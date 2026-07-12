---
sidebar_position: 2
title: list_files
---

# `list_files` — Your Project Map

Think of [`list_files`](list-files.md) as the "where am I?" button for Mirror VS. It lists the contents of any directory in your project, giving the AI a bird's-eye view of your codebase's structure.

## Parameters

| Parameter   | Type      | Required | Description                                                   |
| ----------- | --------- | -------- | ------------------------------------------------------------- |
| `path`      | `string`  | ✅       | Directory path to list (relative to workspace)                |
| `recursive` | `boolean` | ✅       | `true` for full recursive listing, `false` for top-level only |

## What It Does

[`list_files`](list-files.md) shows the AI what files and folders exist in a given directory. It's how Mirror VS explores your project structure before deciding which files to read or edit. Think of it as `ls` on steroids — with `.gitignore` awareness and a 200-file safety cap.

## When Is It Used?

Whenever the AI needs to understand your project's structure:

- **Initial project exploration**: "What's in this project?" → recursive listing of root
- **Finding the right file**: "Where do you keep your API routes?" → explore `src/api/`
- **Before reading**: "Let me see what's in this directory before diving in"
- **Confirming structure**: "Did that file end up in the right place?"

## Key Features

- **Recursive mode** — See the full directory tree with one call
- **`.gitignore` & `.mirrorignore` aware** — Ignores files you don't want to see
- **200-file cap** — Safety limit prevents overwhelming context windows
- **Ripgrep-based** — Uses the same fast engine as VS Code's file explorer
- **Lock symbol** — Files blocked by `.mirrorignore` show a 🔒 indicator

## Limitations

- **200 file limit** — Directories with more entries truncate results
- **No file contents** — Just names and paths, not what's _inside_ the files
- **Respects ignore files** — Hidden and gitignored files won't appear (usually a feature, not a bug)

## How It Works

1. The AI requests a listing for a specific directory path
2. Mirror VS scans the directory using ripgrep-based file discovery
3. It filters results through `.gitignore` and `.mirrorignore` rules
4. Results are returned as a structured list with paths and indicators
5. If recursive, it walks the full subtree (up to the 200-file limit)

### File Listing Format

```
src/
├── api/
│   ├── routes.ts
│   └── middleware.ts
├── components/
│   ├── Button.tsx
│   └── Header.tsx
├── utils/
│   └── helpers.ts
└── index.ts
```

Files blocked by `.mirrorignore` show a 🔒 padlock, so you know they exist but are off-limits.

## Examples When Used

**Project onboarding**: "List the root directory recursively" → gets the full project structure in seconds.

**Finding the right subdirectory**: "List only `src/components/`" → sees what components exist without the noise.

**Confirming creation**: After creating a new file, the AI may list the directory to confirm it landed in the right spot.

## Usage Examples

### Exploring the Project Root

```
What's in this project?
```

This triggers [`list_files`](list-files.md) with `{ path: ".", recursive: true }`, returning the full directory structure.

### Checking a Specific Directory

```
List only the top-level files in src/styles/
```

This triggers [`list_files`](list-files.md) with `{ path: "src/styles", recursive: false }`.

### Understanding Component Structure

```
Show me the component directory structure
```

List `src/components` recursively to see all component files at once.
