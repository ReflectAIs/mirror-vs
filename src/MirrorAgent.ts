import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as http from 'http';

export class MirrorAgent {
    private maxTurns = 15; // Increased for 2.0 self-correction
    private abortController?: AbortController;
    private turnSummaries: string[] = [];

    constructor(private readonly provider: { postMessageToWebview: (message: any) => void }) {}

    public handleStop() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    public async handleUserMessage(text: string, mode: 'planning' | 'coding' = 'coding') {
        let turn = 0;
        let history = `User: ${text}\n`;
        this.abortController = new AbortController();

        while (turn < this.maxTurns) {
            if (this.abortController.signal.aborted) break;

            if (turn > 7) {
                history = `User: ${text}\n... (compressed) ...\n${this.turnSummaries.slice(-3).join('\n')}\n`;
            }

            const config = vscode.workspace.getConfiguration('mirror-code');
            const ollamaUrl = config.get<string>('ollamaUrl') || 'http://localhost:11434';
            const ollamaModel = config.get<string>('ollamaModel') || 'codellama';

            const planningPrompt = `You are Mirror Code in PLANNING mode. 
Focus on architectural advice. No file writing.
Available tools: <search_vector_db>, <read_skeleton>, <read_file>, <list_dir>.`;

            const codingPrompt = `You are Mirror Code in CODING mode (Autopilot 2.0).
Always confirm functionality by reading diagnostics after changes.
Tools: 
1. <search_vector_db query="term" />
2. <read_skeleton filepath="path" />
3. <read_file filepath="path" />
4. <patch_file filepath="path">
<search>
EXISTING EXACT CODE BLOCK
</search>
<replace>
NEW CODE BLOCK
</replace>
</patch_file>
5. <get_symbols filepath="path" />
6. <get_diagnostics filepath="path" /> (RUN THIS AFTER EVERY PATCH)
7. <list_dir dirpath="path" />
8. <run_terminal command="cmd" />

For patch_file: Use multiple search/replace blocks for multiple edits.
Always use exact indentation.
Workspace: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath}`;

            const systemPrompt = mode === 'planning' ? planningPrompt : codingPrompt;

            try {
                const url = new URL(`${ollamaUrl}/api/generate`);
                const postData = JSON.stringify({
                    model: ollamaModel,
                    prompt: `${systemPrompt}\n\nHistory:\n${history}\n\nAssistant:`,
                    stream: true
                });

                let fullReply = "";
                
                await new Promise((resolve, reject) => {
                    const req = http.request({
                        hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: this.abortController?.signal
                    }, (res) => {
                        res.on('data', (chunk) => {
                            const lines = chunk.toString().split('\n');
                            for (const line of lines) {
                                if (!line) continue;
                                try {
                                    const json = JSON.parse(line);
                                    if (json.response) {
                                        fullReply += json.response;
                                        this.provider.postMessageToWebview({ type: 'onAssistantChunk', value: json.response });
                                    }
                                    if (json.done) resolve(true);
                                } catch (e) {}
                            }
                        });
                    });
                    req.on('error', reject); req.write(postData); req.end();
                });

                const searchMatch = fullReply.match(/<search_vector_db query="([^"]+)" \/>/);
                const skeletonMatch = fullReply.match(/<read_skeleton filepath="([^"]+)" \/>/);
                const readFileMatch = fullReply.match(/<read_file filepath="([^"]+)" \/>/);
                const patchMatch = fullReply.match(/<patch_file filepath="([^"]+)">([\s\S]*?)<\/patch_file>/);
                const getSymbolsMatch = fullReply.match(/<get_symbols filepath="([^"]+)" \/>/);
                const getDiagMatch = fullReply.match(/<get_diagnostics filepath="([^"]+)" \/>/);
                const listDirMatch = fullReply.match(/<list_dir dirpath="([^"]+)" \/>/);
                const runTerminalMatch = fullReply.match(/<run_terminal command="([^"]+)" \/>/);

                let toolResult = "";
                if (searchMatch) {
                    const query = searchMatch[1];
                    this.provider.postMessageToWebview({ type: 'onAssistantMessage', value: `Searching: ${query}` });
                    const res = await axios.post('http://localhost:3000/tools/search_vector_db', { query }, { signal: this.abortController.signal });
                    toolResult = JSON.stringify(res.data.results);
                    history += `Assistant: <search_vector_db query="${query}" />\nSystem: ${toolResult}\n`;
                } else if (skeletonMatch) {
                    const fp = skeletonMatch[1];
                    this.provider.postMessageToWebview({ type: 'onAssistantMessage', value: `Reading signals for ${path.basename(fp)}...` });
                    const res = await axios.post('http://localhost:3000/tools/read_skeleton', { filepath: fp }, { signal: this.abortController.signal });
                    toolResult = JSON.stringify(res.data.signals);
                    history += `Assistant: <read_skeleton filepath="${fp}" />\nSystem: ${toolResult}\n`;
                } else if (readFileMatch) {
                    const fp = readFileMatch[1];
                    this.provider.postMessageToWebview({ type: 'onAssistantMessage', value: `Reading: ${path.basename(fp)}` });
                    const res = await axios.post('http://localhost:3000/tools/read_file', { filepath: fp }, { signal: this.abortController.signal });
                    toolResult = res.data.content;
                    history += `Assistant: <read_file filepath="${fp}" />\nSystem: ${toolResult}\n`;
                } else if (patchMatch) {
                    const fp = patchMatch[1];
                    const blocks: any[] = [];
                    const blockRegex = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/g;
                    let m;
                    while ((m = blockRegex.exec(patchMatch[2])) !== null) {
                        blocks.push({ search: m[1], replace: m[2] });
                    }
                    this.provider.postMessageToWebview({ type: 'onAssistantMessage', value: `Drafting changes for ${path.basename(fp)}...` });
                    const res = await axios.post('http://localhost:3000/tools/patch_file', { filepath: fp, blocks, previewOnly: true }, { signal: this.abortController.signal });
                    this.provider.postMessageToWebview({ type: 'requestDiffReview', value: { filepath: fp, blocks, original: res.data.original, modified: res.data.content } });
                    break; 
                } else if (getSymbolsMatch) {
                    const fp = getSymbolsMatch[1];
                    const syms = await vscode.commands.executeCommand('mirror-code.getSymbols', vscode.Uri.file(fp).toString());
                    toolResult = JSON.stringify(syms);
                    history += `Assistant: <get_symbols filepath="${fp}" />\nSystem: ${toolResult}\n`;
                } else if (getDiagMatch) {
                    const fp = getDiagMatch[1];
                    const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(fp).toString());
                    toolResult = JSON.stringify(diags);
                    history += `Assistant: <get_diagnostics filepath="${fp}" />\nSystem: ${toolResult}\n`;
                } else if (runTerminalMatch) {
                    const cmd = runTerminalMatch[1];
                    const res = await axios.post('http://localhost:3000/tools/run_terminal', { command: cmd, cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath }, { signal: this.abortController.signal });
                    toolResult = res.data.stdout + res.data.stderr;
                    history += `Assistant: <run_terminal command="${cmd}" />\nSystem: ${toolResult}\n`;
                } else if (listDirMatch) {
                    const dp = listDirMatch[1];
                    const res = await axios.post('http://localhost:3000/tools/list_dir', { dirpath: dp }, { signal: this.abortController.signal });
                    toolResult = JSON.stringify(res.data.files);
                    history += `Assistant: <list_dir dirpath="${dp}" />\nSystem: ${toolResult}\n`;
                } else {
                    break;
                }
                this.turnSummaries.push(`Turn ${turn + 1}: ${toolResult.substring(0, 200)}...`);
                turn++;
            } catch (err: any) {
                const isAbort = err.name === 'CanceledError' || (err.message && err.message.includes('aborted'));
                this.provider.postMessageToWebview({ type: 'onAssistantMessage', value: isAbort ? 'Stopped.' : `Error: ${err.message}` });
                break;
            }
        }
    }
}
