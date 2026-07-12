---
description: Load and execute skill instructions using the skill tool for specialized tasks in Mirror VS.
keywords:
    - skill
    - skills
    - specialized tasks
    - instructions
    - Mirror VS tools
    - automation
    - workflows
---

# `skill` — Expert Instructions on Demand

Think of [`skill`](skill.md) as Mirror VS's "downloadable expertise" — pre-written instruction sets that guide the AI through specific tasks like creating MCP servers, building custom modes, or following standardized workflows.

## Parameters

| Parameter | Type     | Required | Description                                                          |
| --------- | -------- | -------- | -------------------------------------------------------------------- |
| `skill`   | `string` | ✅       | Name of the skill to load (e.g., `create-mcp-server`, `create-mode`) |
| `args`    | `string` | ❌       | Additional context to pass to the skill                              |

## What It Does

[`skill`](skill.md) retrieves skill instructions from the skills directory and injects them into the active conversation. Skills are pre-written, step-by-step guides that walk Mirror VS through complex, multi-step procedures. It's mode-aware too — it loads mode-specific skills when available.

## When Is It Used?

- When executing specialized procedures with standardized workflows
- When creating MCP servers, custom modes, or other structured artifacts
- When following documented best practices for specific task types
- When you need expert guidance for a particular domain

## Key Features

- **Mode-aware resolution** — Loads mode-specific skills when available (e.g., `skills-code/` for Code mode)
- **Project-level overrides** — Project skills take precedence over global skills
- **Progressive disclosure** — Linked files aren't auto-loaded; the AI must explicitly read them
- **Customizable with arguments** — Pass context to tailor skill execution
- **Persistent context** — Skills remain available for the conversation's duration

## How It Works

1. **Skill Resolution** — Searches in priority order:
    - Project `.mirror/skills-code/` (mode-specific)
    - Project `.mirror/skills/` (generic)
    - Project `.agents/skills-code/` (mode-specific)
    - Project `.agents/skills/` (generic)
    - Global equivalents in `~/.mirror/` and `~/.agents/`
2. **Skill Loading** — Loads the skill's main instruction file (typically `SKILL.md`)
3. **Context Injection** — Injects the instructions into the conversation
4. **Execution** — Mirror VS follows the skill's instructions to complete the task

### Available Skills

Common skills include:

- `create-mcp-server` — Guide for creating Model Context Protocol servers
- `create-mode` — Guide for creating custom Mirror VS modes
- `find-skills` — Helps discover and install agent skills

To see available skills, ask Mirror VS "what skills are available?" or check the skills list in the system prompt.

## Usage Examples

```
<skill>
  <skill>create-mcp-server</skill>
  <args>weather API integration</args>
</skill>
```

```
<skill>
  <skill>create-mode</skill>
</skill>
```

## Relation to Features

The [`skill`](skill.md) tool is the programmatic interface to the [Skills](/features/skills) feature. For comprehensive documentation on how skills work, creating custom skills, and the skills system architecture, see the [Skills feature documentation](/features/skills).
