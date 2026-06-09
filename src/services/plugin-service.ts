/**
 * Plugin Service — allows registering custom agent tools via VS Code extension API.
 * Third-party extensions can contribute tools via the "mirror-vs.tools" contribution point.
 * Also supports user-defined tools registered at runtime.
 */
import * as vscode from 'vscode';
import { ToolCall } from '../agent/types';

export interface ToolPlugin {
  name: string;
  description: string;
  parameters: {
    name: string;
    description: string;
    required: boolean;
    type: 'string' | 'number' | 'boolean';
  }[];
  execute: (params: Record<string, any>, context: ToolExecutionContext) => Promise<string>;
}

export interface ToolExecutionContext {
  workspaceFolder: string;
  getSafePath: (p: string) => string;
  postMessage: (msg: any) => void;
}

export interface ToolContribution {
  name: string;
  title: string;
  description: string;
  parameters?: {
    name: string;
    description: string;
    required?: boolean;
    type?: string;
  }[];
}

export class PluginService {
  private static instance: PluginService;
  private _plugins: Map<string, ToolPlugin> = new Map();
  private _contributedTools: ToolContribution[] = [];

  static getInstance(): PluginService {
    if (!PluginService.instance) {
      PluginService.instance = new PluginService();
    }
    return PluginService.instance;
  }

  /**
   * Register a tool plugin at runtime (called by extensions or internally).
   */
  registerPlugin(plugin: ToolPlugin): void {
    if (this._plugins.has(plugin.name)) {
      console.warn(`Mirror VS: Tool plugin "${plugin.name}" already registered. Overwriting.`);
    }
    this._plugins.set(plugin.name, plugin);
    console.log(`Mirror VS: Registered tool plugin "${plugin.name}"`);
  }

  /**
   * Unregister a tool plugin.
   */
  unregisterPlugin(name: string): boolean {
    return this._plugins.delete(name);
  }

  /**
   * Get all registered plugins.
   */
  getPlugins(): ToolPlugin[] {
    return [...this._plugins.values()];
  }

  /**
   * Get a specific plugin by name.
   */
  getPlugin(name: string): ToolPlugin | undefined {
    return this._plugins.get(name);
  }

  /**
   * Execute a plugin tool.
   */
  async executePlugin(
    tool: ToolCall,
    context: ToolExecutionContext,
  ): Promise<string> {
    const plugin = this._plugins.get(tool.name);
    if (!plugin) {
      return `Error: Unknown plugin tool "${tool.name}". Available plugins: ${[...this._plugins.keys()].join(', ') || 'none'}`;
    }
    try {
      return await plugin.execute(tool as unknown as Record<string, any>, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error executing plugin "${tool.name}": ${message}`;
    }
  }

  /**
   * Add contributed tools from extensions (called during activation).
   */
  addContributedTools(tools: ToolContribution[]): void {
    this._contributedTools.push(...tools);
  }

  /**
   * Get all contributed tool definitions (for system prompt generation).
   */
  getContributedToolDefinitions(): ToolContribution[] {
    return [
      ...this._contributedTools,
      ...this.getPlugins().map((p) => ({
        name: p.name,
        title: p.name,
        description: p.description,
        parameters: p.parameters.map((param) => ({
          name: param.name,
          description: param.description,
          required: param.required,
          type: param.type,
        })),
      })),
    ];
  }

  /**
   * Generate the tools section for the system prompt.
   */
  getPluginPromptSnippet(): string {
    const plugins = this.getPlugins();
    if (plugins.length === 0) return '';

    let snippet = '\n## 🧩 External Tool Plugins\n';
    snippet += 'You have access to these additional tools registered by extensions or the user:\n\n';

    for (const plugin of plugins) {
      snippet += `- **${plugin.name}**: ${plugin.description}\n`;
      if (plugin.parameters.length > 0) {
        snippet += '  Parameters:\n';
        for (const param of plugin.parameters) {
          const req = param.required ? ' (required)' : ' (optional)';
          snippet += `    - \`${param.name}\` (${param.type})${req}: ${param.description}\n`;
        }
      }
    }
    snippet += '\nUsage: <plugin_name param1="value1" param2="value2" />\n';
    return snippet;
  }

  /**
   * Check if a tool name belongs to a registered plugin.
   */
  isPluginTool(name: string): boolean {
    return this._plugins.has(name);
  }
}
