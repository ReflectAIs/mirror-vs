import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ToolCall } from '../types';
import { ReviewManager } from '../../services/review-manager';

export async function executeSearchTool(tool: ToolCall): Promise<string> {
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

  if (tool.name !== 'grep_search') {
    throw new Error(`Invalid search tool: ${tool.name}`);
  }

  if (!tool.query) throw new Error('Missing "query" attribute for grep_search.');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) throw new Error('No workspace folder open.');

  const query = tool.query.toLowerCase();
  const results: string[] = [];

  // Use vscode.workspace.findFiles for highly optimized workspace scanning
  const files = await vscode.workspace.findFiles(
    '**/*',
    '{**/node_modules/**,**/dist/**,**/out/**,**/.git/**,**/.mirror-vs/**,**/bin/**,**/obj/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.ico,**/*.svg,**/*.pdf,**/*.zip,**/*.exe,**/*.dll}'
  );

  const uris = [...files];
  const concurrency = 50;
  const worker = async () => {
    while (uris.length > 0) {
      const uri = uris.pop();
      if (!uri) break;
      const fullPath = uri.fsPath;
      
      const ext = path.extname(fullPath).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.o', '.obj'].includes(ext)) {
        continue;
      }

      try {
        let content = '';
        const proposed = ReviewManager.getInstance().getProposedContent(fullPath);
        if (proposed !== undefined) {
          content = proposed;
        } else {
          const stat = await fs.promises.stat(fullPath);
          if (stat.size > 1024 * 1024) continue; // Skip files larger than 1MB
          content = await fs.promises.readFile(fullPath, 'utf8');
        }

        if (content.toLowerCase().includes(query)) {
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes(query)) {
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
      } catch (e) {
        // Ignore read/stat errors
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return results.slice(0, 40).join('\n') || 'No matches found.';
}

