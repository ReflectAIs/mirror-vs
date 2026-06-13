import { describe, it, expect } from 'vitest';
import { extractSkillJson } from '../teacher-escalation';

describe('Teacher Escalation Service', () => {
  describe('extractSkillJson', () => {
    it('should extract JSON block from markdown fences', () => {
      const response = [
        'Here is the corrected procedure.',
        '```json',
        '{',
        '  "name": "figma-export",',
        '  "description": "Export figma layouts"',
        '}',
        '```',
        'Let me know if you need help.'
      ].join('\n');

      const extracted = extractSkillJson(response);
      expect(extracted).not.toBeNull();
      expect(extracted.name).toBe('figma-export');
      expect(extracted.description).toBe('Export figma layouts');
    });

    it('should return null for invalid JSON or missing code block', () => {
      expect(extractSkillJson('no code block here')).toBeNull();
      expect(extractSkillJson('```json\n{ malformed\n```')).toBeNull();
    });
  });
});
