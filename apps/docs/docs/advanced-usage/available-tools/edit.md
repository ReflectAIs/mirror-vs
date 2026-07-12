---
description: Replace the first or all occurrences of text using the edit search-and-replace tool in Mirror VS.
keywords:
    - edit
    - search and replace
    - file editing
    - text replacement
    - Mirror VS tools
    - code modifications
---

# edit

The `edit` tool is a straightforward search-and-replace for files. By default it replaces only the **first occurrence** — useful when you need to change one specific instance without touching the rest.

---

## Parameters

- `file_path` (required): The file to modify, relative to the current working directory
- `old_string` (required): The exact text to find and replace
- `new_string` (required): The replacement text
- `replace_all` (optional): When `true`, replaces all occurrences. Default: `false` (first occurrence only)

---

## What It Does

Searches for an exact string and replaces either the first match (default) or all matches. It's perfect for quick, targeted replacements where you know exactly what you're looking for.

---

## When Is It Used?

- Updating a single specific value (e.g., a timeout constant)
- When the first instance needs different handling than the rest
- Making targeted changes without affecting other occurrences
- Quick text substitutions that don't need fuzzy matching

---

## Key Features

- Replaces first occurrence only by default (conservative)
- Optional `replace_all` for global replacements
- Exact string matching — no regex confusion
- Shows a preview before applying
- Requires your approval before changes are made

---

## Limitations

- Exact matching only — no regex or fuzzy matching
- Case-sensitive and whitespace-sensitive
- Can't target specific occurrence numbers (second, third, etc.)
- Less precise than [`apply_diff`](/advanced-usage/available-tools/apply-diff) for complex edits

---

## How It Works

1. **Validates** required parameters
2. **Reads** the target file
3. **Searches** for the old string
4. **Replaces** first or all occurrences based on `replace_all`
5. **Shows** you a preview for approval
6. **Applies** if approved

---

## Related Tools

- `edit` — First occurrence by default **(this tool)**
- [`edit_file`](/advanced-usage/available-tools/edit-file) — Always replaces **all** occurrences
- [`search_replace`](/advanced-usage/available-tools/search-replace) — Simple search-and-replace everywhere
- [`apply_diff`](/advanced-usage/available-tools/apply-diff) — Context-aware edits with fuzzy matching

:::info Deprecated Alias
`SearchAndReplaceTool` is a deprecated internal alias for `EditTool`. Same tool, different name.
:::
