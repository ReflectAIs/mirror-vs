---
description: Discover how use_mcp_tool integrates external MCP servers to extend Mirror VS with specialized tools, domain-specific functionality, and external services.
keywords:
    - use_mcp_tool
    - MCP tools
    - Model Context Protocol
    - external tools
    - Mirror VS integration
    - MCP servers
    - domain tools
    - tool extension
    - VS Code AI
---

# `use_mcp_tool` — Plug Into the MCP Ecosystem

Think of [`use_mcp_tool`](use-mcp-tool.md) as Mirror VS's universal adapter — it lets the AI call specialized tools hosted on external MCP servers. Weather data, code analysis, image generation, database queries — if an MCP server exposes it as a tool, this is how you call it.

## Parameters

| Parameter     | Type            | Required | Description                                                                       |
| ------------- | --------------- | -------- | --------------------------------------------------------------------------------- |
| `server_name` | `string`        | ✅       | Name of the MCP server providing the tool                                         |
| `tool_name`   | `string`        | ✅       | Name of the tool to execute                                                       |
| `arguments`   | `object` (JSON) | ✅/❌    | Input parameters following the tool's schema (may be optional for no-input tools) |

## What It Does

[`use_mcp_tool`](use-mcp-tool.md) allows Mirror VS to access specialized functionality provided by external MCP servers. Each MCP server can offer multiple tools with unique capabilities, extending Mirror VS far beyond its built-in functionality. Arguments are validated against schemas, server connections are managed, and responses are processed for multiple content types.

## When Is It Used?

- When specialized functionality not available in core tools is needed
- When domain-specific operations are required
- When integration with external systems or services is needed
- When accessing proprietary tools through a standardized interface
- When working with data that requires specific processing or analysis

## Key Features

- **Standardized MCP protocol** — Uses the `@modelcontextprotocol/sdk` library for reliable communication
- **Multiple transport mechanisms** — Supports STDIO, Streamable HTTP, and SSE (legacy) transports
- **Schema validation** — Arguments are validated using Zod schemas on both client and server sides
- **Multiple response types** — Handles text, image, and resource reference responses
- **Server lifecycle management** — Automatic restarts when server code changes
- **"Always allow" list** — Bypass approval for trusted tools
- **Configurable timeouts** — 1–3600 seconds (default: 60s)

## Limitations

- Depends on external MCP servers being available and connected
- Limited to the tools provided by connected servers
- Tool capabilities vary between different MCP servers
- Network issues can affect reliability
- Requires user approval (unless in the "always allow" list)
- Cannot execute multiple MCP tool operations simultaneously

## Server Configuration

MCP servers can be configured at two levels:

**Global Configuration**: Managed through Mirror VS extension settings in VS Code. Applies across all projects unless overridden.

**Project-level Configuration**: Defined in `.mirror/mcp.json` within your project's root. Project-level servers take precedence over global servers with the same name. Since `mcp.json` can be committed to version control, it simplifies team sharing.

## How It Works

1. **Initialization & Validation** — Verifies the MCP hub is available, server exists and is connected, tool exists on the server, and arguments match the tool's schema
2. **Execution** — Selects the appropriate transport (STDIO for local, Streamable HTTP or SSE for remote), sends the request with validated parameters, and handles timeouts
3. **Response Processing** — Handles multiple content types: text, image (binary with MIME type), and resource references (URIs for use with `access_mcp_resource`)
4. **Error Handling** — Checks the `isError` flag, uses WeakRef patterns to prevent memory leaks, tracks consecutive mistakes

## Usage Examples

```
<use_mcp_tool>
<server_name>weather-server</server_name>
<tool_name>get_forecast</tool_name>
<arguments>
{
  "city": "San Francisco",
  "days": 5,
  "format": "text"
}
</arguments>
</use_mcp_tool>
```

```
<use_mcp_tool>
<server_name>code-analysis</server_name>
<tool_name>complexity_metrics</tool_name>
<arguments>
{
  "language": "typescript",
  "file_path": "src/app.ts",
  "include_functions": true,
  "metrics": ["cyclomatic", "cognitive"]
}
</arguments>
</use_mcp_tool>
```

## Security and Permissions

- Users must approve tool usage by default
- Specific tools can be marked for automatic approval ("always allow" list)
- Server configurations validated with Zod schemas for integrity
- Configurable timeouts prevent hanging operations
- Server connections can be enabled/disabled through the UI

## Relation to Other Tools

[`use_mcp_tool`](use-mcp-tool.md) and [`access_mcp_resource`](access-mcp-resource.md) are Mirror VS's MCP gateway tools — one executes actions, the other fetches data. They're how Mirror VS transcends its built-in capabilities and hooks into the broader MCP ecosystem.
