import * as vscode from 'vscode';
import { MirrorVsSidebarProvider } from './providers/sidebar-provider';
import { ReviewManager } from './services/review-manager';
import { TelemetryService } from './services/telemetry-service';

export function activate(context: vscode.ExtensionContext) {
  console.log('Mirror VS Extension is now active!');

  // Global error handlers to prevent extension host crashes from unhandled rejections
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[Mirror VS] Unhandled Promise Rejection:', reason instanceof Error ? reason.message : reason);
  });
  process.on('uncaughtException', (error: Error) => {
    console.error('[Mirror VS] Uncaught Exception:', error.message);
  });

  // Register ReviewManager service
  ReviewManager.getInstance().register(context);

  // Initialize TelemetryService
  TelemetryService.getInstance().initialize(context);

  const provider = new MirrorVsSidebarProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MirrorVsSidebarProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
  );

  // Register commands contributed in package.json
  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.focusSidebar', () => {
      vscode.commands.executeCommand('workbench.view.extension.mirror-vs-container');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.clearChat', () => {
      provider.clearActiveChat();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.refreshGitStatus', () => {
      provider.refreshGitStatus();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.fixSelection', () => {
      vscode.commands.executeCommand('workbench.view.extension.mirror-vs-container');
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selectionText = editor.document.getText(editor.selection);
        provider.handleSelectionCommand('fix', selectionText);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.explainSelection', () => {
      vscode.commands.executeCommand('workbench.view.extension.mirror-vs-container');
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selectionText = editor.document.getText(editor.selection);
        provider.handleSelectionCommand('explain', selectionText);
      }
    }),
  );
}

export function deactivate() {}
