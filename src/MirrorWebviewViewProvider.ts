import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MirrorAgent } from './MirrorAgent';
import * as cp from 'child_process';
import { McpManager } from './McpManager';

export class MirrorWebviewViewProvider implements vscode.WebviewViewProvider {
    public dispose() {}

    public static readonly viewType = 'mirror-code.sidebar';
    private _view?: vscode.WebviewView;
    private _agents: Map<string, MirrorAgent> = new Map();
    private _outputChannel: vscode.OutputChannel;
    private _currentPersona: string = 'architect';
    private _terminal: vscode.Terminal | undefined;
    private _terminalWriteEmitter = new vscode.EventEmitter<string>();
    private _activeProcesses: Map<string, { child: cp.ChildProcess, output: string, logStream?: fs.WriteStream }> = new Map();
    private _mcpManager: McpManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._outputChannel = vscode.window.createOutputChannel('Mirror Code');
        this._mcpManager = new McpManager();
        this._mcpManager.initialize().catch(e => {
            this._outputChannel.appendLine(`[MCP] Initialization failed: ${e.message}`);
        });
    }

    public get mcpManager() { return this._mcpManager; }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);


        // No longer creating a single agent here. Agents are created per session.

        webviewView.webview.onDidReceiveMessage(async (data) => {
            const config = vscode.workspace.getConfiguration('mirror-code');
            const historyKey = 'mirror-code.history';

            switch (data.type) {
                case 'ready': {
                    this._outputChannel.appendLine(`[Handshake] Webview is ready. Sending logo...`);
                    // Send logo URI and Base64 once webview is ready
                    try {
                        const logoPath = path.join(this._extensionUri.fsPath, 'webview-ui', 'dist', 'assets', 'logo.png');
                        const logoBase64 = Buffer.from(require('fs').readFileSync(logoPath)).toString('base64');
                        const logoDataUri = `data:image/png;base64,${logoBase64}`;
                        
                        this._outputChannel.appendLine(`[Logo DEBUG] Read success. Length: ${logoBase64.length}`);
                        
                        webviewView.webview.postMessage({ 
                            type: 'onInitialize', 
                            value: { logoUri: logoDataUri } 
                        });
                    } catch (e: any) {
                        this._outputChannel.appendLine(`[Logo DEBUG] READ FAILED: ${e.message}`);
                        // Fallback to URI if FS read fails
                        const logoUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'logo.png'));
                        webviewView.webview.postMessage({ type: 'onInitialize', value: { logoUri: logoUri.toString() } });
                    }

                    // Send active generations status
                    webviewView.webview.postMessage({ 
                        type: 'onActiveGenerations', 
                        value: Array.from(this._agents.keys()) 
                    });
                    break;
                }
                case 'onUserMessage': {
                    if (!data.value || !data.sessionId) return;
                    
                    // Reuse existing agent for the same session (preserves history)
                    let agent = this._agents.get(data.sessionId);
                    if (!agent) {
                        const defaultReadLines = config.get('defaultReadLines', 500);
                        agent = new MirrorAgent(data.sessionId, this, this._outputChannel, defaultReadLines, this._currentPersona, this._mcpManager);
                        this._agents.set(data.sessionId, agent);
                    }
                    
                    agent.handleUserMessage(data.value).then(() => {
                        // Don't delete the agent — keep it alive for multi-turn
                        // It will be cleaned up when the session is explicitly closed
                    });
                    break;
                }
                case 'openLogs': {
                    this._outputChannel.show();
                    break;
                }
                case 'getSettings': {
                    webviewView.webview.postMessage({
                        type: 'onSettings',
                        value: {
                            ollamaUrl: config.get('ollamaUrl'),
                            ollamaModel: config.get('ollamaModel'),
                            maxTurns: config.get('maxTurns'),
                            autonomousMode: config.get('autonomousMode'),
                            defaultReadLines: config.get('defaultReadLines'),
                        }
                    });
                    break;
                }
                case 'updateSettings': {
                    config.update('ollamaUrl', data.value.ollamaUrl, vscode.ConfigurationTarget.Global);
                    config.update('ollamaModel', data.value.ollamaModel, vscode.ConfigurationTarget.Global);
                    config.update('maxTurns', Number(data.value.maxTurns), vscode.ConfigurationTarget.Global);
                    config.update('autonomousMode', Boolean(data.value.autonomousMode), vscode.ConfigurationTarget.Global);
                    config.update('defaultReadLines', Number(data.value.defaultReadLines), vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage('Settings updated!');
                    // Immediate broadcast back to the webview to update UI state (like Buddy)
                    webviewView.webview.postMessage({ type: 'onSettings', value: data.value });
                    break;
                }
                case 'getHistory': {
                    const history = this._context.workspaceState.get<any[]>(historyKey) || [];
                    webviewView.webview.postMessage({ type: 'onHistory', value: history });
                    break;
                }
                case 'saveChat': {
                    let history = this._context.workspaceState.get<any[]>(historyKey) || [];
                    const session = data.value;
                    const index = history.findIndex(s => s.id === session.id);
                    if (index >= 0) {
                        history[index] = session;
                    } else {
                        history.unshift(session);
                    }
                    this._context.workspaceState.update(historyKey, history);
                    break;
                }
                case 'deleteChat': {
                    let history = this._context.workspaceState.get<any[]>(historyKey) || [];
                    history = history.filter(s => s.id !== data.value);
                    this._context.workspaceState.update(historyKey, history);
                    break;
                }
                case 'newChat': {
                    // Logic handled in webview, we just clear and focus
                    break;
                }
                case 'fetchModels': {
                    const { ollamaUrl } = data.value;
                    try {
                        const response = await fetch(`${ollamaUrl}/api/tags`);
                        if (response.ok) {
                            const result: any = await response.json();
                            const models = result.models.map((m: any) => m.name);
                            webviewView.webview.postMessage({
                                type: 'onModels',
                                value: models
                            });
                        }
                    } catch (error) {
                        webviewView.webview.postMessage({
                            type: 'onModels',
                            value: []
                        });
                    }
                    break;
                }
                case 'stopGeneration': {
                    if (data.sessionId) {
                        const agent = this._agents.get(data.sessionId);
                        if (agent) {
                            agent.handleStop();
                            this._agents.delete(data.sessionId);
                        }
                    }
                    break;
                }
                case 'commitPatch': {
                    const { filepath, blocks, sessionId } = data.value;
                    try {
                        await axios.post('http://localhost:3000/tools/patch_file', { 
                            filepath, 
                            blocks, 
                            previewOnly: false 
                        });
                        vscode.window.showInformationMessage(`Applied patch to ${path.basename(filepath)}`);
                        // Trigger diagnostic check automatically
                        const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(filepath).toString()) as any[];
                        
                        webviewView.webview.postMessage({ type: 'onPatchApplied', value: { filepath, diags, sessionId } });
                        
                        // Self-healing: notify the agent
                        const agent = this._agents.get(sessionId);
                        if (agent) {
                            agent.handlePatchResult(filepath, diags);
                        }
                    } catch (e: any) {
                        const errorMsg = e.response?.data?.error || e.message;
                        vscode.window.showErrorMessage(`Failed to apply patch: ${errorMsg}`);
                    }
                    break;
                }
                case 'openFile': {
                    const filepath = data.value;
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (workspaceFolder && filepath) {
                        const fullPath = path.isAbsolute(filepath) ? filepath : path.join(workspaceFolder.uri.fsPath, filepath);
                        try {
                            if (fs.existsSync(fullPath)) {
                                if (fs.statSync(fullPath).isDirectory()) {
                                    // If someone accidentally sent a directory to openFile, show a warning or handle as terminal
                                    vscode.window.showInformationMessage(`Opening terminal in directory: ${path.basename(fullPath)}`);
                                    this.openTerminal(fullPath, `Mirror: ${path.basename(fullPath)}`);
                                } else {
                                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
                                    await vscode.window.showTextDocument(doc);
                                }
                            }
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Failed to open ${filepath}: ${e.message}`);
                        }
                    }
                    break;
                }
                case 'openTerminal': {
                    const { path: dirpath, label, command } = data.value;
                    this.openTerminal(dirpath, label, command);
                    break;
                }
                case 'getFiles': {
                    const files: string[] = await vscode.commands.executeCommand('mirror-code.getFiles') || [];
                    this.postMessageToWebview({ type: 'onFiles', value: files });
                    break;
                }
                case 'setPersona': {
                    this._currentPersona = data.value;
                    this._outputChannel.appendLine(`[Persona] Switched to ${data.value}`);
                    break;
                }
                case 'getSymbols': {
                    try {
                        const symbols: any[] = await vscode.commands.executeCommand('mirror-code.getSymbols', data.value) || [];
                        this.postMessageToWebview({ type: 'onSymbols', value: symbols });
                    } catch (e) {
                        this.postMessageToWebview({ type: 'onSymbols', value: [] });
                    }
                    break;
                }
                case 'approveTerminal': {
                    const termData = data.value;
                    if (!termData) break;
                    const sessionId = termData.sessionId || termData.messageId;
                    try {
                        const res = await axios.post('http://localhost:3000/tools/run_terminal', {
                            command: termData.command,
                            cwd: termData.dir
                        }, { timeout: 35000 });
                        const result = res.data;
                        const stdout = result.stdout || '';
                        const stderr = result.stderr || '';
                        
                        // Notify the agent to resume
                        const agent = this._agents.get(sessionId);
                        if (agent) {
                            agent.handleTerminalResult(stdout, stderr);
                        }
                    } catch (e: any) {
                        const errorMsg = e.response?.data?.error || e.message;
                        vscode.window.showErrorMessage(`Terminal command failed: ${errorMsg}`);
                        const agent = this._agents.get(sessionId);
                        if (agent) {
                            agent.handleTerminalResult('', `Error: ${errorMsg}`);
                        }
                    }
                    break;
                }
                case 'rejectTerminal': {
                    const termData = data.value;
                    if (!termData) break;
                    const sessionId = termData.sessionId || termData.messageId;
                    const agent = this._agents.get(sessionId);
                    if (agent) {
                        agent.handleTerminalResult('', '[User rejected the terminal command.]');
                    }
                    break;
                }
                case 'openDiff': {
                    const { filepath, content } = data.value;
                    const tempDir = os.tmpdir();
                    const tempFileName = `mirror_diff_${Math.random().toString(36).substring(7)}_${path.basename(filepath)}`;
                    const tempFilePath = path.join(tempDir, tempFileName);
                    
                    try {
                        fs.writeFileSync(tempFilePath, content);
                        
                        const originalUri = vscode.Uri.file(filepath);
                        const tempUri = vscode.Uri.file(tempFilePath);
                        
                        await vscode.commands.executeCommand('vscode.diff', originalUri, tempUri, `Review: ${path.basename(filepath)} (Proposed)`);
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to open diff: ${e.message}`);
                    }
                    break;
                }
            }
        });
    }

    public async executeIntegratedTerminal(command: string, cwd: string): Promise<{ stdout: string, exitCode: number }> {
        const terminalId = await this.startBackgroundTerminal(command, cwd);
        return new Promise((resolve) => {
            const process = this._activeProcesses.get(terminalId);
            if (!process) {
                resolve({ stdout: 'Error: Failed to start process.', exitCode: 1 });
                return;
            }

            process.child.on('close', (code) => {
                const finalProcess = this._activeProcesses.get(terminalId);
                const stdout = finalProcess?.output || '';
                this._activeProcesses.delete(terminalId);
                resolve({ stdout, exitCode: code || 0 });
            });

            process.child.on('error', (err) => {
                const finalProcess = this._activeProcesses.get(terminalId);
                const stdout = finalProcess?.output || '';
                this._activeProcesses.delete(terminalId);
                resolve({ stdout: stdout + `\nError: ${err.message}`, exitCode: 1 });
            });
        });
    }

    public async startBackgroundTerminal(command: string, cwd: string): Promise<string> {
        const terminalId = Math.random().toString(36).substring(7);
        const logDir = path.join(cwd, '.mirror', 'logs');
        
        try {
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        } catch (e) { }
        
        const logPath = path.join(logDir, `terminal_${terminalId}.log`);
        const logStream = fs.createWriteStream(logPath);
        logStream.write(`[${new Date().toISOString()}] STARTING: ${command}\n\n`);

        if (!this._terminal) {
            const pty: vscode.Pseudoterminal = {
                onDidWrite: this._terminalWriteEmitter.event,
                open: () => {},
                close: () => { this._terminal = undefined; },
                handleInput: (data) => { this._terminalWriteEmitter.fire(data); }
            };
            this._terminal = vscode.window.createTerminal({ name: 'Mirror: Executor', pty });
        }

        this._terminal.show();
        this._terminalWriteEmitter.fire(`\r\n\x1b[35m[Mirror] Terminal ${terminalId} started:\x1b[0m ${command}\r\n\r\n`);

        const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
        const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];
        const child = cp.spawn(shell, shellArgs, { cwd, shell: true });

        const processInfo = { child, output: '', logStream };
        this._activeProcesses.set(terminalId, processInfo);

        child.stdout?.on('data', (data) => {
            const str = data.toString();
            processInfo.output += str;
            logStream.write(str);
            this._terminalWriteEmitter.fire(str.replace(/\n/g, '\r\n'));
        });

        child.stderr?.on('data', (data) => {
            const str = data.toString();
            processInfo.output += str;
            logStream.write(str);
            this._terminalWriteEmitter.fire(str.replace(/\n/g, '\r\n'));
        });

        return terminalId;
    }

    public sendTerminalInput(terminalId: string, input: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const process = this._activeProcesses.get(terminalId);
            if (!process) {
                reject(new Error(`No active terminal with ID: ${terminalId}`));
                return;
            }
            if (process.child.stdin) {
                process.child.stdin.write(input);
                this._terminalWriteEmitter.fire(`\x1b[34m[Input: ${terminalId}]\x1b[0m ${input.replace(/\n/g, '\\n')}\r\n`);
                resolve();
            } else {
                reject(new Error('stdin is not available for this process.'));
            }
        });
    }

    public readTerminalOutput(terminalId: string): string {
        const process = this._activeProcesses.get(terminalId);
        if (!process) return `Error: No active terminal with ID: ${terminalId}`;
        return process.output;
    }

    private openTerminal(dirpath: string, label: string = 'Mirror Terminal', command?: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;
        
        const fullPath = path.isAbsolute(dirpath) ? dirpath : path.join(workspaceFolder.uri.fsPath, dirpath);
        
        // Find existing terminal with same name or create new
        const name = label.startsWith('Run: ') ? `Mirror: ${label.substring(5)}` : (label === 'Mirror Terminal' ? 'Mirror Terminal' : label);
        const existing = vscode.window.terminals.find(t => t.name === name);
        
        if (existing) {
            existing.show();
            if (command) {
                existing.sendText(command);
            }
        } else {
            const terminal = vscode.window.createTerminal({
                name,
                cwd: fullPath
            });
            terminal.show();
            if (command) {
                terminal.sendText(command);
            }
        }
    }

    public postMessageToWebview(message: any) {
        this._view?.webview.postMessage(message);
        
        // Auto-persist background activity to history
        const sessionAwareTypes = ['onAssistantChunk', 'onAssistantMessage', 'onToolTrace', 'onPatchApplied', 'requestDiffReview', 'requestTerminalReview'];
        if (sessionAwareTypes.includes(message.type) && message.sessionId) {
            const historyKey = 'mirror-code.history';
            let history = this._context.workspaceState.get<any[]>(historyKey) || [];
            let sessionIndex = history.findIndex(s => s.id === message.sessionId);
            
            if (sessionIndex === -1) {
                // If the session isn't in history yet, create a placeholder
                history.unshift({ id: message.sessionId, title: 'Background Task', messages: [] });
                sessionIndex = 0;
            }

            const session = history[sessionIndex];
            const msgs = session.messages || [];

            switch (message.type) {
                case 'onAssistantChunk': {
                    const last = msgs[msgs.length - 1];
                    if (last && last.sender === 'assistant' && last.type === 'chunk') {
                        last.text += message.value;
                    } else {
                        msgs.push({ id: Date.now().toString(), text: message.value, sender: 'assistant', type: 'chunk' });
                    }
                    break;
                }
                case 'onAssistantMessage':
                    // Clean up fragments and add final message
                    session.messages = [
                        ...msgs.filter((m: any) => m.type !== 'chunk' && m.type !== 'status'),
                        { id: Date.now().toString(), text: message.value, sender: 'assistant' }
                    ];
                    break;
                case 'onToolTrace':
                    const lastTrace = msgs[msgs.length - 1];
                    if (lastTrace && lastTrace.type === 'trace' && lastTrace.traceData?.label === message.value.label) {
                        lastTrace.traceData = message.value;
                    } else {
                        msgs.push({ id: Date.now().toString(), text: '', sender: 'assistant', type: 'trace', traceData: message.value });
                    }
                    break;
                case 'onPatchApplied':
                    msgs.push({ id: Date.now().toString(), text: `Patch applied to ${path.basename(message.value.filepath)}`, sender: 'assistant' });
                    break;
                case 'requestDiffReview':
                    msgs.push({ id: Date.now().toString(), text: `Review proposed changes for ${message.value.filepath}`, sender: 'assistant', type: 'diff', diffData: message.value });
                    break;
                case 'requestTerminalReview':
                    msgs.push({ id: Date.now().toString(), text: `Execution Request: ${message.value.command}`, sender: 'assistant', type: 'terminal', terminalData: message.value });
                    break;
            }

            session.messages = msgs;
            this._context.workspaceState.update(historyKey, history);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // We use a static build approach for maximum stability in the webview environment
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'index.css'));

        return `<!DOCTYPE html>
            <html lang="en" style="height: 100%; margin:0; padding:0;">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline'; connect-src *;">
                <title>Mirror Code</title>
                <link rel="stylesheet" href="${styleUri}">
                <style>
                    body, html {
                      height: 100%;
                      width: 100%;
                      margin: 0;
                      padding: 0;
                      overflow: hidden;
                      background-color: transparent;
                    }
                    #root {
                      height: 100%;
                    }
                </style>
            </head>
            <body>
                <script>
                    const vscode = acquireVsCodeApi();
                    window.vscode = vscode;
                </script>
                <div id="root"></div>
                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
