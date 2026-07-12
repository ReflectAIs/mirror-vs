---
description: Comprehensive guide to Mirror VS's tool system, including tool groups, calling mechanisms, mode integration, and best practices for AI-powered development.
keywords:
    - Mirror VS tools
    - tool system
    - tool groups
    - AI development
    - tool architecture
    - mode integration
    - tool security
    - workflow tools
    - VS Code AI
---

# Tool Use Overview

Mirror VS's tool system is how your AI assistant actually _does things_ — not just talks about doing them. Think of it as a toolkit filled with carefully designed instruments, each one responsible for a specific job, from reading files to running commands to switching modes.

---

## Core Concepts

### Tool Groups

Tools are sorted into squads based on what they do:

| Category           | Purpose                           | Tools                                                                                                                                                                                                                                                                                                                                                                                                        | Common Use                            |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Read Group**     | File system reading & exploration | [`read_file`](/advanced-usage/available-tools/read-file), [`list_files`](/advanced-usage/available-tools/list-files), [`read_command_output`](/advanced-usage/available-tools/read-command-output)                                                                                                                                                                                                           | Code exploration and analysis         |
| **Search Group**   | Pattern & semantic searching      | [`search_files`](/advanced-usage/available-tools/search-files), [`codebase_search`](/advanced-usage/available-tools/codebase-search)                                                                                                                                                                                                                                                                         | Finding code patterns                 |
| **Edit Group**     | File modifications                | [`apply_diff`](/advanced-usage/available-tools/apply-diff), [`apply_patch`](/advanced-usage/available-tools/apply-patch), [`edit`](/advanced-usage/available-tools/edit), [`edit_file`](/advanced-usage/available-tools/edit-file), [`search_replace`](/advanced-usage/available-tools/search-replace), [`write_to_file`](/advanced-usage/available-tools/write-to-file)                                     | Code changes                          |
| **Image Group**    | AI image generation               | [`generate_image`](/advanced-usage/available-tools/generate-image)                                                                                                                                                                                                                                                                                                                                           | Creating images                       |
| **Command Group**  | System command execution          | [`execute_command`](/advanced-usage/available-tools/execute-command), [`run_slash_command`](/advanced-usage/available-tools/run-slash-command)\*                                                                                                                                                                                                                                                             | Running scripts, builds               |
| **MCP Group**      | External tool integration         | [`use_mcp_tool`](/advanced-usage/available-tools/use-mcp-tool), [`access_mcp_resource`](/advanced-usage/available-tools/access-mcp-resource)                                                                                                                                                                                                                                                                 | External server tools                 |
| **Workflow Group** | Mode & task management            | [`switch_mode`](/advanced-usage/available-tools/switch-mode), [`new_task`](/advanced-usage/available-tools/new-task), [`ask_followup_question`](/advanced-usage/available-tools/ask-followup-question), [`attempt_completion`](/advanced-usage/available-tools/attempt-completion), [`update_todo_list`](/advanced-usage/available-tools/update-todo-list), [`skill`](/advanced-usage/available-tools/skill) | Context switching & task organization |

\*_Experimental — requires explicit enablement in settings_

### Always Available Tools

These tools work no matter what mode you're in. They're the emergency exits:

- [`ask_followup_question`](/advanced-usage/available-tools/ask-followup-question) — When Mirror VS needs more info from you
- [`attempt_completion`](/advanced-usage/available-tools/attempt-completion) — The "I'm done!" signal
- [`switch_mode`](/advanced-usage/available-tools/switch-mode) — Change hats mid-conversation
- [`new_task`](/advanced-usage/available-tools/new-task) — Spin off a subtask

---

## Available Tools

### Read Tools

These let Mirror VS peek at your code:

- [`read_file`](/advanced-usage/available-tools/read-file) — Opens files and shows you what's inside
- [`list_files`](/advanced-usage/available-tools/list-files) — Maps out your project structure
- [`read_command_output`](/advanced-usage/available-tools/read-command-output) — Retrieves full output from commands that got truncated

### Search Tools

Find stuff. Fast.

- [`search_files`](/advanced-usage/available-tools/search-files) — Regex-powered search across your codebase
- [`codebase_search`](/advanced-usage/available-tools/codebase-search) — Semantic search using your indexed codebase

### Edit Tools

Where the magic happens — changing your code:

- [`apply_diff`](/advanced-usage/available-tools/apply-diff) — Surgical, precise edits to existing code
- [`apply_patch`](/advanced-usage/available-tools/apply-patch) — Multi-file unified diff patches
- [`edit`](/advanced-usage/available-tools/edit) — Search-and-replace (first occurrence)
- [`edit_file`](/advanced-usage/available-tools/edit-file) — Search-and-replace (all occurrences, with validation)
- [`search_replace`](/advanced-usage/available-tools/search-replace) — Simple search-and-replace everywhere
- [`write_to_file`](/advanced-usage/available-tools/write-to-file) — Create new files or blow away old ones

### Image Tools

One tool, one job:

- [`generate_image`](/advanced-usage/available-tools/generate-image) — Turns text prompts into pictures

### Command Tools

Let Mirror VS run things:

- [`execute_command`](/advanced-usage/available-tools/execute-command) — Runs commands in your terminal
- [`run_slash_command`](/advanced-usage/available-tools/run-slash-command) — Executes predefined slash commands _(Experimental)_

### MCP Tools

Bridge to the outside world:

- [`use_mcp_tool`](/advanced-usage/available-tools/use-mcp-tool) — Calls external tools via MCP servers
- [`access_mcp_resource`](/advanced-usage/available-tools/access-mcp-resource) — Reads data from external sources

### Workflow Tools

Keep things organized:

- [`ask_followup_question`](/advanced-usage/available-tools/ask-followup-question) — Asks you for more info
- [`attempt_completion`](/advanced-usage/available-tools/attempt-completion) — Wraps up and presents results
- [`switch_mode`](/advanced-usage/available-tools/switch-mode) — Changes the active mode
- [`new_task`](/advanced-usage/available-tools/new-task) — Kicks off a new subtask
- [`update_todo_list`](/advanced-usage/available-tools/update-todo-list) — Updates the running task checklist
- [`skill`](/advanced-usage/available-tools/skill) — Loads and runs predefined skill instructions

---

## Tool Calling Mechanism

### Handling Complex Tasks

Some operations are too complex for a single tool call. Creating an MCP server, for example, is a multi-step dance that involves running setup scripts, writing config files, and asking you for API keys.

Mirror VS handles these by following internal workflows. When you ask to create an MCP server, it triggers a known multi-step plan that chains together standard tools like [`execute_command`](/advanced-usage/available-tools/execute-command), [`write_to_file`](/advanced-usage/available-tools/write-to-file), and [`ask_followup_question`](/advanced-usage/available-tools/ask-followup-question).

You don't see the internal planning tool — you just see Mirror VS doing its thing, step by step, like a chef following a recipe.

### When Tools Are Called

Tools get invoked in three scenarios:

1. **Direct Task Requirements** — The AI needs to do something specific to complete your request
2. **Mode-Based Availability** — Different modes have different tools available
3. **Context-Dependent Calls** — Based on workspace state, system events, or error recovery

### Decision Process

Before any tool is called, Mirror VS runs through a checklist:

1. **Mode Validation** — Is this tool allowed in the current mode?
2. **Requirement Checking** — Are all system and resource requirements met?
3. **Parameter Validation** — Are the parameters correct and complete?

```typescript
isToolAllowedForMode(
    tool: string,
    modeSlug: string,
    customModes: ModeConfig[],
    toolRequirements?: Record<string, boolean>,
    toolParams?: Record<string, any>
)
```

---

## Technical Implementation

### Tool Call Processing

1. **Initialization** — Tool name and parameters are validated; mode compatibility is checked
2. **Execution** — The tool runs with the given parameters
3. **Result Handling** — Success or failure is determined, results are formatted, errors are handled

### Security and Permissions

Tools don't have free rein. They're guarded by:

- **Access Control** — File system restrictions, command execution limits, network access controls
- **Validation Layers** — Tool-specific checks, mode-based restrictions, system-level safeguards

---

## Mode Integration

### Mode-Based Tool Access

Different modes unlock different tool sets:

- **Code Mode**: Full access — read, write, execute, the works
- **Ask Mode**: Read-only. Can look, can't touch.
- **Architect Mode**: Design and documentation tools. Limited execution.
- **Custom Modes**: You decide what tools are available.

### Mode Switching

Switching modes preserves your current state but updates the available tool set. Think of it as changing your tool belt without leaving the construction site.

---

## Best Practices

### Tool Usage Guidelines

1. **Efficiency** — Use the most specific tool for the job. Don't use `write_to_file` when `apply_diff` will do.
2. **Security** — Validate inputs, use minimum required permissions.
3. **Error Handling** — Check for errors, provide meaningful messages, recover gracefully.

### Common Patterns

Here are some typical tool workflows:

**Information Gathering:**

```
[ask_followup_question] → [read_file] → [codebase_search]
```

**Code Modification:**

```
[read_file] → [apply_diff] → [attempt_completion]
```

**Task Management:**

```
[new_task] → [switch_mode] → [execute_command]
```

---

## Error Handling and Recovery

### Error Types

- **Tool-Specific Errors** — Bad parameters, execution failures, resource access issues
- **System Errors** — Permission denied, resource unavailable, network failures
- **Context Errors** — Wrong mode, missing requirements, state inconsistencies

### Recovery Strategies

- **Automatic Recovery** — Retry mechanisms, fallback options, state restoration
- **User Intervention** — Error notifications, recovery suggestions, manual override options

When things go wrong, Mirror VS doesn't just give up — it tells you what happened and suggests a way forward. And if all else fails, you can always start a fresh task.
