/**
 * Agent Memory Service — persistent cross-session memory for Mirror VS agent.
 * Stores project-level conventions, architecture decisions, known patterns,
 * and user preferences in .mirror-vs/memory.md and .mirror-vs/memory.json.
 * Provides hybrid retrieval: structured JSON queries + markdown documentation.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface MemoryEntry {
  key: string;
  value: string;
  category: 'convention' | 'architecture' | 'pattern' | 'preference' | 'note';
  timestamp: number;
  source?: string; // Which file or turn generated this memory
}

export interface MemoryIndex {
  version: number;
  lastUpdated: number;
  entries: MemoryEntry[];
}

export class AgentMemoryService {
  private static instance: AgentMemoryService;
  private _index: MemoryIndex = { version: 1, lastUpdated: 0, entries: [] };
  private _memoryDir = '';
  private _loaded = false;

  static getInstance(): AgentMemoryService {
    if (!AgentMemoryService.instance) {
      AgentMemoryService.instance = new AgentMemoryService();
    }
    return AgentMemoryService.instance;
  }

  private _getMemoryDir(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return '';
    const dir = path.join(workspaceFolder, '.mirror-vs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private _ensureLoaded(): void {
    if (this._loaded) return;
    this._memoryDir = this._getMemoryDir();
    if (!this._memoryDir) return;
    const indexPath = path.join(this._memoryDir, 'memory.json');
    try {
      if (fs.existsSync(indexPath)) {
        this._index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      }
    } catch {
      // Use default empty index
    }
    this._loaded = true;
  }

  private _save(): void {
    if (!this._memoryDir) return;
    this._index.lastUpdated = Date.now();
    const indexPath = path.join(this._memoryDir, 'memory.json');
    fs.writeFileSync(indexPath, JSON.stringify(this._index, null, 2), 'utf8');
    this._syncMarkdown();
  }

  /**
   * Syncs the JSON memory index to a human-readable .mirror-vs/memory.md file.
   * This file can be read by the agent as context in future sessions.
   */
  private _syncMarkdown(): void {
    if (!this._memoryDir) return;
    const mdPath = path.join(this._memoryDir, 'memory.md');
    const lines: string[] = [
      '# Mirror VS Agent Memory',
      '',
      `> Last updated: ${new Date(this._index.lastUpdated).toISOString()}`,
      '',
      'This file contains persistent memory across coding sessions. The agent reads this file to understand project conventions, architecture decisions, and user preferences.',
      '',
    ];

    const categories: { key: string; label: string }[] = [
      { key: 'convention', label: '## 📋 Conventions' },
      { key: 'architecture', label: '## 🏗️ Architecture' },
      { key: 'pattern', label: '## 🔁 Patterns' },
      { key: 'preference', label: '## ⚙️ Preferences' },
      { key: 'note', label: '## 📝 Notes' },
    ];

    for (const cat of categories) {
      const entries = this._index.entries.filter((e) => e.category === cat.key);
      if (entries.length === 0) continue;
      lines.push('', cat.label, '');
      for (const entry of entries) {
        lines.push(`- **${entry.key}**: ${entry.value}`);
        if (entry.source) {
          lines.push(`  - *Source: ${entry.source}*`);
        }
      }
    }

    fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
  }

  /**
   * Add or update a memory entry.
   */
  set(key: string, value: string, category: MemoryEntry['category'] = 'note', source?: string): void {
    this._ensureLoaded();
    const existing = this._index.entries.findIndex((e) => e.key === key);
    const entry: MemoryEntry = {
      key,
      value,
      category,
      timestamp: Date.now(),
      source,
    };

    if (existing >= 0) {
      this._index.entries[existing] = entry;
    } else {
      this._index.entries.push(entry);
    }

    this._save();
  }

  /**
   * Get a specific memory entry by key.
   */
  get(key: string): MemoryEntry | undefined {
    this._ensureLoaded();
    return this._index.entries.find((e) => e.key === key);
  }

  /**
   * Get all entries of a specific category.
   */
  getByCategory(category: MemoryEntry['category']): MemoryEntry[] {
    this._ensureLoaded();
    return this._index.entries.filter((e) => e.category === category);
  }

  /**
   * Search memory entries by keyword (case-insensitive).
   */
  search(query: string): MemoryEntry[] {
    this._ensureLoaded();
    const q = query.toLowerCase();
    return this._index.entries.filter((e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }

  /**
   * Get all persistent memories as a raw object.
   */
  getPersistentMemoryObject(): Record<string, any> {
    this._ensureLoaded();
    const structured: Record<string, any> = {
      conventions: [],
      architectureDecisions: [],
      knownPatterns: [],
      userPreferences: [],
      notes: [],
    };

    const mapping: Record<string, string> = {
      convention: 'conventions',
      architecture: 'architectureDecisions',
      pattern: 'knownPatterns',
      preference: 'userPreferences',
      note: 'notes',
    };

    for (const entry of this._index.entries) {
      const targetList = mapping[entry.category] || 'notes';
      structured[targetList].push({
        key: entry.key,
        value: entry.value,
        source: entry.source,
      });
    }

    return structured;
  }

  /**
   * Get all memories formatted as a structured JSON context string for the agent.
   */
  getContextString(currentGoal?: string): string {
    const structured = this.getPersistentMemoryObject();
    if (currentGoal) {
      (structured as any).currentGoal = currentGoal;
    }
    return `### 🧠 PERSISTENT AGENT MEMORY (JSON):\n\`\`\`json\n${JSON.stringify(structured, null, 2)}\n\`\`\``;
  }

  /**
   * Delete a memory entry by key.
   */
  delete(key: string): boolean {
    this._ensureLoaded();
    const idx = this._index.entries.findIndex((e) => e.key === key);
    if (idx >= 0) {
      this._index.entries.splice(idx, 1);
      this._save();
      return true;
    }
    return false;
  }

  /**
   * Clear all memory entries.
   */
  clear(): void {
    this._ensureLoaded();
    this._index.entries = [];
    this._save();
  }

  /**
   * Get total memory count.
   */
  get count(): number {
    this._ensureLoaded();
    return this._index.entries.length;
  }
}
