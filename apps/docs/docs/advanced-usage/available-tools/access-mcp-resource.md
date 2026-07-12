---
description: Learn how the access_mcp_resource tool retrieves data from Model Context Protocol servers for additional context in Mirror VS tasks.
keywords:
    - access_mcp_resource
    - MCP
    - Model Context Protocol
    - MCP resources
    - Mirror VS tools
    - context retrieval
    - API integration
---

# `access_mcp_resource` — Fetching Data from MCP Servers

Think of [`access_mcp_resource`](access-mcp-resource.md) as Mirror VS's library card for MCP servers. When the AI needs data from an external system — API docs, database schemas, weather data, you name it — this tool reaches out to connected MCP servers and brings back exactly what's needed.

## Parameters

| Parameter     | Type     | Required | Description                                     |
| ------------- | -------- | -------- | ----------------------------------------------- |
| `server_name` | `string` | ✅       | Name of the MCP server providing the resource   |
| `uri`         | `string` | ✅       | URI identifying the specific resource to access |

## What It Does

This tool connects to MCP servers and fetches data from their exposed resources. Unlike [`use_mcp_tool`](use-mcp-tool.md) which executes actions, this tool specifically retrieves **information** — think of it as reading vs. writing. Files, API responses, documentation, system info — if an MCP server exposes it as a resource, this tool can fetch it.

## When Is It Used?

- When Mirror VS needs additional context from external systems
- When accessing domain-specific data from specialized MCP servers
- When retrieving reference documentation hosted by MCP servers
- When integrating real-time data from external APIs via MCP

## Key Features

- **Text & image retrieval** — Can fetch both text content and image data
- **URI-based addressing** — Pinpoint exactly what you need with specific URIs
- **User approval** — Every resource access requires your okay before proceeding
- **Timeout support** — Configurable timeouts for reliable network operations
- **Server state handling** — Gracefully handles connected, connecting, and disconnected servers
- **Resource discovery** — Can discover what resources are available from connected servers

## Limitations

- Depends on external MCP servers being available and connected
- Limited to the resources provided by connected servers
- Cannot access resources from disabled servers
- Network issues can affect reliability
- URI formats are determined by the specific MCP server implementation
- No offline or cached resource access

## How It Works

1. **Connection Validation** — Verifies the MCP hub is available, the named server exists, and it's not disabled
2. **User Approval** — Presents the resource access request (server name + URI) for your approval
3. **Resource Request** — Sends a `resources/read` request to the server through the MCP hub using the Model Context Protocol SDK
4. **Response Processing** — Receives structured response with metadata and content arrays, processes text and image data appropriately

### Resource Types

MCP servers provide two types of resources:

**Standard Resources**: Fixed resources with specific URIs — static data, real-time information, or well-known endpoints. Direct access without parameters.

**Resource Templates**: Parameterized resources with placeholder values in URIs — think "query endpoints" that accept parameters for dynamic results. More flexible, but require proper URI formatting.

## Usage Examples

```
<access_mcp_resource>
<server_name>weather-server</server_name>
<uri>weather://san-francisco/current</uri>
</access_mcp_resource>
```

```
<access_mcp_resource>
<server_name>api-docs</server_name>
<uri>docs://payment-service/endpoints</uri>
</access_mcp_resource>
```

```
<access_mcp_resource>
<server_name>knowledge-base</server_name>
<uri>kb://medical/terminology/common</uri>
</access_mcp_resource>
```

## Relation to Other Tools

[`access_mcp_resource`](access-mcp-resource.md) is the "read" counterpart to [`use_mcp_tool`](use-mcp-tool.md)'s "write" — one fetches data, the other executes actions. Both extend Mirror VS's capabilities through MCP servers.
