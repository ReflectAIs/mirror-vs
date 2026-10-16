# @mirror-vs/core

> Autonomous, lightweight, and completely pluggable AI agent engine. Run tailored AI agents anywhere: in **Data Analytics** pipelines, **Figma Plugins**, **Web Applications**, Edge Runtimes, or CLI tools.

---

## Why `@mirror-vs/core`?

Traditional AI agent libraries bundle dozens of hardcoded coding tools (`execute_command`, `read_file`, `write_to_file`, `git`, etc.) and system prompts designed exclusively for software engineering.

When building an AI assistant for a **Figma Plugin**, a **BI / Data Analytics dashboard**, or an **in-browser Web App**, you don't want terminal commands or file edits. You need:

1. **100% Pluggable Toolsets**: Only the tools _you_ define exist. Zero unwanted developer tools.
2. **Zero Native/VS Code Dependencies**: Runs anywhere TypeScript runs — Node.js, Next.js, Vite, Cloudflare Workers, Electron, or Figma's iframe sandbox.
3. **Dual Runtime Support**:
    - `@mirror-vs/core`: Full Node.js runtime with TypeScript dynamic tool loader & compiler.
    - `@mirror-vs/core/browser`: Ultra-lightweight, 100% in-memory browser-safe build (no `fs`, `path`, `os`, or `child_process`).
4. **Universal LLM Compatibility**: Works seamlessly with OpenAI (`gpt-4o`, `gpt-4o-mini`), Claude (via OpenRouter or LiteLLM), DeepSeek, Groq, and local models (Ollama, vLLM).

---

## Installation

```bash
# npm
npm install @mirror-vs/core @mirror-vs/types zod openai

# pnpm
pnpm add @mirror-vs/core @mirror-vs/types zod openai

# yarn
yarn add @mirror-vs/core @mirror-vs/types zod openai
```

---

## Quick Start (30 Seconds)

```typescript
import { createMirrorAgent, defineTool, z } from "@mirror-vs/core"

// 1. Define custom domain tools
const weatherTool = defineTool({
	name: "get_weather",
	description: "Get the current temperature and conditions for a city",
	parameters: z.object({
		city: z.string().describe("The city name, e.g. 'San Francisco'"),
		unit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
	}),
	async execute({ city, unit }) {
		return JSON.stringify({ city, temperature: 21, unit, condition: "Sunny" })
	},
})

// 2. Initialize your domain agent (no coding tools injected)
const agent = createMirrorAgent({
	systemPrompt: "You are a friendly personal concierge.",
	tools: [weatherTool],
	llm: {
		apiKey: process.env.OPENAI_API_KEY,
		model: "gpt-4o-mini",
	},
})

// 3. Run autonomously
const response = await agent.run("What's the weather in Tokyo?")
console.log(response.text)
```

---

## Real-World Examples

### 1. Data Analytics Agent (SQL & Pandas / DuckDB)

Build an agent that queries your data warehouse, computes statistics, and renders chart configurations for your analytics dashboard:

```typescript
import { createMirrorAgent, defineTool, z } from "@mirror-vs/core"
import { Database } from "duckdb-async" // or pg, mysql2, snowflake-sdk

interface AnalyticsContext {
	db: Database
}

// Tool 1: Query SQL database
const querySql = defineTool<any, AnalyticsContext>({
	name: "query_database",
	description: "Execute a read-only SQL query against the analytics database",
	parameters: z.object({
		sql: z.string().describe("Valid read-only SQL query (SELECT only)"),
	}),
	async execute({ sql }, ctx) {
		// Only allow SELECT statements for security
		if (!sql.trim().toLowerCase().startsWith("select")) {
			throw new Error("Only SELECT queries are allowed.")
		}
		const rows = await ctx.db.all(sql)
		return JSON.stringify(rows.slice(0, 50)) // Return sample to fit context window
	},
})

// Tool 2: Generate Chart Config
const createChart = defineTool({
	name: "generate_chart_spec",
	description: "Generate a Vega-Lite or Chart.js specification to visualize metrics",
	parameters: z.object({
		chartType: z.enum(["bar", "line", "pie", "scatter"]),
		title: z.string(),
		xKey: z.string(),
		yKey: z.string(),
	}),
	async execute(spec) {
		return JSON.stringify({ status: "chart_rendered", spec })
	},
})

// Agent setup with custom database context
const analyticsAgent = createMirrorAgent<AnalyticsContext>({
	systemPrompt: `You are an expert Data Analyst. Answer business questions by querying the database 
and proposing chart visual representations.`,
	tools: [querySql, createChart],
	context: { db: await Database.create(":memory:") },
	llm: {
		apiKey: process.env.OPENAI_API_KEY,
		model: "gpt-4o",
	},
})

const result = await analyticsAgent.run("Show our top 5 revenue-generating customer segments this quarter.")
console.log(result.text)
```

---

### 2. Figma Plugin Agent (Browser & Sandbox Safe)

Figma plugins run in a restricted browser sandbox without access to Node.js built-ins (`fs`, `child_process`). Use `@mirror-vs/core/browser`:

```typescript
// in your figma plugin code: plugin.ts
import { createMirrorAgent, defineTool, z } from "@mirror-vs/core/browser"

interface FigmaContext {
	figma: PluginAPI
}

// Tool 1: Create UI elements in the current page
const createRectangleTool = defineTool<any, FigmaContext>({
	name: "create_rectangle",
	description: "Create a rectangle on the Figma canvas",
	parameters: z.object({
		name: z.string().describe("Layer name"),
		width: z.number().default(100),
		height: z.number().default(100),
		colorHex: z
			.string()
			.regex(/^#[0-9A-Fa-f]{6}$/)
			.describe("Hex color code, e.g. #3B82F6"),
	}),
	async execute({ name, width, height, colorHex }, ctx) {
		const rect = ctx.figma.createRectangle()
		rect.name = name
		rect.resize(width, height)

		// Convert hex to Figma RGB [0..1]
		const r = parseInt(colorHex.slice(1, 3), 16) / 255
		const g = parseInt(colorHex.slice(3, 5), 16) / 255
		const b = parseInt(colorHex.slice(5, 7), 16) / 255
		rect.fills = [{ type: "SOLID", color: { r, g, b } }]

		ctx.figma.currentPage.appendChild(rect)
		return `Created rectangle '${name}' (ID: ${rect.id})`
	},
})

// Tool 2: Inspect selected layers
const getSelectionTool = defineTool<any, FigmaContext>({
	name: "get_selection",
	description: "Get information about currently selected nodes in Figma",
	parameters: z.object({}),
	async execute(_args, ctx) {
		const selection = ctx.figma.currentPage.selection
		return JSON.stringify(selection.map((node) => ({ id: node.id, name: node.name, type: node.type })))
	},
})

// Initialize Figma agent
export const figmaAgent = createMirrorAgent<FigmaContext>({
	systemPrompt: "You are a Figma design co-pilot. Help users build and structure components.",
	tools: [createRectangleTool, getSelectionTool],
	context: { figma },
	llm: {
		apiKey: "YOUR_OPENROUTER_OR_PROXY_KEY",
		baseURL: "https://your-company-api-proxy.com/v1", // Forward safely without exposing raw keys
		model: "gpt-4o",
	},
})
```

---

### 3. Web Application (Streaming & Real-Time UI)

Stream AI tokens and tool execution events directly to your React / Next.js / Vue UI:

```typescript
// app/api/chat/route.ts (Next.js App Router / Edge)
import { createMirrorAgent, defineTool, z } from "@mirror-vs/core/browser"

const crmSearchTool = defineTool({
	name: "search_customer",
	description: "Search customer profile by email",
	parameters: z.object({ email: z.string().email() }),
	async execute({ email }) {
		return JSON.stringify({ name: "Jane Doe", plan: "Enterprise", status: "Active" })
	},
})

const webAgent = createMirrorAgent({
	tools: [crmSearchTool],
	llm: { apiKey: process.env.OPENAI_API_KEY, model: "gpt-4o-mini" },
})

export async function POST(req: Request) {
	const { prompt } = await req.json()

	// Stream text deltas & tool events
	const stream = new ReadableStream({
		async start(controller) {
			for await (const chunk of webAgent.stream(prompt)) {
				if (chunk.type === "text_delta") {
					controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk.delta })}\n\n`))
				} else if (chunk.type === "tool_call") {
					controller.enqueue(
						new TextEncoder().encode(
							`data: ${JSON.stringify({ status: `Calling ${chunk.toolName}...` })}\n\n`,
						),
					)
				}
			}
			controller.close()
		},
	})

	return new Response(stream, { headers: { "Content-Type": "text/event-stream" } })
}
```

---

### 4. Dynamic Tool Swapping & Permissions

Easily swap or filter available tools on-the-fly based on tenant, user role, or UI mode:

```typescript
import { createMirrorAgent, defineTool, z } from "@mirror-vs/core"

const readOnlyTool = defineTool({
	name: "view_report",
	description: "View financial report",
	parameters: z.object({ reportId: z.string() }),
	async execute({ reportId }) {
		return `Report data for ${reportId}`
	},
})

const adminTool = defineTool({
	name: "delete_user",
	description: "Delete user account",
	parameters: z.object({ userId: z.string() }),
	async execute({ userId }) {
		return `User ${userId} deleted.`
	},
})

const agent = createMirrorAgent({
	tools: [readOnlyTool], // Start with read-only tools
})

// When an admin logs in:
if (currentUser.isAdmin) {
	agent.addTool(adminTool)
}

// Or completely replace the tool suite:
agent.setTools([
	/* new tools */
])
```

---

### 5. Using with Local LLMs (Ollama, vLLM, Groq, DeepSeek)

`@mirror-vs/core` works with any OpenAI-compatible endpoint:

```typescript
// Ollama running locally
const localAgent = createMirrorAgent({
	tools: [
		/* your tools */
	],
	llm: {
		baseURL: "http://localhost:11434/v1",
		model: "llama3.1:8b",
	},
})

// DeepSeek API
const deepseekAgent = createMirrorAgent({
	tools: [
		/* your tools */
	],
	llm: {
		apiKey: process.env.DEEPSEEK_API_KEY,
		baseURL: "https://api.deepseek.com",
		model: "deepseek-chat",
	},
})

// Groq for ultra-fast responses
const groqAgent = createMirrorAgent({
	tools: [
		/* your tools */
	],
	llm: {
		apiKey: process.env.GROQ_API_KEY,
		baseURL: "https://api.groq.com/openai/v1",
		model: "llama-3.3-70b-versatile",
	},
})
```

---

## API Reference

### `defineTool(options)`

Defines a type-safe custom tool with automatic schema validation:

```typescript
const myTool = defineTool<TArgs, TContext>({
  name: "tool_name",                       // Unique tool identifier
  description: "Tool description for LLM", // Explains to the model when/how to use it
  parameters: z.object({ ... }),           // Zod schema for input arguments
  execute: async (args, context) => { ... } // Execution handler returning string
})
```

### `createMirrorAgent(options)` / `new MirrorAgent(options)`

| Option         | Type                                     | Description                                                                                           |
| -------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `tools`        | `CustomToolDefinition[] \| ToolRegistry` | Array of domain tools or tool registry instance. Defaults to empty (no coding tools).                 |
| `systemPrompt` | `string`                                 | Base instructions for the agent's persona, domain, and behavior.                                      |
| `context`      | `TContext`                               | Default contextual object passed to tool handlers (e.g. database handle, API client, Figma instance). |
| `llm`          | `AgentLlmConfig`                         | LLM configuration (`apiKey`, `model`, `baseURL`, `fetch`, `client`).                                  |
| `maxSteps`     | `number`                                 | Maximum autonomous tool execution loops (default: `10`).                                              |
| `onToolCall`   | `(name, args) => void`                   | Lifecycle hook triggered when a tool execution starts.                                                |
| `onToolResult` | `(name, result) => void`                 | Lifecycle hook triggered when a tool execution finishes.                                              |
| `onStep`       | `(step) => void`                         | Lifecycle hook triggered after each assistant turn.                                                   |

### Agent Methods

- `agent.run(prompt, options?)`: Executes autonomous agent loop and resolves with `{ text, messages, steps, stepCount }`.
- `agent.stream(prompt, options?)`: Returns an async generator yielding `{ type, delta, toolName, toolArgs, toolResult, step, result }`.
- `agent.addTool(tool)`: Adds an additional tool to the agent.
- `agent.addTools(tools)`: Adds multiple tools.
- `agent.setTools(tools)`: Clears and replaces all active tools.
- `agent.setSystemPrompt(prompt)`: Updates system instructions.
- `agent.getTools()`: Returns all active tool definitions.

---

## License

Apache-2.0
