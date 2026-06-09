/**
 * Diff-Aware Service — analyzes uncommitted git changes and provides AI-powered
 * pre-commit review and targeted patch suggestions.
 * Integrates with the agent's patch tool for "review my changes" workflows.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface DiffFile {
  filePath: string;
  status: 'added' | 'modified' | 'deleted' | 'untracked' | 'renamed';
  oldPath?: string;
  diff: string; // Unified diff
  additions: number;
  deletions: number;
}

export interface DiffSummary {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  changedFiles: number;
}

export interface DiffReviewResult {
  filePath: string;
  hunks: DiffReviewHunk[];
  overallAssessment: string;
}

export interface DiffReviewHunk {
  startLine: number;
  endLine: number;
  content: string;
  issues: string[];
  suggestions: string[];
}

export class DiffAwareService {
  private static instance: DiffAwareService;

  static getInstance(): DiffAwareService {
    if (!DiffAwareService.instance) {
      DiffAwareService.instance = new DiffAwareService();
    }
    return DiffAwareService.instance;
  }

  /**
   * Get the full diff of all uncommitted changes (staged + unstaged).
   */
  getUncommittedDiff(): DiffSummary {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return { files: [], totalAdditions: 0, totalDeletions: 0, changedFiles: 0 };

    const files = this._getChangedFiles(workspaceFolder);
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const file of files) {
      try {
        const relativePath = vscode.workspace.asRelativePath(file.filePath);
        const diff = this._getFileDiff(workspaceFolder, relativePath, file.status);
        file.diff = diff;

        // Count additions/deletions from diff
        const lines = diff.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) totalAdditions++;
          if (line.startsWith('-') && !line.startsWith('---')) totalDeletions++;
        }
        file.additions = totalAdditions;
        file.deletions = totalDeletions;
      } catch {
        file.diff = '';
      }
    }

    // Re-count properly per-file
    totalAdditions = 0;
    totalDeletions = 0;
    for (const file of files) {
      let fileAdds = 0;
      let fileDels = 0;
      const lines = file.diff.split('\n');
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) fileAdds++;
        if (line.startsWith('-') && !line.startsWith('---')) fileDels++;
      }
      file.additions = fileAdds;
      file.deletions = fileDels;
      totalAdditions += fileAdds;
      totalDeletions += fileDels;
    }

    return {
      files,
      totalAdditions,
      totalDeletions,
      changedFiles: files.length,
    };
  }

  /**
   * Get diff for a specific file between HEAD and working tree.
   */
  getFileDiff(filePath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return '';
    try {
      return execFileSync('git', ['diff', 'HEAD', '--', filePath], {
        cwd: workspaceFolder,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch {
      return '';
    }
  }

  /**
   * Format the diff summary as a readable string for the agent.
   */
  formatDiffForAgent(summary: DiffSummary): string {
    if (summary.files.length === 0) {
      return 'No uncommitted changes detected in the workspace.';
    }

    let output = `## Uncommitted Changes\n`;
    output += `${summary.changedFiles} files changed (${summary.totalAdditions} additions, ${summary.totalDeletions} deletions)\n\n`;

    for (const file of summary.files) {
      const icon = { added: '➕', modified: '📝', deleted: '🗑️', untracked: '❓', renamed: '📛' }[file.status];
      output += `### ${icon} ${file.filePath} [${file.status}]\n`;
      output += `(${file.additions}+, ${file.deletions}-)\n\n`;

      // Include truncated diff
      const maxDiff = 3000;
      const diff = file.diff.length > maxDiff
        ? file.diff.substring(0, maxDiff) + '\n... (diff truncated, too large)'
        : file.diff;

      output += '```diff\n' + diff + '\n```\n\n';
    }

    return output;
  }

  /**
   * Review specific changes (from diff) and generate suggestions.
   * Returns structured review of each hunk.
   */
  reviewChanges(filePath: string, diff: string): DiffReviewResult {
    const hunks = this._parseDiffHunks(diff);
    const reviewHunks: DiffReviewHunk[] = [];

    for (const hunk of hunks) {
      const issues = this._analyzeHunk(hunk);
      reviewHunks.push({
        startLine: hunk.startLine,
        endLine: hunk.endLine,
        content: hunk.content,
        issues: issues.issues,
        suggestions: issues.suggestions,
      });
    }

    const totalIssues = reviewHunks.reduce((s, h) => s + h.issues.length, 0);
    let overall = '';
    if (totalIssues === 0) {
      overall = 'No issues detected in these changes.';
    } else {
      overall = `Found ${totalIssues} potential issue(s) across ${reviewHunks.length} change block(s).`;
    }

    return {
      filePath,
      hunks: reviewHunks,
      overallAssessment: overall,
    };
  }

  /**
   * Get the current file's uncommitted changes as context for the agent.
   * Called when user asks "review my changes" or selects code.
   */
  getActiveFileDiffContext(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';

    const filePath = vscode.workspace.asRelativePath(editor.document.uri);
    const summary = this.getUncommittedDiff();

    // If there are changes to this specific file, include them
    const fileChange = summary.files.find((f) => f.filePath === filePath);
    if (fileChange) {
      return `The file "${filePath}" has uncommitted changes:\n\`\`\`diff\n${fileChange.diff.substring(0, 4000)}\n\`\`\``;
    }

    // If no uncommitted changes, include the selected text
    if (editor.selection && !editor.selection.isEmpty) {
      const selectedText = editor.document.getText(editor.selection);
      return `The user has selected the following code in "${filePath}" (lines ${editor.selection.start.line + 1}-${editor.selection.end.line + 1}):\n\`\`\`\n${selectedText.substring(0, 4000)}\n\`\`\``;
    }

    return '';
  }

  // --- Private helpers ---

  private _getChangedFiles(workspaceFolder: string): DiffFile[] {
    const files: DiffFile[] = [];
    try {
      // Staged and unstaged changes
      const statusOutput = execFileSync('git', ['status', '--porcelain'], {
        cwd: workspaceFolder,
        encoding: 'utf8',
        stdio: 'pipe',
      });

      for (const line of statusOutput.split('\n')) {
        if (!line.trim()) continue;
        const statusCode = line.substring(0, 2).trim();
        const filePath = line.substring(3).trim();

        let status: DiffFile['status'];
        if (statusCode === 'M' || statusCode === 'MM') status = 'modified';
        else if (statusCode === 'A' || statusCode === 'AM') status = 'added';
        else if (statusCode === 'D') status = 'deleted';
        else if (statusCode === 'R') {
          const parts = filePath.split(' -> ');
          const oldPath = parts[0];
          const newPath = parts[1] || parts[0];
          files.push({
            filePath: newPath,
            oldPath,
            status: 'renamed',
            diff: '',
            additions: 0,
            deletions: 0,
          });
          continue;
        } else if (statusCode === '??' || statusCode === '?') status = 'untracked';
        else status = 'modified';

        files.push({
          filePath,
          status,
          diff: '',
          additions: 0,
          deletions: 0,
        });
      }
    } catch {
      // Not a git repo — fallback to listing workspace files
    }

    return files;
  }

  private _getFileDiff(workspaceFolder: string, filePath: string, status: string): string {
    try {
      if (status === 'untracked' || status === 'added') {
        // For untracked/added files, show the full file content as "diff"
        const fullPath = path.join(workspaceFolder, filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          let diff = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n`;
          for (const line of lines) {
            diff += '+' + line + '\n';
          }
          return diff;
        }
      }

      return execFileSync('git', ['diff', 'HEAD', '--', filePath], {
        cwd: workspaceFolder,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch {
      return '';
    }
  }

  private _parseDiffHunks(diff: string): { startLine: number; endLine: number; content: string }[] {
    const hunks: { startLine: number; endLine: number; content: string }[] = [];
    const lines = diff.split('\n');
    let currentHunk = '';
    let startLine = 0;
    let endLine = 0;

    for (const line of lines) {
      const hunkHeader = line.match(/^@@ -(\d+),\d+ \+(\d+),\d+ @@/);
      if (hunkHeader) {
        if (currentHunk) {
          hunks.push({ startLine, endLine, content: currentHunk });
        }
        startLine = parseInt(hunkHeader[2]);
        endLine = startLine;
        currentHunk = line + '\n';
      } else if (currentHunk) {
        currentHunk += line + '\n';
        if (line.startsWith('+') && !line.startsWith('+++')) endLine++;
      }
    }

    if (currentHunk) {
      hunks.push({ startLine, endLine, content: currentHunk });
    }

    return hunks;
  }

  private _analyzeHunk(hunk: { startLine: number; endLine: number; content: string }): {
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    const lines = hunk.content.split('\n');

    // Heuristic checks
    let hasConsoleLog = false;
    let hasDebugger = false;
    let hasTodo = false;
    let hasHardcodedSecret = false;

    for (const line of lines) {
      if (line.startsWith('+')) {
        if (line.match(/console\.(log|warn|error|debug)/)) hasConsoleLog = true;
        if (line.match(/^\+\s*debugger/)) hasDebugger = true;
        if (line.match(/TODO|FIXME|HACK/i)) hasTodo = true;
        if (line.match(/(?:password|secret|api_key|token|apiKey)\s*[:=]\s*['"][^'"]+['"]/i)) hasHardcodedSecret = true;
      }
    }

    if (hasConsoleLog) {
      issues.push('Contains console.log statements — consider using a logging framework or removing before commit.');
      suggestions.push('Replace console.log with a proper logging utility.');
    }

    if (hasDebugger) {
      issues.push('Contains debugger statement — should be removed before commit.');
      suggestions.push('Remove the debugger statement.');
    }

    if (hasTodo) {
      issues.push('Contains TODO/FIXME comments — ensure they are tracked or resolved.');
    }

    if (hasHardcodedSecret) {
      issues.push('⚠️ Potential hardcoded secret detected — never commit secrets to version control.');
      suggestions.push('Use environment variables or a secrets manager instead of hardcoding credentials.');
    }

    return { issues, suggestions };
  }
}
