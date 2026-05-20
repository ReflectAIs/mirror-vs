import * as vscode from 'vscode';
import { MirrorVsSidebarProvider } from './providers/sidebar-provider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Mirror VS Extension is now active!');

  const provider = new MirrorVsSidebarProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MirrorVsSidebarProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Register commands contributed in package.json
  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.focusSidebar', () => {
      vscode.commands.executeCommand('workbench.view.extension.mirror-vs-container');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.clearChat', () => {
      provider.clearActiveChat();
    })
  );
}

export function deactivate() {}
