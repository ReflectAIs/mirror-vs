import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatMessage, LLMProvider } from '../types';
import { CommandService } from '../services/command-service';
import { getModelContextWindow, estimateTokenCount } from './orchestrator-config';
import { getBaseAgentRole } from './prompts/baseAgentRole';
import { getWorkspaceContext } from './prompts/workspaceContext';
import { getToolSpecifications } from './prompts/toolSpecifications';
import { getDebugSkill } from './prompts/skills/debugSkill';
import { getReactSkill } from './prompts/skills/reactSkill';
import { getBackendSkill } from './prompts/skills/backendSkill';
import { getRefactorSkill } from './prompts/skills/refactorSkill';
import { getModeInstructions } from './prompts/modePrompts';
import { TaskMode } from './orchestrator';

import { detectGuideOnly, domainRulesForTools, GUIDE_ONLY_DIRECTIVE, getToolsForQuery } from './tool-policy';
import { UNTRUSTED_CONTEXT_POLICY } from './prompt-security';

export function buildSystemPrompt(
  loopCount: number = 1,
  hasPlan: boolean = false,
  featureOwner: string = '',
  agentState: string = 'DISCOVERY',
  taskMode: TaskMode = TaskMode.IMPLEMENT,
  userRequest: string = '',
): string {
  const service = CommandService.getInstance();
  const terminals = service.getActiveTerminals();
  let terminalContext = '';
  if (terminals.length > 0) {
    terminalContext =
      '\n\n### ACTIVE RUNNING TERMINALS:\n' +
      terminals.map((t) => '- "' + t.name + '" ' + (t.running ? 'RUNNING' : 'EXITED')).join('\n');
  } else {
    terminalContext = '\n\n### ACTIVE RUNNING TERMINALS:\nNone';
  }

  const isSubsequent = loopCount > 1;
  const baseRole = getBaseAgentRole();
  const workspaceContext = getWorkspaceContext();
  const toolSpecs = getToolSpecifications(isSubsequent);

  let planStatusContext = '';
  if (hasPlan) {
    planStatusContext =
      '\n\n### 📋 APPROVED PLAN DETECTED:\nAn implementation plan has already been proposed and approved by the user for this session. Do NOT write or output a new <implementation_plan> block. Proceed directly to executing the tool calls (e.g. read_file, patch_file, etc.) to accomplish the plan steps now!';
  }

  const config = vscode.workspace.getConfiguration('mirror-vs');

  // 1. Custom Prompt Prefix
  const customPrefix = config.get<string>('customSystemPrompt', '').trim();
  let customPrefixSection = '';
  if (customPrefix) {
    customPrefixSection = `### CUSTOM USER INSTRUCTIONS:\n${customPrefix}\n\n`;
  }

  // 2. Workspace Rules (.mirror-vs/rules.md)
  let rulesSection = '';
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceFolder) {
    const rulesPath = path.join(workspaceFolder, '.mirror-vs', 'rules.md');
    if (fs.existsSync(rulesPath)) {
      try {
        const rulesContent = fs.readFileSync(rulesPath, 'utf8').trim();
        if (rulesContent) {
          rulesSection = `\n\n### WORKSPACE RULES (MANDATORY):\n${rulesContent}`;
        }
      } catch (e) {
        console.warn('Failed to read workspace rules.md', e);
      }
    }
  }

  // 3. Project Memory (.mirror-vs/project-memory.json)
  let projectMemorySection = '';
  if (workspaceFolder) {
    const projectMemoryPath = path.join(workspaceFolder, '.mirror-vs', 'project-memory.json');
    if (fs.existsSync(projectMemoryPath)) {
      try {
        const memoryContent = fs.readFileSync(projectMemoryPath, 'utf8').trim();
        if (memoryContent) {
          projectMemorySection = `\n\n### PROJECT MEMORY & ARCHITECTURE PERSISTENCE:\n${memoryContent}`;
        }
      } catch (e) {
        console.warn('Failed to read project-memory.json', e);
      }
    }
  }

  // 4. Agent Memory (via AgentMemoryService)
  let memorySection = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AgentMemoryService } = require('../services/agent-memory-service');
    const memory = AgentMemoryService.getInstance();
    const contextStr = memory.getContextString();
    if (contextStr) {
      memorySection = `\n\n${contextStr}`;
    }
  } catch {
    // Fallback: read memory.json directly
    if (workspaceFolder) {
      const memoryPath = path.join(workspaceFolder, '.mirror-vs', 'memory.json');
      if (fs.existsSync(memoryPath)) {
        try {
          const memoryContent = fs.readFileSync(memoryPath, 'utf8').trim();
          if (memoryContent) {
            memorySection = `\n\n### AGENT MEMORY & SESSION CONTEXT:\n${memoryContent}`;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  // 5. Specialized Agent Mode Instructions (Prompt Modularization)
  let modeSection = getModeInstructions(taskMode);
  const activeMode = config.get<string>('agentMode', 'normal');
  if (activeMode === 'refactor') {
    modeSection += `\n\n### REFACTOR METHODOLOGY\nIdentify structural patterns, extract modular components, migrate APIs, and explain your changes clearly.`;
  } else if (activeMode === 'debug') {
    modeSection += `\n\n### DEBUG METHODOLOGY\nYou are attached to the VS Code debugger to trace errors, read logs, and inspect runtime code states. Use debug tools to identify bugs and resolve them.`;
  }

  // 6. Dynamic Skills Integration
  let skillsSection = '';
  const activeSkills: string[] = [];
  const lowerOwner = featureOwner.toLowerCase();

  if (activeMode === 'debug' || agentState === 'VERIFICATION') {
    activeSkills.push(getDebugSkill());
  }
  if (lowerOwner.includes('ui') || lowerOwner.includes('react') || lowerOwner.includes('frontend')) {
    activeSkills.push(getReactSkill());
  }
  if (lowerOwner.includes('backend') || lowerOwner.includes('api') || lowerOwner.includes('server')) {
    activeSkills.push(getBackendSkill());
  }
  if (activeMode === 'refactor') {
    activeSkills.push(getRefactorSkill());
  }

  if (activeSkills.length > 0) {
    skillsSection = `\n\n### TASK-SPECIFIC SKILLS:\n` + activeSkills.join('\n\n');
  }

  let finalSpecs = toolSpecs;
  let guideOnlyPrompt = '';
  if (detectGuideOnly(userRequest)) {
    finalSpecs = '';
    guideOnlyPrompt = `\n\n${GUIDE_ONLY_DIRECTIVE}`;
  } else {
    const activeToolsSet = new Set([
      'read_file',
      'create_file',
      'write_file',
      'patch_file',
      'multi_patch_file',
      'list_dir',
      'grep_search',
      'semantic_search',
      'web_search',
      'get_diagnostics',
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_evaluate_script',
      'analyze_project',
      'analyze_dependencies',
      'analyze_complexity',
      'analyze_coverage',
      'analyze_dead_code',
      'analyze_impact',
      'graphify',
      'wait',
      'browser_screenshot',
      'run_command',
      'send_terminal_input',
      'close_terminal',
      'read_terminal',
      'list_terminals',
      'figma_inspect',
      'update_agent_memory',
    ]);
    const prunedToolsSet = getToolsForQuery(userRequest, activeToolsSet);
    const domainRules = domainRulesForTools(prunedToolsSet);
    const prunedSpecs = pruneToolSpecsText(toolSpecs, prunedToolsSet);
    if (domainRules) {
      finalSpecs = `${domainRules}\n\n${prunedSpecs}`;
    } else {
      finalSpecs = prunedSpecs;
    }
  }

  const securityPolicy = `\n\n### SECURITY ENFORCEMENT:\n${UNTRUSTED_CONTEXT_POLICY}`;

  return `${customPrefixSection}${baseRole}${guideOnlyPrompt}${planStatusContext}${modeSection}${skillsSection}\n\n${finalSpecs}${securityPolicy}\n\nENVIRONMENT: ${getShellEnvDescription()}${terminalContext}${workspaceContext}${rulesSection}${projectMemorySection}${memorySection}`;
}

function getShellEnvDescription(): string {
  if (process.platform === 'win32') {
    return 'This is a WINDOWS machine running PowerShell.';
  }
  return 'This is a macOS/Linux machine running bash/zsh.';
}

export function hasActionPlanningIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    /\bi'll start by\b/,
    /\bi will start by\b/,
    /\blet's start by\b/,
    /\blet me start by\b/,
    /\bfirst, i will\b/,
    /\bfirst, let's\b/,
    /\bfirst, let me\b/,
    /\bfirst, i need to\b/,
    /\bi will need to\b/,
    /\bi'll need to\b/,
    /\bi need to\b/,
    /\bi'm going to\b/,
    /\bi will analyze\b/,
    /\bi'll analyze\b/,
    /\bi will search\b/,
    /\bi'll search\b/,
    /\bi will read\b/,
    /\bi'll read\b/,
    /\bi will run\b/,
    /\bi'll run\b/,
    /\bi will check\b/,
    /\bi'll check\b/,
  ];
  return patterns.some((p) => p.test(lower));
}

export function hasDeclaredPlan(history: ChatMessage[], currentResponse: string): boolean {
  const planTagRegex = /<implementation_plan>([\s\S]*?)<\/implementation_plan>/i;
  if (planTagRegex.test(currentResponse)) return true;
  return history.some((msg) => msg.role === 'assistant' && planTagRegex.test(msg.content));
}

export function getDiagnosticsForFile(filePath: string): string {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return '';

    const workspaceRoot = folders[0].uri.fsPath;
    const allDiagnostics = vscode.languages.getDiagnostics();
    const relativeTarget = path.isAbsolute(filePath)
      ? path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
      : filePath.replace(/\\/g, '/');

    const fileDiags: string[] = [];

    for (const [uri, diags] of allDiagnostics) {
      const relPath = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');
      if (relPath !== relativeTarget) continue;

      for (const d of diags) {
        if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
        const severity = d.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
        fileDiags.push(`- Line ${d.range.start.line + 1}: [${severity}] ${d.message} (${d.source || 'linter'})`);
      }
    }

    if (fileDiags.length === 0) {
      return `\n[Grounding Observation]: VS Code reports 0 errors and 0 warnings in this file. build is clean!`;
    }

    return `\n[Grounding Warning - Code issues detected after patch]:\n${fileDiags.join('\n')}\n*Please fix these compiler/syntax errors in your next turn!*`;
  } catch (e) {
    return '';
  }
}

export function pruneToolSpecsText(specs: string, activeTools: Set<string>): string {
  if (specs.includes('### 🛠️ QUICK TOOL CHEATSHEET')) {
    const lines = specs.split('\n');
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        const match = trimmed.match(/^-\s*([a-z0-9_]+)/i);
        if (match) {
          const tool = match[1];
          if (tool.startsWith('browser_')) {
            return activeTools.has('browser_navigate') || activeTools.has('browser_screenshot');
          }
          if (tool.includes('terminal')) {
            return activeTools.has('run_command') || activeTools.has('read_terminal');
          }
          return activeTools.has(tool);
        }
      }
      return true;
    });
    return filtered.join('\n');
  }

  // First turn: filter lists of available tools
  const lines = specs.split('\n');
  let filtered = [];
  let skipCurrentTool = false;
  let inAvailableToolsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### 🧰 AVAILABLE TOOLS')) {
      inAvailableToolsSection = true;
    }

    if (inAvailableToolsSection) {
      const toolStartMatch = trimmed.match(/^\d+\.\s+([A-Z_]+)(?:\s+\(.*?\))?:/i);
      if (toolStartMatch) {
        const toolName = toolStartMatch[1].toLowerCase().replace(/\s+/g, '_');
        if (
          toolName === 'read_file' ||
          toolName === 'create_file' ||
          toolName === 'write_file' ||
          toolName === 'patch_file' ||
          toolName === 'multi_patch_file' ||
          toolName === 'list_directory' ||
          toolName === 'grep_search'
        ) {
          // Keep core file/search tools
          skipCurrentTool = false;
        } else {
          // Maps title to tool policy names
          let actualName = toolName;
          if (toolName === 'list_directory') actualName = 'list_dir';
          if (toolName === 'codebase_analysis') actualName = 'analyze_project';

          if (actualName === 'browser_navigate') {
            skipCurrentTool = !activeTools.has('browser_navigate') && !activeTools.has('browser_screenshot');
          } else if (actualName === 'debugger_controls') {
            skipCurrentTool = !activeTools.has('debug_inspect_variables');
          } else {
            // Check if any tool in DOMAIN_TOOL_MAP starts with or matches
            skipCurrentTool = !activeTools.has(actualName) && ![...activeTools].some((t) => t.startsWith(actualName));
          }
        }
      }
    }

    if (!skipCurrentTool) {
      filtered.push(line);
    }
  }

  return filtered.join('\n');
}
