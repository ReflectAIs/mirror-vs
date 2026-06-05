import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChatMessage, ChatSession } from '../types';

/**
 * Lazy-load storage service that avoids deserializing the entire chat sessions
 * blob on VS Code startup. Messages are stored per-session in separate keys.
 * Session list only contains lightweight metadata (id, title, timestamp, messageCount).
 */

export class StorageService {
  constructor(private readonly _workspaceState: vscode.Memento) {}

  /**
   * Get session list (lightweight — no messages included).
   */
  getSessions(): ChatSession[] {
    const state = this._workspaceState.get<ChatSession[]>('mirror-vs.sessions.meta', []);
    if (state.length > 0) return state;
    // Fall back to file backup if workspaceState is empty
    const fileData = this._readFileBackup();
    return fileData?.sessions || [];
  }

  /**
   * Save session list (metadata only: id, title, timestamp, messageCount).
   * Messages are striped out before saving.
   */
  async saveSessions(sessions: ChatSession[]): Promise<void> {
    // Strip message content — only keep count for the session list
    const metaOnly = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      timestamp: s.timestamp,
      messageCount: s.messageCount || 0,
      messages: [] as ChatMessage[],
    }));
    await this._workspaceState.update('mirror-vs.sessions.meta', metaOnly);
    // Also write file backup for cross-workspace persistence
    const messages: Record<string, ChatMessage[]> = {};
    for (const session of sessions) {
      messages[session.id] = this.loadMessages(session.id);
    }
    this._writeFileBackup({ sessions: metaOnly, messages });
  }

  /**
   * Load messages for a specific session from its dedicated key.
   */
  loadMessages(sessionId: string): ChatMessage[] {
    const state = this._workspaceState.get<ChatMessage[]>(`mirror-vs.messages.${sessionId}`, []);
    if (state.length > 0) return state;
    // Fall back to file backup
    const fileData = this._readFileBackup();
    return fileData?.messages?.[sessionId] || [];
  }

  /**
   * Save messages for a specific session to its dedicated key.
   */
  async saveMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    await this._workspaceState.update(`mirror-vs.messages.${sessionId}`, messages);
    // Also write file backup
    const sessions = this.getSessions();
    const allMessages: Record<string, ChatMessage[]> = {};
    for (const session of sessions) {
      if (session.id === sessionId) {
        allMessages[session.id] = messages;
      } else {
        allMessages[session.id] = this.loadMessages(session.id);
      }
    }
    this._writeFileBackup({ sessions, messages: allMessages });
  }

  /**
   * Delete a session's messages entirely.
   */
  async deleteMessages(sessionId: string): Promise<void> {
    await this._workspaceState.update(`mirror-vs.messages.${sessionId}`, undefined);
    // Update file backup
    const fileData = this._readFileBackup();
    if (fileData && fileData.messages) {
      delete fileData.messages[sessionId];
      this._writeFileBackup(fileData);
    }
  }

  /**
   * Migrate from legacy monolithic storage (mirror-vs.chatSessions) to separated keys.
   * Call once on extension activation if the old key exists.
   */
  async migrateFromLegacyIfNeeded(): Promise<void> {
    try {
      const legacy = this._workspaceState.get<ChatSession[]>('mirror-vs.chatSessions');
      const legacyPerSession = this._workspaceState.get<ChatMessage[]>('mirror-vs.chatHistory');
      const activeId = this._workspaceState.get<string>('mirror-vs.activeSessionId');

      if (Array.isArray(legacy) && legacy.length > 0) {
        console.log('[StorageService] Migrating legacy chatSessions to per-session keys...');

        const allMessages: Record<string, ChatMessage[]> = {};

        for (const session of legacy) {
          if (!session || !session.id) continue;
          // Strip images from all messages to avoid bloating workspaceState with base64
          const cleaned = Array.isArray(session.messages)
            ? session.messages.map((msg) => ({
                ...msg,
                images: msg.images ? msg.images.slice(0, 0) : undefined,
              }))
            : [];
          await this._workspaceState.update(`mirror-vs.messages.${session.id}`, cleaned);
          allMessages[session.id] = cleaned;
        }

        // Save light metadata (no messages)
        const metaOnly = legacy.map((s) => ({
          id: s.id,
          title: s.title || 'Chat Session',
          timestamp: s.timestamp || Date.now(),
          messageCount: s.messages ? s.messages.length : 0,
          messages: [] as ChatMessage[],
        }));
        await this._workspaceState.update('mirror-vs.sessions.meta', metaOnly);

        // Write file backup with all migrated data
        this._writeFileBackup({ sessions: metaOnly, messages: allMessages });

        // Clear legacy key
        await this._workspaceState.update('mirror-vs.chatSessions', undefined);
        console.log('[StorageService] Migration complete.');
      } else if (Array.isArray(legacyPerSession) && legacyPerSession.length > 0 && activeId) {
        // Migration from single per-workspace chatHistory key to per-session
        console.log('[StorageService] Migrating legacy chatHistory to per-session key...');
        const cleaned = legacyPerSession.map((msg) => ({
          ...msg,
          images: msg.images ? msg.images.slice(0, 0) : undefined,
        }));
        await this._workspaceState.update(`mirror-vs.messages.${activeId}`, cleaned);

        // Create lightweight metadata for this migrated active session
        const sessions = this.getSessions();
        if (!sessions.find((s) => s.id === activeId)) {
          const firstUser = legacyPerSession.find((m) => m.role === 'user');
          let title = 'Chat Session';
          if (firstUser) {
            let text = firstUser.content.trim();
            const contextIndex = text.indexOf('\n\n[Active File Context:');
            if (contextIndex !== -1) {
              text = text.substring(0, contextIndex).trim();
            }
            title = text.substring(0, 32);
            if (text.length > 32) title += '...';
          }
          sessions.push({
            id: activeId,
            title: title || 'Chat Session',
            timestamp: Date.now(),
            messageCount: legacyPerSession.length,
            messages: [] as ChatMessage[],
          });
          await this.saveSessions(sessions);
        }

        // Write file backup
        const allMessages: Record<string, ChatMessage[]> = { [activeId]: cleaned };
        this._writeFileBackup({ sessions, messages: allMessages });

        // Persist active session ID
        this.persistActiveSessionId(activeId);

        await this._workspaceState.update('mirror-vs.chatHistory', undefined);
        console.log('[StorageService] Migration complete.');
      }

      // Clean up any stale empty message keys
      if (
        (Array.isArray(legacy) && legacy.length > 0) ||
        (Array.isArray(legacyPerSession) && legacyPerSession.length > 0)
      ) {
        this._workspaceState.update('mirror-vs.chatHistory', undefined);
      }
    } catch (err) {
      console.error('[StorageService] Legacy migration failed:', err);
    }
  }

  /**
   * Trim old sessions to keep total session count under a limit.
   */
  async trimOldSessions(maxSessions: number = 50): Promise<void> {
    const sessions = this.getSessions();
    if (sessions.length <= maxSessions) return;

    sessions.sort((a, b) => b.timestamp - a.timestamp);
    const toKeep = sessions.slice(0, maxSessions);
    const toDelete = sessions.slice(maxSessions);

    for (const session of toDelete) {
      await this.deleteMessages(session.id);
    }

    await this.saveSessions(toKeep);
  }

  // =============================================================
  // MISSING METHODS ADDED BACK
  // =============================================================

  /**
   * Get the active session ID from a file-based persistence layer.
   * Returns undefined if no active session is stored.
   */
  getActiveSessionIdFromFile(): string | undefined {
    // Check if there's a globalState-based active session ID
    // This is stored in the workspaceState as 'mirror-vs.activeSessionId'
    return this._workspaceState.get<string>('mirror-vs.activeSessionId');
  }

  /**
   * Persist the active session ID to both workspaceState and file backup.
   */
  persistActiveSessionId(id: string): void {
    // The active session ID is stored via the sidebar provider directly
    // This method ensures the file backup also has a reference
    const fileData = this._readFileBackup();
    if (fileData) {
      fileData.activeSessionId = id;
      this._writeFileBackup(fileData);
    }
  }

  /**
   * Read the backup file from disk (global storage path).
   * Returns null if the file doesn't exist or is corrupted.
   */
  private _readFileBackup(): {
    sessions: ChatSession[];
    messages: Record<string, ChatMessage[]>;
    activeSessionId?: string;
  } | null {
    try {
      // Use a global storage path for the backup file
      const backupPath = this._getBackupFilePath();
      if (!backupPath || !fs.existsSync(backupPath)) {
        return null;
      }
      const raw = fs.readFileSync(backupPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[StorageService] Failed to read file backup:', e);
      return null;
    }
  }

  /**
   * Write the backup file to disk (global storage path).
   */
  private _writeFileBackup(data: {
    sessions: ChatSession[];
    messages: Record<string, ChatMessage[]>;
    activeSessionId?: string;
  }): void {
    try {
      const backupPath = this._getBackupFilePath();
      if (!backupPath) return;
      const dir = path.dirname(backupPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.warn('[StorageService] Failed to write file backup:', e);
    }
  }

  /**
   * Derive the backup file path from the extension's global storage directory.
   * Uses a hash of the workspace folder path to create a unique file per workspace.
   */
  private _getBackupFilePath(): string | null {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return null;
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const workspaceHash = this._simpleHash(workspacePath);
      // Store backup inside the workspace's .mirror-vs directory
      const backupDir = path.join(workspacePath, '.mirror-vs', 'backup');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      return path.join(backupDir, `storage_${workspaceHash}.json`);
    } catch (e) {
      console.warn('[StorageService] Failed to get backup file path:', e);
      // Ultimate fallback to OS temp directory
      try {
        const tempDir = path.join(os.tmpdir(), 'mirror-vs-backup');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        return path.join(tempDir, 'storage_fallback.json');
      } catch {
        return null;
      }
    }
  }

  /**
   * Simple string hash function for generating unique workspace identifiers.
   */
  private _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}
