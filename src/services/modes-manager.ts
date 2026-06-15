/**
 * Custom Modes Manager — allows users to define custom agent modes with tool restrictions,
 * system prompts, and configuration overrides.
 * Adapted from Roo Code's CustomModesManager.
 */

import * as vscode from 'vscode';

export interface AgentMode {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  disabledTools: string[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  isBuiltIn: boolean;
}

const BUILT_IN_MODES: AgentMode[] = [
  {
    id: 'architect',
    name: 'Architect',
    description: 'High-level system design and architecture planning. Read-only tools + analysis.',
    systemPrompt:
      'You are an ARCHITECT mode agent. Focus on system design, architecture patterns, and high-level planning.\n' +
      'Read and analyze code extensively. Do not write or modify any files.\n' +
      'Provide clear architectural recommendations, diagram descriptions, and trade-off analyses.',
    allowedTools: [
      'read_file',
      'list_dir',
      'grep_search',
      'semantic_search',
      'graphify',
      'analyze_project',
      'analyze_dependencies',
      'analyze_complexity',
      'web_search',
      'get_diagnostics',
      'figma_inspect',
    ],
    disabledTools: [],
    isBuiltIn: true,
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Deep code review and quality analysis. Read-only, no file changes.',
    systemPrompt:
      'You are a CODE REVIEWER mode agent. Review code for bugs, security issues, performance problems, and style violations.\n' +
      'Focus on: correctness, security, performance, maintainability, and best practices.\n' +
      'Do not modify any files. Provide specific, actionable feedback with line references.',
    allowedTools: [
      'read_file',
      'list_dir',
      'grep_search',
      'semantic_search',
      'git_diff',
      'git_status',
      'get_diagnostics',
      'analyze_project',
      'analyze_dependencies',
      'analyze_complexity',
      'analyze_impact',
      'graphify',
    ],
    disabledTools: [],
    isBuiltIn: true,
  },
  {
    id: 'debugger',
    name: 'Debugger',
    description: 'Focus on debugging and root cause analysis. Can run commands and use debugger.',
    systemPrompt:
      'You are a DEBUGGER mode agent. Your goal is to find and diagnose bugs efficiently.\n' +
      'Use evidence-driven debugging: gather data before forming theories.\n' +
      'You can read files, run commands, use the debugger, and search code.\n' +
      'Do not modify files unless the user explicitly asks you to fix a confirmed bug.',
    allowedTools: [
      'read_file',
      'list_dir',
      'grep_search',
      'semantic_search',
      'run_command',
      'get_diagnostics',
      'debug_get_sessions',
      'debug_get_breakpoints',
      'debug_add_breakpoint',
      'debug_remove_breakpoint',
      'debug_inspect_variables',
      'git_status',
      'git_diff',
      'web_search',
    ],
    disabledTools: [],
    isBuiltIn: true,
  },
  {
    id: 'doc-writer',
    name: 'Doc Writer',
    description: 'Generate documentation, READMEs, and code comments.',
    systemPrompt:
      'You are a DOCUMENTATION mode agent. Write clear, accurate documentation for code.\n' +
      'You can read files and the project structure, but should only create or modify documentation files.\n' +
      'Generate: READMEs, API docs, inline comments, architecture docs, and changelog entries.',
    allowedTools: [
      'read_file',
      'list_dir',
      'grep_search',
      'semantic_search',
      'create_file',
      'write_file',
      'patch_file',
      'multi_patch_file',
      'graphify',
      'analyze_project',
    ],
    disabledTools: [
      'delete_file',
      'rename_file',
      'run_command',
      'git_commit',
      'git_add',
      'browser_navigate',
    ],
    isBuiltIn: true,
  },
  {
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Write unit tests, integration tests, and test fixtures.',
    systemPrompt:
      'You are a TEST WRITER mode agent. Write comprehensive tests for code.\n' +
      'Focus on: coverage, edge cases, regression tests, and proper mocking.\n' +
      'Read the source code, understand the interfaces, then write tests.\n' +
      'You can create and modify test files only.',
    allowedTools: [
      'read_file',
      'list_dir',
      'grep_search',
      'semantic_search',
      'create_file',
      'write_file',
      'patch_file',
      'multi_patch_file',
      'run_command',
      'get_diagnostics',
      'analyze_coverage',
      'graphify',
    ],
    disabledTools: [
      'delete_file',
      'rename_file',
      'git_commit',
      'git_add',
    ],
    isBuiltIn: true,
  },
];

export class ModesManager {
  private static instance: ModesManager;
  private customModes: Map<string, AgentMode> = new Map();
  private activeModeId: string = 'default';

  private constructor() {
    this.loadCustomModes();
  }

  static getInstance(): ModesManager {
    if (!ModesManager.instance) {
      ModesManager.instance = new ModesManager();
    }
    return ModesManager.instance;
  }

  get activeMode(): AgentMode | undefined {
    if (this.activeModeId === 'default') return undefined;
    return this.getMode(this.activeModeId);
  }

  setActiveMode(modeId: string): void {
    this.activeModeId = modeId;
  }

  /**
   * Get all available modes (built-in + custom).
   */
  getAllModes(): AgentMode[] {
    return [...BUILT_IN_MODES, ...this.customModes.values()];
  }

  /**
   * Get a specific mode by ID.
   */
  getMode(id: string): AgentMode | undefined {
    const builtIn = BUILT_IN_MODES.find((m) => m.id === id);
    if (builtIn) return builtIn;
    return this.customModes.get(id);
  }

  /**
   * Get the allowed tools for a mode. Returns empty array = all tools allowed.
   */
  getModeAllowedTools(modeId: string): string[] {
    const mode = this.getMode(modeId);
    if (!mode || modeId === 'default') return [];
    return mode.allowedTools;
  }

  /**
   * Get the disabled tools for a mode.
   */
  getModeDisabledTools(modeId: string): string[] {
    const mode = this.getMode(modeId);
    if (!mode || modeId === 'default') return [];
    return mode.disabledTools;
  }

  /**
   * Get the system prompt override for a mode.
   */
  getModeSystemPrompt(modeId: string): string | undefined {
    if (modeId === 'default') return undefined;
    return this.getMode(modeId)?.systemPrompt;
  }

  /**
   * Register a custom mode from user configuration.
   */
  registerCustomMode(mode: AgentMode): void {
    mode.isBuiltIn = false;
    this.customModes.set(mode.id, mode);
  }

  /**
   * Remove a custom mode.
   */
  removeCustomMode(id: string): void {
    this.customModes.delete(id);
  }

  /**
   * Load custom modes from VS Code settings.
   */
  private loadCustomModes(): void {
    const config = vscode.workspace.getConfiguration('mirror-vs');
    const customModes = config.get<AgentMode[]>('customModes') || [];
    for (const mode of customModes) {
      if (mode.id && mode.name) {
        this.customModes.set(mode.id, {
          ...mode,
          isBuiltIn: false,
          allowedTools: mode.allowedTools || [],
          disabledTools: mode.disabledTools || [],
        });
      }
    }
  }

  /**
   * Save custom modes to VS Code settings.
   */
  async saveCustomModes(): Promise<void> {
    const config = vscode.workspace.getConfiguration('mirror-vs');
    const modes = Array.from(this.customModes.values()).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      systemPrompt: m.systemPrompt,
      allowedTools: m.allowedTools,
      disabledTools: m.disabledTools,
      temperature: m.temperature,
      maxTokens: m.maxTokens,
      model: m.model,
    }));
    await config.update('customModes', modes, vscode.ConfigurationTarget.Global);
  }
}
