import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as http from 'http';

export class MirrorAgent {
    private abortController?: AbortController;
    private turnSummaries: string[] = [];

    constructor(
        private readonly sessionId: string,
        private readonly provider: { postMessageToWebview: (message: any) => void },
        private readonly output: vscode.OutputChannel
    ) { }

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

        // 1. Normalize the path (resolve any .. or //)
        let normalized = path.normalize(p).replace(/[\\\/]+$/, '');

        // 2. Prison Mode (Base behavior): Strip drive letters and leading slashes 
        // This ensures "C:\Windows\..." becomes "Windows\..." relative to the root.
        let stripped = normalized.replace(/^([a-zA-Z]:)?[\\\/]+/, '').replace(/\.\.\//g, '');
        
        // 3. Handle Hallucinated Root Prefix recursively
        // Some models include the workspace folder name multiple times:
        // "OllamaModels/OllamaModels/test.txt" -> "test.txt"
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

        // 4. Force interpretation relative to the actual workspace root
        return path.join(root, stripped);
    }

    private async summarizeHistory(history: string, ollamaUrl: string, ollamaModel: string): Promise<string> {
        this.log("Summarizing history to save context...");
        this.provider.postMessageToWebview({ 
            type: 'onToolTrace', 
            value: { label: 'Compressing Context...', category: 'analyzing' },
            sessionId: this.sessionId
        });
        try {
            const res = await axios.post(`${ollamaUrl}/api/generate`, {
                model: ollamaModel,
                prompt: `Summarize the following conversation history into a concise state description (max 2 sentences) that captures the user's goal and what has been accomplished so far. Focus on facts.\n\n${history}\n\nSummary:`,
                stream: false
            }, { signal: this.abortController?.signal });
            return res.data.response;
        } catch (e) {
            this.log(`Summarization failed: ${e}`);
            return "History compression failed. Continuing with raw history.";
        }
    }

    public async handleUserMessage(text: string, mode: 'planning' | 'coding' = 'coding') {
        const config = vscode.workspace.getConfiguration('mirror-code');
        const maxTurns = config.get<number>('maxTurns') || 5;
        this.log(`--- New Session (${mode}, maxTurns: ${maxTurns}) ---`);
        this.log(`User Input: "${text}"`);

        let turn = 0;
        let history = `User: ${text}\n`;
        this.abortController = new AbortController();

        const completeToolPattern = /<(search_vector_db|read_skeleton|read_file|get_symbols|get_diagnostics|list_dir|run_terminal)\s+[^>]*\/>|<patch_file\s+[^>]*>[\s\S]*?<\/patch_file>/;

        while (turn < maxTurns) {
            if (this.abortController.signal.aborted) {
                this.log('Aborted mid-turn.');
                break;
            }

            if (turn > 0 && turn % 5 === 0) {
                const ollamaUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
                const ollamaModel = config.get<string>('ollamaModel') || 'codellama';
                const summary = await this.summarizeHistory(history, ollamaUrl, ollamaModel);
                history = `[CONTEXT COMPRESSED] Previous activities: ${summary}\n`;
            }

            const ollamaUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
            const ollamaModel = config.get<string>('ollamaModel') || 'codellama';

            const rootName = vscode.workspace.workspaceFolders?.[0]?.name || "current project";
            const systemPrompt = mode === 'planning' ?
                `You are Mirror Code in PLANNING mode. Focus on architectural advice. No file writing.
IMPORTANT: You are OPERATING ONLY WITHIN the "${rootName}" workspace. Use ONLY relative paths.
If you need to call a tool, output the XML tag and STOP immediately. Do NOT hallucinate results.
Tools: 
1. <search_vector_db query="term" />
2. <read_skeleton filepath="path" />
3. <read_file filepath="path" />
4. <list_dir dirpath="path" />` :
                `You are Mirror Code in CODING mode (Autopilot 2.0). Always confirm functionality by reading diagnostics after changes.
IMPORTANT: You are OPERATING ONLY WITHIN the "${rootName}" workspace. Use ONLY relative paths.
If you need to call a tool, output the XML tag and STOP immediately. Do NOT hallucinate results.
Tools: 
1. <search_vector_db query="term" />
2. <read_skeleton filepath="path" />
3. <read_file filepath="path" />
4. <patch_file filepath="path">
<search>EXISTING CODE</search>
<replace>NEW CODE</replace>
</patch_file>
5. <get_symbols filepath="path" />
6. <get_diagnostics filepath="path" />
7. <list_dir dirpath="path" />
8. <run_terminal command="cmd" />`;

            try {
                const statusMsg = `Turn ${turn + 1}: Contacting ${ollamaModel}...`;
                this.log(statusMsg);
                this.provider.postMessageToWebview({ 
                    type: 'onToolTrace', 
                    value: { label: statusMsg, category: 'analyzing' },
                    sessionId: this.sessionId
                });

                this.log(`Turn ${turn + 1}: Contacting Ollama (${ollamaModel}) at ${ollamaUrl}...`);
                const url = new URL(`${ollamaUrl}/api/generate`);
                const postData = JSON.stringify({
                    model: ollamaModel,
                    prompt: `${systemPrompt}\n\nHistory:\n${history}\n\nAssistant:`,
                    stream: true,
                    options: { num_ctx: 8192 }
                });

                let fullReply = "";
                let buffer = "";

                await new Promise((resolve, reject) => {
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

                                        if (completeToolPattern.test(fullReply)) {
                                            req.destroy();
                                            resolve(true);
                                            return;
                                        }

                                        const lastOpen = fullReply.lastIndexOf('<');
                                        const isPotentialTool = lastOpen !== -1 && /<[a-zA-Z_]/.test(fullReply.slice(lastOpen));

                                        if (!isPotentialTool) {
                                            this.provider.postMessageToWebview({ 
                                                type: 'onAssistantChunk', 
                                                value: json.response,
                                                sessionId: this.sessionId
                                            });
                                        }
                                    }
                                    if (json.done) resolve(true);
                                } catch (e) {}
                            }
                        });
                    });

                    req.on('error', (e) => {
                        if (e.message !== 'socket hang up') {
                            this.log(`Ollama Request Error: ${e.message}`);
                            reject(e);
                        } else {
                            resolve(true);
                        }
                    });
                    req.write(postData);
                    req.end();
                });

                const match = completeToolPattern.exec(fullReply);

                if (match) {
                    const toolCall = match[0];
                    let toolResult = "";
                    let traceLabel = "";
                    let traceCategory: 'analyzing' | 'planning' | 'executing' = 'analyzing';

                    try {
                        const getAttr = (name: string) => new RegExp(`(?:${name})=["']([^"']+)["']`).exec(toolCall)?.[1] || "";
                        
                        if (toolCall.includes('<search_vector_db')) {
                            const q = getAttr('query');
                            traceLabel = `Searching: ${q}`;
                            this.log(`Tool: search_vector_db("${q}")`);
                            this.provider.postMessageToWebview({ 
                                type: 'onToolTrace', 
                                value: { label: traceLabel, category: 'analyzing' },
                                sessionId: this.sessionId
                            });
                            const res = await axios.post('http://localhost:3000/tools/search_vector_db', { query: q }, { signal: this.abortController.signal });
                            toolResult = JSON.stringify(res.data.results);
                        } else if (toolCall.includes('<read_skeleton')) {
                            const fp = this.resolvePath(getAttr('filepath'));
                            traceLabel = `Skeleton: ${path.basename(fp)}`;
                            this.log(`Tool: read_skeleton("${fp}")`);
                            this.provider.postMessageToWebview({ 
                                type: 'onToolTrace', 
                                value: { label: traceLabel, category: 'analyzing' },
                                sessionId: this.sessionId
                            });
                            const res = await axios.post('http://localhost:3000/tools/read_skeleton', { filepath: fp }, { signal: this.abortController.signal });
                            toolResult = JSON.stringify(res.data.signals);
                        } else if (toolCall.includes('<read_file')) {
                            const fp = this.resolvePath(getAttr('filepath'));
                            traceLabel = `Reading: ${path.basename(fp)}`;
                            this.log(`Tool: read_file("${fp}")`);
                            this.provider.postMessageToWebview({ 
                                type: 'onToolTrace', 
                                value: { label: traceLabel, category: 'analyzing' },
                                sessionId: this.sessionId
                            });
                            const res = await axios.post('http://localhost:3000/tools/read_file', { filepath: fp }, { signal: this.abortController.signal });
                            toolResult = res.data.content;
                        } else if (toolCall.includes('<patch_file')) {
                            const fp = this.resolvePath(getAttr('filepath'));
                            const content = /<patch_file\s+[^>]*>([\s\S]*?)<\/patch_file>/.exec(toolCall)?.[1] || "";
                            this.log(`Tool: patch_file("${fp}")`);
                            traceCategory = 'executing';
                            const blocks: any[] = [];
                            const blockRegex = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/g;
                            let m;
                            while ((m = blockRegex.exec(content)) !== null) { blocks.push({ search: m[1], replace: m[2] }); }
                            const res = await axios.post('http://localhost:3000/tools/patch_file', { filepath: fp, blocks, previewOnly: true }, { signal: this.abortController.signal });
                            this.provider.postMessageToWebview({ 
                                type: 'requestDiffReview', 
                                value: { filepath: fp, blocks, original: res.data.original, modified: res.data.content },
                                sessionId: this.sessionId
                            });
                            return;
                        } else if (toolCall.includes('<get_symbols')) {
                            const fp = this.resolvePath(getAttr('filepath'));
                            this.log(`Tool: get_symbols("${fp}")`);
                            traceLabel = `Symbols: ${path.basename(fp)}`;
                            const syms = await vscode.commands.executeCommand('mirror-code.getSymbols', vscode.Uri.file(fp).toString());
                            toolResult = JSON.stringify(syms);
                        } else if (toolCall.includes('<get_diagnostics')) {
                            const fp = this.resolvePath(getAttr('filepath'));
                            traceLabel = `Diagnostics: ${path.basename(fp)}`;
                            this.log(`Tool: get_diagnostics("${fp}")`);
                            this.provider.postMessageToWebview({ 
                                type: 'onToolTrace', 
                                value: { label: traceLabel, category: 'analyzing' },
                                sessionId: this.sessionId
                            });
                            const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(fp).toString());
                            toolResult = JSON.stringify(diags);
                        } else if (toolCall.includes('<list_dir')) {
                            const dp = this.resolvePath(getAttr('dirpath'));
                            traceLabel = `Listing: ${path.basename(dp)}`;
                            this.log(`Tool: list_dir("${dp}")`);
                            this.provider.postMessageToWebview({ 
                                type: 'onToolTrace', 
                                value: { label: traceLabel, category: 'analyzing' },
                                sessionId: this.sessionId
                            });
                            const res = await axios.post('http://localhost:3000/tools/list_dir', { dirpath: dp }, { signal: this.abortController.signal });
                            toolResult = JSON.stringify(res.data.files);
                        } else if (toolCall.includes('<run_terminal')) {
                            const cmd = getAttr('command');
                            traceLabel = `Terminal: ${cmd}`;
                            this.log(`Tool: run_terminal("${cmd}")`);
                            this.provider.postMessageToWebview({ 
                                type: 'onToolTrace', 
                                value: { label: traceLabel, category: 'executing' },
                                sessionId: this.sessionId
                            });
                            const res = await axios.post('http://localhost:3000/tools/run_terminal', { command: cmd, cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath }, { signal: this.abortController.signal });
                            toolResult = res.data.stdout + res.data.stderr;
                        }
                    } catch (err: any) {
                        this.log(`Tool Exception: ${err.name} - ${err.message}`);
                        let errorMsg = err.message || 'Unknown error';
                        if (err.response && err.response.data && err.response.data.error) {
                            errorMsg = `API Error [${err.response.status}]: ${err.response.data.error}`;
                        } else if (err.response) {
                            errorMsg = `API Error [${err.response.status}]: ${JSON.stringify(err.response.data) || err.message}`;
                        }
                        
                        this.log(`Tool Failed: ${errorMsg}`);
                        toolResult = `Error: ${errorMsg}`;
                        traceCategory = 'analyzing'; 
                        traceLabel = "Tool Error";
                    }

                    const toolSummary = toolResult.length > 100 ? `${toolResult.substring(0, 100)}...` : toolResult;
                    this.provider.postMessageToWebview({ 
                        type: 'onToolTrace', 
                        value: { label: traceLabel, category: traceCategory, result: toolSummary },
                        sessionId: this.sessionId
                    });

                    history += `Assistant: ${toolCall}\nSystem: ${toolResult}\n`;
                    this.turnSummaries.push(`Turn ${turn + 1}: ${toolResult.substring(0, 200)}...`);
                    turn++;
                } else {
                    this.log('Turn complete (No more tools called).');
                    this.provider.postMessageToWebview({ 
                        type: 'onAssistantMessage', 
                        value: fullReply,
                        sessionId: this.sessionId
                    });
                    break;
                }
            } catch (err: any) {
                const isAbort = err.name === 'CanceledError' || (err.message && err.message.includes('aborted'));
                let errorMsg = err.message || 'Unknown error';
                
                if (axios.isAxiosError(err)) {
                    errorMsg = err.response ? `API Error [${err.response.status}]: ${err.response.data?.error || err.message}` : `Network Error: could not reach the tool server.`;
                }

                this.log(`Turn Failed: ${errorMsg}`);
                this.provider.postMessageToWebview({ 
                    type: 'onAssistantMessage', 
                    value: isAbort ? 'Stopped.' : `Error: ${errorMsg}`,
                    sessionId: this.sessionId
                });
                break;
            }
        }
        this.log('Session Completed.\n');
        this.provider.postMessageToWebview({ type: 'onAssistantComplete', sessionId: this.sessionId });
    }
}