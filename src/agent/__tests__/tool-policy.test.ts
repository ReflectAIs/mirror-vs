import { describe, it, expect } from 'vitest';
import { detectGuideOnly, domainRulesForTools, getDisabledToolsForMode, getToolsForQuery } from '../tool-policy';
import { TaskMode } from '../orchestrator';

describe('Tool Policy Service', () => {
  describe('detectGuideOnly', () => {
    it('should detect guide-only mode requests', () => {
      expect(detectGuideOnly('Please run in guide-only mode')).toBe(true);
      expect(detectGuideOnly("don't use any tools, please")).toBe(true);
      expect(detectGuideOnly('ask me for confirmation before using tools')).toBe(true);
    });

    it('should return false for regular messages', () => {
      expect(detectGuideOnly('Please fix the bug in index.ts')).toBe(false);
    });
  });

  describe('domainRulesForTools', () => {
    it('should only return rules for domains matching active tools', () => {
      const activeTools = new Set(['read_file', 'patch_file']);
      const rules = domainRulesForTools(activeTools);
      expect(rules).toContain('File Operation Rules');
      expect(rules).not.toContain('Terminal Rules');
    });
  });

  describe('getDisabledToolsForMode', () => {
    it('should return disallowed tools in REVIEW mode', () => {
      const allTools = new Set(['read_file', 'patch_file', 'run_command']);
      const disabled = getDisabledToolsForMode(TaskMode.REVIEW, allTools);
      expect(disabled.has('patch_file')).toBe(true);
      expect(disabled.has('run_command')).toBe(true);
      expect(disabled.has('read_file')).toBe(false);
    });
  });

  describe('getToolsForQuery', () => {
    it('should prune tools by keywords', () => {
      const allTools = new Set(['read_file', 'patch_file', 'run_command', 'git_status', 'figma_inspect']);
      
      const gitTools = getToolsForQuery('check git status please', allTools);
      expect(gitTools.has('git_status')).toBe(true);
      expect(gitTools.has('run_command')).toBe(false);
      expect(gitTools.has('figma_inspect')).toBe(false);
      
      const figmaTools = getToolsForQuery('view the figma inspect details', allTools);
      expect(figmaTools.has('figma_inspect')).toBe(true);
      expect(figmaTools.has('git_status')).toBe(false);
      
      // Core tools (read_file, patch_file) must never be pruned
      expect(gitTools.has('read_file')).toBe(true);
      expect(gitTools.has('patch_file')).toBe(true);
    });
  });
});
