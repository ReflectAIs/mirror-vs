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

  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

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

    // Register acceptance/rejection commands
    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.acceptReview', async (filePath: string) => {
        await this.resolveReview(filePath, true);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('mirror-vs.rejectReview', async (filePath: string) => {
        await this.resolveReview(filePath, false);
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
  }

  public async startReview(
    filePath: string,
    originalContent: string,
    proposedContent: string
  ): Promise<boolean> {
    const normPath = this.normalizePath(filePath);
    if (this._activeReviews.has(normPath)) {
      await this.resolveReview(filePath, false);
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
      'Compare Changes'
    ).then(async (selection) => {
      if (this.hasActiveReview(filePath)) {
        if (selection === 'Accept Changes') {
          await this.resolveReview(filePath, true);
        } else if (selection === 'Reject Changes') {
          await this.resolveReview(filePath, false);
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
    token: vscode.CancellationToken
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
        title: '🔍 Compare Changes',
        command: 'mirror-vs.diffReview',
        arguments: [review.filePath]
      })
    );

    return lenses;
  }
}
