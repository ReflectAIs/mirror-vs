import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
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
        this.abortController?.abort();
    }

    private post(type: string, value: any = null) {
        this.provider.postMessageToWebview({ type, value, sessionId: this.sessionId });
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
        this.post('onToolTrace', { label: 'Dreaming...', category: 'analyzing', result: 'Consolidating history into a permanent Memory Stone.' });
        
        const rawHistory = this.history.map(t => `${t.role.toUpperCase()}: ${t.content}`).join('\n');
        const prompt = `You are a memory compaction module for Mirror Code. Review this transcript and extract EVERY concrete architectural discovery, file path, bug fix, and environment detail. 
Output ONLY a JSON object: {"summary": "Brief 1-sentence recap", "stones": [{"topic": "...", "content": "detailed facts", "tags": ["tag1", "tag2"]}]}.
No other text.

TRANSCRIPT:
${rawHistory}`;
        
        try {
            const res = await axios.post(`${ollamaUrl}/api/generate`, { model: ollamaModel, prompt, stream: false });
            let response = res.data.response.trim();
            // Basic JSON cleaning if model adds markdown blocks
            response = response.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            const compaction = JSON.parse(response);
            
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ".";
            const memoryPath = path.join(root, '.mirror', 'memory.json');
            
            let memory = { stones: [] };
            if (fs.existsSync(memoryPath)) {
                memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
            }
            
            const timestamp = new Date().toISOString();
            compaction.stones.forEach((s: any) => {
                (memory as any).stones.push({ ...s, timestamp, id: Math.random().toString(36).substring(7) });
            });
            
            if (!fs.existsSync(path.dirname(memoryPath))) fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
            fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
            
            // Still update the Knowledge Bank for human readability
            await this.addKnowledge(`Dream_${timestamp.replace(/[:.-]/g, '_')}`, compaction.summary);
            
            // Project Index Refresh (Kairos)
            const files = await this.recursiveList(root);
            const indexContent = `# Project Index (Refreshed via Kairos)\n\nLast Refresh: ${timestamp}\n\n${files.map(f => `- ${f}`).join('\n')}`;
            const indexPath = path.join(root, '.mirror', 'INDEX.md');
            fs.writeFileSync(indexPath, indexContent);
            
            this.log(`Memory consolidated. ${compaction.stones.length} new Stones added.`);
            
            // Wipe history but keep initial goal
            const initialGoal = this.history.length > 0 ? this.history[0] : null;
            this.history = initialGoal ? [initialGoal] : [];
            this.history.push({ role: 'system', content: `[SYSTEM: Previous turns consolidated into a Memory Stone. Summary: ${compaction.summary}. You can use <recall_memory query="..." /> to fetch details if needed.]` });
            
        } catch (e: any) { this.log(`Dreaming failed: ${e.message}`); }
    }

    private async recursiveList(dir: string, depth = 0): Promise<string[]> {
        if (depth > 3) return []; // Limit depth for indexing
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
            if (file === 'node_modules' || file === '.git' || file === '.mirror') continue;
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            results.push(this.resolveRelative(fullPath));
            if (stat.isDirectory()) {
                results = results.concat(await this.recursiveList(fullPath, depth + 1));
            }
        }
        return results;
    }

    private resolveRelative(fullPath: string): string {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
        return path.relative(root, fullPath);
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
        const completeToolPattern = /<(search_vector_db|grep_search|read_skeleton|read_file|get_symbols|get_diagnostics|list_dir|run_terminal|recall_memory)(\s+[^>]*)?\/?>|<(patch_file|write_file|add_knowledge)(\s+[^>]*)?>([\s\S]*?)<\/\3>/;

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

                this.post('onAssistantChunk', turnCount === 0 ? "*(Thinking...)* " : "");

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
                                                if (afterTag.trim()) this.post('onAssistantChunk', afterTag);
                                            }
                                        } else {
                                            this.post('onAssistantChunk', json.response);
                                        }
                                    }
                                    if (json.done) {
                                        if (inThinkingTag) {
                                            const afterPotentialTag = fullReply.replace(/<(thinking|thought)>[\s\S]*?(<\/(thinking|thought)>|$)/g, '').trim();
                                            if (afterPotentialTag) this.post('onAssistantChunk', afterPotentialTag);
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
                let pauseForReview = false;

                if (toolMatches.length > 0) {
                    for (const match of toolMatches) {
                        if (this.abortController.signal.aborted) break;
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
                                toolResult = "[SYSTEM: STUTTER DETECTED. You have already called this exact tool with identical parameters in the previous turn. If the results were insufficient, provide your final answer or try a different approach. DO NOT repeat your previous action.]";
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
                                    const filepathRaw = getAttr('filepath');
                                    if (!filepathRaw) {
                                        toolResult = "[SYSTEM: Error: You MUST provide a 'filepath' attribute in the <patch_file> tag. Example: <patch_file filepath=\"src/main.ts\">...]";
                                        traceLabel = "Patch Failed: Missing Filepath";
                                    } else {
                                        const fp = this.resolvePath(filepathRaw);
                                        const blocks: { search: string, replace: string }[] = [];
                                        const blockPattern = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/g;
                                        let bMatch;
                                        while ((bMatch = blockPattern.exec(toolCall)) !== null) {
                                            blocks.push({ search: bMatch[1], replace: bMatch[2] });
                                        }

                                        if (blocks.length === 0) {
                                            toolResult = "[SYSTEM: Error: No search/replace blocks found. Ensure you use <search>...</search> and <replace>...</replace> pairs.]";
                                            traceLabel = "Patch Failed: Empty Blocks";
                                        } else {
                                            traceLabel = `Proposing Patch (${blocks.length} blocks): ${path.basename(fp)}`;
                                            tracePath = fp;
                                            traceCategory = 'planning';
                                            
                                            const res = await axios.post('http://localhost:3000/tools/patch_file', { 
                                                filepath: fp, 
                                                blocks, 
                                                previewOnly: true 
                                            }, { signal: this.abortController.signal });

                                            if (isAutonomous) {
                                                this.log(`Auto-Applying patch to ${fp} (Autonomous Mode)`);
                                                await axios.post('http://localhost:3000/tools/patch_file', { 
                                                    filepath: fp, 
                                                    blocks, 
                                                    previewOnly: false 
                                                });
                                                
                                                const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(fp).toString()) as any[];
                                                this.post('onPatchApplied', { filepath: fp, diags });
                                                toolResult = diags.length > 0 ? `Patch auto-applied but found issues: ${JSON.stringify(diags)}` : "Patch auto-applied successfully.";
                                            } else {
                                                this.post('requestDiffReview', { 
                                                        filepath: filepathRaw, 
                                                        original: res.data.original, 
                                                        content: res.data.content,
                                                        blocks,
                                                        messageId: Date.now().toString()
                                                });

                                                toolResult = "WAITING_FOR_USER_REVIEW";
                                                this.history.push({ role: 'assistant', content: toolCall });
                                                this.history.push({ role: 'system', content: "The user is now reviewing the proposed diff. Please wait for their response before continuing." });
                                                
                                                pauseForReview = true;
                                            }
                                        }
                                    }
                                } else if (toolCall.includes('<run_terminal')) {
                                    const cmd = getAttr('command');
                                    const dir = this.resolvePath(getAttr('dir') || ".");
                                    traceLabel = `Terminal (${path.basename(dir)}): ${cmd}`;
                                    tracePath = dir;
                                    traceCategory = 'executing';
                                    
                                    if (isAutonomous) {
                                        const res = await axios.post('http://localhost:3000/tools/run_terminal', { command: cmd, cwd: dir }, { signal: this.abortController.signal });
                                        toolResult = res.data.stdout + res.data.stderr;
                                        
                                        // Self-healing: If command failed, inject a diagnostic reminder
                                        if (res.data.code !== 0 && res.data.code !== undefined) {
                                            toolResult += `\n[SYSTEM: Command exited with code ${res.data.code}. If this was unexpected, analyze the error and try to fix it.]`;
                                        }
                                    } else {
                                        this.post('requestTerminalReview', { 
                                                command: cmd, 
                                                dir: getAttr('dir') || "." 
                                        });

                                        toolResult = "WAITING_FOR_TERMINAL_APPROVAL";
                                        this.history.push({ role: 'assistant', content: toolCall });
                                        this.history.push({ role: 'system', content: "The user is now reviewing this terminal command. Please wait for approval." });
                                        pauseForReview = true;
                                    }
                                } else if (toolCall.includes('<recall_memory')) {
                                    const q = getAttr('query').toLowerCase();
                                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ".";
                                    const memoryPath = path.join(root, '.mirror', 'memory.json');
                                    
                                    if (!fs.existsSync(memoryPath)) {
                                        toolResult = "No memory stones found.";
                                    } else {
                                        const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
                                        const matches = (memory.stones as any[]).filter((s: any) => 
                                            s.topic.toLowerCase().includes(q) || 
                                            s.content.toLowerCase().includes(q) ||
                                            s.tags.some((t: string) => t.toLowerCase().includes(q))
                                        ).slice(0, 5);
                                        
                                        toolResult = matches.length > 0 
                                            ? `Found ${matches.length} relevant Memory Stones:\n\n` + matches.map(m => `### Topic: ${m.topic}\nContent: ${m.content}\nTags: ${m.tags.join(', ')}`).join('\n\n')
                                            : `No memories found matching "${q}". Try a broader query or checking the project directory manually.`;
                                    }
                                    traceLabel = `Recalling Memory: ${q}`;
                                    traceCategory = 'analyzing';
                                } else if (toolCall.includes('<add_knowledge')) {
                                    const t = getAttr('topic') || "General";
                                    const c = /<add_knowledge[^>]*>([\s\S]*?)<\/add_knowledge>/.exec(toolCall)?.[1]?.trim() || "";
                                    toolResult = await this.addKnowledge(t, c);
                                    traceLabel = `Learning: ${t}`;
                                    traceCategory = 'planning';
                                }
                            }
                        } catch (err: any) { toolResult = `Error: ${err.message}`; }

                        this.post('onToolTrace', { label: traceLabel, category: traceCategory, path: tracePath, result: toolResult.substring(0, 100) });
                        this.history.push({ role: 'assistant', content: toolCall });
                        this.history.push({ role: 'system', content: toolResult });
                        turnCount++;
                    }

                    if (pauseForReview) {
                        
                        return;
                    }
                } else {
                    this.post('onAssistantMessage', fullReply);
                    this.history.push({ role: 'assistant', content: fullReply });
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

    public async handleTerminalResult(stdout: string, stderr: string) {
        const result = (stdout + stderr) || "Command executed with no output.";
        this.log(`Resuming agent turn after terminal approval.`);
        
        // Push the result back into history and resume the thinking loop
        this.history.push({ role: 'system', content: result });
        this.handleUserMessage(""); 
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
7. XML Tools: 
   - <read_file filepath="relative/path" start_line="1" end_line="500" />
   - <grep_search query="string" root="relative/dir" />
   - <list_dir dirpath="relative/dir" />
   - <run_terminal command="cmd" dir="relative/path" />
   - <patch_file filepath="relative/path"><search>exact code to find</search><replace>new code</replace></patch_file>
   - <write_file filepath="relative/path">full content</write_file>
   - <add_knowledge topic="String">markdown documentation</add_knowledge>
   - <recall_memory query="context to search for" /> (Searches your past consolidations and project history)
   - <get_symbols filepath="path" /> (Lists all classes/methods in a file)
   - <get_diagnostics filepath="path" /> (Checks for Lint/Type errors)
8. Creation vs Edit: Use <write_file /> exclusively for creating NEW files or completely overwriting existing ones. Use <patch_file /> for targeted edits to existing files.
9. Terminal Relocation: Use the "dir" attribute in <run_terminal /> to execute commands in a specific folder.
10. Pagination (Sliding Window): Files can be huge. Use "start_line" and "end_line" (1-indexed) in <read_file /> to read ~${this.defaultReadLines} lines at a time. If you find your answer, stop; otherwise, continue reading the next chunk. The tool will return the total line count to help you navigate.
11. BIAS FOR ACTION: Priority: Implementation > Exploration. Once you have located the target code and understand the fix, YOUR NEXT TURN SHOULD BE A MODIFICATION TOOL (<patch_file /> or <write_file />).
12. STRUCTURED PROGRESS: For multi-step tasks, you MUST use ".mirror/plan.md" as your living TODO list. Update it religiously so the user can see your current state and progress.
13. ADAPTIVE PLANNING: The User's latest prompt overrules any previous plan. If you receive a new task, your priority is to reconcile the existing ".mirror/plan.md" with the new request (either by updating or replacing it).
14. ANTI-STUTTERING: NEVER repeat the same tool call with the same parameters in the same response Turn. If you must iterate, wait for the result of the previous tool before sending the next one via a new Turn.
15. ATTRIBUTE ENFORCEMENT: ALL file-related tools REQUIRE the 'filepath' or 'dirpath' attribute in the opening XML tag. Failure to provide this will result in a tool error.

ENVIRONMENT: ${rootName}${hwNote}

PROJECT INDEX:
${memoryIndex}`;
    }
}
