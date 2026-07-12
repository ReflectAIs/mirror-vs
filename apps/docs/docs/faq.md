---
description: Find answers to common questions about Mirror VS, including setup, usage, troubleshooting, and advanced features. Get help with API keys, modes, and more.
keywords:
    - Mirror VS FAQ
    - frequently asked questions
    - troubleshooting
    - API setup
    - custom modes
    - MCP
    - local models
---

import KangamirrorIcon from '@site/src/components/KangamirrorIcon';

# Frequently Asked Questions

Welcome to the FAQ page — where your questions go to find answers. If you don't see yours here, check the rest of the docs or just ask Mirror VS itself. (Meta, we know.)

---

## General

### What is Mirror VS?

Mirror VS is an open-source AI coding agent for VS Code. It's designed to take full advantage of advanced large-language models so you can stop typing boilerplate and start building.

### How does Mirror VS work?

Mirror VS uses large language models (LLMs) to understand your requests and turn them into actions. Specifically, it can:

- Read and write files in your project
- Execute shell commands
- Perform web browsing (if enabled)
- Use external tools via the Model Context Protocol (MCP)

You interact with it through a chat interface in the extension. That's it. You talk, it does.

### What can Mirror VS do?

Glad you asked. Mirror VS can help with:

- Generating code from natural language descriptions
- Refactoring existing code (because that function you wrote at 2 AM needs work)
- Fixing bugs (the ones you know about, and the ones you don't)
- Writing documentation (the part everyone loves to skip)
- Explaining code (your own or someone else's)
- Answering questions about your codebase
- Automating repetitive tasks
- Creating new files and projects

### Is Mirror VS free to use?

The Mirror VS extension itself is free and [open-source](https://github.com/ReflectAIs/mirror-vs/). However, Mirror VS relies on external LLM inference providers (like [Anthropic](providers/anthropic), [OpenAI](providers/openai), [OpenRouter](providers/openrouter), [Requesty](providers/requesty), etc.) for its AI brain. These providers typically charge for API usage based on tokens processed. You'll need an account and an API key from your chosen provider. See [about providers](/providers/) for details.

### What are the risks of using Mirror VS?

Mirror VS is a powerful tool. Use it responsibly. Keep these in mind:

- **Mirror VS can make mistakes.** Always review proposed changes before approving them.
- **Mirror VS can execute commands.** Be cautious about allowing command execution, especially with auto-approval enabled.
- **Mirror VS can access the internet.** If your provider supports web browsing, Mirror could potentially access sensitive information if you're not careful.

---

## Setup & Installation

### How do I install Mirror VS?

See the [Installation Guide](/getting-started/installing) for detailed instructions. Takes about two minutes, including the coffee break.

### Which API providers are supported?

See the [full list here](/providers/). Spoiler: most of the major ones.

### How do I get an API key?

Each provider has its own process. See [Setting Up Your First AI Provider](/getting-started/connecting-api-provider) for links to the relevant docs.

### Can I use Mirror VS with local models?

Yes! Mirror VS supports running models locally using [Ollama](/providers/ollama) and [LM Studio](/providers/lmstudio). See [Using Local Models](/advanced-usage/local-models) for instructions. No internet required. No API bills. Just you and your GPU.

---

## Extension Usage

### How do I start a new task?

Open the Mirror VS panel (<KangamirrorIcon />) and type your task in the chat box. Be clear and specific. See [Typing Your Requests](/basic-usage/typing-your-requests) for best practices.

### What are modes in Mirror VS?

[Modes](/basic-usage/using-modes) are different personas Mirror VS can adopt, each with a specific focus and set of capabilities. The built-in modes are:

- **Code:** For general-purpose coding
- **Architect:** For planning and technical leadership
- **Ask:** For answering questions and providing information
- **Debug:** For systematic problem diagnosis
- **Orchestrator:** For coordinating multi-step workflows

You can also create [Custom Modes](/features/custom-modes) to suit your specific needs.

### How do I switch between modes?

Use the dropdown menu in the chat input area, type a slash command like `/architect`, or use the keyboard shortcut (`⌘+.` on Mac, `Ctrl+.` on Windows/Linux).

### What are tools and how do I use them?

[Tools](/basic-usage/how-tools-work) are how Mirror VS interacts with your system. Mirror automatically selects and uses the appropriate tools to complete your tasks. You don't call tools directly — you just approve or reject them.

### What are context mentions?

[Context mentions](/basic-usage/context-mentions) are a way to feed Mirror VS specific information about your project. Use `@` followed by a file, folder, problem, or Git reference (e.g., `@/src/file.ts`, `@problems`, `@git-changes`).

### Can Mirror VS access the internet?

Yes, if you're using a provider with a model that supports web browsing. Be mindful of the security implications.

### Can Mirror VS run commands in my terminal?

Yes. You'll be prompted to approve each command before execution, unless auto-approval is enabled. Be extremely cautious about auto-approving commands. See the [Shell Integration Guide](/features/shell-integration) for troubleshooting.

### How do I provide feedback to Mirror VS?

Approve or reject Mirror's proposed actions. You can also use the feedback field at the bottom of each response. Mirror learns from both.

### Can I customize Mirror VS's behavior?

Yes, several ways:

- **Custom Instructions:** General instructions that apply to all modes
- **Custom Modes:** Create your own modes with tailored prompts and tool permissions
- **`.mirrorrules` Files:** Project-level guidelines in `.mirrorrules` files
- **Settings:** Adjust auto-approval, diff editing, and more

### Does Mirror VS have auto approval settings?

Yes. Mirror VS has settings that, when enabled, automatically approve certain actions. Find out more [here](/features/auto-approving-actions). Use with caution. With great power comes great responsibility.

---

## Advanced Features

### Can I use Mirror offline?

Yes, if you use a [local model](/advanced-usage/local-models). Perfect for planes, trains, and places where the internet goes to die.

### What is MCP (Model Context Protocol)?

[MCP](/features/mcp/overview) is a protocol that lets Mirror VS communicate with external servers, extending its capabilities with custom tools and resources. Think of it as giving Mirror superpowers.

### Can I create my own MCP servers?

Yes. You can build your own MCP servers to add custom functionality. See the [MCP documentation](https://github.com/modelcontextprotocol) for details.

### What is Codebase Indexing?

[Codebase Indexing](/features/codebase-indexing) creates a semantic search index of your project using AI embeddings. It lets Mirror VS find code based on meaning, not just keywords. It's like Google for your codebase.

### How much does Codebase Indexing cost?

It requires an OpenAI API key for generating embeddings and a Qdrant vector database for storage. Costs depend on your project size and the embedding model. Initial indexing is the most expensive part. Subsequent updates are incremental and much cheaper.

---

## Troubleshooting

### Mirror VS isn't responding. What should I do?

Before you throw your laptop out the window:

- Make sure your API key is correct and hasn't expired
- Check your internet connection
- Check the status of your chosen API provider
- Try restarting VS Code (the IT classic)

### Mirror VS made changes I didn't want. How do I undo them?

Use the standard "Undo" command (`Ctrl/Cmd + Z`). If experimental checkpoints are enabled, Mirror can also revert changes made to a file.

### Mirror VS can't write to markdown files. What's wrong?

If Mirror VS fails to write to `.md` files with errors like "Failed to open diff editor" or "write_to_file tool failed", it's typically caused by VS Code extensions or settings that interfere with file editing:

**Common causes:**

- Extensions with "format on save" functionality
- VS Code settings that open markdown files in preview mode by default
- The Markdown Preview extension or similar markdown processing extensions

**Solutions:**

- Disable any extensions that automatically format files on save
- Remove these settings from your VS Code `settings.json`:
    ```json
    "markdown.preview.openMarkdownLinks": "inPreview",
    "workbench.editorAssociations": {
      "*.md": "vscode.markdown.preview.editor"
    }
    ```
