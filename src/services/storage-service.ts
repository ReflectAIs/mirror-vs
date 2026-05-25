
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
    const metaOnly = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      timestamp: s.timestamp,
      messageCount: s.messageCount || 0,
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
    const legacy = this._workspaceState.get<ChatSession[]>('mirror-vs.chatSessions') || [];
    const legacyPerSession = this._workspaceState.get<ChatMessage[]>('mirror-vs.chatHistory') || [];
    const activeId = this._workspaceState.get<string>('mirror-vs.activeSessionId');

    if (legacy && legacy.length > 0) {
      console.log('[StorageService] Migrating legacy chatSessions to per-session keys...');

      for (const session of legacy) {
        // Strip images from all messages to avoid bloating workspaceState with base64
        const cleaned = session.messages.map((msg) => ({
          ...msg,
          images: msg.images ? msg.images.slice(0, 0) : undefined,
        }));
        await this._workspaceState.update(`mirror-vs.messages.${session.id}`, cleaned);
      }

      // Save light metadata (no messages)
      const metaOnly = legacy.map((s) => ({
        id: s.id,
        title: s.title,
        timestamp: s.timestamp,
        messageCount: s.messages ? s.messages.length : 0,
        messages: [] as ChatMessage[],
      }));
      await this._workspaceState.update('mirror-vs.sessions.meta', metaOnly);

      // Clear legacy key
      await this._workspaceState.update('mirror-vs.chatSessions', undefined);
      console.log('[StorageService] Migration complete.');
    } else if (legacyPerSession && legacyPerSession.length > 0 && activeId) {
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

      await this._workspaceState.update('mirror-vs.chatHistory', undefined);
      console.log('[StorageService] Migration complete.');
    }

    // Clean up any stale empty message keys
    if ((legacy && legacy.length > 0) || (legacyPerSession && legacyPerSession.length > 0)) {
      this._workspaceState.update('mirror-vs.chatHistory', undefined);
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
}
