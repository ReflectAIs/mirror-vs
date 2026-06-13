import { describe, it, expect, vi } from 'vitest';
import { trimForContext, maybeCompact, sanitizeToolMessages } from '../context-compactor';
import { ChatMessage } from '../../types';

describe('Context Compactor Service', () => {
  describe('sanitizeToolMessages', () => {
    it('should drop orphan tool result messages', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: '[Tool Result for read_file on "a.ts"]: Success - content' },
        { role: 'user', content: 'hello' },
      ];
      const cleaned = sanitizeToolMessages(messages);
      expect(cleaned).toHaveLength(1);
      expect(cleaned[0].role).toBe('user');
    });

    it('should keep tool results that follow assistant tool calls', () => {
      const messages: ChatMessage[] = [
        { role: 'assistant', content: 'Running tool...', tool_calls: [{ name: 'read_file', arguments: '{}' }] } as any,
        { role: 'system', content: '[Tool Result for read_file on "a.ts"]: Success - content' },
        { role: 'user', content: 'next' },
      ];
      const cleaned = sanitizeToolMessages(messages);
      expect(cleaned).toHaveLength(3);
      expect(cleaned[0].role).toBe('assistant');
      expect(cleaned[1].role).toBe('system');
    });

    it('should strip dangling assistant tool calls with no following tool response', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: 'I will write a file',
          tool_calls: [{ name: 'write_file', arguments: '{}' }],
        } as any,
        { role: 'user', content: 'wait, do not!' },
      ];
      const cleaned = sanitizeToolMessages(messages);
      expect(cleaned).toHaveLength(2);
      expect((cleaned[0] as any).tool_calls).toBeUndefined();
      expect(cleaned[0].content).toBe('I will write a file');
    });
  });

  describe('trimForContext', () => {
    it('should return messages unchanged if under budget', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user query' },
      ];
      const trimmed = trimForContext(messages, 8192);
      expect(trimmed).toEqual(messages);
    });

    it('should drop extra system messages (keep the first)', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'preset system prompt' },
        { role: 'system', content: 'RAG context metadata' },
        { role: 'system', content: 'memory profile' },
        { role: 'user', content: 'user query' },
      ];
      // Set very small context window to force trimming
      const trimmed = trimForContext(messages, 20, 0);
      expect(trimmed).toHaveLength(2);
      expect(trimmed[0].content).toBe('preset system prompt');
      expect(trimmed[1].role).toBe('user');
    });

    it('should trim older conversation messages but keep recent ones', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'preset prompt' },
        { role: 'user', content: 'turn 1' },
        { role: 'assistant', content: 'reply 1' },
        { role: 'user', content: 'turn 2' },
        { role: 'assistant', content: 'reply 2' },
        { role: 'user', content: 'turn 3' },
        { role: 'assistant', content: 'reply 3' },
        { role: 'user', content: 'latest user message' },
      ];
      // We want to force it to trim older turns
      const trimmed = trimForContext(messages, 30, 0);
      expect(trimmed.some((m) => m.content === 'latest user message')).toBe(true);
      expect(trimmed.some((m) => m.content === 'turn 1')).toBe(false);
    });
  });

  describe('maybeCompact', () => {
    it('should not compact if under threshold', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'preset prompt' },
        { role: 'user', content: 'hello' },
      ];
      const mockSummarize = vi.fn().mockResolvedValue('Summary');
      const { compactedMessages, wasCompacted } = await maybeCompact(messages, 128000, mockSummarize);
      expect(wasCompacted).toBe(false);
      expect(compactedMessages).toEqual(messages);
      expect(mockSummarize).not.toHaveBeenCalled();
    });

    it('should compact older half of conversation when above threshold', async () => {
      // Create a list of messages that would exceed budget threshold (using small mock context)
      const messages: ChatMessage[] = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'a'.repeat(200) },
        { role: 'assistant', content: 'b'.repeat(200) },
        { role: 'user', content: 'c'.repeat(200) },
        { role: 'assistant', content: 'd'.repeat(200) },
        { role: 'user', content: 'e'.repeat(200) },
        { role: 'assistant', content: 'f'.repeat(200) },
      ];

      const mockSummarize = vi.fn().mockResolvedValue('Mock conversation summary text.');
      // Context length = 500, used ≈ 1200 * 0.3 = 360 tokens. 360/500 = 72%? No, let's use contextLength = 300 to be sure it is above 85% threshold
      const { compactedMessages, wasCompacted } = await maybeCompact(messages, 300, mockSummarize);
      expect(wasCompacted).toBe(true);
      expect(mockSummarize).toHaveBeenCalled();
      expect(compactedMessages[1].role).toBe('system');
      expect(compactedMessages[1].content).toContain('Mock conversation summary text.');
    });
  });
});
