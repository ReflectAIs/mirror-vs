import { describe, it, expect } from 'vitest';
import { evaluateTurnResult, isToolError } from '../failure-detector';

describe('Failure Detector Service', () => {
  describe('isToolError', () => {
    it('should detect explicit error results', () => {
      expect(isToolError('[Tool Result for read_file on "a.ts"]: Error - File not found')).toBe(true);
      expect(isToolError('[Tool Result for run_command]: Error - exit status 1')).toBe(true);
    });

    it('should match regex error patterns', () => {
      expect(isToolError('Unknown action "read_file"')).toBe(true);
      expect(isToolError('Failed to parse SEARCH block')).toBe(true);
      expect(isToolError('Fatal error: out of memory')).toBe(true);
      expect(isToolError('File config.json not found')).toBe(true);
    });

    it('should return false for success messages', () => {
      expect(isToolError('[Tool Result for read_file on "a.ts"]: Success - file contents')).toBe(false);
      expect(isToolError('Task completed successfully')).toBe(false);
    });
  });

  describe('evaluateTurnResult', () => {
    it('should detect tool failures', () => {
      const results = [
        '[Tool Result for read_file on "a.ts"]: Success - content',
        '[Tool Result for patch_file on "b.ts"]: Error - Match not found',
      ];
      const reply = 'I will try something else.';
      const turnEval = evaluateTurnResult(results, reply);
      expect(turnEval.status).toBe('failure');
      expect(turnEval.reason).toContain('tool returned error');
    });

    it('should detect verbal give up patterns in agent reply', () => {
      const results = ['[Tool Result for read_file]: Success'];
      const reply = "I'm not sure how to fix this because I don't have a tool to run tests.";
      const turnEval = evaluateTurnResult(results, reply);
      expect(turnEval.status).toBe('failure');
      expect(turnEval.reason).toContain('give-up pattern');
    });

    it('should return ok when no failures are found', () => {
      const results = ['[Tool Result for read_file]: Success'];
      const reply = 'I have successfully edited the file.';
      const turnEval = evaluateTurnResult(results, reply);
      expect(turnEval.status).toBe('ok');
    });
  });
});
