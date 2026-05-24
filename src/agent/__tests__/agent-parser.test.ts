import { describe, it, expect } from 'vitest';
import { AgentParser } from '../agent-parser';

function makeParser() {
  return new AgentParser();
}

describe('AgentParser', () => {
  describe('stripCodeBlocks', () => {
    it('should strip triple-backtick fenced blocks', () => {
      const parser = makeParser();
      const input = 'Some text\n\\\\nmore text';
      expect(parser.stripCodeBlocks(input)).toBe('Some text\n\nmore text');
    });

    it('should strip inline backtick blocks', () => {
      const parser = makeParser();
      const input = 'Use \ to read files';
      expect(parser.stripCodeBlocks(input)).toBe('Use  to read files');
    });

    it('should return unchanged text if no code blocks', () => {
      const parser = makeParser();
      const input = 'Just plain text with no blocks';
      expect(parser.stripCodeBlocks(input)).toBe(input);
    });
  });

  describe('hasCompleteToolCall', () => {
    it('should detect a self-closing tool tag (read_file)', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall('<read_file path="test.ts" />')).toBe(true);
    });

    it('should return false for plain text', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall('Just a regular message')).toBe(false);
    });
  });

  describe('parseToolCalls', () => {
    const tags = [
      { input: '<read_file path="src/index.ts" />', expected: { name: 'read_file', path: 'src/index.ts' } },
      { input: '<write_file path="hello.txt">Hello World<\u002Fwrite_file>', expected: { name: 'write_file', path: 'hello.txt', content: 'Hello World' } },
      { input: '<run_command command="npm install" />', expected: { name: 'run_command', command: 'npm install' } },
      { input: '<browser_screenshot />', expected: { name: 'browser_screenshot' } },
      { input: '<list_terminals />', expected: { name: 'list_terminals' } },
    ];

    for (const { input, expected } of tags) {
      it(, () => {
        const parser = makeParser();
        const calls = parser.parseToolCalls(input);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual(expected);
      });
    }

    it('should return empty array for text with no tool tags', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls('Just some random text without tools');
      expect(calls).toEqual([]);
    });

    it('should return only the first tool call when multiple are present', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls('<read_file path="a.ts" /> <read_file path="b.ts" />');
      expect(calls).toHaveLength(1);
      expect(calls[0].path).toBe('a.ts');
    });
  });

  describe('getCleanedToolResponse', () => {
    it('should auto-close a block tool tag', () => {
      const parser = makeParser();
      const result = parser.getCleanedToolResponse('<write_file path="test.ts">content');
      expect(result).toContain('<\u002Fwrite_file>');
      expect(result).toContain('content');
    });

    it('should strip content after the first tool call', () => {
      const parser = makeParser();
      const result = parser.getCleanedToolResponse('<read_file path="a.ts" /> extra <read_file path="b.ts" />');
      expect(result).not.toContain('b.ts');
    });
  });
});
