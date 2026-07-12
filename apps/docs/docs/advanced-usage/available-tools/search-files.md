---
sidebar_position: 12
title: search_files
---

# `search_files` — Find in Files on Steroids

Think of [`search_files`](search-files.md) as VS Code's "Find in Files" feature that got a PhD in regex and a black belt in ripgrep. It's how Mirror VS hunts down every occurrence of a pattern across your entire project — fast.

## Parameters

| Parameter      | Type     | Required | Description                                             |
| -------------- | -------- | -------- | ------------------------------------------------------- |
| `path`         | `string` | ✅       | Directory to search recursively (relative to workspace) |
| `regex`        | `string` | ✅       | Rust-compatible regular expression pattern              |
| `file_pattern` | `string` | ❌       | Glob filter (e.g., `"*.ts"` for TypeScript only)        |

## What It Does

[`search_files`](search-files.md) performs a blazing-fast regex search across all files in a directory (recursively), returning matches with surrounding context so the AI can understand _where_ and _how_ patterns appear in your codebase.

## When Is It Used?

Whenever the AI needs to find all the places where something is defined, referenced, or used. For example:

- "Find all imports of `UserService` across the codebase"
- "Show me every place we handle authentication errors"
- "Where's that deprecated `oldMethod` we've been meaning to remove?"
- "Find all TODO comments in the project"

## Key Features

- **Ripgrep-powered** — Uses the same engine that makes VS Code's search lightning fast. We're talking sub-second searches across thousands of files.
- **Regex patterns** — Full Rust regex support (which is regex on espresso — powerful and precise)
- **Glob filtering** — Limit searches to specific file types with familiar glob patterns like `*.ts`, `*.py`, or `*.{json,yaml}`
- **Context-rich results** — Each match shows surrounding lines so the AI understands the neighborhood, not just the house number
- **`.gitignore` & `.mirrorignore` aware** — Respects your ignore files by default (but can override them)

## Limitations

- **No case-insensitive flag** — Rust regex requires `(?i)` prefix for case-insensitive search (e.g., `(?i)error` matches "Error", "ERROR", "error")
- **No multi-line patterns** — Each match is line-based; patterns spanning multiple lines won't work
- **Binary files skipped** — Compiled binaries and non-text files are excluded
- **Performance on very large codebases** — While fast, searching millions of lines still takes noticeable time
- **Character limits** — Excessively long lines (2000+ chars) may be truncated in results

## How It Works

1. The AI crafts a regex pattern and target directory path
2. Mirror VS invokes ripgrep under the hood (the same search engine VS Code uses)
3. Ripgrep recursively scans files matching the glob filter (if provided)
4. Results are returned with file paths, line numbers, and surrounding context lines
5. If results exceed display limits, the AI may narrow the search with a more specific pattern

### Search Results Format

```
Showing first 300 of 300+ results. Use a more specific search if necessary.

rel/path/to/auth.ts
 17 |   return checkDatabase(credentials);
 18 |   // TODO: Add rate limiting
 19 |   const result = await db.query(sql);

rel/path/to/users.ts
 42 |   return checkDatabase(credentials);
 43 |   // FIXME: This is slow
 44 |   const result = await db.query(sql);
```

## Usage Examples

### Simple Text Search

Search for all occurrences of a function name:

```
Search all .ts files for "checkDatabase"
```

This triggers [`search_files`](search-files.md) with `{ path: ".", regex: "checkDatabase", file_pattern: "*.ts" }`.

### Finding TODO/FIXME Comments

```
Search the entire project for TODO or FIXME comments
```

Pattern: `(?i)(TODO|FIXME|HACK|XXX)` — the `(?i)` makes it case-insensitive.

### Cross-Reference Search

```
Find all places where UserService is imported
```

Pattern: `import.*UserService` or `from.*user-service`, depending on your import style.

### Searching Within a Specific Subdirectory

```
Search only the api directory for error handlers
```

Sets `path` to `src/api` and searches recursively from there.

## Examples When Used

**Debugging a bug**: "Search for all references to `userId` in the `auth` module" → finds the variable across multiple files to trace data flow.

**Refactoring**: "Find all usages of `deprecatedHelper` before renaming it" → ensures nothing gets left behind.

**Code review**: "Search for hardcoded API keys or secrets" → `(?i)(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]+['"]`

## Respecting `.gitignore`

### Default Behavior (Respecting `.gitignore`)

By default, [`search_files`](search-files.md) respects both `.gitignore` and `.mirrorignore` patterns. Files and directories listed in these files are skipped during search. This is usually what you want — nobody needs to search through `node_modules` or `dist` folders.

### Overriding `.gitignore` (Search All Files)

When you truly need to search _everything_ (including gitignored files), you can specify a file pattern that forces the search to bypass `.gitignore`. For example, to search log files that might be in `.gitignore`:

```
Search all .log files for "FATAL ERROR"
```

This sets `file_pattern: "*.log"` and overrides `.gitignore` restrictions for that glob.
