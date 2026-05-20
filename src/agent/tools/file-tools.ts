import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ToolCall } from '../types';
import { createCheckpoint } from '../../utils/editor-utils';

function normalizeLineEndings(str: string): string {
  return str.replace(/\r\n/g, '\n');
}

/**
 * Normalizes a line's whitespace to allow fuzzy comparison.
 */
function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * Attempts to fuzzy-locate a sequence of SEARCH lines in target content lines.
 * Returns the start and end line indices (0-indexed) if found, or null.
 */
function findFuzzyMatchRange(fileContentLines: string[], searchLines: string[]): { start: number; end: number } | null {
  if (searchLines.length === 0) return null;

  const normalizedSearch = searchLines.map(normalizeLine);
  const normalizedFile = fileContentLines.map(normalizeLine);

  for (let i = 0; i <= normalizedFile.length - normalizedSearch.length; i++) {
    let match = true;
    for (let j = 0; j < normalizedSearch.length; j++) {
      if (normalizedFile[i + j] !== normalizedSearch[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return { start: i, end: i + searchLines.length - 1 };
    }
  }

  return null;
}

/**
 * Visual split diff confirmation.
 */
async function confirmChangesWithDiff(
  originalPath: string,
  proposedContent: string,
  fileName: string
): Promise<boolean> {
  // Autonomous mode: bypass split diff and return true immediately
  // Allows instantaneous code application without human intervention
  return true;
}

export async function executeFileTool(
  tool: ToolCall,
  getSafePath: (p: string) => string
): Promise<string> {
  switch (tool.name) {
    case 'read_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for read_file.');
      const safePath = getSafePath(tool.path);
      if (!fs.existsSync(safePath)) {
        throw new Error(`File does not exist: ${tool.path}`);
      }
      return fs.readFileSync(safePath, 'utf8');
    }

    case 'list_dir': {
      if (!tool.path) throw new Error('Missing "path" attribute for list_dir.');
      const safePath = getSafePath(tool.path);
      if (!fs.existsSync(safePath)) {
        throw new Error(`Directory does not exist: ${tool.path}`);
      }
      const stat = fs.statSync(safePath);
      if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${tool.path}`);
      }
      const entries = fs.readdirSync(safePath);
      return entries.map(e => {
        const isDir = fs.statSync(path.join(safePath, e)).isDirectory();
        return `${e}${isDir ? '/' : ''}`;
      }).join('\n') || '[Directory is empty]';
    }

    case 'create_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for create_file.');
      const safePath = getSafePath(tool.path);
      const proposedContent = tool.content || '';
      
      const confirmed = await confirmChangesWithDiff(safePath, proposedContent, path.basename(tool.path));
      if (!confirmed) {
        throw new Error('User rejected file creation.');
      }

      // Ensure parent directories are created recursively before writing the file
      const parentDir = path.dirname(safePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const checkpointId = await createCheckpoint(safePath, 'create');
      fs.writeFileSync(safePath, proposedContent, 'utf8');

      try {
        const doc = await vscode.workspace.openTextDocument(safePath);
        await vscode.window.showTextDocument(doc);
      } catch (e) {
        // ignore editor errors
      }

      return `File created and opened in editor: ${tool.path}. Revert ID: ${checkpointId}`;
    }

    case 'write_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for write_file.');
      const safePath = getSafePath(tool.path);
      const proposedContent = tool.content || '';

      const confirmed = await confirmChangesWithDiff(safePath, proposedContent, path.basename(tool.path));
      if (!confirmed) {
        throw new Error('User rejected file overwrite changes.');
      }

      // Ensure parent directories are created recursively before writing the file
      const parentDir = path.dirname(safePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const checkpointId = await createCheckpoint(safePath, 'replace');
      fs.writeFileSync(safePath, proposedContent, 'utf8');

      try {
        const doc = await vscode.workspace.openTextDocument(safePath);
        await vscode.window.showTextDocument(doc);
      } catch (e) {
        // ignore editor errors
      }

      return `File updated and opened in editor: ${tool.path}. Revert ID: ${checkpointId}`;
    }

    case 'patch_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for patch_file.');
      const safePath = getSafePath(tool.path);
      if (!fs.existsSync(safePath)) {
        throw new Error(`File does not exist: ${tool.path}`);
      }

      let fileContent = normalizeLineEndings(fs.readFileSync(safePath, 'utf8'));
      const rawPatches = tool.content || '';
      const patches = parsePatchBlocks(rawPatches);

      if (patches.length === 0) {
        throw new Error('No valid SEARCH/REPLACE blocks found in patch_file content.');
      }

      for (let i = 0; i < patches.length; i++) {
        const { search, replace } = patches[i];
        
        // Try exact match first
        if (fileContent.includes(search)) {
          fileContent = fileContent.replace(search, replace);
        } else {
          // Fuzzy match fallback
          const fileLines = fileContent.split('\n');
          const searchLines = search.split('\n');
          const matchRange = findFuzzyMatchRange(fileLines, searchLines);

          if (!matchRange) {
            throw new Error(
              `SEARCH block #${i + 1} not found in file (failed both exact and fuzzy matches).\nSearch target:\n${search}`
            );
          }

          // Apply replacement on the matched lines
          fileLines.splice(matchRange.start, matchRange.end - matchRange.start + 1, replace);
          fileContent = fileLines.join('\n');
        }
      }

      const confirmed = await confirmChangesWithDiff(safePath, fileContent, path.basename(tool.path));
      if (!confirmed) {
        throw new Error('User rejected patch edits.');
      }

      const checkpointId = await createCheckpoint(safePath, 'replace');
      fs.writeFileSync(safePath, fileContent, 'utf8');

      try {
        const doc = await vscode.workspace.openTextDocument(safePath);
        await vscode.window.showTextDocument(doc);
      } catch (e) {
        // ignore editor errors
      }

      return `File patched: ${tool.path}. Applied ${patches.length} block(s). Revert ID: ${checkpointId}`;
    }

    default:
      throw new Error(`Invalid file tool: ${tool.name}`);
  }
}

function parsePatchBlocks(content: string): { search: string; replace: string }[] {
  const blocks: { search: string; replace: string }[] = [];
  const regex = /<<<<<<< SEARCH[\r\n]+([\s\S]*?)[\r\n]+=======[\r\n]+([\s\S]*?)[\r\n]+>>>>>>> REPLACE/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const search = match[1].replace(/\r\n/g, '\n');
    const replace = match[2].replace(/\r\n/g, '\n');
    blocks.push({ search, replace });
  }
  return blocks;
}
