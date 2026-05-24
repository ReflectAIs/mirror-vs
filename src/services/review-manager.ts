import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { diffLines } from '../utils/diff';

export interface ActiveReview {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  tempOriginalPath?: string;
  tempProposedPath?: string;
  addedLineIndices: number[];
  removedLineIndices: number[];
  resolve: (accepted: boolean) => void;
}

export class ReviewManager implements vscode.CodeLensProvider {
  private static _instance: ReviewManager;
  private _activeReviews = new Map<string, ActiveReview>();
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  private _onDidChangeActiveReviews = new vscode.EventEmitter<void>();

  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  public readonly onDidChangeActiveReviews = this._onDidChangeActiveReviews.event;

  private _acceptStatusBarItem: vscode.StatusBarItem | undefined;
  private _rejectStatusBarItem: vscode.StatusBarItem | undefined;
  private _acceptAllStatusBarItem: vscode.StatusBarItem | undefined;
  private _prevStatusBarItem: vscode.StatusBarItem | undefined;
  private _nextStatusBarItem: vscode.StatusBarItem | undefined;

  private _addedDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(74, 137, 74, 0.15)', // Glassmorphic green highlight
    isWholeLine: true,
    overviewRulerColor: 'rgba(74, 137, 74, 0.6)',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  private _deletedDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(239, 68, 68, 0.12)', // Translucent red highlight for deleted lines
    isWholeLine: true,
    overviewRulerColor: 'rgba(239, 68, 68, 0.6)',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    textDecoration: 'line-through rgba(239, 68, 68, 0.4)', // Strikethrough for deleted lines!
    gutterIconPath: vscode.Uri.parse(
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><line x1="3" y1="8" x2="13" y2="8" stroke="%23ef4444" stroke-width="2.5" stroke-linecap="round"/></svg>',
    ),
    gutterIconSize: 'contain',
  });

  public getActiveReviewsCount(): number {
    return this._activeReviews.size;
  }

  public static getInstance(): ReviewManager {
    if (!this._instance) {
      this._instance = new ReviewManager();
    }
    return this._instance;
  }

  private normalizePath(filePath: string): string {
    return path.normalize(filePath).toLowerCase();
  }

  public register(context: vscode.ExtensionContext) {
    // Register the CodeLens Provider for all files
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this));

    // Initialize Status Bar Items
    this._acceptStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    this._acceptStatusBarItem.text = '$(check) Accept';
    this._acceptStatusBarItem.command = 'mirror-vs.acceptReview';
    this._acceptStatusBarItem.tooltip = 'Accept current changes (Ctrl+Enter)';
    context.subscriptions.push(this._acceptStatusBarItem);

    this._rejectStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 999);
    this._rejectStatusBarItem.text = '$(close) Reject';
    this._rejectStatusBarItem.command = 'mirror-vs.rejectReview';
    this._rejectStatusBarItem.tooltip = 'Reject current changes (Ctrl+Backspace)';
    context.subscriptions.push(this._rejectStatusBarItem);

    this._acceptAllStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 998);
    this._acceptAllStatusBarItem.text = '$(checklist) Accept All';
    this._acceptAllStatusBarItem.command = 'mirror-vs.acceptAllReviews';
    this._acceptAllStatusBarItem.tooltip = 'Accept all active changes';
    context.subscriptions.push(this._acceptAllStatusBarItem);

    this._prevStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 997);
    this._prevStatusBarItem.text = '$(arrow-up) Prev';
    this._prevStatusBarItem.command = 'mirror-vs.prevChange';
    this._prevStatusBarItem.tooltip = 'Previous Change (Alt+K)';
    context.subscriptions.push(this._prevStatusBarItem);

    this._nextStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 996);
    this._nextStatusBarItem.text = '$(arrow-down) Next';
    this._nextStatusBarItem.command = 'mirror-vs.nextChange';
    this._nextStatusBarItem.tooltip = 'Next Change (Alt+J)';
    context.subscriptions.push(this._nextStatusBarItem);

    // Register acceptance/rejection commands (supporting keyboard shortcuts)
    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.acceptReview', async (filePath?: string) => {
        const targetPath = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
        if (targetPath) {
          await this.resolveReview(targetPath, true);
        }
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.rejectReview', async (filePath?: string) => {
        const targetPath = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
        if (targetPath) {
          await this.resolveReview(targetPath, false);
        }
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.acceptAllReviews', async () => {
        const filePaths = Array.from(this._activeReviews.keys());
        if (filePaths.length === 0) {
          vscode.window.showInformationMessage('No active changes to accept.');
          return;
        }
        for (const filePath of filePaths) {
          const review = this._activeReviews.get(filePath);
          if (review) {
            await this.resolveReview(review.filePath, true);
          }
        }
        vscode.window.showInformationMessage('✅ All active changes accepted!');
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.prevChange', async () => {
        await this.navigateToChange('prev');
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.nextChange', async () => {
        await this.navigateToChange('next');
      }),
    );

    this.updateStatusBar();

    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.diffReview', async (filePath: string) => {
        const review = this._activeReviews.get(this.normalizePath(filePath));
        if (review) {
          const originalUri = review.tempOriginalPath
            ? vscode.Uri.file(review.tempOriginalPath)
            : vscode.Uri.file(review.filePath);
          const proposedUri = review.tempProposedPath
            ? vscode.Uri.file(review.tempProposedPath)
            : vscode.Uri.file(review.filePath);

          await vscode.commands.executeCommand(
            'vscode.diff',
            originalUri,
            proposedUri,
            `Review Changes: ${path.basename(review.filePath)}`,
            { preview: false },
          );
        }
      }),
    );

    // Watch active editor changes to apply/refresh decorations
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.applyDecorations(editor);
        }
      }),
    );

    // Watch visible editor changes to handle split editors, etc.
    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const editor of editors) {
          this.applyDecorations(editor);
        }
      }),
    );

    // Listen to document changes to keep decorations positioned
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editors = vscode.window.visibleTextEditors.filter((e) => e.document === event.document);
        for (const editor of editors) {
          this.applyDecorations(editor);
        }
      }),
    );
  }

  private getDeletedContentText(_lines: string[], _isAtEnd = false): string {
    return `➖ [deleted ${_lines.length} line${_lines.length !== 1 ? 's' : ''}]`;
  }

  private applyDecorations(editor: vscode.TextEditor) {
    const normPath = this.normalizePath(editor.document.uri.fsPath);
    const review = this._activeReviews.get(normPath);

    if (!review) {
      editor.setDecorations(this._addedDecorationType, []);
      editor.setDecorations(this._deletedDecorationType, []);
      return;
    }

    const addedRanges: vscode.Range[] = [];
    const deletedRanges: vscode.Range[] = [];

    for (const lineIdx of review.addedLineIndices) {
      if (lineIdx < editor.document.lineCount) {
        addedRanges.push(editor.document.lineAt(lineIdx).range);
      }
    }

    for (const lineIdx of review.removedLineIndices) {
      if (lineIdx < editor.document.lineCount) {
        deletedRanges.push(editor.document.lineAt(lineIdx).range);
      }
    }

    editor.setDecorations(this._addedDecorationType, addedRanges);
    editor.setDecorations(this._deletedDecorationType, deletedRanges);
  }

  public async startReview(filePath: string, originalContent: string, proposedContent: string): Promise<boolean> {
    const normPath = this.normalizePath(filePath);
    if (this._activeReviews.has(normPath)) {
      await this.resolveReview(filePath, true); // Auto-accept previous stage if a new review starts
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let tempOriginalPath: string | undefined;
    let tempProposedPath: string | undefined;

    if (workspaceFolder) {
      const tempDir = path.join(workspaceFolder, '.mirror-vs', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const baseName = path.basename(filePath);
      tempOriginalPath = path.join(tempDir, `original_${Date.now()}_${baseName}`);
      tempProposedPath = path.join(tempDir, `proposed_${Date.now()}_${baseName}`);

      fs.writeFileSync(tempOriginalPath, originalContent, 'utf8');
      fs.writeFileSync(tempProposedPath, proposedContent, 'utf8');
    }

    // Compute diff to construct visual review content
    const diff = diffLines(originalContent, proposedContent);
    const visualLines: string[] = [];
    const addedLineIndices: number[] = [];
    const removedLineIndices: number[] = [];

    for (let i = 0; i < diff.length; i++) {
      const item = diff[i];
      visualLines.push(item.line);
      if (item.type === 'added') {
        addedLineIndices.push(visualLines.length - 1);
      } else if (item.type === 'removed') {
        removedLineIndices.push(visualLines.length - 1);
      }
    }
    const visualContent = visualLines.join('\n');

    // Write visual content containing inline diff to the actual file
    try {
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), encoder.encode(visualContent));
    } catch (e) {
      // ignore
    }

    return new Promise<boolean>((resolve) => {
      this._activeReviews.set(normPath, {
        filePath,
        originalContent,
        proposedContent,
        tempOriginalPath,
        tempProposedPath,
        addedLineIndices,
        removedLineIndices,
        resolve,
      });

      this._onDidChangeCodeLenses.fire();
      this._onDidChangeActiveReviews.fire();
      this.updateStatusBar();

      // Open the original file in the active editor (now containing the inline diff content)
      vscode.workspace.openTextDocument(filePath).then(
        (doc) => {
          vscode.window.showTextDocument(doc, { preview: false }).then((editor) => {
            this.applyDecorations(editor);
          });
        },
        () => {},
      );

      // Show dual-mode non-blocking notification toast
      this.showReviewNotification(filePath);
    });
  }

  private showReviewNotification(filePath: string) {
    const docName = path.basename(filePath);
    vscode.window
      .showInformationMessage(
        `✨ Proposed changes to ${docName}. Review them in the editor.`,
        'Accept Changes',
        'Reject Changes',
        'Accept All',
        'Compare Changes',
      )
      .then(async (selection) => {
        if (this.hasActiveReview(filePath)) {
          if (selection === 'Accept Changes') {
            await this.resolveReview(filePath, true);
          } else if (selection === 'Reject Changes') {
            await this.resolveReview(filePath, false);
          } else if (selection === 'Accept All') {
            await vscode.commands.executeCommand('mirror-vs.acceptAllReviews');
          } else if (selection === 'Compare Changes') {
            await vscode.commands.executeCommand('mirror-vs.diffReview', filePath);
            this.showReviewNotification(filePath);
          }
        }
      });
  }

  public async resolveReview(filePath: string, accepted: boolean) {
    const normPath = this.normalizePath(filePath);
    const review = this._activeReviews.get(normPath);
    if (!review) return;

    this._activeReviews.delete(normPath);
    this._onDidChangeActiveReviews.fire();
    this.updateStatusBar();

    // Clear decorations for this file
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.normalizePath(editor.document.uri.fsPath) === normPath) {
        editor.setDecorations(this._addedDecorationType, []);
        editor.setDecorations(this._deletedDecorationType, []);
      }
    }

    if (accepted) {
      try {
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), encoder.encode(review.proposedContent));
      } catch (e) {
        // ignore
      }
    }

    // Clean up temp files
    try {
      if (review.tempOriginalPath && fs.existsSync(review.tempOriginalPath)) {
        fs.unlinkSync(review.tempOriginalPath);
      }
      if (review.tempProposedPath && fs.existsSync(review.tempProposedPath)) {
        fs.unlinkSync(review.tempProposedPath);
      }
    } catch (e) {
      // ignore
    }

    // Close any diff tab if open
    try {
      const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
      const proposedTab = tabs.find(
        (t) =>
          t.input instanceof vscode.TabInputTextDiff &&
          (this.normalizePath(t.input.modified.fsPath) === normPath ||
            (review.tempOriginalPath &&
              this.normalizePath(t.input.original.fsPath) === this.normalizePath(review.tempOriginalPath))),
      );
      if (proposedTab) {
        await vscode.window.tabGroups.close(proposedTab);
      }
    } catch (e) {
      // ignore
    }

    review.resolve(accepted);
    this._onDidChangeCodeLenses.fire();
  }

  public hasActiveReview(filePath: string): boolean {
    return this._activeReviews.has(this.normalizePath(filePath));
  }

  public getActiveReview(filePath: string): ActiveReview | undefined {
    return this._activeReviews.get(this.normalizePath(filePath));
  }

  public getProposedContent(filePath: string): string | undefined {
    return this._activeReviews.get(this.normalizePath(filePath))?.proposedContent;
  }

  private updateStatusBar() {
    const hasReview = this._activeReviews.size > 0;
    vscode.commands.executeCommand('setContext', 'mirror-vs.inReview', hasReview);

    if (hasReview) {
      this._acceptStatusBarItem?.show();
      this._rejectStatusBarItem?.show();
      this._acceptAllStatusBarItem?.show();
      this._prevStatusBarItem?.show();
      this._nextStatusBarItem?.show();
    } else {
      this._acceptStatusBarItem?.hide();
      this._rejectStatusBarItem?.hide();
      this._acceptAllStatusBarItem?.hide();
      this._prevStatusBarItem?.hide();
      this._nextStatusBarItem?.hide();
    }
  }

  private async navigateToChange(direction: 'prev' | 'next') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const normPath = this.normalizePath(editor.document.uri.fsPath);
    const review = this._activeReviews.get(normPath);
    if (!review) return;

    const allChanges = [...review.addedLineIndices, ...review.removedLineIndices].sort((a, b) => a - b);
    if (allChanges.length === 0) return;

    const currentLine = editor.selection.active.line;
    let targetLine = allChanges[0];

    if (direction === 'next') {
      const next = allChanges.find((line) => line > currentLine);
      targetLine = next !== undefined ? next : allChanges[0];
    } else {
      const prev = [...allChanges].reverse().find((line) => line < currentLine);
      targetLine = prev !== undefined ? prev : allChanges[allChanges.length - 1];
    }

    const targetPosition = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(targetPosition, targetPosition);
    editor.revealRange(new vscode.Range(targetPosition, targetPosition), vscode.TextEditorRevealType.InCenter);
  }

  // CodeLensProvider Implementation
  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;
    const review = this._activeReviews.get(this.normalizePath(filePath));

    if (!review) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const range = new vscode.Range(0, 0, 0, 0);

    lenses.push(
      new vscode.CodeLens(range, {
        title: '✨ Accept Changes',
        command: 'mirror-vs.acceptReview',
        arguments: [review.filePath],
      }),
    );

    lenses.push(
      new vscode.CodeLens(range, {
        title: '❌ Reject Changes',
        command: 'mirror-vs.rejectReview',
        arguments: [review.filePath],
      }),
    );

    lenses.push(
      new vscode.CodeLens(range, {
        title: '✨ Accept All Changes',
        command: 'mirror-vs.acceptAllReviews',
        arguments: [],
      }),
    );

    lenses.push(
      new vscode.CodeLens(range, {
        title: '🔍 Compare Changes',
        command: 'mirror-vs.diffReview',
        arguments: [review.filePath],
      }),
    );

    return lenses;
  }
}
