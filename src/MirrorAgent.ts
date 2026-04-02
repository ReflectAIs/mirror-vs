import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Turn {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class MirrorAgent {
    private abortController: AbortController | undefined;
    private lastToolCall: string = "";
    private history: Turn[] = [];

    constructor(
        private readonly sessionId: string,
        private readonly provider: { postMessageToWebview: (message: any) => void },
        private readonly output: vscode.OutputChannel,
        private readonly defaultReadLines: number = 500,
        private readonly maxToolsPerTurn: number = 8
    ) {}

    private async loadMemoryIndex(): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return "";

        const indexPath = path.join(workspaceFolder.uri.fsPath, '.mirror', 'INDEX.md');
        try {
            const data = await vscode.workspace.fs.readFile(vscode.Uri.file(indexPath));
            return Buffer.from(data).toString('utf8');
        } catch {
            return "No Knowledge Index found. Use <add_knowledge> to start recording facts.";
        }
    }

    private async addKnowledge(topic: string, content: string): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return "Error: No workspace";

        const mirrorDir = path.join(workspaceFolder.uri.fsPath, '.mirror');
        const knowledgeDir = path.join(mirrorDir, 'knowledge');
        
        // Clean topic name for filename
        const safeTopic = topic.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);
        const topicPath = path.join(knowledgeDir, `${safeTopic}.md`);
        const indexPath = path.join(mirrorDir, 'INDEX.md');
        
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(mirrorDir));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(knowledgeDir));
            
            // Append to topic file
            const timestamp = new Date().toISOString();
            const newContent = `\n## [${timestamp}]\n${content}\n`;
            
            let existingContent = "";
            try {
                const data = await vscode.workspace.fs.readFile(vscode.Uri.file(topicPath));
                existingContent = Buffer.from(data).toString('utf8');
            } catch {
                existingContent = `# Topic: ${topic}\n`;
            }
            
            await vscode.workspace.fs.writeFile(vscode.Uri.file(topicPath), Buffer.from(existingContent + newContent, 'utf8'));
            
            // Update INDEX.md
            let indexContent = "";
            try {
                const data = await vscode.workspace.fs.readFile(vscode.Uri.file(indexPath));
                indexContent = Buffer.from(data).toString('utf8');
            } catch {
                indexContent = "# MASTER KNOWLEDGE INDEX\n\nWhen you need details, use <read_file filepath=\".mirror/knowledge/[topic].md\" />\n\n### KNOWN TOPICS:\n";
            }
            
            if (!indexContent.includes(`- ${safeTopic}.md`)) {
                indexContent += `- ${safeTopic}.md (Topic: ${topic})\n`;
                await vscode.workspace.fs.writeFile(vscode.Uri.file(indexPath), Buffer.from(indexContent, 'utf8'));
            }
            
            this.log(`Knowledge added to .mirror/knowledge/${safeTopic}.md`);
            return `Knowledge successfully appended to .mirror/knowledge/${safeTopic}.md. The INDEX has been updated.`;
        } catch (e) {
            this.log(`Failed to save knowledge: ${e}`);
            return `Failed to save knowledge: ${e}`;
        }
    }

    private log(msg: string) {
        const time = new Date().toLocaleTimeString();
        this.output.appendLine(`[${time}] ${msg}`);
    }

    public handleStop() {
        this.log('Stop requested by user.');
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    private resolvePath(p: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return p;

        const root = workspaceFolder.uri.fsPath;
        const rootName = workspaceFolder.name;

        let normalized = path.normalize(p).replace(/[\\\/]+$/, '');
        let stripped = normalized.replace(/^([a-zA-Z]:)?[\\\/]+/, '').replace(/\.\.\//g, '');
        
        let count = 0;
        while (rootName && count < 10) {
            const lowerStripped = stripped.toLowerCase();
            const lowerRootName = rootName.toLowerCase();
            if (lowerStripped.startsWith(lowerRootName + path.sep)) {
                stripped = stripped.substring(rootName.length).replace(/^[\\\/]+/, '');
            } else if (lowerStripped === lowerRootName) {
                stripped = '.';
                break;
            } else {
                break;
            }
            count++;
        }
        return path.join(root, stripped);
    }

    private compactHistory(history: Turn[]): string {
        let result = "";
        
        // Preserve the first Turn (Initial Goal)
        if (history.length > 0) {
            result += `Target Goal: ${history[0].content}\n\n`;
        }

        const recentTurns = history.slice(-8);
        const middleTurns = history.slice(1, -8);
        
        if (middleTurns.length > 0) {
            result += `[CONTEXT RECAP: The agent has completed ${middleTurns.length} turns of exploration and research. Key architectural findings are recorded in the .mirror/knowledge bank. Eliding detailed tool logs for efficiency.]\n\n`;
        }
        
        for (const t of recentTurns) {
            const block = `${t.role === 'user' ? 'User' : (t.role === 'system' ? 'System' : 'Assistant')}: ${t.content}\n`;
            result += block;
        }
        
        return result;
    }

    private async performDreamCompaction(ollamaUrl: string, ollamaModel: string): Promise<void> {
        this.log("Starting Auto-Dream Compaction...");
        this.provider.postMessageToWebview({ type: 'onToolTrace', value: { label: 'Dreaming...', category: 'analyzing', result: 'Compressing 40+ turns of history to free the context window.' }, sessionId: this.sessionId });
        
        const rawHistory = this.history.map(t => `${t.role.toUpperCase()}: ${t.content}`).join('\n');
        const prompt = `You are a memory compaction module. Review this recent agent transcript and extract ALL concrete facts, file structures, bugs fixed, and architectural discoveries made. Output ONLY a concise Markdown summary of what you learned. Do not add introductory conversational text.\n\nTRANSCRIPT:\n${rawHistory}`;
        
        try {
            const res = await axios.post(`${ollamaUrl}/api/generate`, {
                model: ollamaModel,
                prompt: prompt,
                stream: false
            });
            const summary = res.data.response;
            await this.addKnowledge("context_compaction", summary);
            
            // Wipe history but keep initial goal
            const initialGoal = this.history.length > 0 ? this.history[0] : null;
            this.history = initialGoal ? [initialGoal] : [];
            this.history.push({ role: 'system', content: '[SYSTEM: Previous turns were compacted into .mirror/knowledge/context_compaction.md. You are continuing the same task with a refreshed context window.]' });
            
            this.log("Auto-Dream Compaction complete. History wiped.");
        } catch (e) {
            this.log(`Auto-Dream failed: ${e}`);
        }
    }

    public async handleUserMessage(text: string) {
        const config = vscode.workspace.getConfiguration('mirror-code');
        const isAutonomous = config.get<boolean>('autonomousMode') || false;
        const maxTurns = isAutonomous ? 1000 : (config.get<number>('maxTurns') || 25);
        const memoryIndex = await this.loadMemoryIndex();
        const rootName = vscode.workspace.workspaceFolders?.[0]?.name || "current project";

        if (text) {
            this.history.push({ role: 'user', content: text });
        }
        this.abortController = new AbortController();

        let turnCount = 0;
        const completeToolPattern = /<(search_vector_db|grep_search|read_skeleton|read_file|get_symbols|get_diagnostics|list_dir|run_terminal)\s+[^>]*\/?>|<(patch_file|write_file|add_knowledge)\s+[^>]*>[\s\S]*?<\/\2>/;

        while (turnCount < maxTurns) {
            if (this.abortController.signal.aborted) break;

            const ollamaUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
            const ollamaModel = config.get<string>('ollamaModel') || 'qwen3.5:4b';

            if (isAutonomous && this.history.length > 40) {
                await this.performDreamCompaction(ollamaUrl, ollamaModel);
            }

            const vramMB = await this.detectHardware();
            const numCtx = vramMB < 4500 ? 6144 : (vramMB < 9000 ? 12288 : 32768); 
            const isThinkingModel = /qwen3|llama[4]|phi[4]/.test(ollamaModel.toLowerCase());

            const historyString = this.compactHistory(this.history);
            const systemPrompt = this.getSystemPrompt(rootName, memoryIndex, turnCount, historyString, vramMB, ollamaModel, isThinkingModel);

            try {
                const url = new URL(`${ollamaUrl}/api/generate`);
                const postData = JSON.stringify({
                    model: ollamaModel,
                    prompt: isThinkingModel ? `${systemPrompt}\n\n[CONTEXT ARCHIVE]\n${historyString}\n\nAssistant Response Phase:` : `${systemPrompt}\n\n[CONTEXT ARCHIVE]\n${historyString}\n\nAssistant: <thinking>\n`,
                    stream: true,
                    options: { num_ctx: numCtx, temperature: 0.1, stop: ["[CONTEXT ARCHIVE]", "User:"] } 
                });

                this.provider.postMessageToWebview({ type: 'onAssistantChunk', value: turnCount === 0 ? "*(Thinking...)* " : "", sessionId: this.sessionId });

                let fullReply = isThinkingModel ? "" : "<thinking>\n";
                let buffer = "";
                let inThinkingTag = !isThinkingModel;

                const MAX_TOOLS_PER_TURN = this.maxToolsPerTurn;
                await new Promise((resolve) => {
                    const req = http.request({
                        hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: this.abortController?.signal
                    }, (res) => {
                        res.on('data', (chunk) => {
                            buffer += chunk.toString();
                            let lines = buffer.split('\n');
                            buffer = lines.pop() || "";
                            for (const line of lines) {
                                if (!line) continue;
                                try {
                                    const json = JSON.parse(line);
                                    if (json.response) {
                                        fullReply += json.response;
                                        
                                        // Aggressive tool batch constraint: Interrupt as soon as an Official Opening Tag is detected
                                        const toolPattern = /<(read_file|grep_search|list_dir|run_terminal|patch_file|write_file|add_knowledge|get_symbols|get_diagnostics)(\s+|>)/g;
                                        const toolStarts = fullReply.match(toolPattern) || [];
                                        if (toolStarts.length > MAX_TOOLS_PER_TURN) {
                                            req.destroy();
                                            resolve(true);
                                            return;
                                        }

                                        if (inThinkingTag) {
                                            if (fullReply.includes('</thinking>') || fullReply.includes('</thought>')) {
                                                inThinkingTag = false;
                                                const afterTag = fullReply.split(/<\/thinking>|<\/thought>/).pop() || "";
                                                if (afterTag.trim()) this.provider.postMessageToWebview({ type: 'onAssistantChunk', value: afterTag, sessionId: this.sessionId });
                                            }
                                        } else {
                                            this.provider.postMessageToWebview({ type: 'onAssistantChunk', value: json.response, sessionId: this.sessionId });
                                        }
                                    }
                                    if (json.done) {
                                        if (inThinkingTag) {
                                            const afterPotentialTag = fullReply.replace(/<(thinking|thought)>[\s\S]*?(<\/(thinking|thought)>|$)/g, '').trim();
                                            if (afterPotentialTag) this.provider.postMessageToWebview({ type: 'onAssistantChunk', value: afterPotentialTag, sessionId: this.sessionId });
                                        }
                                        resolve(true); 
                                    }
                                } catch (e) {}
                            }
                        });
                    });
                    req.on('error', (_e) => resolve(true));
                    req.write(postData);
                    req.end();
                });

                const globalToolPattern = new RegExp(completeToolPattern.source, 'g');
                const toolMatches = [...fullReply.matchAll(globalToolPattern)];

                if (toolMatches.length > 0) {
                    for (const match of toolMatches) {
                        const toolCall = match[0];
                        let toolResult = "";
                        let traceLabel = "";
                        let traceCategory: 'analyzing' | 'planning' | 'executing' = 'analyzing';
                        let tracePath: string | undefined;

                        const getAttr = (name: string) => {
                            const m = new RegExp(`(?:${name})=(?:["']([^"']+)["']|([^\\s/>]+))`).exec(toolCall);
                            return m?.[1] || m?.[2] || "";
                        };

                        try {
                            if (toolCall === this.lastToolCall) {
                                this.log(`Stutter Detected: ${toolCall.substring(0, 50)}...`);
                                toolResult = "[SYSTEM: STUTTER DETECTED. You have already called this exact tool with identical parameters in the previous turn. If the results were insufficient, try a different query, or different tool, or provide your final answer. DO NOT repeat your previous action.]";
                                traceLabel = "Stutter Intercepted";
                                traceCategory = 'planning';
                            } else {
                                this.lastToolCall = toolCall;
                                if (toolCall.includes('<search_vector_db')) {
                                    const q = getAttr('query');
                                    traceLabel = `Searching: ${q}`;
                                    tracePath = ".";
                                    const res = await axios.post('http://localhost:3000/tools/search_vector_db', { query: q }, { signal: this.abortController.signal });
                                    toolResult = JSON.stringify(res.data.results);
                                } else if (toolCall.includes('<grep_search')) {
                                    const q = getAttr('query');
                                    const r = this.resolvePath(getAttr('root') || ".");
                                    traceLabel = `Grep: ${q}`;
                                    tracePath = r;
                                    const res = await axios.post('http://localhost:3000/tools/grep_search', { query: q, root: r }, { signal: this.abortController.signal });
                                    toolResult = JSON.stringify(res.data.results);
                                } else if (toolCall.includes('<read_file')) {
                                    const fp = this.resolvePath(getAttr('filepath'));
                                    const sl = getAttr('start_line');
                                    const el = getAttr('end_line');
                                    traceLabel = `Reading: ${path.basename(fp)}${sl ? ` [${sl}:${el || '?'}]` : ''}`;
                                    tracePath = fp;
                                    const res = await axios.post('http://localhost:3000/tools/read_file', { filepath: fp, start_line: sl, end_line: el }, { signal: this.abortController.signal });
                                    
                                    if (sl || el) {
                                        toolResult = `[Showing lines ${res.data.start}-${res.data.end} of ${res.data.totalLines}]\n${res.data.content}`;
                                    } else {
                                        toolResult = res.data.content;
                                    }
                                } else if (toolCall.includes('<write_file')) {
                                    const fp = this.resolvePath(getAttr('filepath'));
                                    const content = /<write_file[^>]*>([\s\S]*?)<\/write_file>/.exec(toolCall)?.[1] || "";
                                    traceLabel = `Writing: ${path.basename(fp)}`;
                                    tracePath = fp;
                                    traceCategory = 'executing';
                                    const res = await axios.post('http://localhost:3000/tools/write_file', { filepath: fp, content }, { signal: this.abortController.signal });
                                    toolResult = res.data.status === 'success' ? `Successfully wrote to ${fp}` : `Error writing to ${fp}: ${res.data.error}`;
                                } else if (toolCall.includes('<list_dir')) {
                                    const dp = this.resolvePath(getAttr('dirpath'));
                                    traceLabel = `Listing: ${path.basename(dp)}`;
                                    tracePath = dp;
                                    const res = await axios.post('http://localhost:3000/tools/list_dir', { dirpath: dp }, { signal: this.abortController.signal });
                                    toolResult = JSON.stringify(res.data.files);
                                } else if (toolCall.includes('<get_symbols')) {
                                    const fp = this.resolvePath(getAttr('filepath'));
                                    traceLabel = `Symbols: ${path.basename(fp)}`;
                                    tracePath = fp;
                                    const symbols = await vscode.commands.executeCommand('mirror-code.getSymbols', vscode.Uri.file(fp).toString()) as any[];
                                    toolResult = symbols.length > 0 ? JSON.stringify(symbols) : "No symbols found.";
                                } else if (toolCall.includes('<get_diagnostics')) {
                                    const fp = this.resolvePath(getAttr('filepath'));
                                    traceLabel = `Diagnostics: ${path.basename(fp)}`;
                                    tracePath = fp;
                                    const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(fp).toString()) as any[];
                                    toolResult = diags.length > 0 ? JSON.stringify(diags) : "No problems found.";
                                } else if (toolCall.includes('<patch_file')) {
                                    const fp = this.resolvePath(getAttr('filepath'));
                                    const search = /<search>([\s\S]*?)<\/search>/.exec(toolCall)?.[1] || "";
                                    const replace = /<replace>([\s\S]*?)<\/replace>/.exec(toolCall)?.[1] || "";
                                    
                                    traceLabel = `Proposing Patch: ${path.basename(fp)}`;
                                    tracePath = fp;
                                    traceCategory = 'planning';
                                    
                                    const res = await axios.post('http://localhost:3000/tools/patch_file', { 
                                        filepath: fp, 
                                        blocks: [{ search, replace }], 
                                        previewOnly: true 
                                    }, { signal: this.abortController.signal });

                                    if (isAutonomous) {
                                        this.log(`Auto-Applying patch to ${fp} (Autonomous Mode)`);
                                        await axios.post('http://localhost:3000/tools/patch_file', { 
                                            filepath: fp, 
                                            blocks: [{ search, replace }], 
                                            previewOnly: false 
                                        });
                                        
                                        const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(fp).toString()) as any[];
                                        this.provider.postMessageToWebview({ type: 'onPatchApplied', value: { filepath: fp, diags, sessionId: this.sessionId } });
                                        toolResult = diags.length > 0 ? `Patch auto-applied but found issues: ${JSON.stringify(diags)}` : "Patch auto-applied successfully.";
                                    } else {
                                        this.provider.postMessageToWebview({ 
                                            type: 'requestDiffReview', 
                                            value: { 
                                                filepath: getAttr('filepath'), 
                                                original: res.data.original, 
                                                content: res.data.content,
                                                blocks: [{ search, replace }],
                                                messageId: Date.now().toString(),
                                                sessionId: this.sessionId
                                            }, 
                                            sessionId: this.sessionId 
                                        });

                                        toolResult = "WAITING_FOR_USER_REVIEW";
                                        this.history.push({ role: 'assistant', content: toolCall });
                                        this.history.push({ role: 'system', content: "The user is now reviewing the proposed diff. Please wait for their response before continuing." });
                                        this.provider.postMessageToWebview({ type: 'onAssistantComplete', sessionId: this.sessionId });
                                        return; 
                                    }
                                } else if (toolCall.includes('<run_terminal')) {
                                    const cmd = getAttr('command');
                                    const dir = this.resolvePath(getAttr('dir') || ".");
                                    traceLabel = `Terminal (${path.basename(dir)}): ${cmd}`;
                                    tracePath = dir;
                                    traceCategory = 'executing';
                                    const res = await axios.post('http://localhost:3000/tools/run_terminal', { command: cmd, cwd: dir }, { signal: this.abortController.signal });
                                    toolResult = res.data.stdout + res.data.stderr;
                                } else if (toolCall.includes('<add_knowledge')) {
                                    const t = getAttr('topic') || "General";
                                    const c = /<add_knowledge[^>]*>([\s\S]*?)<\/add_knowledge>/.exec(toolCall)?.[1]?.trim() || "";
                                    toolResult = await this.addKnowledge(t, c);
                                    traceLabel = `Learning: ${t}`;
                                    traceCategory = 'planning';
                                }
                            }
                        } catch (err: any) { toolResult = `Error: ${err.message}`; }

                        this.provider.postMessageToWebview({ type: 'onToolTrace', value: { label: traceLabel, category: traceCategory, path: tracePath, result: toolResult.substring(0, 100) }, sessionId: this.sessionId });
                        this.history.push({ role: 'assistant', content: toolCall });
                        this.history.push({ role: 'system', content: toolResult });
                        turnCount++;
                    }
                } else {
                    const cleanReply = fullReply.replace(/<(thinking|thought)>[\s\S]*?(<\/(thinking|thought)>|$)/g, '').trim();
                    this.provider.postMessageToWebview({ type: 'onAssistantMessage', value: cleanReply, sessionId: this.sessionId });
                    this.history.push({ role: 'assistant', content: cleanReply });
                    break;
                }
            } catch (err: any) { break; }
        }
        this.provider.postMessageToWebview({ type: 'onAssistantComplete', sessionId: this.sessionId });
    }

    public async handlePatchResult(filepath: string, diags: any[]) {
        const diagMsg = diags.length > 0 ? `Patch applied but found ${diags.length} issues: ${JSON.stringify(diags)}` : "Patch applied successfully and verified by diagnostics.";
        this.log(`Resuming agent turn after patch approval for ${filepath}`);
        
        // Push the result back into history and resume the thinking loop
        this.history.push({ role: 'system', content: diagMsg });
        this.handleUserMessage(""); // Continue from where we left off
    }

    private async detectHardware(): Promise<number> {
        try {
            const { stdout } = await execAsync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits');
            return parseInt(stdout.trim()) || 8192; 
        } catch { return 4096; }
    }

    private getSystemPrompt(rootName: string, memoryIndex: string, _turn: number, _history: string, vramMB: number, _model: string, isThinkingModel: boolean): string {
        const hwNote = vramMB < 4500 ? "\n- Resource Notice: High compression environment. Do NOT omit whitespace." : "";
        
        return `You are Mirror Code (v.2026.04), the "Autonomous Architect". Your goal is to solve requests through a strictly enforced 4-Phase Sequence.

## CLAUDE-INSPIRED MEMORY ARCHITECTURE
History is transient; the Knowledge Bank is eternal. 
- You maintain a permanent Knowledge Bank using <add_knowledge topic="string">markdown content</add_knowledge>.
- When you discover how a system works or make an architectural decision, immediately add it to the bank.
- Your prompt only contains the INDEX. To recall specific details, use <read_file filepath=".mirror/knowledge/[topic].md" />.

## THE BEST SEQUENCE
1. **EXPLORE & RECOVER**: Find relevant files and patterns. **CRITICAL**: Check if ".mirror/plan.md" exists. If it does, READ it to recover context, but remember that the **User's latest prompt is your primary directive**. If it deviates from the existing plan, you MUST prioritize the new goal.
2. **PLAN & RECONCILE**: For any multi-step task, create a ".mirror/plan.md" file using <write_file />. If one exists, compare it with the user's current request. If they diverge, your priority is to UPDATE the plan to reflect the new direction.
3. **ACT & TRACK**: Execute your plan ("<patch_file />", "<run_terminal />"). You MUST update ".mirror/plan.md" religiously as you complete steps (change "[ ]" to "[x]").
4. **RECORD**: For complex architecture, add permanent records via <add_knowledge />.
5. **COMPLETE**: When the task is done, provide your final response to return control to the user.

## OPERATIONAL DIRECTIVES
1. Provide ONLY your direct answer and tool calls.
2. Anti-Loop Rule: NEVER call <list_dir> or <read_file> on the exact same path multiple times.
3. Persistence Balance: Use <add_knowledge /> for critical discoveries and architectural rules. For simple bug fixes or UI tweaks, you may proceed directly to implementation to ensure speed.
4. Actionable Links: Always wrap Workspace-relative file paths in code blocks or quotes to make them clear for the user.
5. ${isThinkingModel ? "Utilize native reasoning mode." : "Always encapsulate your reasoning in <thinking> tags before acting."}
6. Maintain perfect whitespace, indentation, and spaces. Use the [CONTEXT ARCHIVE] for reference.
7. XML Tools: <read_file filepath="relative/path" start_line="1" end_line="500" />, <grep_search query="string" root="relative/dir" />, <list_dir dirpath="relative/dir" />, <run_terminal command="cmd" dir="relative/path" />, <patch_file><search>...</search><replace>...</replace></patch_file>, <write_file filepath="relative/path">content</write_file>, <add_knowledge topic="String">md</add_knowledge>, <get_symbols filepath="path" />, <get_diagnostics filepath="path" />.
8. Creation vs Edit: Use <write_file /> exclusively for creating NEW files or completely overwriting existing ones. Use <patch_file /> for targeted edits to existing files.
9. Terminal Relocation: Use the "dir" attribute in <run_terminal /> to execute commands in a specific folder.
10. Pagination (Sliding Window): Files can be huge. Use "start_line" and "end_line" (1-indexed) in <read_file /> to read ~${this.defaultReadLines} lines at a time. If you find your answer, stop; otherwise, continue reading the next chunk. The tool will return the total line count to help you navigate.
11. BIAS FOR ACTION: Priority: Implementation > Exploration. Once you have located the target code and understand the fix, YOUR NEXT TURN SHOULD BE A MODIFICATION TOOL (<patch_file /> or <write_file />).
12. STRUCTURED PROGRESS: For multi-step tasks, you MUST use ".mirror/plan.md" as your living TODO list. Update it religiously so the user can see your current state and progress.
13. ADAPTIVE PLANNING: The User's latest prompt overrules any previous plan. If you receive a new task, your priority is to reconcile the existing ".mirror/plan.md" with the new request (either by updating or replacing it).
14. ANTI-STUTTERING: NEVER repeat the same tool call with the same parameters in the same response Turn. If you must iterate, wait for the result of the previous tool before sending the next one via a new Turn.

ENVIRONMENT: ${rootName}${hwNote}

PROJECT INDEX:
${memoryIndex}`;
    }
}