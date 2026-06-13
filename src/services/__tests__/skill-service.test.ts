import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addSkill, getAllSkills, getSkillsForTask, injectRelevantSkills, Skill } from '../skill-service';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

vi.mock('vscode', () => {
  return {
    workspace: {
      workspaceFolders: [
        {
          uri: {
            fsPath: '/mock-workspace'
          }
        }
      ]
    }
  };
});

vi.mock('fs', () => {
  const memStore = new Map<string, string>();
  return {
    existsSync: vi.fn((p: string) => memStore.has(p) || p === '/mock-workspace/.mirror-vs/skills'),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((p: string, data: string) => {
      memStore.set(p, data);
    }),
    readdirSync: vi.fn(() => {
      return Array.from(memStore.keys())
        .filter(k => k.endsWith('.json'))
        .map(k => path.basename(k));
    }),
    readFileSync: vi.fn((p: string) => {
      return memStore.get(p) || '';
    })
  };
});

describe('Skill Service', () => {
  const testSkill: Skill = {
    name: 'test-skill-slug',
    description: 'A test skill',
    whenToUse: 'When the user wants to test skills',
    procedure: ['Call step 1', 'Call step 2'],
    pitfalls: ['Avoid step 3'],
    verification: ['Verify output'],
    category: 'testing',
    status: 'draft',
    confidence: 0.9,
    source: 'user'
  };

  it('should successfully add and retrieve a skill', () => {
    addSkill(testSkill);
    const all = getAllSkills();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('test-skill-slug');
    expect(all[0].description).toBe('A test skill');
  });

  it('should trigger skills based on task description', () => {
    addSkill(testSkill);
    const matching = getSkillsForTask('I want to test skills in my workspace.');
    expect(matching).toHaveLength(1);
    expect(matching[0].name).toBe('test-skill-slug');
  });

  it('should inject relevant skills into the conversation history', () => {
    addSkill(testSkill);
    const messages = [
      { role: 'system', content: 'Preset prompt' },
      { role: 'user', content: 'Let us test skills now.' }
    ];
    const injected = injectRelevantSkills(messages, 'Let us test skills now.');
    expect(injected).toHaveLength(3);
    expect(injected[1].role).toBe('system');
    expect(injected[1].content).toContain('[RELEVANT ACQUIRED SKILLS]');
    expect(injected[1].content).toContain('test-skill-slug');
    expect((injected[1] as any)._protected).toBe(true);
  });
});
