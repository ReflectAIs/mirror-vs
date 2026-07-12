---
sidebar_position: 1
title: read_file
---

# `read_file` — Mirror VS's Eyes on the Codebase

Think of [`read_file`](read-file.md) as Mirror VS's way of reading over your shoulder — except it can read anything in your project instantly, without needing glasses or asking "where does this file live?"

## Parameters

| Parameter     | Type      | Required | Description                                     |
| ------------- | --------- | -------- | ----------------------------------------------- |
| `path`        | `string`  | ✅       | File path relative to the workspace             |
| `mode`        | `string`  | ❌       | `"slice"` (default) or `"indentation"`          |
| `offset`      | `integer` | ❌       | 1-based line offset (slice mode, default: 1)    |
| `limit`       | `integer` | ❌       | Max lines to return (slice mode, default: 2000) |
| `indentation` | `object`  | ❌       | Anchor extraction around a specific line        |

## What It Does

[`read_file`](read-file.md) slurps up file contents and hands them to the AI with line numbers attached. It's the primary way Mirror VS understands what's inside your project files — code, config, markdown, you name it.

## When Is It Used?

**Constantly.** Every time the AI needs to understand existing code, check a config, read error context, or review a file before editing it, [`read_file`](read-file.md) is the tool that gets called. It's the foundation that almost every other tool builds on.

## Key Features

- **Line-numbered output** — Every chunk of code comes back with line numbers so the AI knows exactly where things live
- **Two reading modes** — Slice mode for sequential reading, indentation mode for grabbing complete semantic code blocks
- **Multi-file support** — Can read multiple files in a single call (when batching is configured)
- **Image reading** — Can process images for OCR workflows, design reviews, and visual analysis
- **Smart token management** — Automatically truncates to stay within context budgets
- **PDF & DOCX support** — Can extract text from common document formats

## Limitations

- **2000-line default cap** — Files longer than this get truncated (you can increase via `limit`)
- **2000-char line truncation** — Lines longer than this are cut short
- **Binary files** — Won't work on compiled binaries, images (except via vision), or other non-text formats
- **Blocked files** — Files matching `.mirrorignore` patterns can't be read
- **One file per call** — Each invocation reads exactly one file (unless multi-file is enabled)

## How It Works

1. Mirror VS receives a `read_file` request with the file path
2. It resolves the path relative to the workspace root
3. It checks `.mirrorignore` and access permissions
4. It reads the file using VS Code's filesystem API
5. Content is returned with line numbers, formatted for AI consumption
6. If the file is an image, it's sent to the vision model for analysis

### Reading Modes

**Slice Mode** (default): Reads a sequential range of lines starting from `offset` up to `limit` lines. Great for browsing through a file from top to bottom.

**Indentation Mode**: Finds the semantic code block (function, class, method) containing a specific anchor line and returns the complete block. This is the _preferred mode_ when you have a target line number — it guarantees complete, syntactically valid code without mid-function truncation. Includes options for max indentation levels, sibling blocks, and header content.

## Usage Examples

### Reading an Entire File

```
Read src/app.ts
```

When passed to the AI, this triggers [`read_file`](read-file.md) with `{ path: "src/app.ts" }`, returning the full file with line numbers.

### Reading Specific Lines

```
Look at lines 42-89 of src/handler.ts
```

This triggers [`read_file`](read-file.md) with `{ path: "src/handler.ts", offset: 42, limit: 48 }`.

### Reading a Code Block by Anchor

```typescript
// Find the function containing line 156
read_file({ path: "src/services/auth.ts", mode: "indentation", indentation: { anchor_line: 156 } })
```

This returns the complete function or class block containing line 156, with proper indentation and syntax.

### Reading an Image

```
What's in this screenshot? [attached: error.png]
```

The AI reads the image via [`read_file`](read-file.md) and passes it to the vision model for analysis — useful for debugging UI issues, reviewing designs, or OCR workflows.

## Troubleshooting

| Problem                  | Likely Cause                            | Solution                                                        |
| ------------------------ | --------------------------------------- | --------------------------------------------------------------- |
| File returns empty       | `.mirrorignore` blocking it             | Check your `.mirrorignore` rules                                |
| Content is truncated     | File exceeds 2000 lines or token budget | Specify `offset` and `limit` to read in chunks                  |
| Binary file not readable | Not a text format                       | The tool only works with text files and supported image formats |
| Line numbers don't match | File may have been edited since read    | Re-read the file to get fresh line numbers                      |

## Relation to Other Tools

[`read_file`](read-file.md) is the foundation that enables most other tools. Before [`apply_diff`](apply-diff.md) edits a file, [`read_file`](read-file.md) reads it first. Before [`codebase_search`](codebase-search.md) searches semantically, [`read_file`](read-file.md) may be used to inspect results. It's the "read" in the classic read-eval-print loop of coding.
