import * as path from 'path';
import * as vscode from 'vscode';
import { ToolCall } from '../types';

export async function executeSearchTool(tool: ToolCall): Promise<string> {
  if (tool.name === 'semantic_search') {
    const query = tool.query || tool.content || '';
    if (!query) throw new Error('Missing "query" attribute for semantic_search.');

    // Hybrid: try EmbeddingService first (Ollama embeddings), fallback to TF-IDF RAG
    let results: any[] = [];
    try {
      const { EmbeddingService } = await import('../../services/embedding-service.js');
      const embeddings = EmbeddingService.getInstance();
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        const files = await vscode.workspace.findFiles(
          '**/*',
          '{**/node_modules/**,**/dist/**,**/out/**,**/.git/**,**/.mirror-vs/**}',
          100,
        );
        const documents: { filePath: string; content: string }[] = [];
        for (const f of files.slice(0, 80)) {
          try {
            const fs = await import('fs');
            const content = fs.readFileSync(f.fsPath, 'utf8');
            if (content.length < 100000) {
              documents.push({ filePath: vscode.workspace.asRelativePath(f), content });
            }
          } catch {
            /* skip */
          }
        }
        const embedResults = await embeddings.search(query, documents);
        if (embedResults.length > 0) {
          results = embedResults.map((r: any) => ({
            filePath: r.filePath,
            content: r.snippet.substring(0, 500),
            startLine: 1,
            endLine: 1,
          }));
        }
      }
    } catch {
      // EmbeddingService unavailable — try RAG fallback
    }

    // Fallback to LocalRagService
    if (results.length === 0) {
      try {
        const { LocalRagService } = await import('../../services/local-rag-service.js');
        const rag = LocalRagService.getInstance();
        const ragResults = rag.search(query, 5);
        results = ragResults.map((r: any) => ({
          filePath: r.filePath,
          content: r.content,
          startLine: r.startLine,
          endLine: r.endLine,
        }));
      } catch {
        /* ignore */
      }
    }

    if (results.length === 0) {
      console.log(`[Search] No semantic results. Falling back to grep search for query: ${query}`);
      return await executeSearchTool({
        id: tool.id,
        name: 'grep_search',
        query: query,
      });
    }

    return results
      .map((r: any) => {
        return `📄 File: ${r.filePath} (Lines ${r.startLine}-${r.endLine})\n\`\`\`\n${r.content}\n\`\`\``;
      })
      .join('\n\n---\n\n');
  }

  if (tool.name === 'web_search') {
    if (!tool.query) throw new Error('Missing "query" attribute for web_search.');
    const query = encodeURIComponent(tool.query);
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      const text = await res.text();

      const results = [];
      const regex = /<a class="result__snippet[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs;
      let match;
      while ((match = regex.exec(text)) !== null) {
        let url = match[1];
        if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
          url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
        }
        const snippet = match[2].replace(/<b>/g, '').replace(/<\/b>/g, '').trim();
        results.push({ url, snippet });
      }
      return (
        results
          .slice(0, 5)
          .map((r) => `URL: ${r.url}\nSnippet: ${r.snippet}\n`)
          .join('---\n') || 'No web search results found.'
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return `Web search failed: ${message}`;
    }
  }

  if (tool.name === 'get_diagnostics') {
    return getDiagnostics(tool);
  }

  if (tool.name !== 'grep_search') {
    throw new Error(`Invalid search tool: ${tool.name}`);
  }

  if (!tool.query) throw new Error('Missing "query" attribute for grep_search.');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) throw new Error('No workspace folder open.');

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Build scope: if a path is provided, restrict search to that directory/file
  let includePattern: vscode.GlobPattern | undefined;
  if (tool.path) {
    const scopePath = tool.path.replace(/\\/g, '/');
    // If it looks like a directory path (no extension or ends with /), glob it recursively
    if (scopePath.endsWith('/') || !path.extname(scopePath)) {
      includePattern = new vscode.RelativePattern(workspaceFolders[0], `${scopePath}/**`);
    } else {
      includePattern = new vscode.RelativePattern(workspaceFolders[0], scopePath);
    }
  }

  const results: { file: string; line: number; text: string }[] = [];

  try {
    // Use VS Code's native text search API — delegates to ripgrep internally
    await (vscode.workspace as any).findTextInFiles(
      { pattern: tool.query, isRegExp: false, isCaseSensitive: false },
      {
        include: includePattern,
        exclude:
          '{**/node_modules/**,**/dist/**,**/out/**,**/.git/**,**/.mirror-vs/**,**/bin/**,**/obj/**,**/build/**,**/.next/**,**/coverage/**}',
        maxResults: 80,
        previewOptions: { matchLines: 1, charsPerLine: 250 },
      },
      (result: any) => {
        const relPath = path.relative(workspaceRoot, result.uri.fsPath).replace(/\\/g, '/');
        if (result.preview && result.ranges) {
          const range = Array.isArray(result.ranges) ? result.ranges[0] : result.ranges;
          if (range) {
            const lineNum = 'start' in range ? (range as vscode.Range).start.line + 1 : 1;
            const previewText = typeof result.preview.text === 'string' ? result.preview.text.trim() : '';
            results.push({ file: relPath, line: lineNum, text: previewText });
          }
        }
      },
    );
  } catch (e) {
    // Fallback: if findTextInFiles fails (e.g., unsupported VS Code version),
    // use the simpler findFiles + manual scan approach
    return await fallbackGrepSearch(tool.query, workspaceFolders, includePattern);
  }

  if (results.length === 0) {
    return 'No matches found.';
  }

  // Group results by file for compact output
  const grouped = new Map<string, { line: number; text: string }[]>();
  for (const r of results) {
    if (!grouped.has(r.file)) grouped.set(r.file, []);
    grouped.get(r.file)!.push({ line: r.line, text: r.text });
  }

  const lines: string[] = [];
  let totalShown = 0;
  for (const [file, matches] of grouped) {
    if (totalShown >= 50) break;
    lines.push(`📄 ${file}`);
    for (const m of matches.slice(0, 5)) {
      lines.push(`  L${m.line}: ${m.text}`);
      totalShown++;
      if (totalShown >= 50) break;
    }
    if (matches.length > 5) {
      lines.push(`  ... and ${matches.length - 5} more matches in this file`);
    }
  }

  if (results.length > totalShown) {
    lines.push(`\n(${results.length - totalShown} more results not shown)`);
  }

  return lines.join('\n');
}

/**
 * Fallback grep implementation using findFiles + manual file reading.
 * Used only if vscode.workspace.findTextInFiles is unavailable.
 */
async function fallbackGrepSearch(
  query: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  includePattern?: vscode.GlobPattern,
): Promise<string> {
  const fs = await import('fs');
  const lowerQuery = query.toLowerCase();
  const results: string[] = [];

  const files = await vscode.workspace.findFiles(
    includePattern || '**/*',
    '{**/node_modules/**,**/dist/**,**/out/**,**/.git/**,**/.mirror-vs/**,**/bin/**,**/obj/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.ico,**/*.svg,**/*.pdf,**/*.zip,**/*.exe,**/*.dll}',
  );

  const uris = [...files];
  const concurrency = 50;
  const worker = async () => {
    while (uris.length > 0) {
      const uri = uris.pop();
      if (!uri) break;
      const fullPath = uri.fsPath;

      const ext = path.extname(fullPath).toLowerCase();
      if (
        [
          '.png',
          '.jpg',
          '.jpeg',
          '.gif',
          '.ico',
          '.svg',
          '.woff',
          '.woff2',
          '.ttf',
          '.eot',
          '.pdf',
          '.zip',
          '.tar',
          '.gz',
          '.exe',
          '.dll',
          '.o',
          '.obj',
        ].includes(ext)
      ) {
        continue;
      }

      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > 1024 * 1024) continue;
        const content = await fs.promises.readFile(fullPath, 'utf8');

        if (content.toLowerCase().includes(lowerQuery)) {
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes(lowerQuery)) {
              let relPath = fullPath;
              for (const wf of workspaceFolders) {
                const prefix = wf.uri.fsPath + path.sep;
                if (fullPath.startsWith(prefix)) {
                  relPath = fullPath.slice(prefix.length);
                  break;
                }
              }
              relPath = relPath.replace(/\\/g, '/');
              results.push(`${relPath}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      } catch {
        // Ignore read/stat errors
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return results.slice(0, 50).join('\n') || 'No matches found.';
}

/**
 * Get VS Code diagnostics (errors, warnings) for the workspace.
 * Gives the model instant access to all known issues.
 */
function getDiagnostics(tool: ToolCall): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return 'No workspace folder open.';

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const allDiagnostics = vscode.languages.getDiagnostics();

  // Filter by path if provided
  const scopePath = tool.path;

  const entries: { file: string; line: number; severity: string; message: string; source: string }[] = [];

  for (const [uri, diags] of allDiagnostics) {
    const relPath = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');

    // Skip files outside the workspace
    if (relPath.startsWith('..')) continue;
    // Skip node_modules, dist, etc.
    if (relPath.startsWith('node_modules/') || relPath.startsWith('dist/') || relPath.startsWith('.git/')) continue;

    // Apply path scope filter if provided
    if (scopePath && !relPath.startsWith(scopePath.replace(/\\/g, '/'))) continue;

    for (const d of diags) {
      const severity =
        d.severity === vscode.DiagnosticSeverity.Error
          ? 'Error'
          : d.severity === vscode.DiagnosticSeverity.Warning
            ? 'Warning'
            : d.severity === vscode.DiagnosticSeverity.Information
              ? 'Info'
              : 'Hint';

      // Only include errors and warnings by default
      if (d.severity > vscode.DiagnosticSeverity.Warning) continue;

      entries.push({
        file: relPath,
        line: d.range.start.line + 1,
        severity,
        message: d.message,
        source: d.source || '',
      });
    }
  }

  if (entries.length === 0) {
    return scopePath
      ? `✅ No errors or warnings found in "${scopePath}".`
      : '✅ No errors or warnings found in the workspace.';
  }

  // Sort: errors first, then warnings, then by file
  entries.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'Error' ? -1 : 1;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });

  const lines: string[] = [];
  const errorCount = entries.filter((e) => e.severity === 'Error').length;
  const warningCount = entries.filter((e) => e.severity === 'Warning').length;
  lines.push(`Found ${errorCount} error(s) and ${warningCount} warning(s):`);
  lines.push('');

  // Group by file
  const grouped = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!grouped.has(e.file)) grouped.set(e.file, []);
    grouped.get(e.file)!.push(e);
  }

  let totalShown = 0;
  for (const [file, fileEntries] of grouped) {
    if (totalShown >= 60) {
      lines.push(`\n... and more diagnostics in ${grouped.size - lines.length} additional files`);
      break;
    }
    lines.push(`📄 ${file}`);
    for (const e of fileEntries.slice(0, 10)) {
      const icon = e.severity === 'Error' ? '🔴' : '🟡';
      const src = e.source ? ` [${e.source}]` : '';
      lines.push(`  ${icon} L${e.line}: ${e.message}${src}`);
      totalShown++;
    }
    if (fileEntries.length > 10) {
      lines.push(`  ... and ${fileEntries.length - 10} more in this file`);
    }
  }

  return lines.join('\n');
}
