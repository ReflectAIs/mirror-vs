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
    } catch (e: any) {
      return `Web search failed: ${e.message}`;
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

  const search = (dir: string) => {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      if (['node_modules', 'dist', 'out', '.git', '.mirror-vs'].includes(item)) continue;
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        search(fullPath);
      } else if (stat.isFile()) {
        try {
          let content = '';
          const proposed = ReviewManager.getInstance().getProposedContent(fullPath);
          if (proposed !== undefined) {
            content = proposed;
          } else {
            content = fs.readFileSync(fullPath, 'utf8');
          }
          if (content.toLowerCase().includes(query)) {
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              if (line.toLowerCase().includes(query)) {
                // Find which workspace folder this file belongs to for a clean relative path
                let relPath = fullPath;
                for (const wf of workspaceFolders) {
                  const prefix = wf.uri.fsPath + '/';
                  if (fullPath.startsWith(prefix)) {
                    relPath = fullPath.slice(prefix.length);
                    break;
                  }
                }
                results.push(`${relPath}:${idx + 1}: ${line.trim()}`);
              }
            });
          }
        } catch (e) {
          // Ignore binary/read errors
        }
      }
    }
  };

  for (const wf of workspaceFolders) {
    search(wf.uri.fsPath);
  }
  return results.slice(0, 40).join('\n') || 'No matches found.';
}
