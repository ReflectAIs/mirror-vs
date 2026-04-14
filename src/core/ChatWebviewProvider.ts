import * as vscode from 'vscode';
import { AgentOrchestrator } from './AgentOrchestrator';
import { OllamaProvider } from '../providers/OllamaProvider';
import { ContextManager } from '../utils/ContextManager';

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mirror-vs.chatView';
    private _view?: vscode.WebviewView;
    private orchestrator: AgentOrchestrator;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _channel: vscode.OutputChannel
    ) {
        const provider = new OllamaProvider();
        const context = new ContextManager();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        this.orchestrator = new AgentOrchestrator(provider, context, workspaceRoot, _channel);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        this.orchestrator.setUpdateCallback((messages) => {
            webviewView.webview.postMessage({ type: 'updateMessages', value: messages });
        });

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.orchestrator.processMessage(data.value);
                    break;
                case 'newChat':
                    this.orchestrator.reset();
                    break;
                case 'loadHistory':
                    const sessions = this.orchestrator.getSessionManager()?.getSessions() || [];
                    webviewView.webview.postMessage({ type: 'historyList', value: sessions });
                    break;
                case 'selectSession':
                    this.orchestrator.loadSession(data.value);
                    const history = this.orchestrator.getSessionManager()?.getSessions().find(s => s.id === data.value)?.messages || [];
                    webviewView.webview.postMessage({ type: 'sessionSelected', value: history });
                    break;
                case 'deleteSession':
                    this.orchestrator.deleteSession(data.value);
                    const updatedSessions = this.orchestrator.getSessionManager()?.getSessions() || [];
                    webviewView.webview.postMessage({ type: 'historyList', value: updatedSessions });
                    break;
                case 'openLogs':
                    this._channel.show();
                    break;
                case 'stopGeneration':
                    this.orchestrator.stop();
                    break;
                case 'log':
                    this._channel.appendLine(`[WEBVIEW]: ${data.value}`);
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    :root {
                        --bg: var(--vscode-sideBar-background);
                        --container-bg: var(--vscode-editor-background);
                        --text: var(--vscode-foreground);
                        --accent: var(--vscode-button-background);
                        --border: var(--vscode-widget-border);
                        --input-bg: var(--vscode-input-background);
                    }

                    body {
                        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
                        background: var(--bg);
                        color: var(--text);
                        margin: 0;
                        padding: 0;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        overflow: hidden;
                    }

                    /* Header */
                    .header {
                        padding: 12px 16px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        border-bottom: 1px solid var(--border);
                        background: rgba(0,0,0,0.2);
                        backdrop-filter: blur(10px);
                        z-index: 100;
                    }
                    .header h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; opacity: 0.8; }
                    .header-actions { display: flex; gap: 8px; }
                    .icon-btn { 
                        background: transparent; border: none; color: var(--text); cursor: pointer; opacity: 0.6; padding: 4px; border-radius: 4px;
                        display: flex; align-items: center; justify-content: center;
                    }
                    .icon-btn:hover { background: rgba(255,255,255,0.1); opacity: 1; }

                    /* Settings Menu */
                    #settings-menu {
                        position: absolute;
                        top: 50px;
                        right: 16px;
                        background: var(--container-bg);
                        border: 1px solid var(--border);
                        border-radius: 8px;
                        padding: 8px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                        z-index: 200;
                        min-width: 150px;
                    }
                    .settings-item {
                        padding: 8px 12px;
                        cursor: pointer;
                        font-size: 12px;
                        border-radius: 4px;
                    }
                    .settings-item:hover { background: rgba(255,255,255,0.1); }

                    /* Chat Container */
                    #chat-page, #history-page {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        position: relative;
                    }

                    #messages {
                        flex: 1;
                        overflow-y: auto;
                        padding: 16px;
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }

                    .message {
                        max-width: 85%;
                        padding: 10px 14px;
                        border-radius: 12px;
                        font-size: 13px;
                        line-height: 1.5;
                        word-wrap: break-word;
                        position: relative;
                        animation: slideUp 0.2s ease-out;
                    }

                    @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

                    .message.user {
                        align-self: flex-end;
                        background: var(--accent);
                        color: var(--vscode-button-foreground);
                        border-bottom-right-radius: 2px;
                    }

                    .message.assistant {
                        align-self: flex-start;
                        background: var(--container-bg);
                        border: 1px solid var(--border);
                        border-bottom-left-radius: 2px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                        white-space: pre-wrap;
                    }

                    /* Tool Blocks */
                    .message.tool {
                        background: #000;
                        border: 1px solid #333;
                        font-family: var(--vscode-editor-font-family, monospace);
                        color: #0f0;
                        font-size: 11px;
                        max-width: 95%;
                        opacity: 0.9;
                    }
                    .tool-header {
                        color: #888;
                        border-bottom: 1px solid #222;
                        padding-bottom: 4px;
                        margin-bottom: 6px;
                        display: flex;
                        justify-content: space-between;
                    }

                    /* Input Area */
                    .input-container {
                        padding: 16px;
                        background: var(--bg);
                        border-top: 1px solid var(--border);
                    }

                    .input-wrapper {
                        background: var(--input-bg);
                        border: 1px solid var(--border);
                        border-radius: 8px;
                        padding: 8px 12px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        transition: border-color 0.2s;
                    }

                    .input-wrapper:focus-within { border-color: var(--accent); }

                    #input {
                        background: transparent;
                        border: none;
                        color: var(--text);
                        width: 100%;
                        outline: none;
                        font-size: 13px;
                        resize: none;
                        max-height: 150px;
                    }

                    #stop-btn {
                        color: var(--vscode-errorForeground);
                        font-size: 10px;
                        padding: 4px 8px;
                        font-weight: bold;
                        border: 1px solid var(--vscode-errorForeground);
                        opacity: 0.8;
                    }
                    #stop-btn:hover { opacity: 1; background: rgba(255,0,0,0.1); }

                    /* History Page */
                    #history-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                        overflow-y: auto;
                    }
                    .history-item {
                        padding: 8px 12px;
                        border-bottom: 1px solid var(--border);
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 12px;
                        margin: 4px 8px;
                        border-radius: 6px;
                    }
                    .history-item:hover { 
                        background: var(--vscode-list-hoverBackground);
                    }
                    .history-info { 
                        flex: 1; 
                        display: flex; 
                        flex-direction: column;
                        overflow: hidden;
                    }
                    .history-item .title { 
                        font-size: 13px; 
                        font-weight: 500; 
                        white-space: nowrap; 
                        overflow: hidden; 
                        text-overflow: ellipsis;
                        opacity: 0.9;
                    }
                    .history-item .date { 
                        font-size: 10px; 
                        opacity: 0.4; 
                        margin-top: 2px;
                    }
                    .delete-btn { 
                        opacity: 0; 
                        background: transparent;
                        border: none;
                        color: var(--vscode-descriptionForeground);
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 4px;
                        transition: all 0.2s;
                    }
                    .history-item:hover .delete-btn { opacity: 0.7; }
                    .delete-btn:hover { 
                        opacity: 1 !important; 
                        color: var(--vscode-errorForeground);
                        background: rgba(255, 0, 0, 0.1);
                    }

                    .hidden { display: none !important; }

                    /* Loading / Thinking */
                    .thinking {
                        font-family: var(--vscode-editor-font-family, monospace);
                        opacity: 0.4;
                        font-size: 10px;
                        margin-bottom: 6px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        letter-spacing: 1px;
                        text-transform: uppercase;
                    }
                    .dot { width: 3px; height: 3px; background: currentColor; border-radius: 50%; animation: pulse 1.5s infinite; }
                    @keyframes pulse { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2 id="view-title">Mirror</h2>
                    <div class="header-actions">
                        <button class="icon-btn" id="new-chat-btn" title="New Chat">
                            <svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M15 8c0 .55-.45 1-1 1H9v5c0 .55-.45 1-1 1s-1-.45-1-1V9H2c-.55 0-1-.45-1-1s.45-1 1-1h5V2c0-.55.45-1 1-1s1 .45 1 1v5h5c.55 0 1 .45 1 1z"/></svg>
                        </button>
                        <button class="icon-btn" id="history-toggle" title="Chat History">
                            <svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M8.5 10H7V4h1.5v6zm.65 1.6l-1.1-1.1.7-.7 1.1 1.1-.7.7zm2.35-.95l-.7-.7.9-.9.7.7-.9.9zM8 2c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10.5c-2.48 0-4.5-2.02-4.5-4.5S5.52 3.5 8 3.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5z"/></svg>
                        </button>
                        <button class="icon-btn" id="settings-toggle" title="Settings">
                            <svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M9.1 4.4L10 3.5l.7.7-.9.9V7h1.9l.9-.9.7.7-.9 1 .9.9-.7.7-1-1H11v1.9l.9.9-.7.7-1-.9-.9.9-.7-.7.9-.9V11H7.1l-.9.9-.7-.7.9-1-.9-.9.7-.7 1 1H7V7.1l-.9-.9.7-.7 1 .9.9-.9.7.7-.9.9V5h1.9l.9-.9zM1 1h14v14H1V1zm1 1v12h12V2H2z"/></svg>
                        </button>
                    </div>
                </div>

                <div id="settings-menu" class="hidden">
                    <div class="settings-item" id="open-logs-btn">Open Output Logs</div>
                    <div class="settings-item" onclick="location.reload()">Reload UI</div>
                </div>

                <div id="chat-page">
                    <div id="messages">
                        <div class="message assistant">Hello! I am Mirror. How can I assist you today?</div>
                    </div>
                    <div id="thinking-indicator" class="hidden" style="padding: 0 16px;">
                        <div class="thinking"><div class="dot"></div> Mirror is processing...</div>
                    </div>
                    <div class="input-container">
                        <div class="input-wrapper">
                            <textarea id="input" rows="1" placeholder="Type a message..."></textarea>
                            <button class="icon-btn hidden" id="stop-btn" title="Stop Generation">
                                STOP
                            </button>
                        </div>
                    </div>
                </div>

                <div id="history-page" class="hidden">
                    <div id="history-list"></div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const chatPage = document.getElementById('chat-page');
                    const historyPage = document.getElementById('history-page');
                    const historyList = document.getElementById('history-list');
                    const messagesContainer = document.getElementById('messages');
                    const input = document.getElementById('input');
                    const thinkingIndicator = document.getElementById('thinking-indicator');
                    const viewTitle = document.getElementById('view-title');
                    const settingsMenu = document.getElementById('settings-menu');

                    let shouldAutoScroll = true;

                    messagesContainer.addEventListener('scroll', () => {
                        const threshold = 50; // pixels from the bottom
                        const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
                        shouldAutoScroll = isAtBottom;
                    });

                    // Log Bridge
                    function log(msg) { vscode.postMessage({ type: 'log', value: msg }); }
                    console.log = log; console.error = log;
                    log("Webview initialized");

                    // Handle Message input
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const val = input.value.trim();
                            if (val) {
                                // LOCAL ECHO
                                appendMessage({ role: 'user', content: val });
                                vscode.postMessage({ type: 'sendMessage', value: val });
                                input.value = '';
                                input.style.height = 'auto';
                            }
                        }
                    });

                    // Auto-resize input
                    input.addEventListener('input', () => {
                        input.style.height = 'auto';
                        input.style.height = input.scrollHeight + 'px';
                    });

                    // Buttons
                    document.getElementById('new-chat-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'newChat' });
                        messagesContainer.innerHTML = '';
                        showChat();
                    });

                    document.getElementById('stop-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'stopGeneration' });
                        thinkingIndicator.classList.add('hidden');
                    });

                    document.getElementById('history-toggle').addEventListener('click', () => {
                        settingsMenu.classList.add('hidden');
                        if (historyPage.classList.contains('hidden')) {
                            vscode.postMessage({ type: 'loadHistory' });
                            showHistory();
                        } else {
                            showChat();
                        }
                    });

                    document.getElementById('settings-toggle').addEventListener('click', (e) => {
                        e.stopPropagation();
                        settingsMenu.classList.toggle('hidden');
                    });

                    document.getElementById('open-logs-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'openLogs' });
                        settingsMenu.classList.add('hidden');
                    });

                    document.addEventListener('click', () => settingsMenu.classList.add('hidden'));

                    function appendMessage(msg) {
                        const div = document.createElement('div');
                        div.className = 'message ' + msg.role;
                        div.innerText = msg.content;
                        messagesContainer.appendChild(div);
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        if (msg.role === 'user') {
                            thinkingIndicator.classList.remove('hidden');
                            document.getElementById('stop-btn').classList.remove('hidden');
                        }
                    }

                    function showHistory() {
                        chatPage.classList.add('hidden');
                        historyPage.classList.remove('hidden');
                        viewTitle.innerText = 'History';
                    }

                    function showChat() {
                        historyPage.classList.add('hidden');
                        chatPage.classList.remove('hidden');
                        viewTitle.innerText = 'Mirror';
                    }

                    // Listen for updates from Extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'updateMessages':
                                updateChat(message.value);
                                break;
                            case 'historyList':
                                renderHistory(message.value);
                                break;
                            case 'sessionSelected':
                                updateChat(message.value, true); 
                                showChat();
                                break;
                        }
                    });

                    function updateChat(history, forceFullRedraw = false) {
                        if (forceFullRedraw) {
                            messagesContainer.innerHTML = '';
                        }

                        history.filter(m => m.role !== 'system').forEach((msg, i) => {
                            let div = messagesContainer.querySelectorAll('.message')[i];
                            
                            if (!div) {
                                div = document.createElement('div');
                                div.className = 'message ' + (msg.role === 'user' && msg.content.includes('TOOL_RESULT') ? 'tool' : msg.role);
                                messagesContainer.appendChild(div);
                            }

                            // Distinct styling for tool results
                            if (msg.role === 'user' && msg.content.includes('TOOL_RESULT')) {
                                div.className = 'message tool';
                                div.innerHTML = \`<div class="tool-header"><span>CMD_OUTPUT</span></div>\${msg.content.replace('TOOL_RESULT', '')}\`;
                            } else {
                                div.innerText = msg.content;
                            }
                        });

                        // Scroll management
                        const lastMsg = history[history.length - 1];
                        if (lastMsg && lastMsg.role === 'user') {
                            thinkingIndicator.classList.remove('hidden');
                            document.getElementById('stop-btn').classList.remove('hidden');
                        } else {
                            thinkingIndicator.classList.add('hidden');
                            document.getElementById('stop-btn').classList.add('hidden');
                        }

                        if (shouldAutoScroll) {
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        }
                    }

                    function renderHistory(sessions) {
                        historyList.innerHTML = '';
                        if (sessions.length === 0) {
                            historyList.innerHTML = '<div style="padding: 20px; opacity: 0.5; font-size: 12px; text-align: center;">No history found</div>';
                            return;
                        }
                        sessions.forEach(session => {
                            const div = document.createElement('div');
                            div.className = 'history-item';
                            div.innerHTML = \`
                                <div class="history-info">
                                    <div class="title">\${session.title}</div>
                                    <div class="date">\${new Date(session.timestamp).toLocaleDateString()}</div>
                                </div>
                                <button class="delete-btn" title="Delete">
                                    <svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" fill-rule="evenodd" d="M10 2V1H6v1H3v1h10V2h-3zM4.365 4l.654 10.463A2 2 0 0 0 7.015 16h1.97a2 2 0 0 0 1.996-1.537L11.635 4H4.365zM7 13V7h1v6H7zm2 0V7h1v6H9z" clip-rule="evenodd"/></svg>
                                </button>
                            \`;
                            
                            div.addEventListener('click', () => {
                                vscode.postMessage({ type: 'selectSession', value: session.id });
                            });

                            const delBtn = div.querySelector('.delete-btn');
                            delBtn.addEventListener('click', (e) => {
                                e.stopPropagation(); // VERY IMPORTANT: Prevent opening the session when deleting
                                vscode.postMessage({ type: 'deleteSession', value: session.id });
                            });
                            historyList.appendChild(div);
                        });
                    }
                </script>
            </body>
            </html>`;
    }
}
