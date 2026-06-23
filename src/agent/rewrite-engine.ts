import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatMessage } from '../types';
import { detectActiveSymptom } from './state-machine';
import { ALL_REGISTERED_TOOLS } from './tools/tool-registry';

export function logRewriteTelemetryToFile(entry: any): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;
  const workspaceRoot = folders[0].uri.fsPath;
  const logDir = path.join(workspaceRoot, '.mirror-vs');
  const logFile = path.join(logDir, 'rewrites.log');

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    console.log('[Telemetry] Logged rewrite outcome:', entry);
  } catch (e) {
    console.warn('Failed to log rewrite telemetry:', e);
  }
}

export function selectHighestValueTool(toolCalls: any[], messages: ChatMessage[]): { selectedTool: any; alternatives: any[] } {
  const symptom = detectActiveSymptom(messages);
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  let errorFileBasename = '';
  if (symptom === 'BUILD_FAILURE') {
    for (let i = messages.length - 1; i >= 0; i--) {
      const content = messages[i].content;
      if (
        content.toLowerCase().includes('[build status]: failed') ||
        content.toLowerCase().includes('compilation error')
      ) {
        for (const t of toolCalls) {
          if (t.path) {
            const base = path.basename(t.path).toLowerCase();
            if (base && content.toLowerCase().includes(base)) {
              errorFileBasename = base;
              break;
            }
          }
        }
      }
    }
  }

  const getToolScoreDetails = (
    tool: any,
  ): { score: number; breakdown: { basePriority: number; symptomMatch: number; feasibilityScore: number } } => {
    const name = tool.name;
    let basePriority = 10;
    let symptomMatch = 0;
    let feasibilityScore = 0;

    if (name === 'read_file' && tool.path) {
      const fullPath = path.isAbsolute(tool.path) ? tool.path : path.join(workspacePath, tool.path);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          feasibilityScore = -45;
        }
      } catch {
        // Path doesn't exist yet; no penalty
      }
    }

    if (
      [
        'patch_file',
        'write_file',
        'create_file',
        'delete_file',
        'rename_file',
        'run_command',
        'send_terminal_input',
        'git_commit',
      ].includes(name)
    ) {
      basePriority = 100;
    } else if (name === 'read_file') {
      basePriority = 50;
      const pathLower = (tool.path || '').toLowerCase();

      if (symptom === 'BUILD_FAILURE' && errorFileBasename && pathLower.includes(errorFileBasename)) {
        symptomMatch = 45;
      } else if (symptom === 'NETWORK_ERROR') {
        if (pathLower.includes('axiosinstance') || pathLower.includes('axios')) symptomMatch = 40;
        else if (pathLower.includes('apiconfig') || pathLower.includes('config')) symptomMatch = 38;
        else if (pathLower.includes('network') || pathLower.includes('http') || pathLower.includes('api'))
          symptomMatch = 35;
      } else if (symptom === 'AUTH_FAILURE') {
        if (pathLower.includes('auth') || pathLower.includes('login') || pathLower.includes('credential'))
          symptomMatch = 40;
        else if (pathLower.includes('session') || pathLower.includes('token')) symptomMatch = 38;
        else if (pathLower.includes('store') || pathLower.includes('context')) symptomMatch = 35;
      }
    } else if (['grep_search', 'symbol_search', 'git_diff', 'git_status'].includes(name)) {
      basePriority = 30;
    }

    return {
      score: basePriority + symptomMatch + feasibilityScore,
      breakdown: { basePriority, symptomMatch, feasibilityScore },
    };
  };

  const alternatives = toolCalls
    .map((t) => {
      const details = getToolScoreDetails(t);
      return {
        tool: t.name,
        target: t.path || t.query || t.command || t.url || '',
        score: details.score,
        scoreBreakdown: details.breakdown,
      };
    })
    .sort((a, b) => b.score - a.score);

  let best = toolCalls[0];
  let bestScore = getToolScoreDetails(best).score;

  for (let i = 1; i < toolCalls.length; i++) {
    const t = toolCalls[i];
    const s = getToolScoreDetails(t).score;
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }

  return { selectedTool: best, alternatives };
}

export function rewriteResponseToSingleTool(rawText: string, selectedTool: any): string {
  let rewritten = rawText;

  const allTools = [...ALL_REGISTERED_TOOLS, 'ls_dir', 'multipatch_file'];

  for (const toolName of allTools) {
    const openTagPattern = new RegExp('<' + toolName + '(\\s+[^>]*)?>', 'gi');
    let match;

    while ((match = openTagPattern.exec(rewritten)) !== null) {
      const tagStart = match.index;
      const tagContent = match[0];
      const pathAttr = /path\s*=\s*["']([^"']+)["']/i.exec(tagContent);
      const queryAttr = /query\s*=\s*["']([^"']+)["']/i.exec(tagContent);
      const commandAttr = /command\s*=\s*["']([^"']+)["']/i.exec(tagContent);
      const urlAttr = /url\s*=\s*["']([^"']+)["']/i.exec(tagContent);
      const inputAttr = /input\s*=\s*["']([^"']+)["']/i.exec(tagContent);

      const targetVal = pathAttr?.[1] || queryAttr?.[1] || commandAttr?.[1] || urlAttr?.[1] || inputAttr?.[1] || '';

      const isSelected =
        (toolName === selectedTool.name ||
          (toolName === 'ls_dir' && selectedTool.name === 'list_dir') ||
          (toolName === 'multipatch_file' && selectedTool.name === 'multi_patch_file')) &&
        targetVal.trim() ===
          (
            selectedTool.path ||
            selectedTool.query ||
            selectedTool.command ||
            selectedTool.url ||
            selectedTool.content ||
            ''
          ).trim();

      if (!isSelected) {
        let blockEnd = match.index + match[0].length;
        const closeTagRegex = new RegExp('</' + toolName + '\\s*>', 'i');
        const closeMatch = closeTagRegex.exec(rewritten.substring(blockEnd));

        if (closeMatch) {
          blockEnd += closeMatch.index + closeMatch[0].length;
        }

        rewritten = rewritten.substring(0, tagStart) + '\n' + rewritten.substring(blockEnd);
        openTagPattern.lastIndex = 0;
      }
    }
  }

  return rewritten;
}
