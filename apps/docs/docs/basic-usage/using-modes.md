---
description: Learn how to use Mirror VS's specialized modes for different tasks. Switch between Code, Ask, Architect, Debug, and Orchestrator modes for optimal AI assistance.
keywords:
    - Mirror VS modes
    - Code mode
    - Ask mode
    - Architect mode
    - Debug mode
    - Orchestrator mode
    - AI assistant modes
    - mode switching
---

# Using Modes

Modes in Mirror VS are like putting on different hats — except instead of looking silly, you become instantly more productive. Each mode tailors the assistant's behavior, tool access, and personality to whatever you're doing right now.

**Think of it this way:** You wouldn't ask your surgeon to also fix your car's transmission. Same deal here. Code mode codes, Architect mode plans, Debug mode... well, debugs. Everybody plays their part.

:::info Sticky Models & Mode Persistence
Each mode remembers your last-used model like an elephant with a grudge. Switch from `🏗️ Architect` mode (using Gemini 2.5 Preview) to `💻 Code` mode and Mirror automatically picks Claude Sonnet 3.7 — no manual fussing required.

Your mode also sticks between sessions. Close VS Code, reopen it tomorrow, and Mirror remembers exactly where you left off. It's like it never forgets — but in a helpful way, not a creepy way.
:::

---

## Why Use Different Modes?

- **Task specialization:** Get the exact type of help your current task needs, not a one-size-fits-all answer
- **Safety controls:** Architect mode can't accidentally delete your production code (it can only edit markdown files — worst case, your README gets a typo)
- **Focused interactions:** Responses are optimized for what you're actually doing, not trained on everything at once
- **Workflow optimization:** Glide between planning, coding, debugging, and learning like a hot knife through butter

---

## Switching Between Modes

Four ways to swap modes — take your pick:

1. **Dropdown menu:** Click the selector to the left of the chat input. Point and click. Easy.

 <img src="/img/using-modes/using-modes.png" alt="Using the dropdown menu to switch modes" width="400" />

2. **Slash command:** Type `/architect`, `/ask`, `/debug`, `/code`, or `/orchestrator` at the beginning of your message. It switches modes and clears the input — a one-two combo.

 <img src="/img/using-modes/using-modes-1.png" alt="Using slash commands to switch modes" width="400" />

3. **Keyboard shortcut:** Because real developers hate touching their mouse.

    | Operating System | Shortcut |
    | ---------------- | -------- |
    | macOS            | ⌘ + .    |
    | Windows          | Ctrl + . |
    | Linux            | Ctrl + . |

    Each press cycles through all modes in sequence. Keep pressing and you'll eventually land where you need to be. Or just press it twice. We're not picky.

4. **Accept suggestions:** Sometimes Mirror will suggest a mode switch itself — like when you ask a coding question in Architect mode. Click the suggestion and let the magic happen.

 <img src="/img/using-modes/using-modes-2.png" alt="Accepting a mode switch suggestion from Mirror" width="400" />

---

## Built-in Modes

### Code Mode (Default)

| Aspect               | Details                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| **Name**             | `💻 Code`                                                                                                |
| **Description**      | A skilled software engineer with expertise in programming languages, design patterns, and best practices |
| **Tool Access**      | Full access to all tool groups: `read`, `edit`, `command`, `mcp`                                         |
| **Ideal For**        | Writing code, implementing features, debugging, and general development                                  |
| **Special Features** | No tool restrictions — the full toolbox, no questions asked                                              |

### Ask Mode

| Aspect               | Details                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Name**             | `❓ Ask`                                                                                                            |
| **Description**      | A knowledgeable technical assistant who gives thorough answers without jumping to conclusions — or to your codebase |
| **Tool Access**      | Limited access: `read`, `mcp` only (cannot edit files or run commands — it's all talk)                              |
| **Ideal For**        | Code explanation, concept exploration, and technical learning                                                       |
| **Special Features** | Detailed, informative responses, often with ASCII diagrams for clarity, and zero risk of accidental file mutations  |

### Architect Mode

| Aspect               | Details                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| **Name**             | `🏗️ Architect`                                                                                           |
| **Description**      | An experienced technical leader and planner who designs systems and draws boxes with arrows between them |
| **Tool Access**      | Access to `read`, `mcp`, and restricted `edit` (markdown files only — architects plan, they don't build) |
| **Ideal For**        | System design, high-level planning, and architecture discussions                                         |
| **Special Features** | Follows a structured approach from information gathering to detailed planning, with actual diagrams      |

### Debug Mode

| Aspect               | Details                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**             | `🪲 Debug`                                                                                                                             |
| **Description**      | An expert problem solver with the tenacity of a terrier and the patience of a saint                                                    |
| **Tool Access**      | Full access to all tool groups: `read`, `edit`, `command`, `mcp`                                                                       |
| **Ideal For**        | Tracking down bugs, diagnosing errors, and resolving complex issues                                                                    |
| **Special Features** | Uses a methodical approach of analyzing, narrowing possibilities, adding logs, and fixing issues — a bug bounty hunter in digital form |

### Orchestrator Mode (aka Boomerang Mode)

| Aspect               | Details                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**             | `🪃 Orchestrator`                                                                                                                                                                                                         |
| **Description**      | A strategic workflow orchestrator that breaks down complex tasks and delegates them to specialized modes. Like a project manager, but without the meetings                                                                |
| **Tool Access**      | No direct tool access — it uses the `new_task` tool to delegate work to other modes (it's a delegator, not a doer)                                                                                                        |
| **Ideal For**        | Managing multi-step projects, coordinating work across different modes, and automating complex workflows                                                                                                                  |
| **Special Features** | Uses the [`new_task`](/advanced-usage/available-tools/new-task) tool to delegate subtasks. Think of it as the "I'm too busy for this, you handle it" mode. Learn more about [Boomerang Tasks](/features/boomerang-tasks). |

---

## Customizing Modes

Default modes not cutting it? You can tailor Mirror VS's behavior by customizing existing modes or creating entirely new specialized assistants. Define tool access, file permissions, and behavior instructions to enforce team standards or build that one weird assistant your project needs.

See the [Custom Modes documentation](/features/custom-modes) for setup instructions.

### Understanding Tool Groups

Each tool group provides specific capabilities — think of them as permission buckets:

- **`read`**: File reading, listing, and searching capabilities
- **`edit`**: File modification and creation capabilities
- **`command`**: Terminal command execution
- **`mcp`**: Model Context Protocol server interactions

For detailed information about available tools, see the [Available Tools documentation](/advanced-usage/available-tools/tool-use-overview).
