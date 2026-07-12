---
description: Explore write_to_file for creating new files or replacing content with interactive diff view approval, ensuring safe file operations in Mirror VS.
keywords:
    - write_to_file
    - Mirror VS tools
    - file creation
    - file writing
    - diff view
    - content approval
    - file operations
    - interactive editing
    - VS Code AI
---

# `write_to_file` — Creating Files, the Safe Way

Think of [`write_to_file`](write-to-file.md) as the "blank canvas" tool — it creates new files from scratch or completely rewrites existing ones, with a safety net of diff preview and approval so you know exactly what you're getting.

## Parameters

| Parameter    | Type     | Required | Description                                         |
| ------------ | -------- | -------- | --------------------------------------------------- |
| `path`       | `string` | ✅       | File path relative to current working directory     |
| `content`    | `string` | ✅       | Complete content to write to the file               |
| `line_count` | `number` | ✅       | Number of lines in the file (including empty lines) |

## What It Does

[`write_to_file`](write-to-file.md) writes content to a specified file. If the file doesn't exist, it creates it (along with any needed directories). If it exists, it overwrites the entire content. All changes require explicit user approval through a diff view — you can even edit the proposed content before it's saved.

## When Is It Used?

- Creating a new file from scratch
- Completely rewriting an existing file
- Generating configuration files, documentation, or source code
- Creating multiple files for a new project
- When you want to review changes before they're applied

## Key Features

- **Interactive diff approval** — Shows changes in a diff view; you approve or edit before saving
- **User edit support** — Edit the proposed content in the diff view before final approval
- **Safety measures** — Detects code omission, validates paths, prevents truncated content
- **Content preprocessing** — Strips code block markers, handles escaped HTML entities, removes line numbers accidentally included by AI models
- **`.mirrorignore` validation** — Respects file access restrictions

## Limitations

- **Not for existing files** — Much slower and less efficient than [`apply_diff`](apply-diff.md) for modifying files
- **Complete overwrite** — Replaces the entire file; cannot preserve original content
- **Line count required** — Needs accurate `line_count` to detect potential truncation
- **Review overhead** — The approval process adds steps compared to direct edits
- **Interactive only** — Cannot be used in automated/non-interactive workflows

## How It Works

1. **Parameter validation** — Checks `path`, `content`, and `line_count` are valid, and the file isn't blocked by `.mirrorignore`
2. **Content preprocessing** — Strips AI artifacts like code block markers, escaped HTML, and accidental line numbers
3. **Diff view generation** — Opens a diff view in the editor showing the proposed changes
4. **User approval** — You review, optionally edit, and approve or reject the changes
5. **Safety validation** — Detects content truncation by comparing against `line_count`
6. **File writing** — Writes the approved (and possibly user-edited) content to the file

## Usage Examples

Creating a JSON configuration file:

```
<write_to_file>
<path>config/settings.json</path>
<content>
{
  "apiEndpoint": "https://api.example.com",
  "theme": {
    "primaryColor": "#007bff"
  },
  "version": "1.0.0"
}
</content>
<line_count>8</line_count>
</write_to_file>
```

Creating a JavaScript module:

```
<write_to_file>
<path>src/utils/helpers.js</path>
<content>
/**
 * Utility functions for the application
 */

export function formatDate(date) {
  return new Date(date).toLocaleDateString();
}

export function debounce(func, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}
</content>
<line_count>17</line_count>
</write_to_file>
```

## Relation to Other Tools

[`write_to_file`](write-to-file.md) is the **file creation** specialist. For making targeted edits to existing files, use [`apply_diff`](apply-diff.md) (preferred) or [`edit`](edit.md) / [`search_replace`](search-replace.md). Think of [`write_to_file`](write-to-file.md) as the "new file" button and [`apply_diff`](apply-diff.md) as the "edit existing" button.
