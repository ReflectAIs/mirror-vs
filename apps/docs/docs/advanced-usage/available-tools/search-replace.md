---
description: Replace a uniquely-identified occurrence of text in a file using the search_replace tool in Mirror VS.
keywords:
    - search_replace
    - search and replace
    - file editing
    - text replacement
    - Mirror VS tools
    - code modifications
---

# `search_replace` — Find Exactly One Thing, Replace It

[`search_replace`](search-replace.md) is the "one and done" editing tool — it finds a unique string in a file and replaces it with new text. No regex, no fuzzy matching, no ambiguity. If the search string matches more than one spot, it refuses to proceed — forcing precision.

## Parameters

| Parameter    | Type     | Required | Description                                |
| ------------ | -------- | -------- | ------------------------------------------ |
| `file_path`  | `string` | ✅       | Path relative to current working directory |
| `old_string` | `string` | ✅       | Exact text to find (must match uniquely)   |
| `new_string` | `string` | ✅       | Replacement text                           |

## What It Does

[`search_replace`](search-replace.md) performs a targeted find-and-replace on **exactly one** uniquely-identified occurrence in a file. If the search string matches multiple locations, it returns an error — the string must be specific enough to pinpoint a single target. This is an intentional safety design to prevent unintended changes.

## When Is It Used?

- Making a targeted change to a specific, uniquely identifiable location
- Updating a specific string literal or configuration value at a known location
- Fixing a specific instance of a pattern or outdated terminology
- When you need simple, exact string replacement and want to ensure only one spot changes

## Key Features

- **Uniqueness enforcement** — Errors if multiple matches found (safety first!)
- **Exact string matching** — No regex, no surprises, just literal text
- **Simple interface** — Three parameters, one job
- **Preview before applying** — Shows the diff so you can verify

## Limitations

- Requires **exact** matches — case-sensitive, whitespace-sensitive
- Errors on multiple matches — you must be specific enough
- No regex or pattern support
- Less precise than [`apply_diff`](apply-diff.md) for complex edits

## How It Works

1. Validates that all three parameters are present
2. Reads the target file and counts occurrences of `old_string`
3. If more than one match is found, returns error asking for a more specific string
4. If exactly one match is found, replaces it with `new_string`
5. Shows a preview for user approval
6. Applies the change on approval

## Relation to Other Tools

- `search_replace`: Replaces **exactly one** uniquely-identified occurrence (this tool)
- [`edit_file`](edit-file.md): Also replaces exactly one occurrence; supports `old_string=""` for file creation
- [`edit`](edit.md): Replaces first occurrence by default (unless `replace_all: true`)
- [`apply_diff`](apply-diff.md): Use for precise, context-aware edits with fuzzy matching

Think of these as a spectrum: [`search_replace`](search-replace.md) is the most strict (unique match required), [`edit`](edit.md) is more flexible (first match), and [`apply_diff`](apply-diff.md) is the most powerful (context-aware with fuzzy matching).
