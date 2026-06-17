import * as vscode from 'vscode';
import { MirrorVsSidebarProvider } from './providers/sidebar-provider';
import { ReviewManager } from './services/review-manager';
import { TelemetryService } from './services/telemetry-service';
import { AgentMemoryService } from './services/agent-memory-service';
import { LocalRagService } from './services/local-rag-service';
import { EmbeddingService } from './services/embedding-service';
import { AiReviewService } from './services/ai-review-service';
import { GraphService } from './services/graph-service';
import { PluginService } from './services/plugin-service';
import { TestService } from './services/test-service';
import { DiffAwareService } from './services/diff-aware-service';
import { RefactorService } from './services/refactor-service';
import { ArtifactService } from './services/artifact-service';
import { EventBus } from './services/event-bus';
import { McpService } from './services/mcp-service';
import { CheckpointService } from './services/checkpoint-service';
import { ModesManager } from './services/modes-manager';
import { NativeToolCallParser } from './agent/native-tool-call-parser';
import { getMcpToolNames } from './agent/tools/mcp-tools';

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

  // Initialize TelemetryService (opt-in via mirror-vs.telemetryEnabled)
  const telemetryEnabled = vscode.workspace.getConfiguration('mirror-vs').get<boolean>('telemetryEnabled', false);
  if (telemetryEnabled) {
    TelemetryService.getInstance().initialize(context);
  } else {
    console.log('[Mirror VS] Telemetry disabled by user preference');
  }

  // Initialize Agent Memory Service
  try {
    const memoryService = AgentMemoryService.getInstance();
    console.log(`[Mirror VS] Agent Memory loaded: ${memoryService.count} entries`);
  } catch (e) {
    console.warn('[Mirror VS] Agent Memory initialization failed:', e);
  }

  // Load persisted artifacts from disk on startup
  try {
    const artifactService = ArtifactService.getInstance();
    artifactService.loadFromDisk();
    console.log(`[Mirror VS] Loaded ${artifactService.artifacts.length} artifacts from disk`);
  } catch (e) {
    console.warn('[Mirror VS] Failed to load artifacts from disk:', e);
  }

  // Trigger RAG indexing in background
  setTimeout(async () => {
    try {
      const rag = LocalRagService.getInstance();
      await rag.loadIndex();
      if (!rag['isIndexed']) {
        rag.indexWorkspace().catch((err) => { console.error('[Mirror VS] RAG indexing error:', err); });
      }
    } catch {
      /* background — non-critical */
    }
  }, 5000);

  // Initialize embedding service (lazy, on first semantic_search call)
  console.log('[Mirror VS] EmbeddingService ready (lazy init)');

  // Graph service — lazy init on first usage
  console.log('[Mirror VS] GraphService ready (lazy init)');

  // Plugin service — ready for external tool registration
  console.log('[Mirror VS] PluginService ready');

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
    vscode.commands.registerCommand('mirror-vs.clearSession', () => {
      provider.clearActiveChat();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.togglePause', () => {
      provider.togglePause();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.newChat', () => {
      provider.clearActiveChat();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.copyLastMessage', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const { selection, document } = editor;
        provider.copyLastMessage(selection, document);
      }
    }),
  );

  // Listen for config changes to toggle AI review dynamically
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('mirror-vs.aiReviewEnabled')) {
        const enabled = vscode.workspace.getConfiguration('mirror-vs').get<boolean>('aiReviewEnabled', false);
        const reviewService = AiReviewService.getInstance();
        if (enabled && !reviewService.isEnabled) {
          reviewService.enable();
        } else if (!enabled && reviewService.isEnabled) {
          reviewService.disable();
        }
      }
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

  // ── Mirror Assistant Bridge — HTTP Polling (opt-in via mirror-vs.mirrorBridgeEnabled) ──
  const mirrorBridgeEnabled = vscode.workspace.getConfiguration('mirror-vs').get<boolean>('mirrorBridgeEnabled', false);
  if (mirrorBridgeEnabled) {
    const MIRROR_PORT = process.env.MIRROR_PORT || '3000';
    const MIRROR_HOST = process.env.MIRROR_HOST || 'localhost';
    const BRIDGE_URL = `http://${MIRROR_HOST}:${MIRROR_PORT}/api/bridge/tasks`;
    let pollTimer: NodeJS.Timeout | null = null;
    let seenTasks = new Set<string>();

    async function pollTasks() {
      try {
        const response = await fetch(BRIDGE_URL);
        if (!response.ok) return;
        const tasks = (await response.json()) as any[];
        if (!Array.isArray(tasks) || tasks.length === 0) return;

        for (const task of tasks) {
          if (seenTasks.has(task.id)) continue;
          seenTasks.add(task.id);

          const result = await vscode.window.showInformationMessage(
            `🪞 Mirror Assistant: "${task.task}"`,
            'Accept Task',
            'Dismiss',
          );

          if (result === 'Accept Task') {
            // Open the project if provided and different
            const currentPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            if (task.projectPath && task.projectPath !== currentPath) {
              const uri = vscode.Uri.file(task.projectPath);
              await vscode.commands.executeCommand('vscode.openFolder', uri, true);
            }

            // Open the sidebar and send the task
            await vscode.commands.executeCommand('mirror-vs.focusSidebar');
            provider.handleMirrorTask(task.task);

            // Update task status
            await fetch(BRIDGE_URL, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: task.id, status: 'accepted' }),
            });
          } else {
            // Dismissed
            await fetch(BRIDGE_URL, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: task.id, status: 'dismissed' }),
            });
          }
        }
      } catch {
        // Mirror server not running — ignore silently
      }
    }

    // Start polling every 3 seconds
    pollTimer = setInterval(pollTasks, 3000);

    // Cleanup on deactivation
    context.subscriptions.push({
      dispose: () => {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
      },
    });
  } else {
    console.log('[Mirror VS] Mirror Bridge disabled by user preference');
  }
}

export function deactivate() {}
