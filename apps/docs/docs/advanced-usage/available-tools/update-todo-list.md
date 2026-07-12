---
description: Learn how update_todo_list creates dynamic TODO lists with status tracking, enabling step-by-step task management for complex workflows in Mirror VS.
keywords:
    - update_todo_list
    - Mirror VS tools
    - task management
    - TODO lists
    - workflow tracking
    - checklist management
    - task status
    - interactive UI
    - VS Code AI
---

# `update_todo_list` — Keeping Track of What's Left

Think of [`update_todo_list`](update-todo-list.md) as Mirror VS's personal task tracker — a dynamic checklist that lives in the chat interface, showing exactly what's done, what's in progress, and what's still ahead.

## Parameters

| Parameter | Type     | Required | Description                                    |
| --------- | -------- | -------- | ---------------------------------------------- |
| `todos`   | `string` | ✅       | Full markdown checklist with status indicators |

## What It Does

[`update_todo_list`](update-todo-list.md) replaces the entire TODO list with an updated checklist, providing step-by-step tracking for complex, multi-step workflows. It's displayed as an interactive UI component in the chat, so you can see progress at a glance.

## When Is It Used?

- When managing complex, multi-step tasks that benefit from structured tracking
- When Mirror VS needs to show progress through a series of related activities
- When tasks require step-by-step completion verification before proceeding
- When new actionable items are discovered during long or complex workflows

## Key Features

- **Full checklist replacement** — Overwrites the list with the latest status
- **Interactive UI component** — Displays as an editable interface in the chat
- **Three status types** — `[ ]` pending, `[-]` in progress, `[x]` completed
- **Dynamic task management** — Add new tasks as they arise during execution
- **Progress visualization** — Clear visual indicators at a glance

## Limitations

- **Complete replacement** — Replaces entire list rather than incremental updates
- **Single-level structure** — No nesting or subtask support
- **Manual updates** — Requires explicit tool calls to update status
- **Format requirements** — Specific markdown checkbox syntax is required

## How It Works

1. **Input validation** — Validates the `todos` parameter and checks for correct format (`[ ]`, `[-]`, `[x]`)
2. **List processing** — Extracts individual todo items with their status indicators
3. **UI integration** — Replaces the existing todo list in the chat interface
4. **User interaction** — Allows direct editing in the UI with "Add Todo" functionality
5. **State management** — Synchronizes changes between UI and backend

### Checklist Format

```markdown
[ ] Pending task — Not started
[-] In progress — Currently being worked on
[x] Completed — Fully finished
```

### Task Management Guidelines

- Mark tasks as completed when all work is done
- Start the next task by marking it as in-progress
- Add new todos as soon as they're identified
- Keep all unfinished tasks; update their status as needed

## Usage Examples

Creating initial todo list:

```xml
<update_todo_list>
<todos>
[ ] Analyze requirements
[ ] Design architecture
[ ] Implement core logic
[ ] Write tests
[ ] Update documentation
</todos>
</update_todo_list>
```

Updating progress:

```xml
<update_todo_list>
<todos>
[x] Analyze requirements
[x] Design architecture
[x] Implement core logic
[-] Write tests
[ ] Update documentation
[ ] Add performance benchmarks
</todos>
</update_todo_list>
```

## Relation to Other Tools

[`update_todo_list`](update-todo-list.md) pairs with [`new_task`](new-task.md) (which can require todos via `newTaskRequireTodos`) and [`attempt_completion`](attempt-completion.md) (which can be blocked by unchecked todos via `preventCompletionWithOpenTodos`). Together, they form Mirror VS's task management triad.
