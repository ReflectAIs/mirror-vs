import { diffLines, generateUnifiedDiff } from '../diff';

describe('diffLines', () => {
  it('should handle completely identical files', () => {
    const original = 'const a = 1;\nconst b = 2;\nconsole.log(a + b);';
    const proposed = 'const a = 1;\nconst b = 2;\nconsole.log(a + b);';
    const diff = diffLines(original, proposed);

    expect(diff).toHaveLength(3);
    expect(diff.every((d) => d.type === 'common')).toBe(true);
    expect(diff[0]).toEqual({ type: 'common', line: 'const a = 1;', originalLineNum: 0, proposedLineNum: 0 });
    expect(diff[1]).toEqual({ type: 'common', line: 'const b = 2;', originalLineNum: 1, proposedLineNum: 1 });
  });

  it('should handle empty files', () => {
    expect(diffLines('', '')).toEqual([]);
  });

  it('should handle addition of lines at the beginning', () => {
    const original = 'world';
    const proposed = 'hello\nworld';
    const diff = diffLines(original, proposed);

    expect(diff).toEqual([
      { type: 'added', line: 'hello', proposedLineNum: 0 },
      { type: 'common', line: 'world', originalLineNum: 0, proposedLineNum: 1 },
    ]);
  });

  it('should handle addition of lines in the middle', () => {
    const original = 'line 1\nline 3';
    const proposed = 'line 1\nline 2\nline 3';
    const diff = diffLines(original, proposed);

    expect(diff).toEqual([
      { type: 'common', line: 'line 1', originalLineNum: 0, proposedLineNum: 0 },
      { type: 'added', line: 'line 2', proposedLineNum: 1 },
      { type: 'common', line: 'line 3', originalLineNum: 1, proposedLineNum: 2 },
    ]);
  });

  it('should handle addition of lines at the end', () => {
    const original = 'hello';
    const proposed = 'hello\nworld';
    const diff = diffLines(original, proposed);

    expect(diff).toEqual([
      { type: 'common', line: 'hello', originalLineNum: 0, proposedLineNum: 0 },
      { type: 'added', line: 'world', proposedLineNum: 1 },
    ]);
  });

  it('should handle deletion of lines at the beginning', () => {
    const original = 'hello\nworld';
    const proposed = 'world';
    const diff = diffLines(original, proposed);

    expect(diff).toEqual([
      { type: 'removed', line: 'hello', originalLineNum: 0 },
      { type: 'common', line: 'world', originalLineNum: 1, proposedLineNum: 0 },
    ]);
  });

  it('should handle deletion of lines in the middle', () => {
    const original = 'line 1\nline 2\nline 3';
    const proposed = 'line 1\nline 3';
    const diff = diffLines(original, proposed);

    expect(diff).toEqual([
      { type: 'common', line: 'line 1', originalLineNum: 0, proposedLineNum: 0 },
      { type: 'removed', line: 'line 2', originalLineNum: 1 },
      { type: 'common', line: 'line 3', originalLineNum: 2, proposedLineNum: 1 },
    ]);
  });

  it('should handle deletion of lines at the end', () => {
    const original = 'hello\nworld';
    const proposed = 'hello';
    const diff = diffLines(original, proposed);

    expect(diff).toEqual([
      { type: 'common', line: 'hello', originalLineNum: 0, proposedLineNum: 0 },
      { type: 'removed', line: 'world', originalLineNum: 1 },
    ]);
  });

  it('should handle combinations of additions and deletions', () => {
    const original = 'a\nb\nc';
    const proposed = 'b\nc\nd';
    const diff = diffLines(original, proposed);

    expect(diff).toEqual([
      { type: 'removed', line: 'a', originalLineNum: 0 },
      { type: 'common', line: 'b', originalLineNum: 1, proposedLineNum: 0 },
      { type: 'common', line: 'c', originalLineNum: 2, proposedLineNum: 1 },
      { type: 'added', line: 'd', proposedLineNum: 2 },
    ]);
  });
});

describe('generateUnifiedDiff', () => {
  it('should generate an empty string for empty input', () => {
    expect(generateUnifiedDiff('test.ts', '', '')).toBe('');
  });

  it('should generate diff hunks with correct context lines', () => {
    const original = '1\n2\n3\n4\n5\n6\n7\n8\n9';
    const proposed = '1\n2\n3\n4\nupdated 5\n6\n7\n8\n9';
    const diff = generateUnifiedDiff('test.ts', original, proposed, 2);

    expect(diff).toContain('--- a/test.ts');
    expect(diff).toContain('+++ b/test.ts');
    expect(diff).toContain('@@ -3,5 +3,5 @@');
    expect(diff).toContain('  3');
    expect(diff).toContain('  4');
    expect(diff).toContain('+ updated 5');
    expect(diff).not.toContain('  1'); // Excluded by contextLines = 2
    expect(diff).not.toContain('  9'); // Excluded by contextLines = 2
  });
});
