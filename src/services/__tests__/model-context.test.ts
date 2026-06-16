import { describe, it, expect } from 'vitest';
import { getContextLength, estimateTokens, KNOWN_CONTEXT_WINDOWS } from '../model-context';

describe('Model Context Service', () => {
  describe('getContextLength', () => {
    it('should match known model windows by exact key', async () => {
      // deepseek-chat has a known window of 1000000
      const len = await getContextLength('https://api.deepseek.com/chat/completions', 'deepseek-chat');
      expect(len).toBe(1000000);
    });

    it('should match variants by longest key first (substring match)', async () => {
      // 'o1-mini' has 128000, 'o1' has 200000. It must pick o1-mini for 'o1-mini'
      const miniLen = await getContextLength('https://api.openai.com/v1', 'o1-mini');
      expect(miniLen).toBe(128000);

      const proLen = await getContextLength('https://api.openai.com/v1', 'o1-pro');
      expect(proLen).toBe(200000);
    });

    it('should default to 128000 for unknown model', async () => {
      const len = await getContextLength('https://api.unknown.com/v1', 'my-weird-model-v1');
      expect(len).toBe(128000);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate plain text contents correctly (chars * 0.3)', () => {
      const messages = [
        { role: 'user', content: 'hello world' }, // 11 chars * 0.3 = 3 + 4 overhead = 7 tokens
      ];
      expect(estimateTokens(messages)).toBe(7);
    });

    it('should estimate messages with tool calls', () => {
      const messages = [
        {
          role: 'assistant',
          content: 'Running command...',
          tool_calls: [
            {
              function: {
                name: 'run_command',
                arguments: '{"command": "npm test"}',
              },
            },
          ],
        },
      ];
      // content: 18 chars * 0.3 = 5
      // tool_call name: 11 chars, args: 24 chars -> total 35 chars * 0.3 = 10
      // message overhead: 4, tool call overhead: 4
      // total = 5 + 10 + 4 + 4 = 23
      expect(estimateTokens(messages)).toBe(23);
    });
  });
});
