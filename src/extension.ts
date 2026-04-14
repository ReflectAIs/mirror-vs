import * as vscode from 'vscode';
import { ChatWebviewProvider } from './core/ChatWebviewProvider';

export function activate(context: vscode.ExtensionContext) {
    const channel = vscode.window.createOutputChannel('Mirror Agent');
    channel.appendLine('Mirror VS (Gemma 4 Edition) is now active!');

    const provider = new ChatWebviewProvider(context.extensionUri, channel);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatWebviewProvider.viewType, provider)
    );

    let startCommand = vscode.commands.registerCommand('mirror-vs.start', () => {
        vscode.window.showInformationMessage('Mirror Agent Started!');
        // Focus the sidebar
        vscode.commands.executeCommand('workbench.view.extension.mirror-vs-sidebar');
    });

    context.subscriptions.push(startCommand);
}

export function deactivate() {}
