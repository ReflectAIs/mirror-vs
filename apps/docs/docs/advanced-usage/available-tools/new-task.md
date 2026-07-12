---
sidebar_position: 19
title: new_task
---

# `new_task` — Delegate Like a Manager

Ever wish you could clone yourself and have one version research while the other codes? [`new_task`](new-task.md) is the closest thing Mirror VS offers — it lets the AI spin off a completely separate conversation, in a different mode, to handle a subtask while keeping the main thread going.

## Parameters

| Parameter | Type                | Required | Description                                                         |
| --------- | ------------------- | -------- | ------------------------------------------------------------------- |
| `mode`    | `string`            | ✅       | Mode slug to delegate to (e.g., `"code"`, `"architect"`, `"debug"`) |
| `message` | `string`            | ✅       | Initial instructions for the subtask                                |
| `todos`   | `string` (markdown) | ❌       | Initial todo checklist for the subtask (required by some modes)     |

## What It Does

[`new_task`](new-task.md) creates a brand new, independent Mirror VS conversation — a **subtask** — in a specific mode, with specific instructions. The subtask has its own context, its own tools, and its own lifecycle. When it finishes, the results are handed back to the parent task.

Think of it as "I need you to focus on this one thing, in this mode, with this context — go handle it."

## When Is It Used?

For **complex, multi-step tasks** that benefit from specialization:

- An Architect mode task designs the system, then spawns a Code mode task to implement it
- A task hits a bug and spawns a Debug mode subtask to investigate
- You need to research something in Ask mode while continuing to code
- A large refactor is split into independent parallel subtasks

## Key Features

- **Mode specialization** — Each subtask runs in the most appropriate mode for its job
- **Independent context** — Subtasks have their own conversation history, not cluttering the parent
- **Todo list support** — Modes that require todos (`newTaskRequireTodos`) get structured checklists
- **Result transfer** — When `finishSubTask()` is called, results flow back to the parent task
- **Parallel potential** — Multiple subtasks can run concurrently (though the AI manages them sequentially)

## Limitations

- **Sequential execution** — The AI typically handles one subtask at a time
- **Context isolation** — The subtask doesn't automatically inherit all parent context
- **Mode-dependent** — Some modes require a todo list, adding a step
- **Cost** — Each subtask consumes tokens independently

## How It Works

1. The parent task identifies a self-contained piece of work that needs a different mode
2. It calls [`new_task`](new-task.md) with the target mode, message, and optional todos
3. Mirror VS creates a fresh conversation in the specified mode
4. The subtask runs independently with its own tools and context
5. When the subtask calls `finishSubTask()`, its results are transferred back to the parent
6. The parent task picks up where it left off, with the subtask's output available

## Configuration

| Setting                                    | Description                                            |
| ------------------------------------------ | ------------------------------------------------------ |
| `mirror-vs.newTaskRequireTodos`            | Forces todos for all `new_task` calls                  |
| `mirror-vs.preventCompletionWithOpenTodos` | Blocks `attempt_completion` if any todos are unchecked |

## Usage Examples

### Architect → Code Handoff

The Architect designs a plan, then delegates implementation:

```
new_task({
  mode: "code",
  message: "Implement the auth middleware as designed in the architecture above",
  todos: "- [ ] Create auth middleware file\n- [ ] Add JWT verification\n- [ ] Add token refresh logic\n- [ ] Write tests"
})
```

### Debugging Subtask

While working on a feature, an issue is found. A debug subtask is spawned:

```
new_task({
  mode: "debug",
  message: "The login endpoint returns 500 when token is expired. Investigate the error handler in src/auth/middleware.ts"
})
```

### Research Subtask

Need to look up documentation while coding:

```
new_task({
  mode: "ask",
  message: "Research the best approach for rate limiting in Express.js, considering Redis-based and in-memory approaches"
})
```

## Relation to Other Tools

[`new_task`](new-task.md) is the **delegation** tool. It's the reason Mirror VS can handle complex, multi-modal workflows without losing the plot. Combined with [`attempt_completion`](attempt-completion.md) (which finishes a subtask), it creates a powerful parent-child task hierarchy.

For simpler context switches, consider [`switch_mode`](switch-mode.md) — but when you need genuine parallel thinking with mode-specific tool access, [`new_task`](new-task.md) is the answer.
