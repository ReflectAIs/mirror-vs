---
description: Understand how switch_mode enables seamless transitions between Code, Architect, Ask, and Debug modes for specialized task handling in Mirror VS.
keywords:
    - switch_mode
    - Mirror VS tools
    - mode switching
    - operational modes
    - Code mode
    - Architect mode
    - Debug mode
    - Ask mode
    - task transitions
    - VS Code AI
---

# `switch_mode` — Changing Hats Mid-Conversation

Think of [`switch_mode`](switch-mode.md) as Mirror VS's way of saying "I need to switch hats for this next part." It enables seamless transitions between operational modes — Code, Architect, Ask, Debug, or custom modes — each with specialized tools and capabilities.

## Parameters

| Parameter   | Type     | Required | Description                                                            |
| ----------- | -------- | -------- | ---------------------------------------------------------------------- |
| `mode_slug` | `string` | ✅       | Slug of the mode to switch to (e.g., `"code"`, `"ask"`, `"architect"`) |
| `reason`    | `string` | ❌       | Explanation for why the mode switch is needed                          |

## What It Does

[`switch_mode`](switch-mode.md) requests a mode change when the current task would be better handled by another mode's capabilities. It maintains conversation context while shifting Mirror VS's focus and available toolset to match the new task phase.

## When Is It Used?

- Transitioning from information gathering (Ask) to code implementation (Code)
- Shifting from coding to architecture or design (Architect)
- Encountering bugs during development and switching to systematic troubleshooting (Debug)
- When specialized expertise is needed for a particular phase of a complex project

## Key Features

- **Context continuity** — Conversation history is preserved across mode transitions
- **Clear reasoning** — Provides explanation for why the switch is recommended
- **User approval required** — You always get a say before the mode changes
- **Tool group enforcement** — Each mode has appropriate tools enabled/restricted
- **Custom mode support** — Works with both standard and user-defined custom modes
- **Always available** — This tool is in the "always available" list, accessible from any mode

## Limitations

- Cannot switch to modes that don't exist
- Requires explicit user approval for each transition
- Cannot use mode-specific tools until the switch completes
- Some modes have file type restrictions (e.g., Architect mode can only edit `.md` files)
- 500ms delay after switching to allow the change to take effect

## How It Works

1. **Validation** — Checks the requested mode exists and you're not already in it
2. **Approval** — Presents the mode change request with the reason for your approval
3. **Activation** — Updates the UI, adjusts available tools, applies mode-specific prompt/behavior
4. **Continuation** — Proceeds with the task using the new mode's capabilities, retaining relevant context

### Mode Capabilities

| Mode          | Best For                                   | File Restrictions         |
| ------------- | ------------------------------------------ | ------------------------- |
| **Code**      | Implementing features, writing code        | None                      |
| **Architect** | System design, architecture planning       | Can only edit `.md` files |
| **Ask**       | Answering questions, providing information | Read-only                 |
| **Debug**     | Systematic problem diagnosis               | None                      |

### Custom Modes

Beyond core modes, you can define custom project-specific modes with custom role definitions, instructions, and tool group configurations. Custom modes are checked first before falling back to core modes.

## Usage Examples

```
<switch_mode>
<mode_slug>code</mode_slug>
<reason>Need to implement the login functionality based on the architecture we've discussed</reason>
</switch_mode>
```

```
<switch_mode>
<mode_slug>architect</mode_slug>
<reason>Need to design the system architecture before implementation</reason>
</switch_mode>
```

```
<switch_mode>
<mode_slug>debug</mode_slug>
<reason>Need to systematically diagnose the authentication error</reason>
</switch_mode>
```

## Relation to Other Tools

[`switch_mode`](switch-mode.md) handles within-conversation mode changes. For spawning entirely new conversations in different modes (with independent context), use [`new_task`](new-task.md). Think of [`switch_mode`](switch-mode.md) as changing your own hat, and [`new_task`](new-task.md) as sending a clone to handle a specialized task.
