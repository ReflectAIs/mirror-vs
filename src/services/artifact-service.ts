/**
 * Artifact Service — manages interactive previewable artifacts (HTML, SVG, Mermaid, code)
 * inspired by Claude's Artifacts feature. Artifacts are rendered in a dedicated
 * VS Code webview panel alongside the editor.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type ArtifactType = 'html' | 'svg' | 'mermaid' | 'code' | 'markdown';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string; // for type: code
  createdAt: number;
  filePath?: string;
}

export class ArtifactService {
  private static instance: ArtifactService;
  private _artifacts: Artifact[] = [];
  private _panels: Map<string, vscode.WebviewPanel> = new Map();
  private _onDidChangeArtifacts = new vscode.EventEmitter<Artifact[]>();

  static getInstance(): ArtifactService {
    if (!ArtifactService.instance) {
      ArtifactService.instance = new ArtifactService();
    }
    return ArtifactService.instance;
  }

  get artifacts(): Artifact[] {
    return [...this._artifacts];
  }

  get onDidChangeArtifacts(): vscode.Event<Artifact[]> {
    return this._onDidChangeArtifacts.event;
  }

  /**
   * Create a new artifact and optionally render it in a preview panel.
   */
  async createArtifact(
    type: ArtifactType,
    title: string,
    content: string,
    language?: string,
    openInPanel: boolean = true,
  ): Promise<Artifact> {
    const id = `artifact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const artifact: Artifact = {
      id,
      type,
      title: title || `${type.charAt(0).toUpperCase() + type.slice(1)} Artifact`,
      content,
      language,
      createdAt: Date.now(),
    };

    this._artifacts.unshift(artifact);

    // Trim to max 50 artifacts
    if (this._artifacts.length > 50) {
      this._artifacts = this._artifacts.slice(0, 50);
    }

    // Save to .mirror-vs/artifacts/ for persistence
    this._saveToDisk(artifact);

    // Fire change event
    this._onDidChangeArtifacts.fire(this._artifacts);

    // Open in preview panel if requested
    if (openInPanel) {
      this.openArtifactPreview(artifact.id);
    }

    return artifact;
  }

  /**
   * Create a new artifact or update an existing one by ID.
   */
  async createOrUpdateArtifact(
    id: string,
    type: ArtifactType,
    title: string,
    content: string,
    language?: string,
    openInPanel: boolean = false,
  ): Promise<Artifact> {
    let artifact = this._artifacts.find((a) => a.id === id);
    if (artifact) {
      artifact.content = content;
      artifact.title = title;
      artifact.language = language;
      artifact.createdAt = Date.now();
    } else {
      artifact = {
        id,
        type,
        title: title || `${type.charAt(0).toUpperCase() + type.slice(1)} Artifact`,
        content,
        language,
        createdAt: Date.now(),
      };
      this._artifacts.unshift(artifact);
    }

    // Trim to max 50 artifacts
    if (this._artifacts.length > 50) {
      this._artifacts = this._artifacts.slice(0, 50);
    }

    // Save to .mirror-vs/artifacts/ for persistence
    this._saveToDisk(artifact);

    // Fire change event
    this._onDidChangeArtifacts.fire(this._artifacts);

    // Update panel if it is already open
    const existingPanel = this._panels.get(id);
    if (existingPanel) {
      existingPanel.webview.html = this._renderArtifact(artifact);
    }

    // Open in preview panel if requested
    if (openInPanel) {
      this.openArtifactPreview(id);
    }

    return artifact;
  }

  /**
   * Open an artifact in a VS Code webview panel (new window beside editor).
   */
  openArtifactPreview(artifactId: string): void {
    const artifact = this._artifacts.find((a) => a.id === artifactId);
    if (!artifact) {
      vscode.window.showWarningMessage(`Artifact "${artifactId}" not found.`);
      return;
    }

    // If already open, reveal it
    const existingPanel = this._panels.get(artifactId);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel('mirrorArtifact', `🧩 ${artifact.title}`, vscode.ViewColumn.Active, {
      enableScripts: artifact.type === 'html' || artifact.type === 'markdown',
      retainContextWhenHidden: true,
      localResourceRoots: [],
    });

    panel.webview.html = this._renderArtifact(artifact);
    this._panels.set(artifactId, panel);

    // Handle openFile messages from the artifact preview webview
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openFile' && message.filePath) {
        try {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceFolder) {
            const safePath = path.resolve(workspaceFolder, message.filePath);
            if (safePath.startsWith(workspaceFolder) && fs.existsSync(safePath)) {
              const doc = await vscode.workspace.openTextDocument(safePath);
              await vscode.window.showTextDocument(doc, { preview: false });
            }
          }
        } catch (e) {
          console.error('Failed to open file from artifact:', e);
        }
      }
    });

    panel.onDidDispose(() => {
      this._panels.delete(artifactId);
    });
  }

  /**
   * Get an artifact by ID.
   */
  getArtifact(id: string): Artifact | undefined {
    return this._artifacts.find((a) => a.id === id);
  }

  /**
   * Delete an artifact.
   */
  deleteArtifact(id: string): void {
    this._artifacts = this._artifacts.filter((a) => a.id !== id);
    const panel = this._panels.get(id);
    if (panel) {
      panel.dispose();
      this._panels.delete(id);
    }
    this._onDidChangeArtifacts.fire(this._artifacts);

    // Remove from disk
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        const filePath = path.join(workspaceFolder, '.mirror-vs', 'artifacts', `${id}.json`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Clear all artifacts.
   */
  clearAll(): void {
    for (const [id, panel] of this._panels) {
      panel.dispose();
    }
    this._panels.clear();
    this._artifacts = [];
    this._onDidChangeArtifacts.fire(this._artifacts);

    // Clean disk
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        const artifactsDir = path.join(workspaceFolder, '.mirror-vs', 'artifacts');
        if (fs.existsSync(artifactsDir)) {
          fs.rmSync(artifactsDir, { recursive: true, force: true });
        }
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Get artifacts formatted as a string for the agent's context.
   */
  getArtifactsContext(): string {
    if (this._artifacts.length === 0) return '';

    let output = '\n## 📦 Active Artifacts\n\n';
    for (const art of this._artifacts.slice(0, 10)) {
      const typeIcon: Record<string, string> = {
        html: '🌐',
        svg: '🎨',
        mermaid: '📊',
        code: '💻',
        markdown: '📝',
      };
      const preview = art.content.substring(0, 100).replace(/\n/g, ' ').trim();
      output += `${typeIcon[art.type] || '📦'} **${art.title}** (${art.type})\n`;
      output += `  ID: \`${art.id}\`\n`;
      output += `  Preview: ${preview}${art.content.length > 100 ? '...' : ''}\n\n`;
    }
    return output;
  }

  /**
   * Format an artifact as a tool result string for the agent to respond.
   */
  formatArtifactResult(artifact: Artifact): string {
    const size = artifact.content.length;
    const preview = artifact.content.substring(0, 300).replace(/\n/g, ' ').trim();

    let result = `## ✅ Artifact Created: "${artifact.title}"\n\n`;
    result += `- **Type**: ${artifact.type}\n`;
    result += `- **ID**: \`${artifact.id}\`\n`;
    result += `- **Size**: ${size} characters\n`;
    result += `- **Preview in new window**: The artifact has been rendered in a new VS Code panel beside the editor.\n\n`;
    result += `**Preview:**\n\`\`\`\n${preview}${size > 300 ? '...' : ''}\n\`\`\`\n`;
    result += `\nYou can also type \`artifact ${artifact.id}\` to reference this artifact again.`;

    return result;
  }

  // --- Private Helpers ---

  private _renderArtifact(artifact: Artifact): string {
    const styleReset = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: var(--vscode-editor-font-family, 'Segoe UI', sans-serif); background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, #d4d4d4); line-height: 1.6; }
        .artifact-header { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--vscode-panel-border, #333); background: var(--vscode-editor-background, #252526); font-size: 11px; height: 32px; }
        .artifact-header .type-badge { padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
        .artifact-header .type-html { background: #e44d26; color: #fff; }
        .artifact-header .type-svg { background: #ffb13b; color: #1e1e1e; }
        .artifact-header .type-mermaid { background: #ff3670; color: #fff; }
        .artifact-header .type-code { background: #007acc; color: #fff; }
        .artifact-header .type-markdown { background: #4ec9b0; color: #1e1e1e; }
        .artifact-header .title { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .artifact-body { padding: 20px 24px; overflow: auto; height: calc(100vh - 32px); }
        .artifact-body iframe { width: 100%; height: 100%; border: none; }
        pre { background: var(--vscode-textCodeBlock-background, #1e1e1e); padding: 12px; border-radius: 6px; overflow: auto; font-family: var(--vscode-editor-font-family, 'Cascadia Code', monospace); font-size: 13px; line-height: 1.5; margin: 12px 0; }
        code { font-family: var(--vscode-editor-font-family, monospace); }
        
        /* Markdown rendering styles */
        h1 { font-size: 1.5em; font-weight: 600; margin-top: 16px; margin-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border, #333); padding-bottom: 4px; color: var(--vscode-symbolIcon-classForeground, #4fc1ff); }
        h2 { font-size: 1.25em; font-weight: 600; margin-top: 14px; margin-bottom: 6px; color: var(--vscode-symbolIcon-interfaceForeground, #9cdcfe); }
        h3 { font-size: 1.1em; font-weight: 600; margin-top: 12px; margin-bottom: 6px; }
        p { margin-bottom: 8px; font-size: 13px; }
        ul, ol { margin-left: 20px; margin-bottom: 12px; font-size: 13px; }
        li { margin-bottom: 4px; }
        
        .history-file-tag {
          display: inline-flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--vscode-panel-border, #333);
          border-radius: 4px;
          padding: 2px 6px;
          font-family: var(--vscode-editor-font-family, monospace);
          font-size: 11px;
          cursor: pointer;
          color: var(--vscode-textLink-foreground, #3794ff) !important;
          margin: 4px 0;
          transition: background 0.2s;
        }
        .history-file-tag:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      </style>
    `;

    const typeIcons: Record<string, string> = {
      html: '🌐',
      svg: '🎨',
      mermaid: '📊',
      code: '💻',
      markdown: '📝',
    };

    const header = `
      <div class="artifact-header">
        <span class="type-badge type-${artifact.type}">${typeIcons[artifact.type] || '📦'} ${artifact.type.toUpperCase()}</span>
        <span class="title">${artifact.title}</span>
        <span style="font-size:9px;color:var(--vscode-textSecondary, #888);">${new Date(artifact.createdAt).toLocaleTimeString()}</span>
      </div>
    `;

    let body = '';
    switch (artifact.type) {
      case 'html':
        // For HTML artifacts, embed in an iframe via srcdoc
        body = `
          <div class="artifact-body" style="padding:0;height:calc(100vh - 32px);">
            <iframe srcdoc="${artifact.content.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" style="width:100%;height:100%;border:none;"></iframe>
          </div>
        `;
        break;

      case 'svg':
        body = `
          <div class="artifact-body" style="display:flex;align-items:center;justify-content:center;background:#fff;height:calc(100vh - 32px);">
            ${artifact.content}
          </div>
        `;
        break;

      case 'mermaid':
        body = `
          <div class="artifact-body">
            <p style="color:var(--vscode-textSecondary,#888);margin-bottom:12px;">Mermaid diagram rendered below (requires Mermaid library):</p>
            <pre><code class="language-mermaid">${artifact.content}</code></pre>
            <div style="margin-top:12px;padding:12px;background:var(--vscode-textCodeBlock-background,#1e1e1e);border-radius:6px;font-size:12px;color:var(--vscode-textSecondary,#888);">
              💡 Tip: Install the <strong>Markdown Preview Mermaid Support</strong> extension or use the <a href="https://mermaid.live" target="_blank" style="color:#3794ff;">Mermaid Live Editor</a> to render this diagram.
            </div>
          </div>
        `;
        break;

      case 'markdown':
        body = `
          <div class="artifact-body">
            <div style="line-height:1.7;">${this._simpleMarkdownToHtml(artifact.content)}</div>
            <script>
              const vscode = acquireVsCodeApi();
              document.addEventListener('click', (e) => {
                const tag = e.target.closest('.history-file-tag');
                if (tag) {
                  const filePath = tag.getAttribute('data-file-path');
                  if (filePath) {
                    vscode.postMessage({ type: 'openFile', filePath });
                  }
                }
              });
            </script>
          </div>
        `;
        break;

      case 'code':
      default: {
        const lang = artifact.language || '';
        body = `
          <div class="artifact-body">
            <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
              <span style="font-size:11px;color:var(--vscode-textSecondary,#888);">Language: <strong>${lang || 'auto'}</strong></span>
              <button onclick="copyCode()" style="padding:4px 12px;border:1px solid var(--vscode-panel-border,#333);border-radius:4px;background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);cursor:pointer;font-size:11px;">📋 Copy</button>
            </div>
            <pre><code>${this._escapeHtml(artifact.content)}</code></pre>
            <script>
              function copyCode() {
                navigator.clipboard.writeText(${JSON.stringify(artifact.content)});
                const btn = event.target;
                btn.textContent = '✅ Copied!';
                setTimeout(() => btn.textContent = '📋 Copy', 2000);
              }
            </script>
          </div>
        `;
        break;
      }
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8">${styleReset}</head><body>${header}${body}</body></html>`;
  }

  private _simpleMarkdownToHtml(md: string): string {
    let html = this._escapeHtml(md);
    
    // Convert code blocks (temp placeholder to prevent escaping collision)
    const codeBlocks: string[] = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre><code class="language-${lang}">${code}</code></pre>`);
      return `___CODEBLOCK_${idx}___`;
    });

    // Convert inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Convert bold/italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Convert links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#3794ff;">$1</a>');

    // Split into lines to parse line-based items (headers, lists, paths) properly
    const lines = html.split('\n');
    let inList = false;
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      
      // Headers
      if (trimmed.startsWith('### ')) {
        if (inList) { inList = false; return '</ul><h3>' + trimmed.substring(4) + '</h3>'; }
        return '<h3>' + trimmed.substring(4) + '</h3>';
      }
      if (trimmed.startsWith('## ')) {
        if (inList) { inList = false; return '</ul><h2>' + trimmed.substring(3) + '</h2>'; }
        return '<h2>' + trimmed.substring(3) + '</h2>';
      }
      if (trimmed.startsWith('# ')) {
        if (inList) { inList = false; return '</ul><h1>' + trimmed.substring(2) + '</h1>'; }
        return '<h1>' + trimmed.substring(2) + '</h1>';
      }

      // Check for path block (e.g. "Path: walkthrough.md")
      const pathMatch = line.match(/^(Path:\s*)([a-zA-Z0-9_\-\\\/\.]+\.[a-zA-Z0-9]{1,10})/i);
      if (pathMatch) {
        const prefix = pathMatch[1];
        const filePath = pathMatch[2];
        const normalized = filePath.replace(/\\/g, '/');
        const fileName = normalized.split('/').pop() || filePath;
        const link = `<span class="history-file-tag" data-file-path="${this._escapeHtml(filePath)}" title="${this._escapeHtml(filePath)} (click to open)" style="cursor:pointer;color:#3794ff;text-decoration:underline;">📖 ${this._escapeHtml(fileName)}</span>`;
        if (inList) { inList = false; return '</ul><p>' + prefix + link + '</p>'; }
        return '<p>' + prefix + link + '</p>';
      }

      // List items
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const itemContent = trimmed.substring(2);
        if (!inList) {
          inList = true;
          return '<ul style="margin-left: 20px; margin-bottom: 8px;"><li>' + itemContent + '</li>';
        }
        return '<li>' + itemContent + '</li>';
      }

      // Plain line or paragraph separator
      if (trimmed === '') {
        if (inList) {
          inList = false;
          return '</ul>';
        }
        return '';
      }

      // Regular line
      if (inList) {
        inList = false;
        return '</ul><p>' + line + '</p>';
      }
      return '<p>' + line + '</p>';
    });

    if (inList) {
      processedLines.push('</ul>');
    }

    html = processedLines.filter(line => line !== '').join('\n');

    // Restore code blocks
    codeBlocks.forEach((block, idx) => {
      html = html.replace(`___CODEBLOCK_${idx}___`, block);
    });

    return html;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private _saveToDisk(artifact: Artifact): void {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) return;
      const artifactsDir = path.join(workspaceFolder, '.mirror-vs', 'artifacts');
      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
      }
      const filePath = path.join(artifactsDir, `${artifact.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf8');
    } catch {
      /* non-critical */
    }
  }

  /**
   * Load persisted artifacts from disk.
   */
  loadFromDisk(): void {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) return;
      const artifactsDir = path.join(workspaceFolder, '.mirror-vs', 'artifacts');
      if (!fs.existsSync(artifactsDir)) return;
      const files = fs.readdirSync(artifactsDir).filter((f) => f.endsWith('.json'));
      // Clear memory artifacts list before reloading to ensure no duplicates
      this._artifacts = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(artifactsDir, file), 'utf8');
          const artifact = JSON.parse(content) as Artifact;
          if (artifact.id && artifact.content) {
            this._artifacts.push(artifact);
          }
        } catch {
          /* skip corrupt files */
        }
      }
      // Sort by creation date, newest first
      this._artifacts.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      /* non-critical */
    }
  }
}
