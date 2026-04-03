import * as vscode from 'vscode';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpServerConfig {
    name: string;
    type: 'sse' | 'stdio';
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
}

export class McpManager {
    private clients: Map<string, Client> = new Map();
    private _onToolsChanged = new vscode.EventEmitter<void>();
    public readonly onToolsChanged = this._onToolsChanged.event;

    constructor() {}

    async initialize() {
        const config = vscode.workspace.getConfiguration('mirror-code');
        const servers = config.get<Record<string, any>>('mcpServers') || {};
        const figmaToken = config.get<string>('figmaAccessToken');

        // Add Figma as a default SSE server if token is present
        if (figmaToken && !servers['figma']) {
            try {
                await this.connectServer('figma', {
                    name: 'figma',
                    type: 'sse',
                    url: 'http://127.0.0.1:3845/sse'
                });
            } catch (e) {
                console.warn(`[MCP] Figma default connection failed (ensure Figma Desktop is running with Dev Mode): ${e.message}`);
            }
        }

        for (const [name, server] of Object.entries(servers)) {
            try {
                await this.connectServer(name, server as McpServerConfig);
            } catch (e) {
                console.error(`Failed to connect to MCP server ${name}:`, e);
            }
        }
    }

    async connectServer(name: string, config: McpServerConfig) {
        let transport;
        if (config.type === 'sse') {
            if (!config.url) throw new Error(`Missing URL for SSE server: ${name}`);
            transport = new SSEClientTransport(new URL(config.url));
        } else {
            if (!config.command) throw new Error(`Missing command for Stdio server: ${name}`);
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...config.env }
            });
        }

        const client = new Client(
            { name: "mirror-code-client", version: "0.1.0" },
            { capabilities: {} }
        );

        await client.connect(transport);
        this.clients.set(name, client);
        this._onToolsChanged.fire();
        return client;
    }

    async getAllTools() {
        const allTools: any[] = [];
        for (const [serverName, client] of this.clients.entries()) {
            try {
                const result = await client.listTools();
                const toolsWithName = result.tools.map(t => ({
                    ...t,
                    name: `mcp_${serverName}_${t.name}`,
                    originalName: t.name,
                    serverName
                }));
                allTools.push(...toolsWithName);
            } catch (e) {
                console.error(`Failed to list tools for ${serverName}:`, e);
            }
        }
        return allTools;
    }

    async callTool(serverName: string, toolName: string, args: any) {
        const client = this.clients.get(serverName);
        if (!client) throw new Error(`Server ${serverName} not connected.`);
        return await client.callTool({
            name: toolName,
            arguments: args
        });
    }

    dispose() {
        for (const client of this.clients.values()) {
            client.close();
        }
        this.clients.clear();
    }
}
