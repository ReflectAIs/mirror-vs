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

The `.mirrorignore` file is a key feature for managing Mirror VS's interaction with your project files. It allows you to specify files and directories that Mirror should not access or modify, similar to how `.gitignore` works for Git.

---

## What is `.mirrorignore`?

- **Purpose**: To protect sensitive information, prevent accidental changes to build artifacts or large assets, and generally define Mirror's operational scope within your workspace.
- **How to Use**: Create a file named `.mirrorignore` in the mirrort directory of your VS Code workspace. List patterns in this file to tell Mirror which files and directories to ignore.
- **Scope**: `.mirrorignore` affects both Mirror's tools and context mentions (like `@directory` attachments).

Mirror actively monitors the `.mirrorignore` file. Any changes you make are reloaded automatically, ensuring Mirror always uses the most current rules. The `.mirrorignore` file itself is always implicitly ignored, so Mirror cannot change its own access rules.

---

## Pattern Syntax

The syntax for `.mirrorignore` is identical to `.gitignore`. Here are common examples:

- `node_modules/`: Ignores the entire `node_modules` directory.
- `*.log`: Ignores all files ending in `.log`.
- `config/secrets.json`: Ignores a specific file.
- `!important.log`: An exception; Mirror will _not_ ignore this specific file, even if a broader pattern like `*.log` exists.
- `build/`: Ignores the `build` directory.
- `docs/**/*.md`: Ignores all Markdown files in the `docs` directory and its subdirectories.

For a comprehensive guide on syntax, refer to the [official Git documentation on .gitignore](https://git-scm.com/docs/gitignore).

---

## How Mirror Tools Interact with `.mirrorignore`

`.mirrorignore` rules are enforced across various Mirror tools:

### Strict Enforcement (Reads & Writes)

These tools directly check `.mirrorignore` before any file operation. If a file is ignored, the operation is blocked:

- [`read_file`](/advanced-usage/available-tools/read-file): Will not read ignored files.
- [`write_to_file`](/advanced-usage/available-tools/write-to-file): Will not write to or create new ignored files.
- [`apply_diff`](/advanced-usage/available-tools/apply-diff): Will not apply diffs to ignored files.

### File Discovery and Listing

- **[`list_files`](/advanced-usage/available-tools/list-files) Tool & `@directory` Attachments**: When Mirror lists files or when you use `@directory` attachments, ignored files are omitted or marked with a 🔒 symbol (see "User Experience" below). Both use identical filtering logic.
- **Environment Details**: Information about your workspace (like open tabs and project structure) provided to Mirror is filtered to exclude or mark ignored items.

### Context Mentions

- **`@directory` Attachments**: Directory contents respect `.mirrorignore` patterns. Ignored files are filtered out or marked with `[🔒]` prefix depending on the `showMirrorIgnoredFiles` setting.
- **Single File Mentions**: Ignored files return "(File is ignored by .mirrorignore)" instead of content.

### Command Execution

- **[`execute_command`](/advanced-usage/available-tools/execute-command) Tool**: This tool checks if a command (from a predefined list like `cat` or `grep`) targets an ignored file. If so, execution is blocked.

---

## Key Limitations and Scope

- **Workspace-Centric**: `.mirrorignore` rules apply **only to files and directories within the current VS Code workspace mirrort**. Files outside this scope are not affected.
- **[`execute_command`](/advanced-usage/available-tools/execute-command) Specificity**: Protection for `execute_command` is limited to a predefined list of file-reading commands. Custom scripts or uncommon utilities might not be caught.
- **Not a Full Sandbox**: `.mirrorignore` is a powerful tool for controlling Mirror's file access via its tools, but it does not create a system-level sandbox.

---

## User Experience and Notifications

- **Visual Cue (🔒)**: In file listings and `@directory` attachments, files ignored by `.mirrorignore` may be marked with a lock symbol (🔒), depending on the `showMirrorIgnoredFiles` setting (defaults to `true`).
- **Ignore Messages**: Single file mentions return "(File is ignored by .mirrorignore)" instead of content.
- **Error Messages**: If a tool operation is blocked, Mirror receives an error: `"Access to [file_path] is blocked by the .mirrorignore file settings. You must try to continue in the task without using this file, or ask the user to update the .mirrorignore file."`
- **Chat Notifications**: You will typically see a notification in the Mirror chat interface when an action is blocked due to `.mirrorignore`.

This guide helps you understand the `.mirrorignore` feature, its capabilities, and its current limitations, so you can effectively manage Mirror's interaction with your codebase.
