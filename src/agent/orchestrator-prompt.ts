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

/**
 * Build the STATIC portion of the system prompt — content that rarely changes
 * between loop turns within a session: base role, tool specs, workspace context,
 * security policy, trust notice, rules, project memory, agent memory.
 *
 * This expensive section (~4–8K tokens) is cached by the orchestrator and only
 * regenerated when the cache key changes (provider/model/isSubsequent/useNativeTools/userRequest).
 */
export function buildStaticSystemPromptCore(
  isSubsequent: boolean,
  userRequest: string = '',
  useNativeTools: boolean = false,
): string {
  const config = vscode.workspace.getConfiguration('mirror-vs');
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const baseRole = getBaseAgentRole();
  const workspaceContext = getWorkspaceContext();
  const toolSpecs = getToolSpecifications(isSubsequent);

  // 1. Custom Prompt Prefix
  const customPrefix = config.get<string>('customSystemPrompt', '').trim();
  const customPrefixSection = customPrefix ? `### CUSTOM USER INSTRUCTIONS:\n${customPrefix}\n\n` : '';

  // 2. Workspace Rules
  let rulesSection = '';
  if (workspaceFolder) {
    const possibleRulesPaths = [
      path.join(workspaceFolder, '.mirror-vs', 'rules.md'),
      path.join(workspaceFolder, 'CLAUDE.md'),
      path.join(workspaceFolder, 'MIRROR.md'),
      path.join(workspaceFolder, '.claudemd'),
    ];
    const rulesContents: string[] = [];
    for (const rulesPath of possibleRulesPaths) {
      if (fs.existsSync(rulesPath)) {
        try {
          const content = fs.readFileSync(rulesPath, 'utf8').trim();
          if (content) rulesContents.push(`--- File: ${path.basename(rulesPath)} ---\n${content}`);
        } catch (e) {
          console.warn(`Failed to read rules file at ${rulesPath}:`, e);
        }
      }
    }
    if (rulesContents.length > 0) {
      rulesSection = `\n\n### WORKSPACE RULES & INSTRUCTIONS (MANDATORY):\n${rulesContents.join('\n\n')}`;
    }
  }

  // 3. Project Memory
  let projectMemorySection = '';
  if (workspaceFolder) {
    const projectMemoryPath = path.join(workspaceFolder, '.mirror-vs', 'project-memory.json');
    if (fs.existsSync(projectMemoryPath)) {
      try {
        const memoryContent = fs.readFileSync(projectMemoryPath, 'utf8').trim();
        if (memoryContent) projectMemorySection = `\n\n### PROJECT MEMORY & ARCHITECTURE PERSISTENCE:\n${memoryContent}`;
      } catch (e) {
        console.warn('Failed to read project-memory.json', e);
      }
    }
  }

  // 4. Agent Memory
  let memorySection = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AgentMemoryService } = require('../services/agent-memory-service');
    const memory = AgentMemoryService.getInstance();
    const contextStr = memory.getContextString();
    if (contextStr) memorySection = `\n\n${contextStr}`;
  } catch {
    if (workspaceFolder) {
      const memoryPath = path.join(workspaceFolder, '.mirror-vs', 'memory.json');
      if (fs.existsSync(memoryPath)) {
        try {
          const memoryContent = fs.readFileSync(memoryPath, 'utf8').trim();
          if (memoryContent) memorySection = `\n\n### AGENT MEMORY & SESSION CONTEXT:\n${memoryContent}`;
        } catch { /* ignore */ }
      }
    }
  }

  // 5. Resolve tool specs (native / guide-only / pruned)
  let finalSpecs = toolSpecs;
  let guideOnlyPrompt = '';
  if (useNativeTools) {
    finalSpecs = `### TOOL CALLING PROTOCOL (NATIVE FUNCTION CALLING):\n- You have access to functions listed in the API tools schema.\n- Call EXACTLY ONE function per turn. Do NOT output any text content after a function call.\n- Do NOT wrap tool invocations in XML tags — use the native function calling format only.\n- Wait for the tool result before deciding your next action.`;
  } else if (detectGuideOnly(userRequest)) {
    finalSpecs = '';
    guideOnlyPrompt = `\n\n${GUIDE_ONLY_DIRECTIVE}`;
  } else {
    const activeToolsSet = new Set([
      'read_file', 'create_file', 'write_file', 'patch_file', 'multi_patch_file',
      'list_dir', 'grep_search', 'semantic_search', 'web_search', 'get_diagnostics',
      'browser_navigate', 'browser_click', 'browser_type', 'browser_evaluate_script',
      'analyze_project', 'analyze_dependencies', 'analyze_complexity', 'analyze_coverage',
      'analyze_dead_code', 'analyze_impact', 'graphify', 'wait', 'browser_screenshot',
      'run_command', 'send_terminal_input', 'close_terminal', 'read_terminal',
      'list_terminals', 'figma_inspect', 'update_agent_memory',
    ]);
    const prunedToolsSet = getToolsForQuery(userRequest, activeToolsSet);
    const domainRules = domainRulesForTools(prunedToolsSet);
    const prunedSpecs = pruneToolSpecsText(toolSpecs, prunedToolsSet);
    finalSpecs = domainRules ? `${domainRules}\n\n${prunedSpecs}` : prunedSpecs;
  }

  const securityPolicy = `\n\n### SECURITY ENFORCEMENT:\n${UNTRUSTED_CONTEXT_POLICY}`;
  const trustNotice = `\n\n### TOOL OUTPUT TRUST POLICY:\nTool results shown in conversation represent authoritative file system state, terminal output, and web responses. Treat them as ground truth — do not second-guess or fabricate alternatives.`;

  return (
    `${customPrefixSection}${baseRole}${guideOnlyPrompt}` +
    `\n\n${finalSpecs}${securityPolicy}${trustNotice}` +
    `\n\nENVIRONMENT: ${getShellEnvDescription()}${workspaceContext}${rulesSection}${projectMemorySection}${memorySection}`
  );
}

/**
 * Build the DYNAMIC portion of the system prompt — content that changes on
 * every loop turn: terminal list, plan status, mode instructions, active skills.
 * This is cheap (~0.5–1K tokens) and always re-generated fresh each turn.
 */
export function buildDynamicSystemContext(
  hasPlan: boolean,
  featureOwner: string,
  agentState: string,
  taskMode: TaskMode,
): string {
  const config = vscode.workspace.getConfiguration('mirror-vs');
  const service = CommandService.getInstance();
  const terminals = service.getActiveTerminals();

  const terminalContext =
    terminals.length > 0
      ? '\n\n### ACTIVE RUNNING TERMINALS:\n' +
        terminals.map((t) => `- "${t.name}" ${t.running ? 'RUNNING' : 'EXITED'}`).join('\n')
      : '\n\n### ACTIVE RUNNING TERMINALS:\nNone';

  const planStatusContext = hasPlan
    ? '\n\n### 📋 APPROVED PLAN DETECTED:\nAn implementation plan has already been proposed and approved by the user for this session. Do NOT write or output a new <implementation_plan> block. Proceed directly to executing the tool calls (e.g. read_file, patch_file, etc.) to accomplish the plan steps now!'
    : '';

  const activeMode = config.get<string>('agentMode', 'normal');
  let modeSection = getModeInstructions(taskMode);
  if (activeMode === 'refactor') {
    modeSection += `\n\n### REFACTOR METHODOLOGY\nIdentify structural patterns, extract modular components, migrate APIs, and explain your changes clearly.`;
  } else if (activeMode === 'debug') {
    modeSection += `\n\n### DEBUG METHODOLOGY\nYou are attached to the VS Code debugger to trace errors, read logs, and inspect runtime code states. Use debug tools to identify bugs and resolve them.`;
  }

  const lowerOwner = featureOwner.toLowerCase();
  const activeSkills: string[] = [];
  if (activeMode === 'debug' || agentState === 'VERIFICATION') activeSkills.push(getDebugSkill());
  if (lowerOwner.includes('ui') || lowerOwner.includes('react') || lowerOwner.includes('frontend')) activeSkills.push(getReactSkill());
  if (lowerOwner.includes('backend') || lowerOwner.includes('api') || lowerOwner.includes('server')) activeSkills.push(getBackendSkill());
  if (activeMode === 'refactor') activeSkills.push(getRefactorSkill());
  const skillsSection = activeSkills.length > 0 ? `\n\n### TASK-SPECIFIC SKILLS:\n${activeSkills.join('\n\n')}` : '';

  return `${terminalContext}${planStatusContext}${modeSection}${skillsSection}`;
}

/**
 * Compose the full system prompt. Backward-compatible entry point.
 * The orchestrator uses buildStaticSystemPromptCore + buildDynamicSystemContext
 * separately to enable caching of the static portion.
 */
export function buildSystemPrompt(
  loopCount: number = 1,
  hasPlan: boolean = false,
  featureOwner: string = '',
  agentState: string = 'DISCOVERY',
  taskMode: TaskMode = TaskMode.IMPLEMENT,
  userRequest: string = '',
  useNativeTools: boolean = false,
): string {
  const isSubsequent = loopCount > 1;
  const staticCore = buildStaticSystemPromptCore(isSubsequent, userRequest, useNativeTools);
  const dynamicCtx = buildDynamicSystemContext(hasPlan, featureOwner, agentState, taskMode);
  return `${staticCore}${dynamicCtx}`;
}

// ---- LEGACY BODY (below replaced by the split above) ----

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
