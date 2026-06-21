import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ToolCall } from '../types';
import { createCheckpoint } from '../../utils/editor-utils';
import { ReviewManager } from '../../services/review-manager';

function normalizeLineEndings(str: string): string {
  return str.replace(/\r\n/g, '\n');
}

/**
 * Light normalization: preserves all characters including emoji.
 * Only normalizes whitespace (tabs→spaces, collapses multiple spaces).
 */
function normalizeLineExact(line: string): string {
  // Preserves all characters including emoji — only normalizes whitespace
  return line.replace(/\t/g, '  ').trim().replace(/\s+/g, ' ');
}

function normalizeLineFuzzy(line: string): string {
  // Strips syntax noise, whitespace, and lowercases for extremely robust fuzzy matching
  return line
    .toLowerCase()
    .replace(/[{}[\]();,.:'"`]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Attempts to fuzzy-locate a sequence of SEARCH lines in target content lines.
 * Returns the start and end line indices (0-indexed) if found, or null.
 */
function findFuzzyMatchRange(fileContentLines: string[], searchLines: string[]): { start: number; end: number } | null {
  if (searchLines.length === 0) return null;

  const exactSearch = searchLines.map(normalizeLineExact);
  const exactFile = fileContentLines.map(normalizeLineExact);
  const fuzzySearch = searchLines.map(normalizeLineFuzzy);
  const fuzzyFile = fileContentLines.map(normalizeLineFuzzy);

  let bestScore = 0;
  let bestStart = -1;

  for (let i = 0; i <= exactFile.length - exactSearch.length; i++) {
    let score = 0;
    for (let j = 0; j < exactSearch.length; j++) {
      const fExact = exactFile[i + j];
      const sExact = exactSearch[j];
      const fFuzzy = fuzzyFile[i + j];
      const sFuzzy = fuzzySearch[j];
      // Skip matching blank lines
      if (sExact === '' && fExact === '') {
        score += 1;
        continue;
      }
      // Exact whitespace-only match (preserves emoji)
      if (fExact === sExact) {
        score += 1;
        continue;
      }
      // Exact contains (handles extra whitespace in file vs search)
      if (fExact.includes(sExact) || sExact.includes(fExact)) {
        score += 0.9;
        continue;
      }
      // Fuzzy match as fallback (may fail on emoji)
      if (fFuzzy === sFuzzy || fFuzzy.includes(sFuzzy) || sFuzzy.includes(fFuzzy)) {
        score += 0.7;
        continue;
      }
      // Character overlap ratio
      const overlap = [...sFuzzy].filter((ch) => fFuzzy.includes(ch)).length;
      const ratio = Math.max(overlap / Math.max(sFuzzy.length, 1), overlap / Math.max(fFuzzy.length, 1));
      if (ratio > 0.7) {
        score += ratio * 0.5;
        continue;
      }
      // Give it a 0 score for this line mismatch instead of setting score to -Infinity and breaking.
      // This allows the rest of the lines in the block to match and verify.
      score += 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
    // Perfect match — return immediately
    if (score === exactSearch.length) {
      return { start: i, end: i + searchLines.length - 1 };
    }
  }

  // Accept if best score exceeds 70% of perfect
  const perfectScore = exactSearch.length;
  if (bestStart >= 0 && bestScore >= perfectScore * 0.7) {
    return { start: bestStart, end: bestStart + searchLines.length - 1 };
  }

  // Report closest lines to help debug
  if (bestStart >= 0) {
    const snippet = fileContentLines.slice(bestStart, bestStart + searchLines.length + 2).join('\n');
    throw new Error(
      `SEARCH block not found (best fuzzy score ${bestScore.toFixed(1)}/${perfectScore}).\n` +
        `Closest match at line ${bestStart + 1}:\n${snippet}\n\n` +
        `Search target:\n${searchLines.join('\n')}`,
    );
  }

  return null;
}

/**
 * Validates structural consistency between search and replace blocks.
 * Checks brace/bracket/paren balance and indentation consistency
 * to catch common model mistakes in applying patches.
 */
function validatePatchStructure(search: string, replace: string): string[] {
  const issues: string[] = [];

  // Count structural characters
  const count = (s: string, ch: string) => (s.match(new RegExp(`\\${ch}`, 'g')) || []).length;
  const searchOpenBr = count(search, '{');
  const replaceOpenBr = count(replace, '{');
  const searchCloseBr = count(search, '}');
  const replaceCloseBr = count(replace, '}');
  const searchOpenP = count(search, '(');
  const replaceOpenP = count(replace, '(');
  const searchCloseP = count(search, ')');
  const replaceCloseP = count(replace, ')');
  const searchOpenB = count(search, '[');
  const replaceOpenB = count(replace, '[');
  const searchCloseB = count(search, ']');
  const replaceCloseB = count(replace, ']');

  // Check brace balance
  if (searchOpenBr !== searchCloseBr || replaceOpenBr !== replaceCloseBr) {
    issues.push(
      `Braces {}: SEARCH has ${searchOpenBr} open / ${searchCloseBr} close, REPLACE has ${replaceOpenBr} open / ${replaceCloseBr} close`,
    );
  }
  // Check paren balance
  if (searchOpenP !== searchCloseP || replaceOpenP !== replaceCloseP) {
    issues.push(
      `Parentheses (): SEARCH has ${searchOpenP} open / ${searchCloseP} close, REPLACE has ${replaceOpenP} open / ${replaceCloseP} close`,
    );
  }
  // Check bracket balance
  if (searchOpenB !== searchCloseB || replaceOpenB !== replaceCloseB) {
    issues.push(
      `Brackets []: SEARCH has ${searchOpenB} open / ${searchCloseB} close, REPLACE has ${replaceOpenB} open / ${replaceCloseB} close`,
    );
  }

  return issues;
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
  const config = vscode.workspace.getConfiguration('mirror-vs');
  const autoApproveWrite = config.get<boolean>('autoApproveWrite', false);
  if (!autoApproveWrite) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const relativePath = path.relative(workspaceFolder, originalPath).replace(/\\/g, '/');
    let approved = true;
    if (process.env.VITEST) {
      approved = true;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MirrorVsSidebarProvider } = require('../../providers/sidebar-provider');
      approved = await MirrorVsSidebarProvider.requestToolApproval('write_file', relativePath, proposedContent);
    }
    if (!approved) {
      return { accepted: false, checkpointId: null };
    }
  }

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
  ReviewManager.getInstance().startReview(originalPath, originalContent, proposedContent, checkpointId || undefined);

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

      // Split by universal newline to handle both Windows (\r\n) and Unix (\n)
      const allLines = fullContent.split(/\r?\n/);
      const totalLines = allLines.length;

      const start = tool.start_line !== undefined ? Math.max(1, tool.start_line) : 1;
      const end = tool.end_line !== undefined ? Math.min(totalLines, tool.end_line) : totalLines;

      if (start > totalLines && totalLines > 0) {
        throw new Error(`start_line ${start} exceeds file length (${totalLines} lines).`);
      }
      if (start > end) {
        throw new Error(`start_line (${start}) cannot be greater than end_line (${end}).`);
      }

      const selectedLines = allLines.slice(start - 1, end);
      const numbered = selectedLines.map((line, i) => `${start + i}: ${line}`).join('\n');
      return `[File: ${tool.path} — showing lines ${start}-${end} of ${totalLines} total]\n${numbered}`;
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
              if (['node_modules', 'dist', 'out', '.git', '.mirror-vs', 'build', '.next', '.vscode'].includes(e))
                continue;
              const fp = path.join(dir, e);
              try {
                const s = fs.statSync(fp);
                if (s.isDirectory()) dirs.push(e);
                else if (s.isFile()) files.push(e);
              } catch {
                /* skip */
              }
            }

            dirs.sort();
            files.sort();

            const allItems = [
              ...dirs.map((d) => ({ name: d, isDir: true })),
              ...files.map((f) => ({ name: f, isDir: false })),
            ];

            for (let i = 0; i < allItems.length; i++) {
              const item = allItems[i];
              const isLast = i === allItems.length - 1;
              const marker = isLast ? '└── ' : '├── ';
              const childPrefix = prefix + (isLast ? '    ' : '│   ');

              if (item.isDir) {
                lines.push(`${prefix}${marker}${item.name}/`);
                lines.push(...buildLocalTree(path.join(dir, item.name), currentDepth + 1, childPrefix));
              } else {
                lines.push(`${prefix}${marker}${item.name}`);
              }
            }
          } catch {
            /* skip */
          }
          return lines;
        };

        const treeLines = buildLocalTree(safePath, 1, '');
        return treeLines.join('\n') || '[Directory is empty]';
      }
    }

    case 'create_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for create_file.');
      const safePath = getSafePath(tool.path);
      const proposedContent = tool.content || '';
      const addedLines = proposedContent ? proposedContent.split('\n').length : 0;

      const { accepted, checkpointId } = await confirmChangesWithDiff(
        safePath,
        proposedContent,
        path.basename(tool.path),
        'create',
      );
      if (!accepted) {
        throw new Error('User rejected file creation.');
      }

      return `File created and opened in editor: ${tool.path} (+${addedLines}, -0). Revert ID: ${checkpointId}`;
    }

    case 'write_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for write_file.');
      const safePath = getSafePath(tool.path);
      const proposedContent = tool.content || '';
      const originalContent = fs.existsSync(safePath) ? fs.readFileSync(safePath, 'utf8') : '';
      const subtractedLines = originalContent ? originalContent.split('\n').length : 0;
      const addedLines = proposedContent ? proposedContent.split('\n').length : 0;

      const { accepted, checkpointId } = await confirmChangesWithDiff(
        safePath,
        proposedContent,
        path.basename(tool.path),
        'replace',
      );
      if (!accepted) {
        throw new Error('User rejected file overwrite changes.');
      }

      return `File updated and opened in editor: ${tool.path} (+${addedLines}, -${subtractedLines}). Revert ID: ${checkpointId}`;
    }

    case 'rename_file': {
      const source = tool.source_path || tool.path;
      const destination = tool.destination_path || tool.content;
      if (!source) throw new Error('Missing "source_path" or "path" attribute for rename_file.');
      if (!destination)
        throw new Error('Missing "destination_path" or "content" attribute for rename_file.');
      const safePath = getSafePath(source);
      const destPath = getSafePath(destination.trim());
      if (!fs.existsSync(safePath)) {
        throw new Error(`Source file does not exist: ${source}`);
      }
      if (fs.existsSync(destPath)) {
        throw new Error(`Destination already exists: ${destination}`);
      }

      const config = vscode.workspace.getConfiguration('mirror-vs');
      const autoApproveWrite = config.get<boolean>('autoApproveWrite', false);
      let approved = true;
      if (!autoApproveWrite) {
        if (process.env.VITEST) {
          approved = true;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { MirrorVsSidebarProvider } = require('../../providers/sidebar-provider');
          approved = await MirrorVsSidebarProvider.requestToolApproval('rename_file', `${source} -> ${destination}`);
        }
      }
      if (!approved) {
        throw new Error('User rejected file rename.');
      }

      const parentDir = path.dirname(destPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.renameSync(safePath, destPath);
      return `File renamed: ${source} -> ${destination}`;
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
      const originalContent = fs.readFileSync(safePathDel, 'utf8');
      const subtractedLines = originalContent ? originalContent.split('\n').length : 0;

      const { accepted, checkpointId } = await confirmChangesWithDiff(
        safePathDel,
        '',
        path.basename(tool.path),
        'replace',
      );
      if (!accepted) {
        throw new Error('User rejected file deletion.');
      }
      return `File deletion proposed and opened in editor: ${tool.path} (+0, -${subtractedLines}). Revert ID: ${checkpointId}`;
    }

    case 'patch_file': {
      if (!tool.path) throw new Error('Missing "path" attribute for patch_file.');
      const safePath = getSafePath(tool.path);
      if (!fs.existsSync(safePath)) {
        throw new Error(`File does not exist: ${tool.path}`);
      }

      let fileContent = normalizeLineEndings(fs.readFileSync(safePath, 'utf8'));
      const fileLines = fileContent.split(/\r?\n/);

      // Support structured line-range parameter or legacy search string
      const isLineTargeted = tool.start_line !== undefined && tool.end_line !== undefined && tool.expected_search_content !== undefined && tool.replace_content !== undefined;
      const patches: { search: string; replace: string }[] = [];

      if (isLineTargeted) {
        const start = Math.max(1, tool.start_line!);
        const end = Math.min(fileLines.length, tool.end_line!);
        const searchSegment = fileLines.slice(start - 1, end).join('\n');
        
        // Exact or whitespace-insensitive verification check
        const cleanExpected = normalizeLineExact(tool.expected_search_content!);
        const cleanTarget = normalizeLineExact(searchSegment);
        
        if (cleanExpected !== cleanTarget) {
          throw new Error(
            `Patch verification failed. Expected search content does not match the file content in specified range (lines ${start}-${end}).\n` +
            `Expected:\n${tool.expected_search_content}\n\n` +
            `Actual in file:\n${searchSegment}`
          );
        }
        patches.push({ search: searchSegment, replace: tool.replace_content! });
      } else {
        const rawPatches = tool.content || '';
        patches.push(...parsePatchBlocks(rawPatches));
      }

      if (patches.length === 0) {
        throw new Error(
          'No valid SEARCH/REPLACE blocks found in patch_file content.' +
            ' The required format is:\n' +
            '<<<<<<< SEARCH\n' +
            '[exact original lines]\n' +
            '=======\n' +
            '[replacement lines]\n' +
            '>>>>>>> REPLACE\n' +
            'Ensure "=======" separates SEARCH from REPLACE and ">>>>>>> REPLACE" closes the block. Do NOT put markdown or prose between the delimiters.',
        );
      }

      let addedLines = 0;
      let subtractedLines = 0;

      // Validate structural integrity of each replace block before applying
      const warnings: string[] = [];
      for (let i = 0; i < patches.length; i++) {
        const { search, replace } = patches[i];
        subtractedLines += search.split('\n').length;
        addedLines += replace.split('\n').length;
        const replaceIssues = validatePatchStructure(search, replace);
        if (replaceIssues.length > 0) {
          warnings.push(`Block #${i + 1}: ${replaceIssues.join('; ')}`);
        }

        // Try exact match first
        if (fileContent.includes(search)) {
          fileContent = fileContent.replace(search, replace);
        } else {
          // Fuzzy match fallback
          const matchRange = findFuzzyMatchRange(fileLines, search.split('\n'));

          if (!matchRange) {
            throw new Error(
              `SEARCH block #${i + 1} not found in file (failed both exact and fuzzy matches).` +
                ` The search string does not match any content in ${tool.path}.` +
                ` Re-read the file with <read_file path="${tool.path}" /> to get the exact current content, then copy the lines verbatim into your SEARCH block.`,
            );
          }

          // Auto-adjust indentation of replacement lines based on the matched file block
          const matchedLine = fileLines[matchRange.start];
          const targetIndent = matchedLine.match(/^([ \t]*)/)?.[1] || '';
          const searchIndent = search.split('\n')[0].match(/^([ \t]*)/)?.[1] || '';
          
          const adjustedReplace = replace
            .split('\n')
            .map((line) => {
              if (line.startsWith(searchIndent)) {
                return targetIndent + line.substring(searchIndent.length);
              }
              return line;
            })
            .join('\n');

          // Apply replacement on the matched lines
          fileLines.splice(matchRange.start, matchRange.end - matchRange.start + 1, adjustedReplace);
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

      let result = `File patched: ${tool.path}. Applied ${patches.length} block(s) (+${addedLines}, -${subtractedLines}). Revert ID: ${checkpointId}`;
      if (warnings.length > 0) {
        result += `\n\n⚠️ SYNTAX WARNINGS:\n${warnings.join('\n')}\n\n_Run \`get_diagnostics\` or \`run_command command="npm run compile"\` to verify the build._`;
      }
      return result;
    }

    case 'multi_patch_file': {
      const isStructured = Array.isArray(tool.patches);
      const results: string[] = [];

      if (isStructured) {
        if (!tool.path) throw new Error('Missing "path" attribute for multi_patch_file.');
        const safePath = getSafePath(tool.path);
        if (!fs.existsSync(safePath)) {
          throw new Error(`File does not exist: ${tool.path}`);
        }

        const fileWarnings: string[] = [];
        let fileContent = normalizeLineEndings(fs.readFileSync(safePath, 'utf8'));
        const fileLines = fileContent.split(/\r?\n/);
        let patchesToApply: { start_line: number; end_line: number; search: string; replace: string }[] = [];

        for (const p of tool.patches!) {
          const start = Math.max(1, p.start_line);
          const end = Math.min(fileLines.length, p.end_line);
          const searchSegment = fileLines.slice(start - 1, end).join('\n');
          
          const cleanExpected = normalizeLineExact(p.expected_search_content);
          const cleanTarget = normalizeLineExact(searchSegment);
          
          if (cleanExpected !== cleanTarget) {
            throw new Error(
              `Multi-patch verification failed for line range ${start}-${end}.\n` +
              `Expected:\n${p.expected_search_content}\n\n` +
              `Actual in file:\n${searchSegment}`
            );
          }
          patchesToApply.push({ start_line: start, end_line: end, search: searchSegment, replace: p.replace_content });
        }

        // Sort patches from bottom of the file to top (start_line descending) to prevent index shifting
        patchesToApply.sort((a, b) => b.start_line - a.start_line);

        let addedLines = 0;
        let subtractedLines = 0;

        for (let i = 0; i < patchesToApply.length; i++) {
          const { start_line, search, replace } = patchesToApply[i];
          subtractedLines += search.split('\n').length;
          addedLines += replace.split('\n').length;
          const replaceIssues = validatePatchStructure(search, replace);
          if (replaceIssues.length > 0) {
            fileWarnings.push(`Block #${i + 1}: ${replaceIssues.join('; ')}`);
          }

          // Array splice update using the pre-sorted bottom-to-top indices
          const currentFileLines = fileContent.split('\n');
          // Find matching indentation
          const matchedLine = currentFileLines[start_line - 1];
          const targetIndent = matchedLine.match(/^([ \t]*)/)?.[1] || '';
          const searchIndent = search.split('\n')[0].match(/^([ \t]*)/)?.[1] || '';

          const adjustedReplace = replace
            .split('\n')
            .map((line) => {
              if (line.startsWith(searchIndent)) {
                return targetIndent + line.substring(searchIndent.length);
              }
              return line;
            })
            .join('\n');

          currentFileLines.splice(start_line - 1, patchesToApply[i].end_line - start_line + 1, adjustedReplace);
          fileContent = currentFileLines.join('\n');
        }

        const { accepted, checkpointId } = await confirmChangesWithDiff(
          safePath,
          fileContent,
          path.basename(tool.path),
          'replace',
        );
        if (!accepted) {
          throw new Error(`User rejected patch edits for ${tool.path}.`);
        }
        let fileResult = `Patched ${tool.path} (${patchesToApply.length} block(s) (+${addedLines}, -${subtractedLines}), Revert ID: ${checkpointId})`;
        if (fileWarnings.length > 0) {
          fileResult += `\n⚠️ SYNTAX WARNINGS:\n${fileWarnings.join('\n')}`;
        }
        return fileResult;
      } else {
        // Legacy XML content parser
        const rawContent = tool.content || '';
        const fileRegex = /<file\s+path="([^"]+)"\s*>([\s\S]*?)<\/file>/gi;
        let match;
        const filePatches: { path: string; patches: { search: string; replace: string }[] }[] = [];
        while ((match = fileRegex.exec(rawContent)) !== null) {
          const filePath = match[1].trim();
          const rawPatches = match[2];
          const patches = parsePatchBlocks(rawPatches);
          if (patches.length > 0) {
            filePatches.push({ path: filePath, patches });
          }
        }

        if (filePatches.length === 0) {
          throw new Error(
            'No valid <file path="...">...</file> blocks containing SEARCH/REPLACE blocks found in multi_patch_file.' +
              ' The required format is:\n' +
              '<multi_patch_file>\n' +
              '<file path="relative/path/to/file.ts">\n' +
              '<<<<<<< SEARCH\n' +
              '[exact original lines]\n' +
              '=======\n' +
              '[replacement lines]\n' +
              '>>>>>>> REPLACE\n' +
              '</file>\n' +
              '</multi_patch_file>\n' +
              'Ensure "=======" separates SEARCH from REPLACE and ">>>>>>> REPLACE" closes the block.',
          );
        }

        for (const fp of filePatches) {
          const safePath = getSafePath(fp.path);
          if (!fs.existsSync(safePath)) {
            throw new Error(`File does not exist: ${fp.path}`);
          }

          const fileWarnings: string[] = [];
          let fileContent = normalizeLineEndings(fs.readFileSync(safePath, 'utf8'));
          let addedLines = 0;
          let subtractedLines = 0;
          for (let i = 0; i < fp.patches.length; i++) {
            const { search, replace } = fp.patches[i];
            subtractedLines += search.split('\n').length;
            addedLines += replace.split('\n').length;
            const replaceIssues = validatePatchStructure(search, replace);
            if (replaceIssues.length > 0) {
              fileWarnings.push(`Block #${i + 1}: ${replaceIssues.join('; ')}`);
            }

            if (fileContent.includes(search)) {
              fileContent = fileContent.replace(search, replace);
            } else {
              const currentFileLines = fileContent.split('\n');
              const matchRange = findFuzzyMatchRange(currentFileLines, search.split('\n'));
              if (!matchRange) {
                throw new Error(
                  `SEARCH block #${i + 1} not found in file ${fp.path} (failed both exact and fuzzy matches).` +
                    ` Re-read the file with <read_file path="${fp.path}" /> to get the exact current content, then copy the lines verbatim into your SEARCH block.`,
                );
              }
              const matchedLine = currentFileLines[matchRange.start];
              const targetIndent = matchedLine.match(/^([ \t]*)/)?.[1] || '';
              const searchIndent = search.split('\n')[0].match(/^([ \t]*)/)?.[1] || '';
              
              const adjustedReplace = replace
                .split('\n')
                .map((line) => {
                  if (line.startsWith(searchIndent)) {
                    return targetIndent + line.substring(searchIndent.length);
                  }
                  return line;
                })
                .join('\n');

              currentFileLines.splice(matchRange.start, matchRange.end - matchRange.start + 1, adjustedReplace);
              fileContent = currentFileLines.join('\n');
            }
          }

          const { accepted, checkpointId } = await confirmChangesWithDiff(
            safePath,
            fileContent,
            path.basename(fp.path),
            'replace',
          );
          if (!accepted) {
            throw new Error(`User rejected patch edits for ${fp.path}.`);
          }
          let fileResult = `Patched ${fp.path} (${fp.patches.length} block(s) (+${addedLines}, -${subtractedLines}), Revert ID: ${checkpointId})`;
          if (fileWarnings.length > 0) {
            fileResult += `\n⚠️ SYNTAX WARNINGS:\n${fileWarnings.join('\n')}`;
          }
          results.push(fileResult);
        }

        let multiResult = results.join('\n');
        return multiResult;
      }
    }

    case 'update_agent_memory': {
      const key = tool.key || tool.query || '';
      const value = tool.value || tool.path || tool.content || '';
      if (!key || !value) {
        return 'Error: Missing "key" or "value" parameters for update_agent_memory. Usage: <update_agent_memory key="preferences" value="use functional components" />';
      }
      try {
        const { AgentMemoryService } = await import('../../services/agent-memory-service.js');
        const memory = AgentMemoryService.getInstance();
        const category = (tool.category as any) || 'note';
        memory.set(key, value, category, tool.path || undefined);
        const count = memory.count;
        return `✅ Successfully updated agent memory for key "${key}" (${category}). Total entries: ${count}.`;
      } catch {
        // Fallback: legacy memory file
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) return 'Error: No workspace folder open.';
        const memoryDir = path.join(workspaceFolder, '.mirror-vs');
        if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
        const memoryPath = path.join(memoryDir, 'memory.json');
        let memory: Record<string, any> = {};
        try {
          if (fs.existsSync(memoryPath)) memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        } catch {
          /* ignore */
        }
        memory[key] = value;
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
        return `✅ Updated agent memory (legacy): "${key}" = "${value}"`;
      }
    }

    case 'update_plan': {
      const content = tool.content || tool.value || '';
      if (!content) {
        return 'Error: Missing "content" parameter for update_plan. Usage: <update_plan> - [x] Step 1\n- [ ] Step 2</update_plan>';
      }
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) return 'Error: No workspace folder open.';
        const mirrorVsDir = path.join(workspaceFolder, '.mirror-vs');
        if (!fs.existsSync(mirrorVsDir)) fs.mkdirSync(mirrorVsDir, { recursive: true });

        const taskPath = path.join(mirrorVsDir, 'task.md');
        fs.writeFileSync(taskPath, content, 'utf8');

        // Sync to artifact service
        const { ArtifactService } = await import('../../services/artifact-service');
        await ArtifactService.getInstance().createOrUpdateArtifact(
          'task',
          'markdown',
          'Task List',
          content,
          undefined,
          false,
        );
        return `✅ Successfully updated active plan checklist. task.md updated.`;
      } catch (err: any) {
        return `Error updating plan: ${err.message}`;
      }
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
