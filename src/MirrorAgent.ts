import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { McpManager } from './McpManager';

const execAsync = promisify(exec);

// ─── Types ───────────────────────────────────────────────────────────

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
    metadata?: { command?: string; dir?: string };
}

// ─── Agent ───────────────────────────────────────────────────────────

export class MirrorAgent {
    private abortController: AbortController | undefined;
    private lastToolCall: string = "";
    private stutterCount: number = 0;
    private history: Turn[];
    private healingAttempts: Map<string, number> = new Map();
    private brainUrl: string = 'http://localhost:3000';
    private readonly osType: 'windows' | 'linux' | 'mac';
    private readonly shellName: string;
    private isProcessing: boolean = false;
    private isWaiting: boolean = false;
    private readonly rootPath: string;

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
        private readonly mcpManager?: McpManager,
        initialHistory?: Turn[]
    ) {
        this.history = initialHistory || [];
        this.rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        if (process.platform === 'win32') { this.osType = 'windows'; this.shellName = 'cmd.exe'; }
        else if (process.platform === 'darwin') { this.osType = 'mac'; this.shellName = '/bin/zsh'; }
        else { this.osType = 'linux'; this.shellName = '/bin/sh'; }
        this.log(`MirrorAgent initialized for ${this.osType} (Shell: ${this.shellName})`);
    }

    // ─── Public API (called by MirrorWebviewViewProvider) ────────────

    public isWaitingForUser(): boolean { return this.isWaiting; }
    public getHistory(): Turn[] { return this.history; }

    public handleStop() {
        this.log('Stop requested.');
        this.isWaiting = false;
        this.isProcessing = false;
        this.abortController?.abort();
    }

    public async handlePatchResult(filepath: string, diags: any[]) {
        if (this.isProcessing) { this.log(`[CONCURRENCY] Ignoring patch resume for ${filepath}.`); return; }
        const diagMsg = diags.length > 0
            ? `Patch applied with ${diags.length} diagnostic issue(s) in ${path.basename(filepath)}: ${JSON.stringify(diags.slice(0, 3))}`
            : `Patch applied and verified clean for ${path.basename(filepath)}.`;
        this.log(`Resuming after patch approval for ${filepath}`);
        this.history.push({ role: 'system', content: `[SYSTEM: USER APPROVED PATCH. ${diagMsg}]` });
        this.isWaiting = false;
        await this.handleUserMessage("");
    }

    public async handleTerminalResult(stdout: string, stderr: string) {
        if (this.isProcessing) { this.log('[CONCURRENCY] Ignoring terminal resume.'); return; }
        const result = (stdout + (stderr ? '\n' + stderr : '')) || "Command executed with no output.";
        this.log('Resuming after terminal approval.');
        this.history.push({ role: 'system', content: `[SYSTEM: USER APPROVED TERMINAL. Output:\n${result}]` });
        this.isWaiting = false;
        await this.handleUserMessage("");
    }

    // ─── Main Agent Loop ─────────────────────────────────────────────

    public async handleUserMessage(userMessage: string, maxTurnsOverride?: number) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.abortController = new AbortController(); // Fix 6: Initialize per-loop

        try {
            if (userMessage) this.history.push({ role: 'user', content: userMessage });

            // Fix 1: Read model config from VS Code settings
            const config = vscode.workspace.getConfiguration('mirror-code');
            const ollamaUrl = config.get<string>('ollamaUrl', 'http://localhost:11434');
            const ollamaModel = config.get<string>('ollamaModel', 'qwen3.5:4b');
            const isAutonomous = config.get<boolean>('autonomousMode', false);
            const maxTurns = maxTurnsOverride ?? config.get<number>('maxTurns', 100);

            this.log(`Using model: ${ollamaModel} at ${ollamaUrl} (autonomous=${isAutonomous}, maxTurns=${maxTurns})`);

            let turnCount = 0;
            while (turnCount < maxTurns) {
                // Fix 5: Aggressive context management
                this.compactHistoryIfNeeded();

                const systemPrompt = this.buildSystemPrompt(turnCount + 1, maxTurns);
                const messages = [{ role: 'system', content: systemPrompt }, ...this.history];

                try {
                    // Fix 8: Single-retry on empty responses
                    let fullReply = await this.streamOllamaChat(ollamaUrl, ollamaModel, messages);
                    if (!fullReply.trim()) {
                        this.log('Empty response. Retrying once...');
                        await new Promise(r => setTimeout(r, 800)); // Small pause
                        fullReply = await this.streamOllamaChat(ollamaUrl, ollamaModel, messages);
                    }

                    if (!fullReply.trim()) {
                        this.log('Empty response after retry. Breaking.');
                        this.post('onAssistantMessage', 'I received an empty response after retrying. The model might be stalled or your local Ollama server is overloaded.');
                        break;
                    }

                    this.history.push({ role: 'assistant', content: fullReply });
                    const toolCalls = this.extractAllToolCalls(fullReply);

                    if (toolCalls.length > 0) {
                        const tc = toolCalls[0];

                        // Stutter detection
                        if (tc.raw === this.lastToolCall) {
                            this.stutterCount++;
                            if (this.stutterCount >= 4) {
                                this.post('onAssistantMessage', 'I got stuck repeating the same action. Please rephrase or check your workspace.');
                                break;
                            }
                            this.history.push({ role: 'system', content: `[SYSTEM: STUTTER #${this.stutterCount}/4. You MUST try a different approach.]` });
                            turnCount++;
                            continue;
                        }
                        this.lastToolCall = tc.raw;
                        this.stutterCount = 0;

                        // Validation
                        const validation = this.validateToolCall(tc.raw, tc.name);
                        if (!validation.valid) {
                            this.history.push({ role: 'system', content: `[SYSTEM: Tool '${tc.name}' rejected: ${validation.error}]` });
                            turnCount++;
                            continue;
                        }

                        // Execution
                        const result = await this.executeSingleTool(tc, isAutonomous);

                        this.post('onToolTrace', {
                            label: result.label, category: result.category,
                            path: result.path, result: result.result.substring(0, 150),
                            metadata: result.metadata
                        });

                        if (['WAITING_FOR_USER_REVIEW', 'WAITING_FOR_TERMINAL_APPROVAL'].includes(result.result)) {
                            this.isWaiting = true;
                            return; // Pause loop; handlePatchResult/handleTerminalResult will resume
                        }

                        this.history.push({ role: 'system', content: `TOOL_RESULT (${tc.name}):\n${result.result}` });
                        turnCount++;
                    } else {
                        // Resilience: Handle "thinking-only" responses (common for 4B models)
                        const hasThought = /<(thinking|thought)>/.test(fullReply);
                        const cleanReply = fullReply.replace(/<(thinking|thought)>[\s\S]*?(?:<\/\1>|$)/g, '').trim();
                        
                        if (fullReply.includes('DONE_TASK')) {
                            let finalMsg = fullReply.replace(/DONE_TASK/g, '').trim();
                            if (!finalMsg) finalMsg = "Task completed. Please review the changes.";
                            this.post('onAssistantMessage', finalMsg);
                            break;
                        }

                        if (hasThought && cleanReply.length < 20) {
                            this.log('Thinking-only response detected. Nudging.');
                            this.history.push({ role: 'system', content: "[SYSTEM: Thinking noted. Please proceed to call a tool or provide a final answer to the user.]" });
                        } else {
                            this.history.push({ role: 'system', content: "[SYSTEM: No tool call detected. If you are finished, say DONE_TASK. Otherwise, call a tool.]" });
                        }
                        turnCount++;
                    }
                } catch (e: any) {
                    if (e.name === 'AbortError' || e.name === 'CanceledError') {
                        this.log('Request aborted by user.');
                        break;
                    }
                    this.log(`Loop error: ${e.message}`);
                    this.post('onAssistantMessage', `Error communicating with Ollama: ${e.message}. Make sure the model "${ollamaModel}" is available.`);
                    break;
                }
            }

            if (turnCount >= maxTurns) {
                this.post('onAssistantMessage', `*[Reached maximum ${maxTurns} turns. Send another message to continue.]*`);
            }
            this.post('onAssistantComplete', { sessionId: this.sessionId });
        } finally {
            this.isProcessing = false;
        }
    }

    // ─── Ollama Streaming (Fix 7: NDJSON-safe) ───────────────────────

    private async streamOllamaChat(url: string, model: string, messages: any[]): Promise<string> {
        const response = await axios.post(`${url}/api/chat`, {
            model, messages, stream: true,
            options: {
                num_ctx: 8192 // Fix: Increase small model default context
            }
        }, {
            responseType: 'stream',
            signal: this.abortController!.signal,
            timeout: 300000 // 5 min timeout for slow 4B reasoning models
        });

        let fullReply = "";
        let buffer = "";

        this.logRaw(`\n--- TURN START [${new Date().toISOString()}] (Model: ${model}) ---\n`);

        return new Promise<string>((resolve, reject) => {
            response.data.on('data', (chunk: Buffer) => {
                const raw = chunk.toString();
                this.logRaw(raw);
                buffer += raw;
                const lines = buffer.split('\n');
                buffer = lines.pop() || ""; // Keep incomplete line in buffer

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const json = JSON.parse(trimmed);
                        const chunkText = json.message?.content || json.message?.thinking || json.thinking || "";
                        if (chunkText) {
                            fullReply += chunkText;
                            this.post('onAssistantChunk', chunkText);
                        }
                        if (json.done && json.done_reason === 'load') {
                            this.log('[Stream] Model loaded successfully.');
                        }
                        if (json.done && json.done_reason === 'limit') {
                            this.log('[WARNING] Context window reached. Further output truncated.');
                        }
                    } catch (e) {
                        // Incomplete line
                    }
                }
            });

            response.data.on('end', () => {
                // Final peek at the buffer
                if (buffer.trim()) {
                    try {
                        const json = JSON.parse(buffer);
                        const chunkText = json.message?.content || json.message?.thinking || json.thinking || "";
                        if (chunkText) {
                            fullReply += chunkText;
                            this.post('onAssistantChunk', chunkText);
                        }
                    } catch { }
                }
                this.logRaw(`\n--- TURN END ---\n`);
                resolve(fullReply);
            });

            response.data.on('error', (err: Error) => reject(err));
        });
    }

    // ─── System Prompt (Fix 3 + 4: Dynamic tools, cacheable split) ───

    private buildSystemPrompt(turn: number, maxTurns: number): string {
        const now = new Date().toLocaleString();
        const rootName = path.basename(this.rootPath);

        // ── STATIC PREFIX (cacheable by Ollama) ──
        const osBlock = this.osType === 'windows'
            ? `OS: Windows. Shell: cmd.exe. NEVER use bash commands (mkdir -p, rm, cp, touch). Use write_file to create files.`
            : `OS: ${this.osType === 'mac' ? 'macOS' : 'Linux'}. Shell: ${this.shellName}.`;

        // Fix 3: Dynamic tool loading by phase
        const toolsBlock = this.getToolsForPhase(turn, maxTurns);

        // ── DYNAMIC SUFFIX (changes per turn) ──
        let phase: string;
        if (turn <= 2) phase = `PHASE: EXPLORE [${turn}/${maxTurns}]. Read files. Understand the task. Create .mirror/PLAN.md.`;
        else if (turn <= Math.floor(maxTurns * 0.85)) phase = `PHASE: EXECUTE [${turn}/${maxTurns}]. Follow your plan. Mark tasks done.`;
        else phase = `PHASE: FINISH [${turn}/${maxTurns}]. Wrap up. Verify. Say DONE_TASK.`;

        const planState = this.loadPlanSync();
        const editorCtx = this.getActiveEditorContext();
        const gitCtx = this.getGitContextSync();

        return `You are Mirror, an autonomous coding agent. ${osBlock}
DATE: ${now}. CWD: ${this.rootPath}. WORKSPACE: ${rootName}.

${phase}

${toolsBlock}

RULES:
1. Start EVERY response with <thought>reasoning</thought>.
2. Call exactly ONE tool per response, then STOP and wait for the result.
3. Use <update_plan> to manage .mirror/PLAN.md (never patch it manually).
4. Use relative paths from CWD. NEVER "cd" into CWD — you are already there.
5. Line numbers from read_file (e.g. "42 | code") are the source of truth for patches.
6. If a terminal command fails, use the [DIAGNOSTICS] context to fix it — don't guess.
7. When scaffolding (npm create, npx), use "." as target directory.
8. Say DONE_TASK when the task is fully complete.
${editorCtx}${gitCtx}${planState}`;
    }

    // Fix 3: Only load tools the model needs for the current phase
    private getToolsForPhase(turn: number, maxTurns: number): string {
        const read = `<read_file filepath="p" start_line="N" end_line="N" /> | <list_dir dirpath="d" /> | <read_skeleton filepath="p" /> | <search_vector_db query="q" /> | <grep_search query="q" root="d" /> | <get_diagnostics filepath="p" />`;
        const plan = `<update_plan name="task" status="todo|progress|done" newTasks="a,b,c" />`;
        const write = `<write_file filepath="p">content</write_file> | <patch_file filepath="p"><search>old</search><replace>new</replace></patch_file>`;
        const action = `<run_terminal command="c" dir="d" />`;
        const interactive = `<terminal_start command="c" dir="d" /> | <terminal_read terminalId="id" /> | <terminal_input terminalId="id" input="t" />`;
        const system = `<add_knowledge topic="t">facts</add_knowledge> | <search_web query="q" /> | <recall_memory query="q" /> | <delegate mission="m" files="f1,f2" />`;

        if (turn <= 2) {
            return `TOOLS (Explore Phase):\n${read}\n${plan}`;
        } else if (turn <= Math.floor(maxTurns * 0.85)) {
            return `TOOLS (Execute Phase):\n${read}\n${write}\n${action}\n${plan}\n${interactive}`;
        } else {
            return `TOOLS (All):\n${read}\n${write}\n${action}\n${plan}\n${interactive}\n${system}`;
        }
    }

    private loadPlanSync(): string {
        const planPath = path.join(this.rootPath, '.mirror', 'PLAN.md');
        try {
            const data = fs.readFileSync(planPath, 'utf8');
            const checkboxes = data.split('\n').filter(l => /^\s*-\s*\[[ x\/]\]/.test(l));
            return checkboxes.length > 0 ? `\nPLAN:\n${checkboxes.join('\n')}` : `\nPLAN EXISTS (.mirror/PLAN.md, ${data.length} chars)`;
        } catch { return "\nNo plan yet. Create .mirror/PLAN.md when starting a task."; }
    }

    private getActiveEditorContext(): string {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return "";
            return `\nACTIVE FILE: ${vscode.workspace.asRelativePath(editor.document.uri)} (line ${editor.selection.active.line + 1})`;
        } catch { return ""; }
    }

    private getGitContextSync(): string {
        try {
            const { execSync } = require('child_process');
            const stdout = execSync('git status --short', { cwd: this.rootPath, timeout: 3000 }).toString().trim();
            return stdout ? `\nGIT:\n${stdout}` : "";
        } catch { return ""; }
    }

    // ─── Context Management (Fix 5: Aggressive for 4B) ───────────────

    private compactHistoryIfNeeded() {
        // For 4B models: keep history under ~2000 tokens (~8000 chars)
        const totalChars = this.history.reduce((s, t) => s + t.content.length, 0);
        if (totalChars < 6000 || this.history.length < 8) return;

        this.log(`Context pressure: ~${Math.ceil(totalChars / 4)} tokens, ${this.history.length} turns. Compacting.`);

        const keepFirst = 2; // Original goal
        const keepLast = 4;  // Immediate context (smaller for 4B)
        const middle = this.history.slice(keepFirst, -keepLast);

        const summaryParts: string[] = [];
        for (const turn of middle) {
            if (turn.role === 'assistant') {
                const tool = /<(\w+)\s/.exec(turn.content);
                if (tool) summaryParts.push(`Used: ${tool[1]}`);
            } else if (turn.role === 'system' && (turn.content.includes('Error') || turn.content.includes('DIAGNOSTICS'))) {
                summaryParts.push(turn.content.substring(0, 100));
            }
        }

        this.history = [
            ...this.history.slice(0, keepFirst),
            { role: 'system', content: `[CONTEXT COMPACTED: ${middle.length} turns → ${summaryParts.slice(-8).join(' | ')}]` },
            ...this.history.slice(-keepLast)
        ];
    }

    // ─── Tool Call Validation ─────────────────────────────────────────

    private readonly REQUIRED_ATTRS: Record<string, string[]> = {
        'read_file': ['filepath'], 'read_skeleton': ['filepath'], 'grep_search': ['query'],
        'list_dir': ['dirpath'], 'get_symbols': ['filepath'], 'get_diagnostics': ['filepath'],
        'search_vector_db': ['query'], 'search_web': ['query'], 'recall_memory': ['query'],
        'write_file': ['filepath'], 'patch_file': ['filepath'], 'run_terminal': ['command'],
        'update_plan': ['name', 'status'], 'add_knowledge': ['topic'], 'delegate': ['mission'],
    };

    private readonly DANGEROUS_PATTERNS = [
        /rm\s+-rf\s+[\/\\](?!tmp)/i, /del\s+\/[sfq]\s+[a-z]:\\/i,
        /format\s+[a-z]:/i, /DROP\s+(TABLE|DATABASE)/i,
        />\/dev\/sd/i, /mkfs\./i, /shutdown/i, /rd\s+\/s\s+\/q\s+[a-z]:\\/i,
    ];

    private validateToolCall(raw: string, name: string): { valid: boolean; error?: string } {
        if (name.startsWith('mcp_')) return { valid: true };
        const required = this.REQUIRED_ATTRS[name];
        if (required) {
            for (const attr of required) {
                if (!this.getAttr(raw, attr)) return { valid: false, error: `Missing '${attr}' for <${name}>.` };
            }
        }
        if (name === 'run_terminal') {
            const cmd = this.getAttr(raw, 'command');
            for (const p of this.DANGEROUS_PATTERNS) {
                if (p.test(cmd)) return { valid: false, error: `BLOCKED: Dangerous pattern in command.` };
            }
        }
        return { valid: true };
    }

    // ─── Tool Extraction ─────────────────────────────────────────────

    private readonly SELF_CLOSING_TOOLS = [
        'search_vector_db', 'grep_search', 'read_skeleton', 'read_file',
        'get_symbols', 'get_diagnostics', 'list_dir', 'run_terminal',
        'recall_memory', 'search_web', 'update_plan', 'terminal_read'
    ];
    private readonly BODY_TOOLS = ['patch_file', 'write_file', 'add_knowledge', 'delegate', 'terminal_input', 'terminal_start'];

    private extractAllToolCalls(text: string): ToolCall[] {
        const calls: ToolCall[] = [];
        const allTools = [...this.SELF_CLOSING_TOOLS, ...this.BODY_TOOLS];
        const readOnly = new Set(['search_vector_db', 'grep_search', 'read_skeleton', 'read_file', 'get_symbols', 'get_diagnostics', 'list_dir', 'recall_memory', 'search_web', 'terminal_read']);

        // Fix: Unified regex that matches:
        // 1. <tool name="val" /> (Self-closing)
        // 2. <tool name="val">body</tool> (With body)
        // 3. <mcp_tool ...> (MCP variant)
        const toolNames = `(?:${allTools.join('|')}|mcp_\\w+)`;
        const unifiedPat = new RegExp(`<(${toolNames})(\\s+[\\s\\S]*?)?(?:\\/>|>([\\s\\S]*?)<\\/\\1>)`, 'g');

        let m;
        while ((m = unifiedPat.exec(text)) !== null) {
            calls.push({
                raw: m[0],
                name: m[1],
                isReadOnly: readOnly.has(m[1])
            });
        }

        calls.sort((a, b) => text.indexOf(a.raw) - text.indexOf(b.raw));
        return calls;
    }

    private getAttr(toolCall: string, name: string): string {
        // Fix: Handle escaped quotes inside attribute values
        const m = new RegExp(`${name}=(?:["']((?:\\\\.|[^"'])*?)["']|([^\\s/>]+))`).exec(toolCall);
        const val = m?.[1] ?? m?.[2] ?? "";
        return this.unescapeAttr(val);
    }

    private unescapeAttr(val: string): string {
        return val
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
    }

    private getAllAttrs(toolCall: string): Record<string, string> {
        const attrs: Record<string, string> = {};
        const re = /(\w+)=(?:["']([^"']*?)["']|([^\s/>]+))/g;
        let m;
        while ((m = re.exec(toolCall)) !== null) attrs[m[1]] = m[2] ?? m[3];
        return attrs;
    }

    // ─── Tool Execution ──────────────────────────────────────────────

    private async executeSingleTool(tc: ToolCall, isAutonomous: boolean): Promise<ToolResult> {
        const t0 = Date.now();
        const raw = tc.raw;
        const ga = (n: string) => this.getAttr(raw, n);
        let result = "", label = "", tracePath: string | undefined;

        try {
            // MCP Tools
            if (tc.name.startsWith('mcp_') && this.mcpManager) {
                const parts = tc.name.split('_');
                const r = await this.mcpManager.callTool(parts[1], parts.slice(2).join('_'), this.getAllAttrs(raw));
                result = JSON.stringify(r); label = `MCP: ${tc.name}`;
            } else {
                switch (tc.name) {
                    // ── Read Tools ──
                    case 'read_file': {
                        const fp = this.resolvePath(ga('filepath'));
                        const res = await axios.post(`${this.brainUrl}/tools/read_file`, { filepath: fp, start_line: ga('start_line'), end_line: ga('end_line') });
                        const s = parseInt(res.data.start || 1);
                        result = res.data.content.split('\n').map((l: string, i: number) => `${s + i} | ${l}`).join('\n');
                        if (ga('start_line') || ga('end_line')) result = `[lines ${res.data.start}-${res.data.end} of ${res.data.totalLines}]\n${result}`;
                        label = `Read: ${path.basename(fp)}`; tracePath = fp;
                        break;
                    }
                    case 'list_dir': {
                        const dp = this.resolvePath(ga('dirpath'));
                        const res = await axios.post(`${this.brainUrl}/tools/list_dir`, { dirpath: dp });
                        result = JSON.stringify(res.data.files); label = `List: ${path.basename(dp)}`;
                        break;
                    }
                    case 'read_skeleton': {
                        const fp = this.resolvePath(ga('filepath'));
                        const res = await axios.post(`${this.brainUrl}/tools/read_skeleton`, { filepath: fp });
                        result = JSON.stringify(res.data.signals); label = `Skeleton: ${path.basename(fp)}`;
                        break;
                    }
                    case 'search_vector_db': {
                        const res = await axios.post(`${this.brainUrl}/tools/search_vector_db`, { query: ga('query') });
                        result = JSON.stringify(res.data.results); label = `Search: ${ga('query')}`;
                        break;
                    }
                    case 'grep_search': {
                        const res = await axios.post(`${this.brainUrl}/tools/grep_search`, { query: ga('query'), root: this.resolvePath(ga('root') || ".") });
                        result = JSON.stringify(res.data.results); label = `Grep: ${ga('query')}`;
                        break;
                    }
                    case 'get_symbols': {
                        const syms = await vscode.commands.executeCommand('mirror-code.getSymbols', vscode.Uri.file(this.resolvePath(ga('filepath'))).toString()) as any[];
                        result = JSON.stringify(syms); label = `Symbols`;
                        break;
                    }
                    case 'get_diagnostics': {
                        const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(this.resolvePath(ga('filepath'))).toString()) as any[];
                        result = diags.length > 0 ? JSON.stringify(diags) : "No diagnostics. Code is clean.";
                        label = `Diagnostics`;
                        break;
                    }
                    case 'search_web': {
                        const res = await axios.post(`${this.brainUrl}/tools/search_web`, { query: ga('query') });
                        result = JSON.stringify(res.data.results); label = `Web: ${ga('query')}`;
                        break;
                    }
                    case 'recall_memory': {
                        const memPath = path.join(this.rootPath, '.mirror', 'memory.json');
                        if (!fs.existsSync(memPath)) { result = "No memories found."; }
                        else {
                            const q = ga('query').toLowerCase();
                            const memory = JSON.parse(fs.readFileSync(memPath, 'utf8'));
                            const matches = (memory.stones as any[]).filter((s: any) => s.topic.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)).slice(0, 3);
                            result = matches.length > 0 ? JSON.stringify(matches) : "No match.";
                        }
                        label = `Recall: ${ga('query')}`;
                        break;
                    }

                    // ── Write Tools ──
                    case 'write_file': {
                        const fp = this.resolvePath(ga('filepath'));
                        // Fallback: Check for 'content' attribute if body is missing
                        let content = /<write_file[^>]*>([\s\S]*?)<\/write_file>/.exec(raw)?.[1];
                        if (content === undefined) content = ga('content');

                        const res = await axios.post(`${this.brainUrl}/tools/write_file`, { filepath: fp, content });
                        result = res.data.status === 'success' ? `Wrote ${path.basename(fp)}` : `Error: ${res.data.error}`;
                        result += await this.checkDiagnostics(fp);
                        label = `Write: ${path.basename(fp)}`; tracePath = fp;
                        break;
                    }
                    case 'patch_file': {
                        const fpRaw = ga('filepath');
                        const fp = this.resolvePath(fpRaw);
                        const blocks: any[] = [];
                        const bp = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/g;
                        let bm; while ((bm = bp.exec(raw)) !== null) blocks.push({ search: bm[1], replace: bm[2] });

                        if (blocks.length === 0) {
                            result = "Error: No <search>/<replace> blocks found. Ensure you wrap changes in these tags.";
                            break;
                        }
                        if (isAutonomous) {
                            await axios.post(`${this.brainUrl}/tools/patch_file`, { filepath: fp, blocks, previewOnly: false });
                            result = "Patch applied." + await this.checkDiagnostics(fp);
                        } else {
                            const res = await axios.post(`${this.brainUrl}/tools/patch_file`, { filepath: fp, blocks, previewOnly: true });
                            this.post('requestDiffReview', { filepath: fpRaw, original: res.data.original, content: res.data.content, blocks, sessionId: this.sessionId });
                            return { label: `Patch: ${path.basename(fp)}`, category: 'planning', path: fp, result: 'WAITING_FOR_USER_REVIEW', durationMs: Date.now() - t0 };
                        }
                        label = `Patch: ${path.basename(fp)}`; tracePath = fp;
                        break;
                    }

                    // ── Action Tools ──
                    case 'run_terminal': {
                        const cmd = ga('command');
                        const dir = this.resolvePath(ga('dir') || ".");
                        if (isAutonomous) {
                            try {
                                const res = await this.provider.executeIntegratedTerminal(cmd, dir);
                                result = res.stdout || "Command completed (no output).";
                                if (res.exitCode !== 0) {
                                    result += `\n[Exit code: ${res.exitCode}]`;
                                    // Self-healing: search codebase for error context
                                    try {
                                        const errSnippet = result.slice(-400).trim();
                                        const searchRes = await axios.post(`${this.brainUrl}/tools/search_vector_db`, { query: errSnippet });
                                        const hits = searchRes.data.results;
                                        if (hits?.length > 0) {
                                            result += `\n\n[MIRROR SELF-HEALING DIAGNOSTICS]\n`;
                                            hits.slice(0, 3).forEach((r: any) => {
                                                result += `- ${r.type} ${r.name} (${r.file}:${r.line}): ${(r.content || '').substring(0, 200)}\n`;
                                            });
                                        }
                                    } catch { }
                                }
                            } catch (err: any) { result = `Terminal error: ${err.message}`; }
                        } else {
                            this.post('requestTerminalReview', { command: cmd, dir, sessionId: this.sessionId });
                            return { label: `Terminal: ${cmd}`, category: 'executing', path: dir, result: 'WAITING_FOR_TERMINAL_APPROVAL', durationMs: Date.now() - t0, metadata: { command: cmd, dir } };
                        }
                        label = `Terminal: ${cmd}`;
                        break;
                    }
                    case 'update_plan': {
                        const res = await axios.post(`${this.brainUrl}/tools/update_plan`, {
                            rootPath: this.rootPath, name: ga('name'), status: ga('status'),
                            newTasks: ga('newTasks') ? ga('newTasks').split(',').map(t => t.trim()) : []
                        });
                        result = res.data.status === 'success' ? `Plan updated: "${ga('name')}" → ${ga('status')}` : `Error: ${res.data.error}`;
                        label = `Plan: ${ga('name')}`;
                        break;
                    }

                    // ── Interactive Terminal ──
                    case 'terminal_start': {
                        const content = /<terminal_start[^>]*>([\s\S]*?)<\/terminal_start>/.exec(raw)?.[1] || "";
                        const cmd = ga('command') || content.trim();
                        const id = await this.provider.startBackgroundTerminal(cmd, this.resolvePath(ga('dir') || "."));
                        result = `Terminal ${id} started. Use <terminal_read terminalId="${id}" /> to see output.`;
                        label = `Start: ${cmd}`;
                        break;
                    }
                    case 'terminal_read': {
                        result = this.provider.readTerminalOutput(ga('terminalId')) || "No output yet.";
                        label = `Read Terminal ${ga('terminalId')}`;
                        break;
                    }
                    case 'terminal_input': {
                        const content = /<terminal_input[^>]*>([\s\S]*?)<\/terminal_input>/.exec(raw)?.[1] || "";
                        const input = ga('input') || content.trim();
                        await this.provider.sendTerminalInput(ga('terminalId'), input);
                        result = `Input sent to terminal ${ga('terminalId')}.`;
                        label = `Input Terminal`;
                        break;
                    }

                    // ── System Tools ──
                    case 'add_knowledge': {
                        const facts = /<add_knowledge[^>]*>([\s\S]*?)<\/add_knowledge>/.exec(raw)?.[1] || "";
                        result = await this.addKnowledge(ga('topic'), facts); label = `Knowledge: ${ga('topic')}`;
                        break;
                    }
                    case 'delegate': {
                        const mission = /<delegate[^>]*>([\s\S]*?)<\/delegate>/.exec(raw)?.[1] || ga('mission');
                        const files = ga('files') ? ga('files').split(',').map(f => f.trim()) : [];
                        result = await this.runSubAgent(mission, files); label = `Delegate`;
                        break;
                    }
                    default: result = `Error: Unknown tool '${tc.name}'.`; label = tc.name;
                }
            }
        } catch (err: any) {
            result = `Error: ${err.response?.data?.error || err.message}`;
            label = label || tc.name;
        }

        result = this.truncateToolResult(result, tc.name);
        return { label, category: 'executing', path: tracePath, result, durationMs: Date.now() - t0 };
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private log(msg: string) { this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`); }

    private post(type: string, value: any = null) {
        this.provider.postMessageToWebview({ type, value, sessionId: this.sessionId, isSubAgent: this.isSubAgent });
    }

    private resolvePath(p: string): string {
        if (!p || p === "." || p === "./") return this.rootPath;
        
        // 1. If absolute and exists, use it
        if (path.isAbsolute(p)) {
            try { if (fs.existsSync(p)) return p; } catch { }
        }

        // 2. Normalize and clean the input
        let clean = path.normalize(p).replace(/[\\\/]+$/, '').replace(/^([a-zA-Z]:)?[\\\/]+/, '');
        
        // 3. Robust de-duplication: 
        // We look for the longest suffix of rootPath that is a prefix of the input path.
        // e.g. root: /a/b/c, input: b/c/d -> overlap is b/c. Result: /a/b/c/d
        const rootParts = this.rootPath.split(/[\\\/]/).filter(Boolean);
        const inputParts = clean.split(/[\\\/]/).filter(Boolean);
        
        let overlapSize = 0;
        const maxPossibleOverlap = Math.min(rootParts.length, inputParts.length);
        
        for (let size = 1; size <= maxPossibleOverlap; size++) {
            const rootSuffix = rootParts.slice(-size);
            const inputPrefix = inputParts.slice(0, size);
            
            const isMatch = rootSuffix.every((s, i) => s.toLowerCase() === inputPrefix[i].toLowerCase());
            if (isMatch) {
                overlapSize = size;
            }
        }

        if (overlapSize > 0) {
            return path.join(this.rootPath, ...inputParts.slice(overlapSize));
        }

        // 4. Default: join directly
        return path.join(this.rootPath, clean);
    }

    // Fix 5: Tighter truncation limits for 4B models
    private truncateToolResult(result: string, toolName: string): string {
        const lines = result.split('\n');
        switch (toolName) {
            case 'read_file': case 'read_skeleton': {
                if (lines.length > 150) {
                    const head = lines.slice(0, 100).join('\n');
                    const tail = lines.slice(-30).join('\n');
                    return `${head}\n\n[... ${lines.length - 130} lines omitted. Use start_line/end_line to read specific ranges. ...]\n\n${tail}`;
                }
                return result;
            }
            case 'grep_search': {
                try {
                    const parsed = JSON.parse(result);
                    if (Array.isArray(parsed) && parsed.length > 10) return JSON.stringify(parsed.slice(0, 10)) + `\n[${parsed.length - 10} more matches omitted]`;
                } catch { }
                return result.length > 6000 ? result.substring(0, 6000) + '\n[truncated]' : result;
            }
            case 'list_dir': {
                try {
                    const files = JSON.parse(result);
                    if (Array.isArray(files) && files.length > 40) {
                        const first = files.slice(0, 20).map((f: any) => f.name || f);
                        return `Directory has ${files.length} items. First 20: ${JSON.stringify(first)}`;
                    }
                } catch { }
                return result;
            }
            case 'run_terminal': case 'terminal_read': {
                if (lines.length > 60) {
                    return lines.slice(0, 15).join('\n') + `\n\n[... ${lines.length - 35} lines omitted ...]\n\n` + lines.slice(-20).join('\n');
                }
                return result;
            }
            case 'search_vector_db': return result.length > 4000 ? result.substring(0, 4000) + '\n[truncated]' : result;
            default: return result.length > 8000 ? result.substring(0, 8000) + '\n[truncated]' : result;
        }
    }

    private async checkDiagnostics(filepath: string): Promise<string> {
        try {
            const attempts = this.healingAttempts.get(filepath) || 0;
            if (attempts >= 3) return "";
            const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(filepath).toString()) as any[];
            const errors = diags.filter((d: any) => d.severity === 'Error');
            if (errors.length > 0) {
                this.healingAttempts.set(filepath, attempts + 1);
                return `\n[DIAGNOSTICS: ${errors.length} error(s): ${JSON.stringify(errors.slice(0, 3))}]`;
            }
            this.healingAttempts.delete(filepath);
        } catch { }
        return "";
    }

    private async addKnowledge(topic: string, content: string): Promise<string> {
        const dir = path.join(this.rootPath, '.mirror', 'knowledge');
        const safe = topic.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(path.join(dir, `${safe}.md`), `\n## [${new Date().toISOString()}]\n${content}\n`);
            return `Knowledge saved to .mirror/knowledge/${safe}.md`;
        } catch (e: any) { return `Failed: ${e.message}`; }
    }

    private async runSubAgent(mission: string, contextFiles: string[]): Promise<string> {
        this.log(`Spawning sub-agent: ${mission}`);
        const sub = new MirrorAgent(this.sessionId, this.provider, this.output, this.defaultReadLines, 'sub-task', true);
        let prompt = `MISSION: ${mission}\n\nCONTEXT:\n`;
        for (const f of contextFiles) {
            try { prompt += `--- ${f} ---\n${fs.readFileSync(this.resolvePath(f), 'utf8').substring(0, 2000)}\n`; } catch { }
        }
        prompt += '\nYou have 5 turns. End with a summary.';
        await sub.handleUserMessage(prompt, 5);
        const h = sub.getHistory();
        const last = [...h].reverse().find(m => m.role === 'assistant');
        return `[SUB-AGENT RESULT]\n${last?.content || "No summary."}`;
    }

    private logRaw(data: string) {
        try {
            const logDir = path.join(this.rootPath, '.mirror', 'logs');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            const logPath = path.join(logDir, 'ollama_raw.log');
            fs.appendFileSync(logPath, data);
        } catch {
            // Silently fail if logging fails
        }
    }
}
