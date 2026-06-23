import { describe, it, expect } from 'vitest';
import { NativeToolCallParser } from '../native-tool-call-parser';

describe('NativeToolCallParser JSON Repair', () => {
  it('should parse valid JSON without changes', () => {
    const call = NativeToolCallParser.parseToolCall(
      'read_file',
      '{"path": "src/index.ts", "start_line": 10, "end_line": 20}'
    );
    expect(call).not.toBeNull();
    expect(call?.name).toBe('read_file');
    expect(call?.path).toBe('src/index.ts');
    expect(call?.start_line).toBe(10);
    expect(call?.end_line).toBe(20);
  });

  it('should repair trailing commas', () => {
    const call = NativeToolCallParser.parseToolCall(
      'read_file',
      '{"path": "src/index.ts", "start_line": 10,}'
    );
    expect(call).not.toBeNull();
    expect(call?.name).toBe('read_file');
    expect(call?.path).toBe('src/index.ts');
    expect(call?.start_line).toBe(10);
  });

  it('should repair unclosed braces', () => {
    const call = NativeToolCallParser.parseToolCall(
      'read_file',
      '{"path": "src/index.ts", "start_line": 10'
    );
    expect(call).not.toBeNull();
    expect(call?.name).toBe('read_file');
    expect(call?.path).toBe('src/index.ts');
    expect(call?.start_line).toBe(10);
  });

  it('should repair unclosed quotes and braces', () => {
    const call = NativeToolCallParser.parseToolCall(
      'read_file',
      '{"path": "src/index.ts'
    );
    expect(call).not.toBeNull();
    expect(call?.name).toBe('read_file');
    expect(call?.path).toBe('src/index.ts');
  });

  it('should parse valid create_artifact JSON', () => {
    const call = NativeToolCallParser.parseToolCall(
      'create_artifact',
      '{"id": "test_artifact", "type": "markdown", "title": "My Title", "content": "# Hello World\\nContent here", "language": "markdown"}'
    );
    expect(call).not.toBeNull();
    expect(call?.name).toBe('create_artifact');
    expect(call?.id).toBe('test_artifact');
    expect(call?.type).toBe('markdown');
    expect(call?.title).toBe('My Title');
    expect(call?.content).toBe('# Hello World\nContent here');
    expect(call?.language).toBe('markdown');
  });
});
