import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ActiveReview {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  tempOriginalPath?: string;
  tempProposedPath?: string;
  resolve: (accepted: boolean) => void;
}

export class ReviewManager implements vscode.CodeLensProvider {
  private static _instance: ReviewManager;
  private _activeReviews = new Map<string, ActiveReview>();
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  private _onDidChangeActiveReviews = new vscode.EventEmitter<void>();

  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  public readonly onDidChangeActiveReviews = this._onDidChangeActiveReviews.event;

  private _highlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(74, 137, 74, 0.12)', // Subtle glassmorphic green highlight
    isWholeLine: true
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
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this)
    );

    // Register acceptance/rejection commands (supporting keyboard shortcuts)
    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.acceptReview', async (filePath?: string) => {
        const targetPath = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
        if (targetPath) {
          await this.resolveReview(targetPath, true);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.rejectReview', async (filePath?: string) => {
        const targetPath = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
        if (targetPath) {
          await this.resolveReview(targetPath, false);
        }
      })
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
      })
    );

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
            `Review Changes: ${path.basename(review.filePath)}`
          );
        }
      })
    );

    // Watch active editor changes to apply/refresh decorations
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.applyDecorations(editor);
        }
      })
    );

    // Watch visible editor changes to handle split editors, etc.
    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        for (const editor of editors) {
          this.applyDecorations(editor);
        }
      })
    );

    // Listen to document changes to keep decorations positioned
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const editors = vscode.window.visibleTextEditors.filter(
          e => e.document === event.document
        );
        for (const editor of editors) {
          this.applyDecorations(editor);
        }
      })
    );
  }

  private applyDecorations(editor: vscode.TextEditor) {
    const normPath = this.normalizePath(editor.document.uri.fsPath);
    const review = this._activeReviews.get(normPath);

    if (!review) {
      editor.setDecorations(this._highlightDecorationType, []);
      return;
    }

    // Highlight all lines green
    const totalLines = editor.document.lineCount;
    const highlightRanges: vscode.Range[] = [];
    for (let i = 0; i < totalLines; i++) {
      const line = editor.document.lineAt(i);
      highlightRanges.push(line.range);
    }
    editor.setDecorations(this._highlightDecorationType, highlightRanges);
  }

  public async startReview(
    filePath: string,
    originalContent: string,
    proposedContent: string
  ): Promise<boolean> {
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

    return new Promise<boolean>((resolve) => {
      this._activeReviews.set(normPath, {
        filePath,
        originalContent,
        proposedContent,
        tempOriginalPath,
        tempProposedPath,
        resolve
      });

      this._onDidChangeCodeLenses.fire();
      this._onDidChangeActiveReviews.fire();

      // Apply decorations immediately to any visible editors for this file
      for (const editor of vscode.window.visibleTextEditors) {
        if (this.normalizePath(editor.document.uri.fsPath) === normPath) {
          this.applyDecorations(editor);
        }
      }

      // Show dual-mode non-blocking notification toast
      this.showReviewNotification(filePath);
    });
  }

  private showReviewNotification(filePath: string) {
    const docName = path.basename(filePath);
    vscode.window.showInformationMessage(
      `✨ Proposed changes to ${docName}. Review them in the editor.`,
      'Accept Changes',
      'Reject Changes',
      'Accept All',
      'Compare Changes'
    ).then(async (selection) => {
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

    // Clear decorations for this file
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.normalizePath(editor.document.uri.fsPath) === normPath) {
        editor.setDecorations(this._highlightDecorationType, []);
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
      const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
      const proposedTab = tabs.find(t => 
        t.input instanceof vscode.TabInputTextDiff && 
        t.input.modified.fsPath === review.tempProposedPath
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

  // CodeLensProvider Implementation
  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
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
        arguments: [review.filePath]
      })
    );

    lenses.push(
      new vscode.CodeLens(range, {
        title: '❌ Reject Changes',
        command: 'mirror-vs.rejectReview',
        arguments: [review.filePath]
      })
    );

    lenses.push(
      new vscode.CodeLens(range, {
        title: '✨ Accept All Changes',
        command: 'mirror-vs.acceptAllReviews',
        arguments: []
      })
    );

    lenses.push(
      new vscode.CodeLens(range, {
        title: '🔍 Compare Changes',
        command: 'mirror-vs.diffReview',
        arguments: [review.filePath]
      })
    );

    return lenses;
  }
}
