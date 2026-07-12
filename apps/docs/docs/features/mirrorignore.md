---
description: Learn how to use .mirrorignore files to control Mirror VS's file access, protect sensitive information, and manage which files the AI can read or modify.
keywords:
    - mirrorignore
    - file access control
    - sensitive data protection
    - gitignore syntax
    - file permissions
    - security
sidebar_label: .mirrorignore
---

# Using .mirrorignore to Control File Access

The `.mirrorignore` file is Mirror VS's version of a velvet rope — it lets you control exactly which files and directories Mirror VS can interact with. Think of it as `.gitignore` for your AI agent.

---

## What is `.mirrorignore`?

- **Purpose**: To protect sensitive information, prevent accidental changes to build artifacts or large assets, and define Mirror VS's operational scope within your workspace
- **How to Use**: Create a file named `.mirrorignore` in the root directory of your VS Code workspace. List patterns to tell Mirror VS which files and directories to ignore
- **Scope**: `.mirrorignore` affects both Mirror VS's tools and context mentions (like `@directory` attachments)

Mirror VS actively monitors the `.mirrorignore` file. Any changes you make are reloaded automatically — no restart required. And Mirror VS can never modify `.mirrorignore` itself, because it's always implicitly ignored. Checks and balances. We like those.

---

## Pattern Syntax

The syntax for `.mirrorignore` is identical to `.gitignore` (because why reinvent the wheel?):

- `node_modules/` — Ignores the entire `node_modules` directory
- `*.log` — Ignores all files ending in `.log`
- `config/secrets.json` — Ignores a specific file
- `!important.log` — An exception; Mirror VS will _not_ ignore this file, even if `*.log` exists
- `build/` — Ignores the `build` directory
- `docs/**/*.md` — Ignores all Markdown files in `docs/` and subdirectories

For a comprehensive guide on syntax, refer to the [official Git documentation on .gitignore](https://git-scm.com/docs/gitignore).

---

## How Mirror Tools Interact with `.mirrorignore`

### Strict Enforcement (Reads & Writes)

These tools directly check `.mirrorignore` before any file operation. If a file is ignored, the operation is blocked:

- [`read_file`](/advanced-usage/available-tools/read-file) — Will not read ignored files
- [`write_to_file`](/advanced-usage/available-tools/write-to-file) — Will not write to or create ignored files
- [`apply_diff`](/advanced-usage/available-tools/apply-diff) — Will not apply diffs to ignored files

### File Discovery and Listing

- **[`list_files`](/advanced-usage/available-tools/list-files) Tool & `@directory` Attachments** — When Mirror VS lists files or when you use `@directory` attachments, ignored files are omitted or marked with a 🔒 symbol
- **Environment Details** — Information about your workspace (open tabs, project structure) is filtered to exclude or mark ignored items

### Context Mentions

- **`@directory` Attachments** — Directory contents respect `.mirrorignore` patterns. Ignored files are filtered out or marked with `[🔒]`
- **Single File Mentions** — Ignored files return "(File is ignored by .mirrorignore)" instead of content

### Command Execution

- **[`execute_command`](/advanced-usage/available-tools/execute-command) Tool** — Checks if a command (from a predefined list like `cat` or `grep`) targets an ignored file. If so, execution is blocked

---

## Key Limitations and Scope

- **Workspace-Centric**: `.mirrorignore` rules apply **only to files and directories within the current VS Code workspace root**. Files outside this scope are not affected
- **[`execute_command`](/advanced-usage/available-tools/execute-command) Specificity**: Protection is limited to a predefined list of file-reading commands. Custom scripts or uncommon utilities might not be caught
- **Not a Full Sandbox**: `.mirrorignore` is powerful for controlling Mirror VS's file access, but it doesn't create a system-level sandbox. It's a seatbelt, not an airbag

---

## User Experience and Notifications

- **Visual Cue (🔒)** — In file listings and `@directory` attachments, ignored files may be marked with a lock symbol
- **Ignore Messages** — Single file mentions return "(File is ignored by .mirrorignore)" instead of content
- **Error Messages** — Blocked operations show: `"Access to [file_path] is blocked by the .mirrorignore file settings. You must try to continue without using this file, or ask the user to update the .mirrorignore file."`
- **Chat Notifications** — You'll typically see a notification in the Mirror VS chat interface when an action is blocked due to `.mirrorignore`

This guide helps you understand the `.mirrorignore` feature, its capabilities, and its current limitations, so you can effectively manage Mirror VS's interaction with your codebase. Guard your secrets, skip the noise, and let Mirror VS focus on what matters.
