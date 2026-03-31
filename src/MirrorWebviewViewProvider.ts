import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import { MirrorAgent } from './MirrorAgent';

export class MirrorWebviewViewProvider implements vscode.WebviewViewProvider {
    public dispose() {}

    public static readonly viewType = 'mirror-code.sidebar';
    private _view?: vscode.WebviewView;
    private _agent?: MirrorAgent;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) { }

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

        // Initialize the agent
        this._agent = new MirrorAgent(this);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            const config = vscode.workspace.getConfiguration('mirror-code');
            const historyKey = 'mirror-code.history';

            switch (data.type) {
                case 'onUserMessage': {
                    if (!data.value) return;
                    this._agent?.handleUserMessage(data.value);
                    break;
                }
                case 'getSettings': {
                    webviewView.webview.postMessage({
                        type: 'onSettings',
                        value: {
                            ollamaUrl: config.get('ollamaUrl'),
                            ollamaModel: config.get('ollamaModel')
                        }
                    });
                    break;
                }
                case 'updateSettings': {
                    config.update('ollamaUrl', data.value.ollamaUrl, vscode.ConfigurationTarget.Global);
                    config.update('ollamaModel', data.value.ollamaModel, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage('Settings updated!');
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
                case 'onStopGeneration': {
                    this._agent?.handleStop();
                    break;
                }
                case 'commitPatch': {
                    const { filepath, blocks } = data.value;
                    try {
                        await axios.post('http://localhost:3000/tools/patch_file', { 
                            filepath, 
                            blocks, 
                            previewOnly: false 
                        });
                        vscode.window.showInformationMessage(`Applied patch to ${path.basename(filepath)}`);
                        // Trigger diagnostic check automatically
                        const diags = await vscode.commands.executeCommand('mirror-code.getDiagnostics', vscode.Uri.file(filepath).toString());
                        webviewView.webview.postMessage({ type: 'onPatchApplied', value: { filepath, diags } });
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to apply patch: ${e.message}`);
                    }
                    break;
                }
            }
        });
    }

    public postMessageToWebview(message: any) {
        this._view?.webview.postMessage(message);
        
        // Auto-save history on assistant messages if it's a final message
        if (message.type === 'onAssistantMessage' && !message.value.startsWith('[Status]')) {
            // Webview will handle the primary save logic but we can trigger it here if needed
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
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline'; connect-src *;">
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
