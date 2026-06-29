import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export async function generateLightweightProjectMap(workspaceRoot: string): Promise<string> {
  const shouldSkipDir = (name: string): boolean =>
    [
      'node_modules',
      'dist',
      'out',
      '.git',
      '.mirror-vs',
      'build',
      '.next',
      '.nuxt',
      'coverage',
      '.nyc_output',
      '__pycache__',
      '.venv',
      'venv',
      'env',
      'target',
      'bin',
      'obj',
      '.vscode',
    ].includes(name);

  const shouldSkipFile = (name: string): boolean => {
    const ext = path.extname(name).toLowerCase();
    const binaryExts = [
      '.ttf', '.woff', '.woff2', '.eot', '.otf',
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
      '.mp4', '.mkv', '.webm', '.avi', '.mov', '.mp3', '.wav', '.ogg',
      '.zip', '.tar', '.gz', '.7z', '.rar',
      '.exe', '.dll', '.so', '.dylib', '.bin',
      '.vsix', '.db', '.sqlite', '.sqlite3'
    ];
    return binaryExts.includes(ext);
  };

  interface FileEntry {
    rel: string;
    hint: string;
  }
  type DirGroup = { isDir: true; name: string; rel: string; children: (FileEntry | DirGroup)[]; fileCount: number };

  const walkDir = (dir: string, depth: number): (FileEntry | DirGroup)[] => {
    if (depth > 4) return [];
    const result: (FileEntry | DirGroup)[] = [];
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir).sort();
    } catch {
      console.error('readdirSync failed for:', dir);
      return result;
    }
    const dirs: string[] = [];
    const files: string[] = [];
    for (const e of entries) {
      if (shouldSkipDir(e)) continue;
      const fp = path.join(dir, e);
      try {
        const s = fs.statSync(fp);
        if (s.isDirectory()) dirs.push(e);
        else if (s.isFile()) {
          if (shouldSkipFile(e)) continue;
          files.push(e);
        }
      } catch {
        console.error('statSync failed for:', fp);
        /* skip */
      }
    }

    // Count all files recursively for directory label
    const countAll = (d: string): number => {
      let c = 0;
      try {
        for (const e of fs.readdirSync(d)) {
          if (shouldSkipDir(e)) continue;
          const fp = path.join(d, e);
          try {
            const s = fs.statSync(fp);
            if (s.isDirectory()) c += countAll(fp);
            else {
              if (shouldSkipFile(e)) continue;
              c++;
            }
          } catch {
            console.error('statSync failed in countAll for:', fp);
            /* skip */
          }
        }
      } catch {
        console.error('readdirSync failed in countAll for:', d);
        /* skip */
      }
      return c;
    };

    for (const d of dirs) {
      const fullPath = path.join(dir, d);
      const rel = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
      const children = walkDir(fullPath, depth + 1);
      result.push({ isDir: true, name: d, rel, children, fileCount: countAll(fullPath) });
    }
    for (const f of files) {
      const fp = path.join(dir, f);
      const rel = path.relative(workspaceRoot, fp).replace(/\\/g, '/');
      result.push({ rel, hint: '' });
    }
    return result;
  };

  const renderEntries = (
    entries: (FileEntry | DirGroup)[],
    prefix: string,
    lines: string[],
    maxLines: number,
  ): void => {
    for (let i = 0; i < entries.length; i++) {
      if (lines.length >= maxLines) break;
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const marker = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      if ('isDir' in entry && entry.isDir) {
        lines.push(`${prefix}${marker}${entry.name}/ (${entry.fileCount} files)`);
        renderEntries(entry.children, childPrefix, lines, maxLines);
      } else {
        const fe = entry as FileEntry;
        const hint = fe.hint ? `  — ${fe.hint}` : '';
        const fileName = path.basename(fe.rel);
        lines.push(`${prefix}${marker}${fileName}${hint}`);
      }
    }
  };

  try {
    const topEntries = walkDir(workspaceRoot, 0);
    const lines: string[] = [`Root: ${path.basename(workspaceRoot)}`];
    const maxProjectMapLines = vscode.workspace.getConfiguration('mirror-vs').get<number>('maxProjectMapLines', 250);
    renderEntries(topEntries, '', lines, maxProjectMapLines);
    return lines.join('\n');
  } catch (e) {
    console.error('Error generating project map:', e instanceof Error ? e.message : String(e));
    return `Error generating map: ${e instanceof Error ? e.message : String(e)}`;
  }
}
