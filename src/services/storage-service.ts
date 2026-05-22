
import * as vscode from 'vscode';
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
    return this._workspaceState.get<ChatSession[]>('mirror-vs.sessions.meta', []);
  }

  /**
   * Save session list (metadata only: id, title, timestamp, messageCount).
   * Messages are striped out before saving.
   */
  async saveSessions(sessions: ChatSession[]): Promise<void> {
    // Strip message content — only keep count for the session list
    const metaOnly = sessions.map(s => ({
      id: s.id,
      title: s.title,
      timestamp: s.timestamp,
      messages: [] as ChatMessage[],
    }));
    await this._workspaceState.update('mirror-vs.sessions.meta', metaOnly);
  }

  /**
   * Load messages for a specific session from its dedicated key.
   */
  loadMessages(sessionId: string): ChatMessage[] {
    return this._workspaceState.get<ChatMessage[]>(`mirror-vs.messages.${sessionId}`, []);
  }

  /**
   * Save messages for a specific session to its dedicated key.
   */
  async saveMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    await this._workspaceState.update(`mirror-vs.messages.${sessionId}`, messages);
  }

  /**
   * Delete a session's messages entirely.
   */
  async deleteMessages(sessionId: string): Promise<void> {
    await this._workspaceState.update(`mirror-vs.messages.${sessionId}`, undefined);
  }

  /**
   * Migrate from legacy monolithic storage (mirror-vs.chatSessions) to separated keys.
   * Call once on extension activation if the old key exists.
   */
  async migrateFromLegacyIfNeeded(): Promise<void> {
    const legacy = this._workspaceState.get<ChatSession[]>('mirror-vs.chatSessions', undefined);
    const legacyPerSession = this._workspaceState.get<ChatMessage[]>('mirror-vs.chatHistory', undefined);
    const activeId = this._workspaceState.get<string>('mirror-vs.activeSessionId');

    if (legacy && legacy.length > 0) {
      console.log('[StorageService] Migrating legacy chatSessions to per-session keys...');

      for (const session of legacy) {
        // Strip images from all messages to avoid bloating workspaceState with base64
        const cleaned = session.messages.map(msg => ({
          ...msg,
          images: msg.images ? msg.images.slice(0, 0) : undefined, // keep the array key but empty
        }));
        await this._workspaceState.update(`mirror-vs.messages.${session.id}`, cleaned);
      }

      // Save light metadata (no messages)
      const metaOnly = legacy.map(s => ({
        id: s.id,
        title: s.title,
        timestamp: s.timestamp,
        messages: [] as ChatMessage[],
      }));
      await this._workspaceState.update('mirror-vs.sessions.meta', metaOnly);

      // Clear legacy key
      await this._workspaceState.update('mirror-vs.chatSessions', undefined);
      console.log('[StorageService] Migration complete.');
    } else if (legacyPerSession && activeId) {
      // Migration from single per-workspace chatHistory key to per-session
      console.log('[StorageService] Migrating legacy chatHistory to per-session key...');
      const cleaned = legacyPerSession.map(msg => ({
        ...msg,
        images: msg.images ? msg.images.slice(0, 0) : undefined,
      }));
      await this._workspaceState.update(`mirror-vs.messages.${activeId}`, cleaned);
      await this._workspaceState.update('mirror-vs.chatHistory', undefined);
      console.log('[StorageService] Migration complete.');
    }

    // Clean up any stale empty message keys
    if (legacy || legacyPerSession) {
      // Also remove any old keys that might have been left behind
      this._workspaceState.update('mirror-vs.chatHistory', undefined);
    }
  }

  /**
   * Trim old sessions to keep total session count under a limit.
   */
  async trimOldSessions(maxSessions: number = 50): Promise<void> {
    const sessions = this.getSessions();
    if (sessions.length <= maxSessions) return;

    // Sort by timestamp descending (newest first)
    sessions.sort((a, b) => b.timestamp - a.timestamp);
    const toKeep = sessions.slice(0, maxSessions);
    const toDelete = sessions.slice(maxSessions);

    for (const session of toDelete) {
      await this.deleteMessages(session.id);
    }

    await this.saveSessions(toKeep);
  }
}
