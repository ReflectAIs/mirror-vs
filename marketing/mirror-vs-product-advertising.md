# Mirror VS — Your AI Pair Programmer

> **One-line pitch:** Mirror VS is the open-source AI coding assistant that adapts to _how you work_ — code, architect, debug, and automate across 10+ AI providers, all without leaving VS Code.

---

## What is Mirror VS?

Mirror VS is an AI-powered development sidekick that lives inside VS Code. Think of it as a brilliant collaborator who never sleeps — ready to write code, plan architectures, squish bugs, answer questions about your codebase, and automate the boring stuff. All without leaving your editor.

Whether you're spinning up a new project, refactoring a gnarly codebase, or trying to understand why that test won't pass, Mirror VS has your back.

- 🆓 **Open source** — Apache 2.0 license. Free to use, transparent to audit, no vendor lock-in.
- 🌍 **Truly global** — available in **18+ languages**, on both the **VS Code Marketplace** and **Open VSX**.
- 🔌 **Provider-agnostic** — bring your own key and switch between **10+ AI providers** without changing tools.
- 🛡️ **Privacy-first** — API keys stay on your device, telemetry is anonymous and opt-out, and we never train models on your data.

---

## What can it do?

- **Write code** from plain-English descriptions and specs
- **Architect systems** — plan migrations, design APIs, document decisions
- **Refactor and debug** existing code with surgical precision
- **Answer questions** about your codebase instantly
- **Automate repetitive tasks** so you can focus on what matters
- **Connect to MCP servers** for extended superpowers
- **Index your codebase** for context-aware file suggestions and semantic search
- **Manage tasks** with structured todo lists, checkpoints, and subtask delegation
- **Persistent SSH sessions** — connect to remote servers securely and run multiple tasks over a single connection without rate-limiting blocks

---

## Features that set Mirror VS apart

### 🎭 Modes for every moment

Mirror VS adjusts its behavior to match what you need — and remembers its own model selection per mode.

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

Assign different models per mode (e.g., Gemini for architecting, Claude for coding) — Mirror VS switches automatically when you change modes.

### 🪃 Boomerang Tasks (subtasks)

The Orchestrator mode delegates work to specialized modes — Architect plans, Code builds, Debug fixes — and weaves the results together. Like a boomerang, but for code.

### 🕰️ Checkpoints — your code's time machine

Every significant action (file edit, command run, new file) automatically creates a Git snapshot in a **hidden shadow repository**. Your real Git history, branches, and remotes stay untouched. When the AI makes a mess — and it will — restore files, rewind the conversation, or compare snapshots. Experiment freely, zero guilt.

### 🔎 Code indexing & semantic search

Mirror VS builds embeddings for your project files so it can find relevant files from natural-language queries and surface context automatically as you work. Supports OpenAI, Gemini, Ollama, Mistral, AWS Bedrock, OpenRouter, Vercel, and more.

### 🔌 MCP integration & Marketplace

Connect to the open **Model Context Protocol** ecosystem — databases, GitHub, browsers, Docker, memory, and more. The built-in **Marketplace** gives you one-click install of MCPs and Modes, scoped to a project or globally.

### 🧠 Brain Explorer — see what your AI is thinking

A live panel showing every file the AI currently holds in memory. Toggle files to **Cold Storage** to exclude them from prompts and save tokens, or forget them entirely. Full transparency into what your AI knows — and what it costs.

### 📊 Session Analytics — know your spend

Aggregated task history showing total cost, total tokens, and per-model/per-mode breakdowns. No more surprise API bills — see exactly where every token goes.

### 🖼️ Image generation & editing (ComfyUI pipelines)

Generate new images from text prompts, or edit existing ones — inpaint, outpaint, upscale, remove backgrounds — all inside your editor. Save results directly to your workspace with in-chat previews.

### 🌲 Git worktrees — parallel development

Work on multiple branches simultaneously, each in its own VS Code window. Test different approaches in parallel, review PRs without disrupting your work, and run multiple AI tasks on different branches at once.

### 🧵 Persistent SSH sessions

Connect to remote servers securely and run many tasks over a single persistent connection — no rate-limiting blocks, no re-authentication loops, no hanging prompts. Server work, tamed.

### 💬 Terminal & shell integration

Mirror VS runs commands, reads output in real time, detects and fixes errors, and reacts to exit codes — all hands-free. Output is smartly truncated with an artifact trail you can search, and you can stop running commands straight from chat.

### 🧠 Intelligent context condensing

Long conversations are automatically summarized as they approach the context limit, so nothing important gets dropped mid-task. A context bar shows token usage and reserved space; a manual "Condense Context" button puts you in control.

### 🛡️ Granular auto-approval & Agent Rules

Fine-grained control over what the AI can do on its own — reads, writes, commands, MCP, browser, mode switches, subtasks, and git — with per-project **AGENTS.md** rules that teach Mirror VS how _your_ team works. Keep the guardrails, skip the babysitting.

### ⚡ Built for speed and developer joy

- **Concurrent multi-tab tasks** — run several tabs at once with smart request gating and auto-retry on rate limits.
- **Multi-anchor visual tracking** — streaming chat stays pinned in view, no jitter.
- **Slash commands** — `/code`, `/architect`, `/debug`, `/todo`, `/clear` and more for speed.
- **Skills & code actions** — reusable skill workflows and right-click explain/improve/fix.
- **Suggested responses & TTS** — one-click follow-ups and read-aloud answers.
- **Delightful details** — an animated mascot, multi-language UI, and a polish that makes every session feel good.

---

## Why Mirror VS? (Even when other products exist)

There are a lot of AI coding assistants out there. Here's why Mirror VS earns a spot on your machine — and your team's.

### 1. No lock-in — you own your AI stack

Most assistants tie you to one vendor, one subscription, one model. Mirror VS is **provider-agnostic**: bring your own API key for Anthropic, OpenAI, Google, AWS Bedrock, OpenRouter, Ollama, LM Studio, DeepSeek, and more — and switch any time. Use the best model for the job, not the only model you're allowed to use.

### 2. Open source you can trust

Apache 2.0. Read the code, audit the data handling, self-host, or contribute. You know exactly what Mirror VS does with your code — because it's all right there. No black boxes, no opaque telemetry, no surprise training on your repos.

### 3. A system that thinks about workflow, not just chat

Mirror VS isn't a chat window bolted onto an editor. It's a **full agent system**: modes that specialize, subtasks that delegate, checkpoints that rewind, context that condenses, memory you can inspect, and spend you can audit. Other tools do one of these. Mirror VS does all of them, together.

### 4. Cost control is built in

No more surprise bills. **Session Analytics** tracks total cost, tokens, and per-model/per-mode spend. **Brain Explorer** lets you move files to Cold Storage to trim tokens. **Context Condensing** keeps long tasks lean. Mirror VS helps you ship great code and keep an eye on what it costs.

### 5. Safety without friction

Granular auto-approval means you decide how much autonomy the AI gets — from fully supervised to fully autonomous — with git never silently touched unless you say so. Agent Rules (`AGENTS.md`) keep behavior consistent across your whole team.

### 6. Made for the whole team, everywhere

18+ languages, VS Code Marketplace and Open VSX, task sharing, custom modes checked into the repo, and a Marketplace of MCPs and Modes. Onboarding a new developer — or a whole organization — is a five-minute setup.

### 7. It keeps up with the frontier

Mirror VS is actively developed and shipping constantly — DeepSeek thinking-mode support, OCR fallbacks for non-vision models, persistent SSH sessions, browser tooling, ComfyUI image pipelines, and more land regularly. You're not buying a snapshot; you're joining a fast-moving project.

---

## Mirror VS vs. the alternatives

| Capability                             | Mirror VS     | Generic AI chat | Typical closed AI tools |
| -------------------------------------- | ------------- | --------------- | ----------------------- |
| Open source                            | ✅ Apache 2.0 | ❌              | ❌                      |
| Bring your own model (10+ providers)   | ✅            | ❌ (one vendor) | ❌ (subscription)       |
| Specialized modes                      | ✅            | ❌              | Partial                 |
| Task delegation (subtasks)             | ✅            | ❌              | Partial                 |
| Auto-checkpoints (shadow git)          | ✅            | ❌              | ❌                      |
| Persistent SSH sessions                | ✅            | ❌              | ❌                      |
| Inspectable AI memory (Brain Explorer) | ✅            | ❌              | ❌                      |
| Cost/token analytics                   | ✅            | ❌              | Partial                 |
| Image gen & editing in-editor          | ✅            | ❌              | ❌                      |
| MCP + Marketplace                      | ✅            | Partial         | Partial                 |
| 18+ languages                          | ✅            | Rarely          | Rarely                  |
| Privacy: keys local, opt-out telemetry | ✅            | Varies          | Varies                  |

> _Feature comparison is directional and based on current public capabilities. Verify specifics before publishing._

---

## Get started in minutes

1. **Install** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=dipeshmajithia.mirror-vs) or [Open VSX](https://open-vsx.org/extension/DipeshMajithia/mirror-vs).
2. **Connect a provider** — the onboarding wizard walks you through picking and configuring one (Anthropic, OpenAI, Google, AWS Bedrock, OpenRouter, Ollama, LM Studio, and more).
3. **Start a task** — open the command palette and run **Mirror VS: Start New Task**, or click the chat icon in the activity bar. Tell Mirror what you need, in your own words.
4. **That's it** — and with custom modes, MCP servers, and slash commands, you'll be customizing within the hour.

---

## The bottom line

Other AI assistants ask you to change how you work. **Mirror VS adapts to how you work.**

- Want to own your models and keys? ✅
- Want open source you can audit and trust? ✅
- Want an agent that plans, codes, debugs, and automates? ✅
- Want to see — and control — what your AI is doing and spending? ✅
- Want it in your language, on your editor, with your team's rules? ✅

Mirror VS gives you all of it. No lock-in. No black boxes. No limits on what "your AI" can be.

**Try Mirror VS today — free, open source, and ready in minutes.**

- 📦 **Install:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=dipeshmajithia.mirror-vs) · [Open VSX](https://open-vsx.org/extension/DipeshMajithia/mirror-vs)
- 📖 **Docs:** [reflectai.in](https://www.reflectai.in/)
- 🔓 **License:** Apache 2.0 © 2026 ReflectAI

_ReflectAI — Mirror VS: Your AI pair programmer._
