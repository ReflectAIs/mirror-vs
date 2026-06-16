import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatMessage } from '../types';

export interface Skill {
  name: string; // kebab-case slug
  description: string; // one-line summary
  whenToUse: string; // trigger pattern
  procedure: string[]; // ordered steps
  pitfalls: string[]; // common mistakes
  verification: string[]; // how to confirm success
  category: string; // e.g. 'debugging', 'refactoring'
  status: 'draft' | 'published';
  confidence: number; // 0-1
  source: 'teacher-escalation' | 'user' | 'auto';
  teacherModel?: string;
}

function getSkillsDir(): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) return null;
  const dir = path.join(workspaceFolder, '.mirror-vs', 'skills');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      return null;
    }
  }
  return dir;
}

function pruneSkills(dir: string, maxKeep: number): void {
  try {
    const files = fs.readdirSync(dir);
    const jsonFiles = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const filePath = path.join(dir, f);
        return {
          filename: f,
          filePath,
          mtime: fs.statSync(filePath).mtimeMs,
        };
      });

    if (jsonFiles.length <= maxKeep) return;

    // Sort oldest first
    jsonFiles.sort((a, b) => a.mtime - b.mtime);

    const toDeleteCount = jsonFiles.length - maxKeep;
    for (let i = 0; i < toDeleteCount; i++) {
      const item = jsonFiles[i];
      try {
        fs.unlinkSync(item.filePath);
        const mdPath = item.filePath.replace(/\.json$/, '.md');
        if (fs.existsSync(mdPath)) {
          fs.unlinkSync(mdPath);
        }
      } catch (e) {
        console.error(`Failed to delete pruned skill file ${item.filename}:`, e);
      }
    }
  } catch (err) {
    console.error('Error during pruning skills:', err);
  }
}

/**
 * Persist a new skill to the workspace memory.
 */
export function addSkill(skill: Skill): void {
  let skillsEnabled = true;
  let maxKeep = 20;
  let budget = 6000;
  
  try {
    if (vscode && vscode.workspace && typeof vscode.workspace.getConfiguration === 'function') {
      const config = vscode.workspace.getConfiguration('mirror-vs');
      skillsEnabled = config.get<boolean>('skillsEnabled', true);
      maxKeep = config.get<number>('maxSkillsToKeep', 20);
      budget = config.get<number>('agentInputTokenBudget', 6000);
    }
  } catch {
    // Ignore in unit test environments
  }

  if (!skillsEnabled) return;

  const dir = getSkillsDir();
  if (!dir) return;

  // Prune first if we are going to exceed limit
  pruneSkills(dir, maxKeep - 1);

  const content = [
    `# Skill: ${skill.name}`,
    `> Description: ${skill.description}`,
    `> Category: ${skill.category}`,
    `> When to Use: ${skill.whenToUse}`,
    `> Status: ${skill.status}`,
    `> Confidence: ${skill.confidence}`,
    `> Source: ${skill.source}`,
    skill.teacherModel ? `> Teacher Model: ${skill.teacherModel}` : '',
    '',
    '## Procedure',
    ...skill.procedure.map((p, idx) => `${idx + 1}. ${p}`),
    '',
    '## Pitfalls',
    ...skill.pitfalls.map((p) => `- ${p}`),
    '',
    '## Verification',
    ...skill.verification.map((v) => `- ${v}`),
  ].join('\n');

  const filePath = path.join(dir, `${skill.name}.md`);
  try {
    fs.writeFileSync(filePath, content, 'utf8');

    // Programmatic backup for quick load times
    const jsonPath = path.join(dir, `${skill.name}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(skill, null, 2), 'utf8');

    // Notify active webview provider to update dashboard UI immediately
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MirrorVsSidebarProvider } = require('../providers/sidebar-provider');
      const allSkills = getAllSkills();
      MirrorVsSidebarProvider.postToActive?.({
        type: 'updateSkills',
        skills: allSkills,
      });
      MirrorVsSidebarProvider.postToActive?.({
        type: 'dashboardStats',
        budget,
        skillsCount: allSkills.length,
      });
    } catch {
      /* ignore - e.g. when running in test environments */
    }
  } catch (err) {
    console.error('Failed to write skill files:', err);
  }
}

/**
 * Load all skills stored in the workspace.
 */
export function getAllSkills(): Skill[] {
  const dir = getSkillsDir();
  if (!dir) return [];

  try {
    const files = fs.readdirSync(dir);
    const skills: Skill[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf8');
          const skill = JSON.parse(content) as Skill;
          skills.push(skill);
        } catch {
          // Ignore malformed files
        }
      }
    }
    return skills;
  } catch {
    return [];
  }
}

/**
 * Search skills by keywords in metadata or procedure contents.
 */
export function searchSkills(query: string): Skill[] {
  const all = getAllSkills();
  if (!query) return all;

  const lower = query.toLowerCase();
  return all.filter((s) => {
    return (
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.category.toLowerCase().includes(lower) ||
      s.procedure.some((step) => step.toLowerCase().includes(lower))
    );
  });
}

/**
 * Retrieve matching skills triggered by a user task message.
 */
export function getSkillsForTask(userRequest: string): Skill[] {
  const all = getAllSkills();
  if (!userRequest) return [];

  const lowerReq = userRequest.toLowerCase();
  return all.filter((skill) => {
    const triggerPattern = skill.whenToUse.toLowerCase();
    try {
      const rx = new RegExp(triggerPattern, 'i');
      if (rx.test(lowerReq)) return true;
    } catch {
      // Fallback to substring matching
    }
    return (
      lowerReq.includes(triggerPattern) ||
      skill.name
        .replace(/-/g, ' ')
        .split(' ')
        .some((word) => word.length > 3 && lowerReq.includes(word))
    );
  });
}

/**
 * Format skill information into dense markdown instruction.
 */
export function formatSkillMarkdown(skill: Skill): string {
  const procedureText = skill.procedure.map((step, idx) => `  ${idx + 1}. ${step}`).join('\n');
  const pitfallsText =
    skill.pitfalls.length > 0 ? `*Pitfalls to avoid:*\n` + skill.pitfalls.map((p) => `  - ${p}`).join('\n') : '';
  const verificationText =
    skill.verification.length > 0 ? `*Verification:*\n` + skill.verification.map((v) => `  - ${v}`).join('\n') : '';

  return [
    `### Skill: ${skill.name} (${skill.description})`,
    `*Suggested Procedure:*`,
    procedureText,
    pitfallsText,
    verificationText,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Inject task-relevant skills into the prompt history as a protected system notice.
 */
export function injectRelevantSkills(messages: ChatMessage[], userRequest: string): ChatMessage[] {
  let skillsEnabled = true;
  try {
    if (vscode && vscode.workspace && typeof vscode.workspace.getConfiguration === 'function') {
      const config = vscode.workspace.getConfiguration('mirror-vs');
      skillsEnabled = config.get<boolean>('skillsEnabled', true);
    }
  } catch {
    // Ignore in unit test environments
  }
  if (!skillsEnabled) return messages;

  const relevant = getSkillsForTask(userRequest);
  if (relevant.length === 0) return messages;

  const skillsText = relevant.map(formatSkillMarkdown).join('\n\n');
  const skillsSystemMessage: ChatMessage = {
    role: 'system',
    content: `[RELEVANT ACQUIRED SKILLS]\nThe following learned skills match the current task context. Utilize their procedures to complete the work accurately:\n\n${skillsText}`,
  };
  (skillsSystemMessage as any)._protected = true;

  // Insert right after the initial system message if present, or at index 0
  const systemIndex = messages.findIndex((m) => m.role === 'system');
  if (systemIndex !== -1) {
    const result = [...messages];
    result.splice(systemIndex + 1, 0, skillsSystemMessage);
    return result;
  }
  return [skillsSystemMessage, ...messages];
}
