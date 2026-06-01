import * as fs from 'fs';
import * as path from 'path';
import { ToolCall } from '../types';
import { createCheckpoint } from '../../utils/editor-utils';
import { ReviewManager } from '../../services/review-manager';

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
 * Writes changes to the file instantly and silently, opening it in the active editor.
 * Returns accepted: true immediately so the model never blocks or halts.
 */
async function confirmChangesWithDiff(
  originalPath: string,
  proposedContent: string,
  _fileName: string,
  checkpointAction: 'create' | 'replace',
): Promise<{ accepted: boolean; checkpointId: string | null }> {
  // Ensure parent directory exists before writing
  const parentDir = path.dirname(originalPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Read original content before it gets overwritten
  const originalContent = fs.existsSync(originalPath) ? fs.readFileSync(originalPath, 'utf8') : '';

  // Create checkpoint first so the user can easily revert if needed
  const checkpointId = await createCheckpoint(originalPath, checkpointAction);

  // Start the non-blocking background review, passing checkpoint ID
  ReviewManager.getInstance().startReview(
    originalPath,
    originalContent,
    proposedContent,
    checkpointId || undefined,
  );

  return { accepted: true, checkpointId };
}

export async function executeFileTool(tool: ToolCall, getSafePath: (p: string) => string): Promise<string> {
  switch (tool.name) {
    case 'read_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for read_file.');
      const safePath = getSafePath(tool.path);
      if (!fs.existsSync(safePath)) {
        throw new Error(`File does not exist: ${tool.path}`);
      }

      let fullContent = '';
      const proposed = ReviewManager.getInstance().getProposedContent(safePath);
      if (proposed !== undefined) {
        fullContent = proposed;
      } else {
        fullContent = fs.readFileSync(safePath, 'utf8');
      }

      const startLine = tool.start_line;
      const endLine = tool.end_line;

      const allLines = fullContent.split('\n');
      const totalLines = allLines.length;
      const s = Math.max(1, startLine ?? 1);
      const e = Math.min(totalLines, endLine ?? totalLines);

      if (s > totalLines && totalLines > 0) {
        throw new Error(`start_line ${s} exceeds file length (${totalLines} lines).`);
      }

      const selectedLines = allLines.slice(s - 1, e);
      const numbered = selectedLines.map((line, i) => `${s + i}: ${line}`).join('\n');
      return `[File: ${tool.path} — showing lines ${s}-${e} of ${totalLines} total]\n${numbered}`;
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

      const depth = tool.depth !== undefined ? Math.max(1, Math.min(5, tool.depth)) : 1;

      if (depth === 1) {
        const entries = fs.readdirSync(safePath);
        return (
          entries
            .map((e) => {
              const isDir = fs.statSync(path.join(safePath, e)).isDirectory();
              return `${e}${isDir ? '/' : ''}`;
            })
            .join('\n') || '[Directory is empty]'
        );
      } else {
        // Recursive listing
        const buildLocalTree = (dir: string, currentDepth: number, prefix: string): string[] => {
          if (currentDepth > depth) return [];
          const lines: string[] = [];
          try {
            const entries = fs.readdirSync(dir);
            const dirs: string[] = [];
            const files: string[] = [];

            for (const e of entries) {
              // Ignore standard skip items to keep output clean and fast
              if (['node_modules', 'dist', 'out', '.git', '.mirror-vs', 'build', '.next', '.vscode'].includes(e)) continue;
              const fp = path.join(dir, e);
              try {
                const s = fs.statSync(fp);
                if (s.isDirectory()) dirs.push(e);
                else if (s.isFile()) files.push(e);
              } catch { /* skip */ }
            }

            dirs.sort();
            files.sort();

            const allItems = [
              ...dirs.map(d => ({ name: d, isDir: true })),
              ...files.map(f => ({ name: f, isDir: false }))
            ];

            for (let i = 0; i < allItems.length; i++) {
              const item = allItems[i];
              const isLast = i === allItems.length - 1;
              const marker = isLast ? "└── " : "├── ";
              const childPrefix = prefix + (isLast ? "    " : "│   ");

              if (item.isDir) {
                lines.push(`${prefix}${marker}${item.name}/`);
                lines.push(...buildLocalTree(path.join(dir, item.name), currentDepth + 1, childPrefix));
              } else {
                lines.push(`${prefix}${marker}${item.name}`);
              }
            }
          } catch { /* skip */ }
          return lines;
        };

        const treeLines = buildLocalTree(safePath, 1, "");
        return treeLines.join('\n') || '[Directory is empty]';
      }
    }

    case 'create_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for create_file.');
      const safePath = getSafePath(tool.path);
      const proposedContent = tool.content || '';

      const { accepted, checkpointId } = await confirmChangesWithDiff(
        safePath,
        proposedContent,
        path.basename(tool.path),
        'create',
      );
      if (!accepted) {
        throw new Error('User rejected file creation.');
      }

      return `File created and opened in editor: ${tool.path}. Revert ID: ${checkpointId}`;
    }

    case 'write_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for write_file.');
      const safePath = getSafePath(tool.path);
      const proposedContent = tool.content || '';

      const { accepted, checkpointId } = await confirmChangesWithDiff(
        safePath,
        proposedContent,
        path.basename(tool.path),
        'replace',
      );
      if (!accepted) {
        throw new Error('User rejected file overwrite changes.');
      }

      return `File updated and opened in editor: ${tool.path}. Revert ID: ${checkpointId}`;
    }

    case 'rename_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for rename_file. Use path for source.');
      if (!tool.content) throw new Error('Missing "content" attribute for rename_file. Use content for destination path.');
      const safePath = getSafePath(tool.path);
      const destPath = getSafePath(tool.content.trim());
      if (!fs.existsSync(safePath)) {
        throw new Error(`Source file does not exist: ${tool.path}`);
      }
      if (fs.existsSync(destPath)) {
        throw new Error(`Destination already exists: ${tool.content}`);
      }
      const parentDir = path.dirname(destPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.renameSync(safePath, destPath);
      return `File renamed: ${tool.path} -> ${tool.content}`;
    }

    case 'delete_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for delete_file.');
      const safePathDel = getSafePath(tool.path);
      if (!fs.existsSync(safePathDel)) {
        throw new Error(`File does not exist: ${tool.path}`);
      }
      const stat = fs.statSync(safePathDel);
      if (stat.isDirectory()) {
        throw new Error(`Cannot delete directory with delete_file. Path is a directory: ${tool.path}`);
      }

      const { accepted, checkpointId } = await confirmChangesWithDiff(
        safePathDel,
        '',
        path.basename(tool.path),
        'replace',
      );
      if (!accepted) {
        throw new Error('User rejected file deletion.');
      }
      return `File deletion proposed and opened in editor: ${tool.path}. Revert ID: ${checkpointId}`;
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
              `SEARCH block #${i + 1} not found in file (failed both exact and fuzzy matches).\nSearch target:\n${search}`,
            );
          }

          // Apply replacement on the matched lines
          fileLines.splice(matchRange.start, matchRange.end - matchRange.start + 1, replace);
          fileContent = fileLines.join('\n');
        }
      }

      const { accepted, checkpointId } = await confirmChangesWithDiff(
        safePath,
        fileContent,
        path.basename(tool.path),
        'replace',
      );
      if (!accepted) {
        throw new Error('User rejected patch edits.');
      }

      return `File patched: ${tool.path}. Applied ${patches.length} block(s). Revert ID: ${checkpointId}`;
    }

    default:
      throw new Error(`Invalid file tool: ${tool.name}`);
  }
}

function parsePatchBlocks(content: string): { search: string; replace: string }[] {
  const blocks: { search: string; replace: string }[] = [];
  
  // 1. Try standard conflict style first
  const gitRegex = /<<<<<<< SEARCH[\r\n]+([\s\S]*?)[\r\n]+=======[\r\n]+([\s\S]*?)[\r\n]+>>>>>>> REPLACE/gi;
  let match;
  while ((match = gitRegex.exec(content)) !== null) {
    const search = match[1].replace(/\r\n/g, '\n');
    const replace = match[2].replace(/\r\n/g, '\n');
    blocks.push({ search, replace });
  }
  
  if (blocks.length > 0) {
    return blocks;
  }

  // 2. Fallback to flexible sequential label parser (handles "SEARCH:" / "REPLACE:" etc.)
  const normalized = content.replace(/\r\n/g, '\n');
  const parts = normalized.split(/SEARCH:?/i);
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const replaceIndex = part.search(/REPLACE:?/i);
    if (replaceIndex !== -1) {
      let search = part.substring(0, replaceIndex);
      // Clean leading/trailing spaces and newlines
      search = search.replace(/^\n/, '').replace(/\n$/, '').trim();
      
      let replace = part.substring(replaceIndex);
      // Strip the REPLACE: marker
      const markerMatch = replace.match(/REPLACE:?/i);
      if (markerMatch) {
        replace = replace.substring(markerMatch[0].length);
      }
      // Strip any trailing git conflict replacement markers if present
      replace = replace.replace(/>>>>>>>\s*REPLACE/i, '');
      replace = replace.replace(/^\n/, '').replace(/\n$/, '').trim();
      
      if (search !== undefined && replace !== undefined) {
        blocks.push({ search, replace });
      }
    }
  }
  
  return blocks;
}