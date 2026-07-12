---
sidebar_position: 9
title: read_command_output
---

# `read_command_output` — Command Output, Retrieved

Ever run a command that produced so much output it got cut off? That's where [`read_command_output`](read-command-output.md) comes in — it's the "show me the rest of that" button for command execution.

## Parameters

| Parameter     | Type     | Required | Description                                                                       |
| ------------- | -------- | -------- | --------------------------------------------------------------------------------- |
| `artifact_id` | `string` | ✅       | The artifact filename from the truncated output (e.g., `"cmd-1706119234567.txt"`) |
| `search`      | `string` | ❌       | Regex or literal pattern to filter lines (like grep, case-insensitive)            |
| `offset`      | `number` | ❌       | Byte offset to start reading from (default: 0)                                    |
| `limit`       | `number` | ❌       | Maximum bytes to return (default: 40KB)                                           |

## What It Does

[`read_command_output`](read-command-output.md) retrieves the full output from a command that was truncated in the initial result. Think of it as a scroll-back buffer for terminal commands — the full output is saved as an artifact, and this tool lets you page through it, search it, or grep through it.

## When Is It Used?

Whenever a command produces more output than fits in the initial response:

- **Build logs** — `npm run build` outputs 10,000 lines; the last 40 get shown, the rest is saved
- **Test output** — `npx vitest run` produces hundreds of test results
- **Search results** — `grep -r` across a large codebase
- **Linter output** — Running ESLint on a large project

## Key Features

- **Pagination** — Read output in chunks using `offset` and `limit`
- **Search mode** — Filter lines by regex or literal strings (case-insensitive grep)
- **Artifact persistence** — Full output is saved as an artifact, not lost
- **40KB default chunks** — Manageable slices for reading context

## Limitations

- **Requires artifact ID** — You need the artifact filename from the original truncated output
- **Text only** — Binary command output won't work
- **Memory-bound** — Very large outputs consume memory to store as artifacts

## How It Works

1. A command is executed (e.g., `npm run build`) and produces more output than fits the initial preview
2. The full output is saved as a text artifact (e.g., `cmd-1706119234567.txt`)
3. The truncated preview shows: `[OUTPUT TRUNCATED - Full output saved to artifact: cmd-1706119234567.txt]`
4. The AI can then use [`read_command_output`](read-command-output.md) to:
    - Read from the beginning with `{ artifact_id: "cmd-1706119234567.txt", offset: 0, limit: 40960 }`
    - Search for specific patterns with `{ artifact_id: "cmd-1706119234567.txt", search: "error|Error|FAIL" }`
    - Page through output by incrementing `offset`

## Usage Examples

### Reading Full Output

```
Let me see the full build output from that last command
```

This triggers [`read_command_output`](read-command-output.md) with the artifact ID from the truncated response and default offset/limit.

### Searching for Errors

```
Search the command output for any errors or failures
```

This triggers [`read_command_output`](read-command-output.md) with `search: "error|failed|Error|FAIL"` — just like grepping through terminal history.

### Paginating Through Output

```
Show me the next chunk of output
```

Increment `offset` by 40960 (40KB) to read the next chunk.

## Relation to Other Tools

[`read_command_output`](read-command-output.md) is the companion to [`execute_command`](execute-command.md). While [`execute_command`](execute-command.md) runs commands and shows a preview, [`read_command_output`](read-command-output.md) lets you dig into the full output. Together, they form Mirror VS's terminal reading capability.
