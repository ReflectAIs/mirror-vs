import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatMessage } from '../types';
import { getDisabledToolsForMode } from './tool-policy';
import { ALL_REGISTERED_TOOLS } from './tools/tool-registry';
import {
  AgentState,
  TaskMode,
  hasEnoughInformationForReview,
  isErrorDirectlyLocalized,
  hasSufficientJSEvidence,
} from './state-machine';

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
  warningsToAdd?: string[];
  newSearchCount?: number;
}

export function validateControlLoopGuard(
  tool: any,
  taskMode: TaskMode,
  activeMode: string,
  verifiedFiles: Set<string>,
  currentMessages: ChatMessage[],
  searchCount: number,
  maxSearchBudget: number,
  readRangesTracker: Map<string, { hash: string; ranges: Set<string> }>,
  lastSearches: string[],
  hasCommittedToPatch: boolean,
  agentState: AgentState,
  blockedScopes: string[],
  allowedScopes: string[],
  featureOwner: string,
 ): GuardResult {
  const allRegisteredTools = ALL_REGISTERED_TOOLS;

  const disabledTools = getDisabledToolsForMode(taskMode, allRegisteredTools);
  if (disabledTools.has(tool.name)) {
    return {
      allowed: false,
      reason: `Tool execution is blocked: the tool "${tool.name}" is not permitted in ${taskMode} mode.`,
    };
  }

  if (agentState === AgentState.NEEDS_EVIDENCE) {
    return {
      allowed: true,
      warning: `[Needs Evidence Reminder]: You lack the JS stack trace or crash logs. Consider asking the user for diagnostic info (Logcat, RedBox, etc.) before patching.`,
    };
  }

  const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';
  const isSearchOrRead = [
    'read_file',
    'grep_search',
    'symbol_search',
    'list_dir',
    'web_search',
    'git_status',
    'git_diff',
  ].includes(tool.name);

  const warningsToAdd: string[] = [];
  let updatedSearchCount = searchCount;

  if (isSearchOrRead) {
    // 0a. Review Sufficiency
    if (hasEnoughInformationForReview(taskMode, verifiedFiles, currentMessages)) {
      warningsToAdd.push(
        `[Review]: You have read ${verifiedFiles.size} file(s) — consider outputting your findings soon.`,
      );
    }

    // 0b. Error Localized
    if (isErrorDirectlyLocalized(currentMessages, verifiedFiles)) {
      warningsToAdd.push(`[Error Localized]: The failing file has been inspected. You may be ready to patch.`);
    }

    // 1. Commitment Lock
    if (hasCommittedToPatch && activeMode !== 'debug') {
      warningsToAdd.push(
        `[Commitment]: You declared you are ready to patch. Prefer implementation over further exploration.`,
      );
    }

    // 2. Search Budget
    if (searchCount >= maxSearchBudget) {
      warningsToAdd.push(
        `[Search Budget]: ${maxSearchBudget} searches used. Consider patching or explaining what's missing.`,
      );
    }

    // 3. "No Re-Read"
    if (tool.name === 'read_file' && activeMode !== 'debug') {
      const startLine = tool.start_line || 1;
      const endLine = tool.end_line || 1000;
      const rangeKey = `${startLine}-${endLine}`;
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = tool.path
        ? path.isAbsolute(tool.path)
          ? tool.path
          : path.join(workspacePath, tool.path)
        : '';

      let currentHash = '';
      try {
        if (fullPath && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath);
          currentHash = crypto.createHash('sha256').update(content).digest('hex');
        }
      } catch {
        console.error('Failed to hash file for diff check');
      }

      let tracker = readRangesTracker.get(fullPath);
      if (!tracker || tracker.hash !== currentHash) {
        tracker = { hash: currentHash, ranges: new Set<string>() };
        readRangesTracker.set(fullPath, tracker);
      }

      if (tracker.ranges.has(rangeKey)) {
        warningsToAdd.push(
          `[Re-Read]: Already read "${tool.path}" (lines ${startLine}-${endLine}). Skipping may save time.`,
        );
      }
      tracker.ranges.add(rangeKey);
    }

    // 4. Convergence Detector
    updatedSearchCount++;
    const searchKey = `${tool.name}:${target}`;
    lastSearches.push(searchKey);
    if (lastSearches.length > 5) lastSearches.shift();

    if (lastSearches.length >= 3 && lastSearches.every((s) => s === searchKey)) {
      warningsToAdd.push(`[Convergence]: Repeated "${searchKey}" 3x. Consider a different approach.`);
    }
  }

  // 5. Workspace Grounding
  if (tool.name === 'patch_file') {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fullPath = tool.path
      ? path.isAbsolute(tool.path)
        ? tool.path
        : path.join(workspacePath, tool.path)
      : '';
    if (fullPath && !verifiedFiles.has(fullPath)) {
      warningsToAdd.push(
        `[Grounding]: You haven't read "${tool.path}" yet this session. Patching without reading may cause SEARCH-block mismatches.`,
      );
    }
  }

  // 7. JS Exception / Evidence
  if ((tool.name === 'patch_file' || tool.name === 'write_file') && !hasSufficientJSEvidence(currentMessages)) {
    warningsToAdd.push(`[Evidence]: Patching a crash without full stack trace. The fix may be speculative.`);
  }

  // 6. Architecture Constraint Lock
  if (isSearchOrRead && blockedScopes.length > 0) {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fullPath = tool.path
      ? path.isAbsolute(tool.path)
        ? tool.path
        : path.join(workspacePath, tool.path)
      : '';
    const normalizedPath = fullPath.toLowerCase().replace(/\\/g, '/');

    for (const blocked of blockedScopes) {
      if (normalizedPath.includes(blocked) || target.toLowerCase().includes(blocked)) {
        warningsToAdd.push(
          `[Architecture]: Accessing '${target}' may violate SEARCH_SCOPE_BLOCKED '${blocked}'. Add JUSTIFICATION to <architecture_routing> if needed.`,
        );
      }
    }
  }

  // Clear read history if modifying a file or running a terminal command
  if (tool.name === 'patch_file' || tool.name === 'write_file' || tool.name === 'create_file') {
    if (tool.path) {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = tool.path
        ? path.isAbsolute(tool.path)
          ? tool.path
          : path.join(workspacePath, tool.path)
        : '';
      if (fullPath) {
        readRangesTracker.delete(fullPath);
      }
    }
  } else if (tool.name === 'run_command') {
    readRangesTracker.clear();
  }

  return {
    allowed: true,
    warningsToAdd,
    newSearchCount: updatedSearchCount,
  };
}
