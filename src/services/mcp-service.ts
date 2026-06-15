/**
 * MCP (Model Context Protocol) Service — enables dynamic tool discovery
 * and execution from local MCP servers. Adapted from Roo Code's MCP infrastructure.
 *
 * Supports:
 * - stdio-based MCP servers (local processes)
 * - Tool discovery via tools/list
 * - Tool execution via tools/call
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  parameters?: object;
  serverName: string;
}

interface McpResponse {
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

interface McpListToolsResponse {
  tools?: {
    name: string;
    description?: string;
    inputSchema?: object;
  }[];
}

export class McpService {
  private static instance: McpService;
  private servers: Map<string, McpServerConfig> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private discoveredTools: Map<string, McpTool[]> = new Map();
  private nextRequestId = 1;
  private readonly requestTimeoutMs = 30000;

  private constructor() {
    this.loadConfig();
  }

  static getInstance(): McpService {
    if (!McpService.instance) {
      McpService.instance = new McpService();
    }
    return McpService.instance;
  }

  /**
   * Load MCP server configurations from VS Code settings.
   */
  private loadConfig(): void {
    const config = vscode.workspace.getConfiguration('mirror-vs');
    const servers = config.get<McpServerConfig[]>('mcpServers') || [];

    for (const server of servers) {
      if (!server.disabled) {
        this.servers.set(server.name, server);
      }
    }
  }

  /**
   * Add or update a server configuration at runtime.
   */
  addServer(config: McpServerConfig): void {
    this.servers.set(config.name, config);
    this.discoveredTools.delete(config.name);
  }

  /**
   * Remove a server configuration.
   */
  removeServer(name: string): void {
    this.servers.delete(name);
    this.discoveredTools.delete(name);
    this.killServerProcess(name);
  }

  /**
   * Get all registered server names.
   */
  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Start an MCP server and discover its tools.
   */
  async discoverTools(serverName: string): Promise<McpTool[]> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server '${serverName}' not configured.`);
    }

    // Check cache first
    const cached = this.discoveredTools.get(serverName);
    if (cached) {
      return cached;
    }

    const workerDir = server.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    const process = spawn(server.command, server.args || [], {
      cwd: workerDir,
      env: { ...process.env, ...server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.activeProcesses.set(serverName, process);

    let buffer = '';
    const tools: McpTool[] = [];

    try {
      // Send tools/list request
      const requestId = this.nextRequestId++;
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/list',
        params: {},
      });

      process.stdin?.write(request + '\n');

      // Read response
      const response = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`MCP server '${serverName}' timed out during tool discovery.`));
        }, this.requestTimeoutMs);

        process.stdout?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          try {
            // Try to parse complete JSON-RPC message
            const lines = buffer.split('\n');
            for (const line of lines) {
              const parsed = JSON.parse(line.trim()) as McpResponse;
              if (parsed.id === requestId) {
                clearTimeout(timeout);
                resolve(line.trim());
              }
            }
          } catch {
            // Incomplete JSON, wait for more data
          }
        });

        process.on('error', (err) => {
          clearTimeout(timeout);
          reject(new Error(`MCP server '${serverName}' process error: ${err.message}`));
        });

        process.on('exit', (code) => {
          clearTimeout(timeout);
          if (code !== 0 && code !== null) {
            reject(new Error(`MCP server '${serverName}' exited with code ${code}`));
          }
        });
      });

      const result = JSON.parse(response) as McpResponse;
      if (result.error) {
        throw new Error(`MCP error from '${serverName}': ${result.error.message}`);
      }

      const toolsList = result.result as McpListToolsResponse;
      if (toolsList.tools && Array.isArray(toolsList.tools)) {
        for (const tool of toolsList.tools) {
          tools.push({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            serverName: serverName,
          });
        }
      }
    } catch (error) {
      this.killServerProcess(serverName);
      throw error;
    }

    this.discoveredTools.set(serverName, tools);
    return tools;
  }

  /**
   * Execute an MCP tool by server name and tool name.
   */
  async executeTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<string> {
    const server = this.servers.get(serverName);
    if (!server) {
      return `Error: MCP server '${serverName}' not configured.`;
    }

    // Ensure process is running
    let process = this.activeProcesses.get(serverName);
    if (!process || process.exitCode !== null) {
      // Restart the process
      await this.discoverTools(serverName);
      process = this.activeProcesses.get(serverName);
    }

    if (!process || !process.stdout || !process.stdin) {
      return `Error: Cannot communicate with MCP server '${serverName}'.`;
    }

    const requestId = this.nextRequestId++;
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    });

    let buffer = '';

    try {
      process.stdin.write(request + '\n');

      const responseStr = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`MCP tool '${toolName}' timed out.`));
        }, this.requestTimeoutMs);

        const onData = (chunk: Buffer) => {
          buffer += chunk.toString();
          try {
            const parsed = JSON.parse(buffer.trim()) as McpResponse;
            if (parsed.id === requestId) {
              clearTimeout(timeout);
              process.stdout?.removeListener('data', onData);
              resolve(buffer.trim());
            }
          } catch {
            // Wait for complete JSON
          }
        };

        process.stdout?.on('data', onData);

        process.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      const result = JSON.parse(responseStr) as McpResponse;
      if (result.error) {
        return `MCP tool error: ${result.error.message}`;
      }

      // Return the content as string
      const content = result.result?.content;
      if (Array.isArray(content)) {
        return content
          .map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c)))
          .join('\n');
      }
      return JSON.stringify(result.result, null, 2);
    } catch (error: any) {
      return `Error executing MCP tool '${toolName}': ${error.message}`;
    }
  }

  /**
   * Get all discovered tools across all servers.
   */
  async getAllTools(): Promise<McpTool[]> {
    const allTools: McpTool[] = [];
    for (const serverName of this.servers.keys()) {
      try {
        const tools = await this.discoverTools(serverName);
        allTools.push(...tools);
      } catch (error) {
        console.warn(`Failed to discover tools from MCP server '${serverName}':`, error);
      }
    }
    return allTools;
  }

  /**
   * Get a specific tool by its fully-qualified name (server__tool).
   */
  async getTool(qualifiedName: string): Promise<McpTool | undefined> {
    const [serverName, ...toolParts] = qualifiedName.split('__');
    const toolName = toolParts.join('__');
    if (!serverName || !toolName) return undefined;

    const tools = await this.discoverTools(serverName);
    return tools.find((t) => t.name === toolName);
  }

  /**
   * Kill the process for a specific server.
   */
  killServerProcess(serverName: string): void {
    const process = this.activeProcesses.get(serverName);
    if (process) {
      try {
        process.stdin?.end();
        process.stdout?.destroy();
        process.stderr?.destroy();
        process.kill();
      } catch {
        // Process may already be dead
      }
      this.activeProcesses.delete(serverName);
    }
  }

  /**
   * Kills all active MCP server processes.
   */
  dispose(): void {
    for (const [name] of this.activeProcesses) {
      this.killServerProcess(name);
    }
    this.activeProcesses.clear();
  }
}
