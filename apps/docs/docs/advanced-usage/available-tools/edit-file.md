---
sidebar_position: 6
title: edit_file
---

# `edit_file` — Search-and-Replace with Surgical Precision

Think of [`edit_file`](edit-file.md) as the surgical replacement tool in Mirror VS's toolkit — it finds an exact string in a file and replaces it with something new. No guesswork, no ambiguity, just find-and-replace done right.

> **Note**: This tool is currently disabled for new installations. Use [`apply_diff`](apply-diff.md) instead for most editing needs.

## Parameters

| Parameter               | Type     | Required | Description                                             |
| ----------------------- | -------- | -------- | ------------------------------------------------------- |
| `path`                  | `string` | ✅       | File path relative to workspace                         |
| `old_string`            | `string` | ✅       | Exact content to find (must match uniquely)             |
| `new_string`            | `string` | ✅       | Replacement content                                     |
| `expected_replacements` | `number` | ❌       | Expected number of replacements (validates correctness) |

## What It Does

[`edit_file`](edit-file.md) performs a single search-and-replace operation on a file. It finds the `old_string` exactly once (uniqueness is required), replaces it with `new_string`, and validates the result. When `old_string` is empty and `new_string` has content, it creates the file from scratch.

## When Is It Used?

For targeted edits where you know exactly what text to find and what to replace it with. It's particularly useful when:

- You need to change a single variable name or function call
- Update a configuration value
- Fix a specific line or small block of code
- Create a new file (using the empty `old_string` trick)

## Key Features

- **Uniquely-identified replacement** — The `old_string` must match exactly one occurrence, preventing accidental multi-replace
- **Validation via `expected_replacements`** — Set this to `1` (or whatever count you expect) to catch mismatches early
- **File creation mode** — Empty `old_string` + non-empty `new_string` = file creation
- **No regex needed** — Just plain text matching, no escaping special characters

## Limitations

- **Currently disabled** — Not available for new installs (legacy feature)
- **Single occurrence only** — The string must be unique in the file, or you specify `expected_replacements`
- **Exact matching** — Whitespace matters. An extra space means no match.
- **No regex support** — Unlike [`search_files`](search-files.md), this is plain-text only

## How It Works

1. The AI identifies the exact `old_string` it wants to replace (including whitespace)
2. It specifies the target file path and the `new_string` replacement
3. Mirror VS locates the unique occurrence of `old_string` in the file
4. It replaces it with `new_string` and validates the result
5. If `expected_replacements` doesn't match, the operation fails (safety first!)

## Relation to Other Tools

[`edit_file`](edit-file.md) is the simpler, more constrained cousin of [`apply_diff`](apply-diff.md). While [`apply_diff`](apply-diff.md) can handle multi-line context-aware replacements with fuzzy matching, [`edit_file`](edit-file.md) is strictly find-and-replace on exact text. Use [`apply_diff`](apply-diff.md) for complex edits and [`edit_file`](edit-file.md) for simple swaps.

For creating new files, [`write_to_file`](write-to-file.md) is the more explicit (and currently active) alternative.
