<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=dipeshmajithia.mirror-vs"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/DipeshMajithia/mirror-vs"><img src="https://img.shields.io/badge/Open_VSX-9146FF?style=flat&logo=open-vsx&logoColor=white" alt="Open VSX"></a>
</p>

<h1 align="center">Mirror VS</h1>

<p align="center">
  <strong>Your AI pair programmer.</strong>
</p>

<p align="center">
  Code, architect, debug, and ask questions naturally. Mirror VS adapts to how <em>you</em> work.
</p>

<details>
  <summary>🌐 Available languages</summary>

- [English](README.md)
- [Català](locales/ca/README.md)
- [Deutsch](locales/de/README.md)
- [Español](locales/es/README.md)
- [Français](locales/fr/README.md)
- [हिंदी](locales/hi/README.md)
- [Bahasa Indonesia](locales/id/README.md)
- [Italiano](locales/it/README.md)
- [日本語](locales/ja/README.md)
- [한국어](locales/ko/README.md)
- [Nederlands](locales/nl/README.md)
- [Polski](locales/pl/README.md)
- [Português (BR)](locales/pt-BR/README.md)
- [Русский](locales/ru/README.md)
- [Türkçe](locales/tr/README.md)
- [Tiếng Việt](locales/vi/README.md)
- [简体中文](locales/zh-CN/README.md)
- [繁體中文](locales/zh-TW/README.md)
- ...
      </details>

---

## What is Mirror VS?

Mirror VS is your AI-powered development sidekick. Think of it as a brilliant collaborator who never sleeps — ready to write code, plan architectures, squish bugs, answer questions, or automate the boring stuff. All without leaving your editor.

Whether you're spinning up a new project, refactoring a gnarly codebase, or trying to understand why that test won't pass, Mirror VS has your back.

> 📖 Full documentation at **[reflectai.in](https://www.reflectai.in/)**

---

## What can it do?

- **Write code** from plain English descriptions and specs
- **Architect systems** — plan migrations, design APIs, document decisions
- **Refactor and debug** existing code with surgical precision
- **Answer questions** about your codebase instantly
- **Automate repetitive tasks** so you can focus on what matters
- **Connect to MCP servers** for extended superpowers
- **Index your codebase** for context-aware file suggestions and semantic search
- **Manage tasks** with structured todo lists, checkpoints, and subtask delegation

---

## Modes for every moment

Mirror VS adjusts its behavior to match what you need:

| Mode                  | What it's for                                              |
| --------------------- | ---------------------------------------------------------- |
| **💻 Code**           | Day-to-day coding, edits, file operations                  |
| **🏗️ Architect**      | Systems design, specs, migrations, planning                |
| **❓ Ask**            | Quick answers, explanations, documentation                 |
| **🪲 Debug**          | Tracing issues, adding logs, finding root causes           |
| **🪃 Orchestrator**   | Complex multi-step workflows with subtask delegation       |
| **🌐 Browser Tester** | Web UI testing and browser automation                      |
| **🔧 Issue Fixer**    | Fix bugs and implement features from GitHub issues         |
| **🛠️ PR Fixer**       | Address PR feedback, resolve conflicts                     |
| **✨ Custom Modes**   | Build your own — tailor Mirror VS to your team or workflow |

Each mode remembers its own model selection, so you can assign different models per mode (e.g., Gemini for architecting, Claude for coding) — and Mirror VS switches automatically when you change modes.

> 🔗 [Full guide to using modes](apps/docs/docs/basic-usage/using-modes.md)

---

## Getting started

### 1. Install

[Install from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=dipeshmajithia.mirror-vs) or [Open VSX](https://open-vsx.org/extension/DipeshMajithia/mirror-vs).

### 2. Connect an AI provider

Mirror VS supports multiple providers. On first launch, the **onboarding wizard** will guide you through choosing and configuring one:

| Provider                          | Recommended for                                    | Models                    |
| --------------------------------- | -------------------------------------------------- | ------------------------- |
| **OpenRouter**                    | Best for flexibility — single API key, many models | Claude, Gemini, GPT, more |
| **Anthropic**                     | Direct access to Claude models                     | Claude Sonnet 4.5, Opus   |
| **OpenAI**                        | GPT-4o, o3, and embedding models                   | GPT-4o, o3-mini           |
| **Google**                        | Gemini models                                      | Gemini 2.5 Flash, Pro     |
| **AWS Bedrock**                   | Enterprise, through your AWS account               | Claude, Llama, Mistral    |
| **Ollama**                        | Local, offline models                              | Llama, Qwen, DeepSeek     |
| **LM Studio / OpenAI Compatible** | Any local or self-hosted API                       | Varies                    |

You can also configure **multiple provider profiles** and switch between them — useful for separating work and personal API keys or assigning different models to different modes.

> 🔗 [Full provider setup guide](apps/docs/docs/getting-started/connecting-api-provider.md)

### 3. Start a task

Open the command palette (`Cmd+Shift+P`) and run **Mirror VS: Start New Task**, or click the chat icon in the activity bar. Tell Mirror what you need — in your own words. That's it.

### 4. Try slash commands

Speed up common workflows with slash commands:

- `/code` — Switch to Code mode
- `/architect` — Switch to Architect mode
- `/ask` — Switch to Ask mode
- `/debug` — Switch to Debug mode
- `/todo` — Show or update the task todo list
- `/clear` — Clear the current task

---

## Custom modes

One of Mirror VS's most powerful features is the ability to create **custom modes** — specialized personas with their own instructions, tool access, and model preferences.

### How to create a custom mode

1. Create a `.mirrormodes` file in your project root (team-wide) or use **Mirror VS > Custom Modes** in settings (personal)
2. Define your mode with a slug, name, role definition, and tool configuration:

```json
{
	"customModes": [
		{
			"slug": "reviewer",
			"name": "Code Reviewer",
			"roleDefinition": "You are a meticulous code reviewer. Focus on security, performance, and readability.",
			"groups": ["read", ["edit", { "fileRegex": "*.ts", "description": "TypeScript files only" }]]
		}
	]
}
```

Your custom mode will appear in the mode selector dropdown alongside built-in modes.

> 🔗 [Full custom modes guide](apps/docs/docs/features/custom-modes.mdx)

---

## MCP Server integration

Mirror VS supports the **Model Context Protocol (MCP)** — an open standard for connecting AI assistants with external tools and data sources.

### Popular MCP servers to try

| Server                  | What it does                                               |
| ----------------------- | ---------------------------------------------------------- |
| **Filesystem**          | Read, write, and manage files with granular access control |
| **GitHub**              | Manage repos, PRs, issues, and code reviews                |
| **PostgreSQL / SQLite** | Query databases, inspect schemas, run migrations           |
| **Puppeteer**           | Browser automation — screenshots, scraping, testing        |
| **Brave Search**        | Web search through Brave's API                             |
| **Docker**              | Manage containers, images, and compose stacks              |
| **Memory**              | Persistent knowledge graph across sessions                 |

### How to add an MCP server

1. Open Mirror VS settings (`Cmd+,`)
2. Navigate to the **MCP Servers** section
3. Click **Add Server** and choose the transport type:
    - **Stdio**: For local servers (Node.js, Python, Go binaries)
    - **SSE**: For remote HTTP servers
4. Configure the command, arguments, and environment variables

Example — adding a filesystem server:

```json
{
	"mcpServers": {
		"filesystem": {
			"command": "npx",
			"args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
			"disabled": false,
			"autoApprove": []
		}
	}
}
```

> 🔗 [MCP server setup docs](apps/docs/docs/features/mcp/overview.md) | [Official MCP specification](https://modelcontextprotocol.io)

---

## Code indexing & semantic search

Mirror VS can index your codebase for fast, context-aware file retrieval. When enabled, it:

- Builds embeddings for your project files
- Finds relevant files based on natural language queries
- Surfaces context automatically as you work

Configure it in **Settings > Code Indexing**. Supports OpenAI, Gemini, Ollama, Mistral, AWS Bedrock, OpenRouter, Vercel, and more.

---

## Key features at a glance

| Feature                  | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| **Multi-provider**       | Switch between 10+ AI providers without changing tools |
| **Terminal integration** | Fix, explain, and debug terminal commands inline       |
| **Code actions**         | Right-click to explain, improve, or fix selected code  |
| **Checkpoints**          | Save and compare snapshots of your codebase            |
| **Task sharing**         | Export and share sessions with your team               |
| **i18n**                 | Available in 18+ languages                             |
| **Agent Rules**          | Per-project AI behavior rules via `AGENTS.md`          |
| **Slash commands**       | Quick mode switching and task management               |

---

## License

[Apache 2.0 © 2026 ReflectAI](./LICENSE)
