
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../orchestrator';

describe('buildSystemPrompt', () => {
  it('should return a string containing expected content', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toBeTruthy();
    expect(prompt).toContain('Mirror VS');
    expect(prompt).toContain('AVAILABLE TOOLS');
    expect(prompt).toContain('PLAN-EXECUTE-MEMORY CYCLE RULES');
    expect(prompt).toContain('ACTIVE RUNNING TERMINALS');
  });
});
