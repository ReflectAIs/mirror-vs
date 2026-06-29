/**
 * Git tools for the Mirror VS agent.
 * Provides git_commit, git_status, git_diff, git_add as built-in tools.
 */

import { ToolCall } from '../types';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  content: string;
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface ParsedDiff {
  hunks: DiffHunk[];
}

function parseUnifiedDiff(diffOutput: string): ParsedDiff | null {
  if (!diffOutput.trim()) return null;

  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  diffOutput.split('\n').forEach((line) => {
    if (line.startsWith('@@ ')) {
      if (currentHunk) hunks.push(currentHunk);
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      currentHunk = {
        oldStart: parseInt(match?.[1] || '0'),
        oldLines: parseInt(match?.[2] || '1'),
        newStart: parseInt(match?.[3] || '0'),
        newLines: parseInt(match?.[4] || '1'),
        lines: [],
      };
    } else if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({ type: 'add' as const, content: line.substring(1) });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'del' as const, content: line.substring(1) });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'ctx' as const, content: line.substring(1) });
      }
    }
  });
  if (currentHunk) hunks.push(currentHunk);

  return { hunks };
}

/**
 * Execute a git tool call
 */
export async function executeGitTool(tool: ToolCall, workspacePath?: string): Promise<string> {
  const ws = workspacePath || process.cwd();

  if (!workspacePath) {
    return 'Error: No workspace folder open. Please open a folder first.';
  }

  // Ensure we're in a git repo
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ws, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    return 'Error: Not a git repository. Please initialize a git repo first with `git init`.';
  }

  switch (tool.name) {
    case 'git_status': {
      const status = execFileSync('git', ['status', '--porcelain'], { cwd: ws, encoding: 'utf8' });
      const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ws, encoding: 'utf8' }).trim();
      const lines = status.trim() ? status.split('\n').filter(Boolean) : [];

      if (lines.length === 0) {
        return `Git Status (branch: ${branch}):\n✅ Working tree clean - no changes detected.`;
      }

      const added = lines.filter((l) => l[0] === 'A' || l.substring(0, 2).trim() === 'A');
      const modified = lines.filter((l) => l[0] === 'M' || l[1] === 'M');
      const deleted = lines.filter((l) => l[0] === 'D' || l[1] === 'D');
      const untracked = lines.filter((l) => l.substring(0, 2) === '??');

      let result = `Git Status (branch: ${branch}):\n`;
      result += `📊 Summary: ${added.length} added, ${modified.length} modified, ${deleted.length} deleted, ${untracked.length} untracked\n\n`;

      lines.forEach((line) => {
        const stagedStatus = line[0].trim();
        const unstagedStatus = line[1].trim();
        let file = line.substring(3).trim();
        if (file.includes(' -> ')) {
          file = file.split(' -> ').pop() || file;
        }
        const statusChar = stagedStatus || unstagedStatus || '?';
        const statusLabel =
          statusChar === 'A'
            ? '✅ Added'
            : statusChar === 'M'
              ? '📝 Modified'
              : statusChar === 'D'
                ? '🗑️ Deleted'
                : statusChar === '?'
                  ? '❓ Untracked'
                  : statusChar;
        result += `  ${statusLabel}: ${file}\n`;
      });

      return result;
    }

    case 'git_diff': {
      const filePath = tool.path;
      if (!filePath) {
        // Full diff
        const diff = execFileSync('git', ['diff', '--unified=5'], { cwd: ws, encoding: 'utf8' });
        if (!diff.trim()) {
          return 'Git Diff: No unstaged changes detected.';
        }
        const parsed = parseUnifiedDiff(diff);
        if (!parsed || parsed.hunks.length === 0) {
          return 'Git Diff: No changes to display (files may be staged or untracked).';
        }
        let result = 'Git Diff (all unstaged changes):\n\n';
        parsed.hunks.forEach((hunk: DiffHunk) => {
          result += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
          hunk.lines.forEach((line: DiffLine) => {
            const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
            result += `${prefix}${line.content}\n`;
          });
        });
        return result;
      }

      // Specific file diff
      const fullPath = path.resolve(ws, filePath);
      if (!fullPath.startsWith(ws)) {
        return `Error: File path "${filePath}" is outside the workspace.`;
      }
      if (!fs.existsSync(fullPath)) {
        return `Error: File not found: ${filePath}`;
      }

      try {
        const diff = execFileSync('git', ['diff', '--unified=5', '--', filePath], { cwd: ws, encoding: 'utf8' });
        if (!diff.trim()) {
          // Try staged diff
          const stagedDiff = execFileSync('git', ['diff', '--cached', '--unified=5', '--', filePath], {
            cwd: ws,
            encoding: 'utf8',
          });
          if (!stagedDiff.trim()) {
            return `Git Diff for ${filePath}: No changes detected (check if file is tracked).`;
          }
          const parsed = parseUnifiedDiff(stagedDiff);
          if (!parsed || parsed.hunks.length === 0) {
            return `Git Diff for ${filePath}: File exists but diff format could not be parsed.`;
          }
          let result = `Git Diff for ${filePath} (staged):\n\n`;
          parsed.hunks.forEach((hunk: DiffHunk) => {
            result += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
            hunk.lines.forEach((line: DiffLine) => {
              const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
              result += `${prefix}${line.content}\n`;
            });
          });
          return result;
        }

        const parsed = parseUnifiedDiff(diff);
        if (!parsed || parsed.hunks.length === 0) {
          return `Git Diff for ${filePath}: Changes detected but diff format could not be parsed.`;
        }

        let result = `Git Diff for ${filePath}:\n\n`;
        parsed.hunks.forEach((hunk: DiffHunk) => {
          result += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
          hunk.lines.forEach((line: DiffLine) => {
            const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
            result += `${prefix}${line.content}\n`;
          });
        });
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return `Error getting git diff for ${filePath}: ${message}`;
      }
    }

    case 'git_add': {
      const filePath = tool.path;
      if (!filePath) {
        // Add all
        execFileSync('git', ['add', '-A'], { cwd: ws, encoding: 'utf8' });
        return '✅ All changes staged for commit.';
      }

      const fullPath = path.resolve(ws, filePath);
      if (!fullPath.startsWith(ws)) {
        return `Error: File path "${filePath}" is outside the workspace.`;
      }
      if (!fs.existsSync(fullPath)) {
        return `Error: File not found: ${filePath}`;
      }

      execFileSync('git', ['add', '--', filePath], { cwd: ws, encoding: 'utf8' });
      return `✅ Staged: ${filePath}`;
    }

    case 'git_commit': {
      const message = tool.content || tool.query || 'Mirror VS: automated commit';
      const addAll = tool.path === undefined; // If no path, add all

      if (addAll) {
        try {
          execFileSync('git', ['add', '-A'], { cwd: ws, encoding: 'utf8' });
        } catch {
          // Continue even if add fails
        }
      }

      try {
        execFileSync('git', ['commit', '-m', message], { cwd: ws, encoding: 'utf8' });
        return `✅ Commit created: "${message}"`;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('nothing to commit')) {
          return 'ℹ️ Nothing to commit - working tree clean.';
        }
        return `Error creating commit: ${message}`;
      }
    }

    case 'git_checkpoint': {
      try {
        execFileSync('git', ['add', '-A'], { cwd: ws, encoding: 'utf8' });
        const timestamp = Date.now();
        const commitMsg = `mirror-checkpoint-${timestamp}`;
        execFileSync('git', ['commit', '--allow-empty', '-m', commitMsg], { cwd: ws, encoding: 'utf8' });
        const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ws, encoding: 'utf8' }).trim();
        return `✅ Checkpoint created successfully.\nCheckpoint ID: ${hash}\nUse <git_rollback checkpoint_id="${hash}" /> to revert to this state.`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `Error creating git checkpoint: ${msg}`;
      }
    }

    case 'git_rollback': {
      const checkpointId = tool.checkpoint_id || (tool as any).checkpointId || tool.query || '';
      if (!checkpointId) {
        return `Error: Missing "checkpoint_id" parameter for git_rollback.`;
      }
      try {
        execFileSync('git', ['reset', '--hard', checkpointId], { cwd: ws, encoding: 'utf8' });
        execFileSync('git', ['clean', '-fd'], { cwd: ws, encoding: 'utf8' });
        return `✅ Workspace rolled back successfully to checkpoint: ${checkpointId}.`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `Error performing git rollback: ${msg}`;
      }
    }

    default:
      return `Error: Unknown git tool: ${tool.name}`;
  }
}
