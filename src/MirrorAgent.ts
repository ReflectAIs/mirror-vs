import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import { McpManager } from './McpManager';

const execAsync = promisify(exec);

interface Turn {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface ToolCall {
    raw: string;
    name: string;
    isReadOnly: boolean;
}

interface ToolResult {
    label: string;
    category: 'analyzing' | 'planning' | 'executing';
    path?: string;
    result: string;
    durationMs: number;
    metadata?: {
        command?: string;
        dir?: string;
    };
}

export class MirrorAgent {
    private abortController: AbortController | undefined;
    private lastToolCall: string = "";
    private stutterCount: number = 0;
    private history: Turn[] = [];
    private healingAttempts: Map<string, number> = new Map();
    private brainUrl: string = 'http://localhost:3000';
    private readonly osType: 'windows' | 'linux' | 'mac';
    private readonly shellName: string;

    constructor(
        private readonly sessionId: string,
        private readonly provider: { 
            postMessageToWebview: (message: any) => void,
            executeIntegratedTerminal: (command: string, cwd: string) => Promise<{ stdout: string, exitCode: number }>,
            startBackgroundTerminal: (command: string, dir: string) => Promise<string>,
            sendTerminalInput: (terminalId: string, input: string) => Promise<void>,
            readTerminalOutput: (terminalId: string) => string,
        },
        private readonly output: vscode.OutputChannel,
        private readonly defaultReadLines: number = 500,
        private readonly persona: string = 'architect',
        private readonly isSubAgent: boolean = false,
        private readonly mcpManager?: McpManager
    ) {
        // OS Detection — critical for correct command generation
        if (process.platform === 'win32') {
            this.osType = 'windows';
            this.shellName = 'cmd.exe';
        } else if (process.platform === 'darwin') {
            this.osType = 'mac';
            this.shellName = '/bin/zsh';
        } else {
            this.osType = 'linux';
            this.shellName = '/bin/sh';
        }
    }

    // ─── Tool Call Validation ─────────────────────────────────────────

    private readonly REQUIRED_ATTRS: Record<string, string[]> = {
        'read_file': ['filepath'],
        'read_skeleton': ['filepath'],
        'grep_search': ['query'],
        'list_dir': ['dirpath'],
        'get_symbols': ['filepath'],
        'get_diagnostics': ['filepath'],
        'search_vector_db': ['query'],
        'search_web': ['query'],
        'recall_memory': ['query'],
        'write_file': ['filepath'],
        'patch_file': ['filepath'],
        'run_terminal': ['command'],
        'add_knowledge': ['topic'],
        'delegate': ['mission'],
    };

    private readonly DANGEROUS_PATTERNS = [
        /rm\s+-rf\s+[\/\\](?!tmp)/i,
        /del\s+\/[sfq]\s+[a-z]:\\/i,
        /format\s+[a-z]:/i,
        /DROP\s+(TABLE|DATABASE)/i,
        /:(){ :\|:& };:/,
        />\/dev\/sd/i,
        /mkfs\./i,
        /shutdown/i,
        /rd\s+\/s\s+\/q\s+[a-z]:\\/i,
    ];

    private validateToolCall(raw: string, name: string): { valid: boolean; error?: string } {
        if (name.startsWith('mcp_')) return { valid: true };
        // 1. Check required attributes
        const required = this.REQUIRED_ATTRS[name];
        if (required) {
            for (const attr of required) {
                const value = this.getAttr(raw, attr);
                if (!value) {
                    return { valid: false, error: `Missing required attribute '${attr}' for tool '${name}'. Provide it like: ${attr}="value"` };
                }
            }
        }

        // 2. Validate paths don't escape workspace
        const pathAttrs = ['filepath', 'dirpath', 'dir'];
        for (const attr of pathAttrs) {
            const val = this.getAttr(raw, attr);
            if (val && (val.includes('\0') || /\.\.[\/\\]/.test(val))) {
                const resolved = this.resolvePath(val);
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                if (workspaceRoot && !resolved.startsWith(workspaceRoot)) {
                    return { valid: false, error: `Path '${val}' escapes the workspace. Use paths relative to '${path.basename(workspaceRoot)}'.` };
                }
            }
        }

        // 3. Validate terminal commands against dangerous patterns
        if (name === 'run_terminal') {
            const cmd = this.getAttr(raw, 'command');
            for (const pattern of this.DANGEROUS_PATTERNS) {
                if (pattern.test(cmd)) {
                    return { valid: false, error: `BLOCKED: Command '${cmd}' matches dangerous pattern. Use a safer alternative.` };
                }
            }
        }

        return { valid: true };
    }

    // ─── Knowledge Bank ───────────────────────────────────────────────

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
        if (!workspaceFolder) {
            this.log(`Attempted to save knowledge but no workspace found.`);
            return "Error: No workspace found. Open a folder to use the Knowledge Bank.";
        }

        const mirrorDir = path.join(workspaceFolder.uri.fsPath, '.mirror');
        const knowledgeDir = path.join(mirrorDir, 'knowledge');
        const safeTopic = topic.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);
        const topicPath = path.join(knowledgeDir, `${safeTopic}.md`);
        const indexPath = path.join(mirrorDir, 'INDEX.md');

        this.log(`Saving knowledge on topic: ${topic} to ${path.relative(workspaceFolder.uri.fsPath, topicPath)}`);

        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(mirrorDir));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(knowledgeDir));
            
            const timestamp = new Date().toISOString();
            const newEntry = `\n## [${timestamp}]\n${content}\n`;

            let existingContent = "";
            try {
                const data = await vscode.workspace.fs.readFile(vscode.Uri.file(topicPath));
                existingContent = Buffer.from(data).toString('utf8');
            } catch {
                existingContent = `# Topic: ${topic}\n`;
            }

            await vscode.workspace.fs.writeFile(vscode.Uri.file(topicPath), Buffer.from(existingContent + newEntry, 'utf8'));

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

            this.log(`Knowledge successfully saved to .mirror/knowledge/${safeTopic}.md`);
            return `Knowledge successfully appended to .mirror/knowledge/${safeTopic}.md. The MASTER KNOWLEDGE INDEX has been updated.`;
        } catch (e) {
            this.log(`CRITICAL FAIL: Failed to save knowledge: ${e}`);
            return `CRITICAL FAIL: Failed to save knowledge: ${e}`;
        }
    }

    // ─── Utilities ────────────────────────────────────────────────────

    private log(msg: string) {
        const time = new Date().toLocaleTimeString();
        this.output.appendLine(`[${time}] ${msg}`);
    }

    public handleStop() {
        this.log('Stop requested by user.');
        this.abortController?.abort();
    }

    private post(type: string, value: any = null) {
        this.provider.postMessageToWebview({ 
            type, 
            value, 
            sessionId: this.sessionId,
            isSubAgent: this.isSubAgent 
        });
    }

    private resolvePath(p: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return p;

        const root = workspaceFolder.uri.fsPath;

        // If it's already an absolute path that exists, use it directly
        if (path.isAbsolute(p)) {
            try {
                if (fs.existsSync(p)) return p;
            } catch { }
        }

        // Normalize and strip leading separators / drive letters
        let normalized = path.normalize(p).replace(/[\\\/]+$/, '');
        let stripped = normalized.replace(/^([a-zA-Z]:)?[\\\/]+/, '');

        // Strip repeated workspace folder name from the front 
        const rootName = workspaceFolder.name;
        let count = 0;
        while (rootName && count < 10) {
            const lowerStripped = stripped.toLowerCase();
            const lowerRootName = rootName.toLowerCase();
            if (lowerStripped.startsWith(lowerRootName + path.sep) || lowerStripped.startsWith(lowerRootName + '/')) {
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

    // ─── Context Management (Area 2) ─────────────────────────────────

    // ─── Context Management (Area 2) ─────────────────────────────────

    private getTokenEstimate(text: string): number {
        // Conservative multiplier for 4B models
        return Math.ceil((text.length / 3.2) + 50);
    }

    private truncateToolResult(result: string, toolName: string): string {
        const lines = result.split('\n');

        switch (toolName) {
            case 'read_file':
            case 'read_skeleton': {
                if (lines.length > 200) {
                    // Head-Middle-Tail cutting: Keep imports (top 50) and bottom 30 lines.
                    const head = lines.slice(0, 150).join('\n');
                    const tail = lines.slice(-40).join('\n');
                    return `${head}\n\n[... SEMANTIC TRUNCATION: ${lines.length - 190} lines of middle logic hidden to save context ...]\n\n${tail}`;
                }
                return result;
            }
            case 'grep_search': {
                try {
                    const parsed = JSON.parse(result);
                    if (Array.isArray(parsed) && parsed.length > 15) {
                        const truncated = parsed.slice(0, 15);
                        return JSON.stringify(truncated) + `\n[... Match cap: ${parsed.length - 15} more matches omitted. Total: ${parsed.length}]`;
                    }
                } catch { }
                return result.length > 10000 ? result.substring(0, 10000) + '\n[... output truncated]' : result;
            }
            case 'list_dir': {
                try {
                    const files = JSON.parse(result);
                    if (Array.isArray(files) && files.length > 50) {
                        // Group by extension to save massive token space
                        const extMap: Record<string, number> = {};
                        files.forEach((f: any) => {
                            const ext = path.extname(f.name || f).toLowerCase() || 'no-ext';
                            extMap[ext] = (extMap[ext] || 0) + 1;
                        });
                        const summary = Object.entries(extMap).map(([ext, count]) => `${count} ${ext} files`).join(', ');
                        const firstTen = files.slice(0, 10).map((f: any) => f.name || f);
                        return `Large directory (${files.length} items). Content summary: ${summary}.\nFirst 10 items: ${JSON.stringify(firstTen)}\n[Use specific read_file or grep_search for details.]`;
                    }
                } catch { }
                return result;
            }
            case 'run_terminal':
            case 'terminal_read': {
                if (lines.length > 60) {
                    const head = lines.slice(0, 20).join('\n');
                    const tail = lines.slice(-30).join('\n');
                    return `${head}\n\n[... ${lines.length - 50} lines of terminal output omitted ...]\n\n${tail}`;
                }
                return result;
            }
            case 'search_vector_db': {
                return result.length > 8000 ? result.substring(0, 8000) + '\n[... truncated]' : result;
            }
            default:
                return result.length > 15000 ? result.substring(0, 15000) + '\n[... truncated]' : result;
        }
    }

    private compactHistoryIfNeeded(numCtx: number) {
        const totalEstimate = this.history.reduce((sum, t) => sum + this.getTokenEstimate(t.content), 0);
        const budget = Math.floor(numCtx * 0.65); // Budget 65% for history to give 4B models breathing room

        if (totalEstimate <= budget) return;

        // BUDGET-BASED PRIORITIZATION
        // Goal: 15% | Immediate turns: 40% | Summarized mid: 10%
        this.log(`CONTEXT PRESSURE: ${totalEstimate}/${budget} tokens. Applying priority-based packing.`);

        const keepFirst = 2; // Original goal + first response
        const keepLast = 6;  // Immediate turns for continuity
        if (this.history.length <= keepFirst + keepLast) return;

        const middle = this.history.slice(keepFirst, -keepLast);
        const summaryParts: string[] = [];

        for (const turn of middle) {
            if (turn.role === 'assistant') {
                const toolMatch = /<(\w+)\s/.exec(turn.content);
                if (toolMatch) summaryParts.push(`Action: ${toolMatch[1]}`);
            } else if (turn.role === 'system') {
                if (turn.content.includes('Error') || turn.content.includes('STUTTER') || turn.content.includes('DIAGNOSTICS')) {
                    summaryParts.push(`Result: ${turn.content.substring(0, 150).trim()}...`);
                }
            }
        }

        const compactionNote = `[SYSTEM: CONTEXT MANAGEMENT - ${middle.length} turns summarized below to stay within the small model's limit]\nRECAP:\n- ${summaryParts.slice(-15).join('\n- ')}`;

        this.history = [
            ...this.history.slice(0, keepFirst),
            { role: 'system', content: compactionNote },
            ...this.history.slice(-keepLast)
        ];

        const newEstimate = this.history.reduce((sum, t) => sum + this.getTokenEstimate(t.content), 0);
        this.log(`COMPACTION DONE: History is now ~${newEstimate} tokens.`);
    }

    // ─── Multi-Tool Extraction (Area 1) ──────────────────────────────

    private readonly SELF_CLOSING_TOOLS = ['search_vector_db', 'grep_search', 'read_skeleton', 'read_file', 'get_symbols', 'get_diagnostics', 'list_dir', 'run_terminal', 'recall_memory', 'search_web'];
    private readonly BODY_TOOLS = ['patch_file', 'write_file', 'add_knowledge'];

    private extractAllToolCalls(text: string): ToolCall[] {
        const calls: ToolCall[] = [];
        const readOnlyTools = new Set(['search_vector_db', 'grep_search', 'read_skeleton', 'read_file', 'get_symbols', 'get_diagnostics', 'list_dir', 'recall_memory', 'search_web']);

        // Match self-closing tools: <tool_name attr="val" />
        const selfClosingPattern = new RegExp(
            `<(${this.SELF_CLOSING_TOOLS.join('|')})(\\s+[^>]*)?\\/?>`,
            'g'
        );

        // Match body tools: <tool_name attr="val">content</tool_name>
        const bodyPattern = new RegExp(
            `<(${this.BODY_TOOLS.join('|')})(\\s+[^>]*)?>([\\s\\S]*?)<\\/\\1>`,
            'g'
        );

        // Match MCP tools: <mcp_server_tool attr="val" />
        const mcpPattern = /<(mcp_\w+)(\s+[^>]*)?\/?>/g;

        let match;
        while ((match = selfClosingPattern.exec(text)) !== null) {
            calls.push({
                raw: match[0],
                name: match[1],
                isReadOnly: readOnlyTools.has(match[1])
            });
        }
        while ((match = bodyPattern.exec(text)) !== null) {
            calls.push({
                raw: match[0],
                name: match[1],
                isReadOnly: false
            });
        }
        while ((match = mcpPattern.exec(text)) !== null) {
            calls.push({
                raw: match[0],
                name: match[1],
                isReadOnly: false // Assume potentially mutating for safety
            });
        }

        // Sort by position in original text
        calls.sort((a, b) => text.indexOf(a.raw) - text.indexOf(b.raw));
        return calls;
    }

    // ─── Tool Execution ──────────────────────────────────────────────

    private getAttr(toolCall: string, name: string): string {
        const m = new RegExp(`(?:${name})=(?:["']([^"']+)["']|([^\\s/>]+))`).exec(toolCall);
        return m?.[1] || m?.[2] || "";
    }

    private getAllAttrs(toolCall: string): Record<string, string> {
        const attrs: Record<string, string> = {};
        const re = /(\w+)=(?:["']([^"']+)["']|([^\s/>]+))/g;
        let match;
        while ((match = re.exec(toolCall)) !== null) {
            attrs[match[1]] = match[2] || match[3];
        }
        return attrs;
    }

    private async executeSingleTool(toolCall: ToolCall, isAutonomous: boolean, config: vscode.WorkspaceConfiguration): Promise<ToolResult> {
        const startTime = Date.now();
        const raw = toolCall.raw;
        const getAttr = (name: string) => this.getAttr(raw, name);

        let toolResult = "";
        let traceLabel = "";
        let traceCategory: 'analyzing' | 'planning' | 'executing' = 'analyzing';
        let tracePath: string | undefined;

        try {
            if (toolCall.name.startsWith('mcp_') && this.mcpManager) {
                const parts = toolCall.name.split('_');
                const serverName = parts[1];
                const toolName = parts.slice(2).join('_');
                const args = this.getAllAttrs(raw);
                
                traceLabel = `MCP: ${serverName}/${toolName}`;
                traceCategory = 'executing';
                
                const result = await this.mcpManager.callTool(serverName, toolName, args);
                toolResult = JSON.stringify(result);

            } else if (raw.includes('<search_vector_db')) {
                const q = getAttr('query');
                traceLabel = `Searching Code: ${q}`;
                tracePath = ".";
                const res = await axios.post(`${this.brainUrl}/tools/search_vector_db`, { query: q }, { signal: this.abortController!.signal });
                toolResult = JSON.stringify(res.data.results);

            } else if (raw.includes('<search_web')) {
                const q = getAttr('query');
                traceLabel = `Web Search: ${q}`;
                tracePath = ".";
                const res = await axios.post(`${this.brainUrl}/tools/search_web`, { query: q }, { signal: this.abortController!.signal });
                toolResult = JSON.stringify(res.data.results);

            } else if (raw.includes('<grep_search')) {
                const q = getAttr('query');
                const r = this.resolvePath(getAttr('root') || ".");
                traceLabel = `Grep: ${q}`;
                tracePath = r;
                const res = await axios.post(`${this.brainUrl}/tools/grep_search`, { query: q, root: r }, { signal: this.abortController!.signal });
                toolResult = JSON.stringify(res.data.results);

            } else if (raw.includes('<read_file')) {
                const fp = this.resolvePath(getAttr('filepath'));
                const sl = getAttr('start_line');
                const el = getAttr('end_line');
                traceLabel = `Reading: ${path.basename(fp)}`;
                tracePath = fp;
                const res = await axios.post(`${this.brainUrl}/tools/read_file`, { filepath: fp, start_line: sl, end_line: el }, { signal: this.abortController!.signal });
                toolResult = (sl || el) ? `[lines ${res.data.start}-${res.data.end} of ${res.data.totalLines}]\n${res.data.content}` : res.data.content;

            } else if (raw.includes('<read_skeleton')) {
                const fp = this.resolvePath(getAttr('filepath'));
                traceLabel = `Skeleton: ${path.basename(fp)}`;
                tracePath = fp;
                const res = await axios.post(`${this.brainUrl}/tools/read_skeleton`, { filepath: fp }, { signal: this.abortController!.signal });
                toolResult = JSON.stringify(res.data.signals);

            } else if (raw.includes('<get_symbols')) {
                const fp = this.resolvePath(getAttr('filepath'));
                traceLabel = `Symbols: ${path.basename(fp)}`;
                tracePath = fp;
                const symbols = await vscode.commands.executeCommand('mirror-code.getSymbols', vscode.Uri.file(fp).toString()) as any[];
                toolResult = symbols.length > 0 ? JSON.stringify(symbols) : "No symbols found.";

            } else if (raw.includes('<get_diagnostics')) {
                const fp = this.resolvePath(getAttr('filepath'));
                traceLabel = `Diagnostics: ${path.basename(fp)}`;
                tracePath = fp;
                const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(fp).toString()) as any[];
                toolResult = diags.length > 0 ? JSON.stringify(diags) : "No diagnostics found. Code is clean.";

            } else if (raw.includes('<list_dir')) {
                const dp = this.resolvePath(getAttr('dirpath'));
                traceLabel = `Listing: ${path.basename(dp)}`;
                tracePath = dp;
                const res = await axios.post(`${this.brainUrl}/tools/list_dir`, { dirpath: dp }, { signal: this.abortController!.signal });
                toolResult = JSON.stringify(res.data.files);

            } else if (raw.includes('<write_file')) {
                const fp = this.resolvePath(getAttr('filepath'));
                const content = /<write_file[^>]*>([\s\S]*?)<\/write_file>/.exec(raw)?.[1] || "";
                traceLabel = `Writing: ${path.basename(fp)}`;
                tracePath = fp;
                traceCategory = 'executing';
                const res = await axios.post(`${this.brainUrl}/tools/write_file`, { filepath: fp, content }, { signal: this.abortController!.signal });
                toolResult = res.data.status === 'success' ? `Successfully wrote to ${fp}` : `Error: ${res.data.error}`;

                // Self-healing: auto-check diagnostics after write
                toolResult += await this.checkDiagnosticsAfterWrite(fp);

            } else if (raw.includes('<patch_file')) {
                const filepathRaw = getAttr('filepath');
                if (!filepathRaw) {
                    toolResult = "[SYSTEM: Error: Missing 'filepath' attribute.]";
                } else {
                    const fp = this.resolvePath(filepathRaw);
                    const blocks: { search: string, replace: string }[] = [];
                    const blockPattern = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/g;
                    let bMatch;
                    while ((bMatch = blockPattern.exec(raw)) !== null) {
                        blocks.push({ search: bMatch[1], replace: bMatch[2] });
                    }

                    if (blocks.length === 0) {
                        toolResult = "[SYSTEM: Error: No search/replace blocks found.]";
                    } else {
                        traceLabel = `Patching: ${path.basename(fp)}`;
                        tracePath = fp;
                        traceCategory = 'executing';

                        if (isAutonomous) {
                            const res = await axios.post(`${this.brainUrl}/tools/patch_file`, { filepath: fp, blocks, previewOnly: false });
                            const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(fp).toString()) as any[];
                            this.post('onPatchApplied', { filepath: fp, diags });
                            toolResult = "Patch applied.";
                            toolResult += await this.checkDiagnosticsAfterWrite(fp);
                        } else {
                            const res = await axios.post(`${this.brainUrl}/tools/patch_file`, { filepath: fp, blocks, previewOnly: true });
                            this.post('requestDiffReview', {
                                filepath: filepathRaw, original: res.data.original,
                                content: res.data.content, blocks, messageId: Date.now().toString()
                            });
                            // Return special sentinel — the caller handles the pause
                            return {
                                label: traceLabel, category: 'planning', path: tracePath,
                                result: 'WAITING_FOR_USER_REVIEW',
                                durationMs: Date.now() - startTime
                            };
                        }
                    }
                }

            } else if (raw.includes('<run_terminal')) {
                const cmd = getAttr('command');
                const dir = this.resolvePath(getAttr('dir') || ".");
                traceLabel = `Terminal: ${cmd}`;
                tracePath = dir;
                traceCategory = 'executing';

                if (isAutonomous) {
                    try {
                        const res = await this.provider.executeIntegratedTerminal(cmd, dir);
                        toolResult = res.stdout || "";
                        if (res.exitCode !== 0) toolResult += `\n[Exit code: ${res.exitCode}]`;
                        if (!toolResult.trim()) toolResult = "Command completed with no output.";

                        return {
                            label: traceLabel, category: traceCategory, path: tracePath,
                            result: toolResult, durationMs: Date.now() - startTime,
                            metadata: { command: cmd, dir }
                        };
                    } catch (err: any) {
                        toolResult = `Terminal error: ${err.message}`;
                    }
                } else {
                    this.post('requestTerminalApproval', {
                        terminalData: { command: cmd, dir, messageId: Date.now().toString() }
                    });
                    return {
                        label: traceLabel, category: traceCategory, path: tracePath,
                        result: 'WAITING_FOR_TERMINAL_APPROVAL',
                        durationMs: Date.now() - startTime,
                        metadata: { command: cmd, dir }
                    };
                }

            } else if (raw.includes('<terminal_start')) {
                const cmd = getAttr('command');
                const dir = this.resolvePath(getAttr('dir') || ".");
                traceLabel = `Background: ${cmd}`;
                tracePath = dir;
                traceCategory = 'executing';
                const terminalId = await this.provider.startBackgroundTerminal(cmd, dir);
                toolResult = `Background terminal ${terminalId} started. Use <terminal_read terminalId="${terminalId}" /> to see output.`;

            } else if (raw.includes('<terminal_read')) {
                const id = getAttr('terminalId');
                traceLabel = `Reading Terminal ${id}`;
                const output = this.provider.readTerminalOutput(id);
                toolResult = output || "No output yet.";

            } else if (raw.includes('<terminal_input')) {
                const id = getAttr('terminalId');
                const input = getAttr('input');
                traceLabel = `Input to Terminal ${id}`;
                try {
                    await this.provider.sendTerminalInput(id, input);
                    toolResult = `Input sent to terminal ${id}.`;
                } catch (e: any) {
                    toolResult = `Error: ${e.message}`;
                }

            } else if (raw.includes('<delegate')) {
                const mission = getAttr('mission');
                const contextFiles = getAttr('files') ? getAttr('files').split(',').map(f => f.trim()) : [];
                traceLabel = `Delegating: ${mission.substring(0, 40)}...`;
                traceCategory = 'planning';
                
                toolResult = await this.runSubAgent(mission, contextFiles);

            } else if (raw.includes('<recall_memory')) {
                const q = getAttr('query').toLowerCase();
                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ".";
                const memoryPath = path.join(root, '.mirror', 'memory.json');
                if (!fs.existsSync(memoryPath)) {
                    toolResult = "No memories found.";
                } else {
                    const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
                    const matches = (memory.stones as any[])
                        .filter((s: any) => s.topic.toLowerCase().includes(q) || s.content.toLowerCase().includes(q))
                        .slice(0, 3);
                    toolResult = matches.length > 0 ? JSON.stringify(matches) : "No match.";
                }
                traceLabel = `Recalling: ${q}`;

            } else if (raw.includes('<add_knowledge')) {
                const t = getAttr('topic') || "General";
                const c = /<add_knowledge[^>]*>([\s\S]*?)<\/add_knowledge>/.exec(raw)?.[1]?.trim() || "";
                toolResult = await this.addKnowledge(t, c);
                traceLabel = `Learning: ${t}`;
            }
        } catch (err: any) {
            toolResult = `Error: ${err.response?.data?.error || err.message}`;
            traceLabel = traceLabel || `Error in ${toolCall.name}`;
        }

        // Apply truncation
        toolResult = this.truncateToolResult(toolResult, toolCall.name);

        return {
            label: traceLabel,
            category: traceCategory,
            path: tracePath,
            result: toolResult,
            durationMs: Date.now() - startTime
        };
    }

    // ─── Self-Healing (Area 3) ───────────────────────────────────────

    private async checkDiagnosticsAfterWrite(filepath: string): Promise<string> {
        try {
            const attempts = this.healingAttempts.get(filepath) || 0;
            if (attempts >= 3) {
                return ""; // Stop self-healing after 3 attempts
            }

            const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(filepath).toString()) as any[];
            const warnings = diags.filter((d: any) => d.severity === 'Error' || d.severity === 'Warning');

            if (warnings.length > 0) {
                this.healingAttempts.set(filepath, attempts + 1);
                return `\n[DIAGNOSTICS: Found ${warnings.length} issue(s) after write: ${JSON.stringify(warnings.slice(0, 5))}. Fix if related to your changes. Attempt ${attempts + 1}/3]`;
            } else {
                this.healingAttempts.delete(filepath); // Reset on success
            }
        } catch { }
        return "";
    }

    // ─── Dream Compaction (Hardened for 4B models) ─────────────────────

    private async performDreamCompaction(ollamaUrl: string, ollamaModel: string): Promise<void> {
        this.log("Starting Auto-Dream Compaction...");
        this.post('onToolTrace', { label: 'Dreaming...', category: 'analyzing', result: 'Consolidating history into a permanent Memory Stone.' });

        // Limit transcript to last 20 turns to keep prompt manageable for 4B
        const recentHistory = this.history.slice(-20);
        const rawHistory = recentHistory.map(t => `${t.role.toUpperCase()}: ${t.content.substring(0, 500)}`).join('\n');
        const prompt = `Extract key facts from this coding session. Output ONLY valid JSON:
{"summary":"one sentence recap","stones":[{"topic":"name","content":"facts","tags":["tag"]}]}

TRANSCRIPT:
${rawHistory}`;

        try {
            const res = await axios.post(`${ollamaUrl}/api/generate`, { model: ollamaModel, prompt, stream: false, options: { temperature: 0.0 } });
            let response = res.data.response.trim();

            // Robust JSON extraction — handle markdown fences, stray text, etc.
            response = response.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            const jsonMatch = /\{[\s\S]*\}/.exec(response);
            if (!jsonMatch) {
                this.log("Dream compaction: No valid JSON found in response. Falling back.");
                // Fallback: create a simple summary without the LLM
                const turnSummary = recentHistory
                    .filter(t => t.role === 'user')
                    .map(t => t.content.substring(0, 100))
                    .join('; ');
                const fallbackSummary = `Session covered: ${turnSummary || 'various coding tasks'}`;
                this.history = this.history.slice(-4);
                this.history.unshift({ role: 'system', content: `[SYSTEM: History compacted. Summary: ${fallbackSummary}]` });
                return;
            }

            const compaction = JSON.parse(jsonMatch[0]);

            // Validate structure
            if (!compaction.summary || !Array.isArray(compaction.stones)) {
                throw new Error("Invalid compaction structure");
            }

            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ".";
            const memoryPath = path.join(root, '.mirror', 'memory.json');

            let memory: { stones: any[] } = { stones: [] };
            if (fs.existsSync(memoryPath)) {
                try { memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8')); } catch { }
            }

            const timestamp = new Date().toISOString();
            compaction.stones.forEach((s: any) => {
                (memory as any).stones.push({ ...s, timestamp, id: Math.random().toString(36).substring(7) });
            });

            // Cap memory stones to prevent unbounded growth
            if (memory.stones.length > 100) {
                memory.stones = memory.stones.slice(-100);
            }

            if (!fs.existsSync(path.dirname(memoryPath))) fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
            fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));

            await this.addKnowledge(`Dream_${timestamp.replace(/[:.-]/g, '_')}`, compaction.summary);

            this.log(`Memory consolidated. ${compaction.stones.length} new Stones added.`);

            // Preserve last 2 user messages + last 2 tool results for continuity
            const userMessages = this.history.filter(t => t.role === 'user');
            const lastUserMsgs = userMessages.slice(-2);
            this.history = lastUserMsgs.length > 0 ? [...lastUserMsgs] : [];
            this.history.push({ role: 'system', content: `[SYSTEM: Previous turns consolidated into Memory Stones. Summary: ${compaction.summary}. Use <recall_memory query="..." /> to fetch details.]` });

        } catch (e: any) { this.log(`Dreaming failed: ${e.message}. Falling back to simple compaction.`); 
            // Hard fallback: just trim history
            if (this.history.length > 10) {
                const userMsgs = this.history.filter(t => t.role === 'user').slice(-2);
                this.history = [
                    ...userMsgs,
                    { role: 'system', content: `[SYSTEM: History was trimmed to save context. Continue your current task.]` },
                    ...this.history.slice(-4)
                ];
            }
        }
    }

    private async recursiveList(dir: string, depth = 0): Promise<string[]> {
        if (depth > 2) return []; // Reduced from 3 to 2 for performance
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
            if (file === 'node_modules' || file === '.git' || file === '.mirror' || file === 'dist' || file === 'out') continue;
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            results.push(this.resolveRelative(fullPath));
            if (stat.isDirectory()) {
                results = results.concat(await this.recursiveList(fullPath, depth + 1));
            }
            if (results.length > 50) break; // Hard cap
        }
        return results;
    }

    private resolveRelative(fullPath: string): string {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
        return path.relative(root, fullPath);
    }

    // ─── Main Agent Loop ─────────────────────────────────────────────

    public async handleUserMessage(text: string) {
        const config = vscode.workspace.getConfiguration('mirror-code');
        const isAutonomous = config.get<boolean>('autonomousMode') || false;
        const maxTurns = isAutonomous ? 1000 : (config.get<number>('maxTurns') || 25);
        const maxToolsPerTurn = config.get<number>('maxToolsPerTurn') || 8;
        const memoryIndex = await this.loadMemoryIndex();
        const rootName = vscode.workspace.workspaceFolders?.[0]?.name || "current project";

        if (text) {
            this.history.push({ role: 'user', content: text });
        }
        this.abortController = new AbortController();
        this.healingAttempts.clear();

        let turnCount = 0;

        while (turnCount < maxTurns) {
            if (this.abortController.signal.aborted) break;

            const ollamaUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
            const ollamaModel = config.get<string>('ollamaModel') || 'qwen3.5:4b';

            const vramMB = await this.detectHardware();
            const numCtx = vramMB < 4500 ? 6144 : (vramMB < 9000 ? 12288 : 32768);
            
            // Proactive Dream Compaction (triggered at 70% of available history budget)
            const totalHistoryTokens = this.history.reduce((s, t) => s + this.getTokenEstimate(t.content), 0);
            const compactionThreshold = vramMB < 4500 ? 4000 : 8000;
            if (isAutonomous && totalHistoryTokens > compactionThreshold) {
                await this.performDreamCompaction(ollamaUrl, ollamaModel);
            }

            // Report usage to UI
            this.post('onContextUsage', { used: totalHistoryTokens, total: numCtx });

            // Compact history if nearing context limit
            this.compactHistoryIfNeeded(numCtx);

            const systemPrompt = await this.getSystemPrompt(rootName, memoryIndex, turnCount, maxTurns, vramMB, ollamaModel, false);
            const messages = [
                { role: 'system', content: systemPrompt },
                ...this.mergeHistory(this.history)
            ];

            try {
                const url = new URL(`${ollamaUrl}/api/chat`);
                const postData = JSON.stringify({
                    model: ollamaModel,
                    messages: messages,
                    stream: true,
                    options: { num_ctx: numCtx, temperature: 0.1 }
                });

                this.post('onAssistantChunk', turnCount === 0 ? "*(Thinking...)* " : "");

                let fullReply = "";
                let buffer = "";
                let inThinkingTag = false;
                let thinkingTagDetected = false;

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
                                    if (json.message?.content) {
                                        const delta = json.message.content;
                                        fullReply += delta;

                                        // Detection of thinking tags
                                        if (!thinkingTagDetected && /<(think|thinking|thought)>/.test(fullReply)) {
                                            thinkingTagDetected = true;
                                            inThinkingTag = true;
                                            this.post('onAssistantChunk', "*(Thinking...)* ");
                                        }

                                        if (inThinkingTag) {
                                            if (/<\/(think|thinking|thought)>/.test(fullReply)) {
                                                inThinkingTag = false;
                                                const parts = fullReply.split(/<\/(think|thinking|thought)>/);
                                                const afterTag = parts[parts.length - 1];
                                                if (afterTag.trim()) this.post('onAssistantChunk', afterTag);
                                            }
                                        } else {
                                            // Non-thinking content is streamed to UI
                                            this.post('onAssistantChunk', delta);
                                        }
                                    }
                                    if (json.done) {
                                        resolve(true);
                                    }
                                } catch (e) { }
                            }
                        });
                    });
                    req.on('error', (_e) => resolve(true));
                    req.write(postData);
                    req.end();
                });

                // Extract ALL tool calls from the response
                const toolCalls = this.extractAllToolCalls(fullReply);

                // Get text before the first tool call (reasoning)
                const firstToolIndex = toolCalls.length > 0 ? fullReply.indexOf(toolCalls[0].raw) : -1;
                const reasoningText = firstToolIndex > 0 ? fullReply.substring(0, firstToolIndex).trim() : (toolCalls.length === 0 ? "" : "");

                if (toolCalls.length > 0) {
                    // Push reasoning to history
                    if (reasoningText && reasoningText !== "<thinking>") {
                        this.history.push({ role: 'assistant', content: reasoningText });
                    }

                    // ─── PARALLEL TOOL EXECUTION ───
                    const MAX_BATCH = 3;
                    const results: string[] = [];
                    let lastExecutedTool = "";

                    for (let i = 0; i < Math.min(toolCalls.length, MAX_BATCH); i++) {
                        const tc = toolCalls[i];
                        
                        // 1. Validation
                        const validation = this.validateToolCall(tc.raw, tc.name);
                        if (!validation.valid) {
                            results.push(`[SYSTEM: Tool '${tc.name}' rejected: ${validation.error}]`);
                            break; 
                        }

                        // 2. Stutter Detection
                        if (i === 0 && tc.raw === this.lastToolCall && !reasoningText) {
                            this.stutterCount++;
                            if (this.stutterCount >= 5) {
                                this.post('onAssistantMessage', `I got stuck repeating the same action 5 times. Please rephrase or check your workspace.`);
                                break;
                            }
                            const recoveryHint = this.osType === 'windows' ? " (Windows: use mkdir not mkdir -p)" : "";
                            results.push(`[SYSTEM: STUTTER #${this.stutterCount}/5. You MUST try a different approach.${recoveryHint}]`);
                            break;
                        }

                        // 3. Execution
                        const isMutation = ['write_file', 'patch_file', 'run_terminal', 'add_knowledge'].includes(tc.name);
                        const result = await this.executeSingleTool(tc, isAutonomous, config);
                        
                        this.post('onToolTrace', { 
                            label: result.label, 
                            category: result.category, 
                            path: result.path, 
                            result: result.result.substring(0, 150),
                            metadata: result.metadata
                        });

                        results.push(`TOOL_RESULT (${tc.name}):\n${result.result}`);
                        lastExecutedTool = tc.raw;

                        if (isMutation || result.result.includes('WAITING_FOR')) {
                            this.lastToolCall = tc.raw;
                            this.stutterCount = 0;
                            break; 
                        }
                    }

                    this.history.push({ role: 'assistant', content: reasoningText || toolCalls[0].raw });
                    this.history.push({ role: 'system', content: results.join('\n\n---\n\n') });

                    if (results.some(r => r.includes('WAITING_FOR'))) return;

                    turnCount++;
                    continue;
                } else {
                    // No tool call — let's see if we should continue in autonomous mode
                    if (isAutonomous && turnCount < maxTurns && !fullReply.includes("DONE_TASK")) {
                        this.log("Autonomous continuity check: Model didn't call a tool but hasn't explicitly finished.");
                        this.history.push({ role: 'assistant', content: fullReply });
                        this.history.push({ role: 'system', content: "[SYSTEM: You didn't call a tool. If you are finished, output 'DONE_TASK'. Otherwise, continue your task using the tools provided.]" });
                        turnCount++;
                        continue;
                    }

                    // Final answer
                    this.post('onAssistantMessage', fullReply.replace(/DONE_TASK/g, '').trim());
                    this.history.push({ role: 'assistant', content: fullReply });
                    break;
                }
            } catch (err: any) {
                this.log(`Agent loop error: ${err.message}`);
                break;
            }
        }

        if (turnCount >= maxTurns) {
            this.post('onAssistantChunk', `\n\n*[Reached maximum ${maxTurns} turns. Send another message to continue.]*`);
        }
        this.provider.postMessageToWebview({ type: 'onAssistantComplete', sessionId: this.sessionId });
    }

    public async handlePatchResult(filepath: string, diags: any[]) {
        const diagMsg = diags.length > 0 ? `Patch applied but found ${diags.length} issues: ${JSON.stringify(diags)}` : "Patch applied successfully and verified by diagnostics.";
        this.log(`Resuming agent turn after patch approval for ${filepath}`);
        this.history.push({ role: 'system', content: diagMsg });
        this.handleUserMessage("");
    }

    public async handleTerminalResult(stdout: string, stderr: string) {
        const result = (stdout + stderr) || "Command executed with no output.";
        this.log(`Resuming agent turn after terminal approval.`);
        this.history.push({ role: 'system', content: result });
        this.handleUserMessage("");
    }

    private async detectHardware(): Promise<number> {
        try {
            // Priority 1: Nvidia GPU
            const { stdout: gpuOut } = await execAsync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits');
            const gpuMem = parseInt(gpuOut.trim());
            if (gpuMem) return gpuMem;
        } catch { }

        try {
            // Priority 2: Total System RAM (Win/Mac/Linux)
            if (process.platform === 'win32') {
                const { stdout: memOut } = await execAsync('wmic ComputerSystem get TotalPhysicalMemory /Value');
                const match = /TotalPhysicalMemory=(\d+)/.exec(memOut);
                if (match) return Math.floor(parseInt(match[1]) / (1024 * 1024));
            } else {
                const { stdout: memOut } = await execAsync('free -m | grep Mem: | awk \'{print $2}\'');
                const mem = parseInt(memOut.trim());
                if (mem) return mem;
            }
        } catch { }

        return 8192; // Default to 8GB if detection fails
    }

    // ─── Sub-Agent Delegation (Area 4) ──────────────────────────────

    private async runSubAgent(mission: string, contextFiles: string[]): Promise<string> {
        this.log(`Spawning sub-agent for mission: ${mission}`);
        
        // Create a specialized sub-agent instance
        // Pass the SAME sessionId but set isSubAgent=true for unified trace
        const subAgent = new MirrorAgent(this.sessionId, this.provider, this.output, this.defaultReadLines, 'sub-task', true);

        // Prepare context for the sub-agent
        let initialPrompt = `MISSION: ${mission}\n\nRESOURCES:\n`;
        for (const file of contextFiles) {
            try {
                const fp = this.resolvePath(file);
                const content = fs.readFileSync(fp, 'utf8');
                initialPrompt += `--- FILE: ${file} ---\n${content.substring(0, 2000)}\n\n`;
            } catch (e) {
                initialPrompt += `--- FILE: ${file} (Error: Could not read) ---\n`;
            }
        }
        initialPrompt += `\nGo! You have 5 turns maximum to complete this mission. Always end your last turn with a concise summary of your findings.`;

        // Run the agent loop (restricted to 5 turns)
        try {
            await subAgent.handleUserMessage(initialPrompt);
            
            // Extract the result from sub-agent's history
            const history = subAgent.getHistory();
            const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
            
            return `[SUB-AGENT MISSION COMPLETE]\nSUMMARY: ${lastAssistantMsg?.content || "Mission finished with no summary."}`;
        } catch (e: any) {
            return `[SUB-AGENT MISSION FAILED] Error: ${e.message}`;
        }
    }

    public getHistory(): Turn[] {
        return this.history;
    }

    // ─── System Prompt (Modular, 4B-Optimized) ────────────────────────

    private async loadPlanState(): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return "";
        const planPath = path.join(workspaceFolder.uri.fsPath, '.mirror', 'PLAN.md');
        try {
            const data = await vscode.workspace.fs.readFile(vscode.Uri.file(planPath));
            const content = Buffer.from(data).toString('utf8');
            // Extract only checkbox lines for compact injection
            const checkboxLines = content.split('\n').filter(l => /^\s*-\s*\[[ x\/]\]/.test(l));
            if (checkboxLines.length > 0) {
                return `\nACTIVE PLAN (from .mirror/PLAN.md):\n${checkboxLines.join('\n')}`;
            }
            return `\nPLAN EXISTS: .mirror/PLAN.md (${content.length} chars). Read it for details.`;
        } catch {
            return "\nNo plan found. Create .mirror/PLAN.md when starting a task.";
        }
    }

    private getActiveEditorContext(): string {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return "";
        const doc = editor.document;
        const line = editor.selection.active.line + 1;
        const relPath = vscode.workspace.asRelativePath(doc.uri);
        return `\nACTIVE FILE: ${relPath} (cursor at line ${line})`;
    }

    private async getGitContext(): Promise<string> {
        try {
            const { stdout } = await execAsync('git status --porcelain');
            if (!stdout.trim()) return "";
            return `\nUNCOMMITTED CHANGES:\n${stdout.trim()}`;
        } catch { return ""; }
    }

    private async getSystemPrompt(rootName: string, memoryIndex: string, turn: number, maxTurns: number, vramMB: number, _model: string, _isThinkingModel: boolean): Promise<string> {
        const gitCtx = await this.getGitContext();
        const planState = await this.loadPlanState();
        // ... (rest of method remains but I need to make it async)

        // ── Section 1: IDENTITY (fixed, cacheable) ──
        let personaLine = "";
        switch (this.persona) {
            case 'researcher': personaLine = "Role: Researcher. Focus: deep codebase understanding."; break;
            case 'debugger': personaLine = "Role: Debugger. Focus: crash logs, traces, fixes."; break;
            case 'sub-task': personaLine = "Role: Sub-agent helper. Focus: Solve the isolated MISSION efficiently."; break;
            default: personaLine = "Role: Architect. Focus: robust, maintainable systems.";
        }

        // ── Section 2: ENVIRONMENT (OS-aware) ──
        const osRules = this.osType === 'windows'
            ? `OS: Windows. Shell: cmd.exe.
IMPORTANT: Do NOT use bash/Linux commands. Specifically:
- Use "mkdir" not "mkdir -p" (the -p flag does not exist)
- Use "del" or "rmdir /s /q" not "rm" or "rm -rf"
- Use "copy" not "cp", "move" not "mv", "type" not "cat", "dir" not "ls"
- Use "echo." not "touch" to create empty files
- Prefer write_file tool over terminal for creating files with content
- Run ONE command at a time, avoid chaining with "&&"`
            : this.osType === 'mac'
                ? `OS: macOS. Shell: /bin/zsh. Standard Unix commands available.`
                : `OS: Linux. Shell: /bin/sh. Standard Unix commands available.`;

        // ── Section 3: PHASE (dynamic) ──
        let phase = "";
        if (turn <= 2) {
            phase = `[Turn ${turn}/${maxTurns}] PHASE: EXPLORE. Read existing files. Create .mirror/PLAN.md with checkboxes.`;
        } else if (turn <= Math.floor(maxTurns * 0.8)) {
            phase = `[Turn ${turn}/${maxTurns}] PHASE: EXECUTE. Follow your plan. Tick checkboxes as you complete steps.`;
        } else {
            phase = `[Turn ${turn}/${maxTurns}] PHASE: FINISH. Wrap up. Tick remaining checkboxes. Say DONE_TASK when verified.`;
        }

        const hwNote = vramMB < 4500 ? " [Low VRAM — be brief]" : "";

        // ── Section 4: TOOLS (concise) ──
        let toolsDef = `TOOLS (ONE per response, then wait):
Read: <read_file filepath="p" start_line="N" end_line="N" /> | <read_skeleton filepath="p" /> | <grep_search query="q" root="dir" /> | <list_dir dirpath="d" /> | <get_symbols filepath="p" /> | <get_diagnostics filepath="p" /> | <search_vector_db query="q" /> | <search_web query="q" /> | <recall_memory query="q" />
Write/Terminal: <write_file filepath="p">content</write_file> | <patch_file filepath="p"><search>old</search><replace>new</replace></patch_file> | <run_terminal command="cmd" dir="d" /> | <add_knowledge topic="t">facts</add_knowledge>
Interactive: <terminal_start command="cmd" dir="d" /> | <terminal_read terminalId="id" /> | <terminal_input terminalId="id" input="text" />
Delegate: <delegate mission="m" files="f1,f2" />`;

        if (this.mcpManager) {
            const mcpTools = await this.mcpManager.getAllTools();
            if (mcpTools.length > 0) {
                toolsDef += `\nEXTERNAL TOOLS (Model Context Protocol):\n`;
                for (const t of mcpTools) {
                    const params = Object.entries(t.inputSchema?.properties || {})
                        .map(([k, v]: [string, any]) => `${k}="${v.type || 'any'}"`)
                        .join(' ');
                    toolsDef += `<${t.name} ${params} /> : ${t.description}\n`;
                }
            }
        }

        // ── Section 5: PLAN FORMAT ──
        const planFormat = `PLAN FORMAT (.mirror/PLAN.md):
Use checkbox markdown. Tick items as you complete them:
- [ ] Not started
- [/] In progress  
- [x] Completed
After completing a step, use patch_file to change [ ] to [x] in PLAN.md.`;

        // ── Section 6: CONTEXT (dynamic, capped) ──
        // Cap knowledge index to prevent context overflow
        const maxIndexTokens = vramMB < 4500 ? 200 : 500;
        const cappedIndex = memoryIndex.length > maxIndexTokens * 4
            ? memoryIndex.substring(0, maxIndexTokens * 4) + '\n[...truncated. Use recall_memory for details.]'
            : memoryIndex;

        const editorCtx = this.getActiveEditorContext();

        // ── Assemble ──
        return `Mirror Code v2026.04 — autonomous coding agent. ${personaLine}${hwNote}
${osRules}
${phase}

${toolsDef}

${planFormat}

RULES:
1. Call ONE tool per response. Think → Tool → Wait.
2. Save state in .mirror/ folder. Plans, logs, knowledge.
3. Use relative paths to "${rootName}".
4. Output DONE_TASK only when goal is verified complete.
5. If a command fails, try write_file instead of retrying.
6. Use <terminal_start> for interactive processes (repl, dev servers).
7. Always <terminal_read> after sending <terminal_input> to see the result.
8. Use <delegate> for intensive research or isolated sub-tasks to save your context.
${editorCtx}

KNOWLEDGE:
${cappedIndex}

WORKSPACE: ${rootName}`;
    }

    private mergeHistory(history: any[]): any[] {
        if (history.length === 0) return [];
        const merged: any[] = [];
        for (const msg of history) {
            const last = merged[merged.length - 1];
            if (last && last.role === msg.role) {
                last.content += "\n\n" + msg.content;
            } else {
                merged.push({ ...msg });
            }
        }
        return merged;
    }
}
