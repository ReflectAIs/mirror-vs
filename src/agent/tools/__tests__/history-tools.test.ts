import { describe, it, expect } from 'vitest';
import { executeHistoryTool } from '../history-tools';
import { ChatMessage } from '../../types';

describe('History Tools', () => {
  describe('search_chat_history', () => {
    it('should throw if query is missing', async () => {
      await expect(executeHistoryTool({ name: 'search_chat_history' } as any)).rejects.toThrow(
        'Missing "query" parameter for search_chat_history.'
      );
    });

    it('should return search matches from active messages', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'We need to fix index.js' },
        { role: 'assistant', content: 'I will use read_file on index.js' },
        { role: 'system', content: '[Tool Result for read_file]: Success' },
      ];

      const result = await executeHistoryTool(
        { name: 'search_chat_history', query: 'index.js' } as any,
        messages
      );

      expect(result).toContain('Chat History Search Results');
      expect(result).toContain('Turn 1 (USER)');
      expect(result).toContain('Turn 2 (ASSISTANT)');
      expect(result).not.toContain('Turn 3');
    });

    it('should respect limits', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'test string' },
        { role: 'assistant', content: 'another test string' },
        { role: 'user', content: 'yet another test string' },
      ];

      const result = await executeHistoryTool(
        { name: 'search_chat_history', query: 'test', limit: 2 } as any,
        messages
      );

      expect(result).toContain('Found 3 matches');
      expect(result).toContain('Turn 2');
      expect(result).toContain('Turn 3');
      expect(result).not.toContain('Turn 1'); // Excluded by limit = 2 (slices most recent)
    });

    it('should return no matches message if query not found', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'hello' },
      ];

      const result = await executeHistoryTool(
        { name: 'search_chat_history', query: 'missing' } as any,
        messages
      );

      expect(result).toContain('No matches found for query "missing"');
    });
  });
});
