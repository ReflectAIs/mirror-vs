---
description: Apply unified diff patches to multiple files in a single operation using the apply_patch tool in Mirror VS.
keywords:
    - apply_patch
    - patch
    - unified diff
    - multi-file edits
    - file operations
    - Mirror VS tools
    - diff patches
---

# apply_patch

The `apply_patch` tool is the big brother of [`apply_diff`](/advanced-usage/available-tools/apply-diff). Where `apply_diff` makes surgical single-file edits, `apply_patch` handles multi-file operations using standard unified diff format. It's for when you have changes spread across several files and want to apply them all at once.

---

## Parameters

- `patch` (required): A unified diff patch string with custom headers. Supports `*** Add File:`, `*** Delete File:`, and `*** Update File:` headers.

---

## What It Does

Processes unified diff patches containing operations for multiple files. It parses the patch content, identifies file operations (add, delete, update), and applies changes atomically. Unlike [`apply_diff`](/advanced-usage/available-tools/apply-diff) which handles single-file search-and-replace, this tool works with traditional unified diff format — the same kind `git diff` produces.

---

## When Is It Used?

- Applying patches from version control systems or diff tools
- Complex multi-file refactoring with precise line-level changes
- Migrating changes between branches or repositories
- Bulk-adding, updating, or removing multiple files in one shot
- Working with patches from external sources or automated tools

---

## Key Features

- Multi-file operations in a single patch
- Handles file creation, deletion, and modification
- Uses standard unified diff format
- Custom headers for clarity (`*** Add File:`, `*** Delete File:`, `*** Update File:`)
- Validates before applying — no surprises
- Compatible with standard diff/patch tooling

---

## Limitations

- Requires proper unified diff format — no fuzzy matching here
- Line numbers and context must match existing content exactly
- Won't apply patches with conflicts or mismatched context
- Less flexible than search-and-replace for approximate matches

---

## How It Works

1. **Parses** the patch to identify custom headers and unified diff blocks
2. **Identifies** operations by file path and type (add, delete, update)
3. **Validates** that target files exist (for updates/deletes) or can be created (for adds)
4. **Checks `.mirrorignore`** rules for each file
5. **Presents** the patch operations for your review and approval
6. **Applies** approved changes to each file sequentially
7. **Reports** success or failure for each operation

---

## Patch Format

```diff
*** Add File: src/utils/newHelper.ts
--- /dev/null
+++ b/src/utils/newHelper.ts
@@ -0,0 +1,5 @@
+export function helperFunction(value: string): string {
+  return value.toUpperCase();
+}

*** Update File: src/main.ts
--- a/src/main.ts
+++ b/src/main.ts
@@ -10,7 +10,7 @@
 import { config } from './config';
-const timeout = 5000;
+const timeout = 10000;

 function main() {

*** Delete File: src/deprecated/oldUtil.ts
```

---

## Related Tools

- [`apply_diff`](/advanced-usage/available-tools/apply-diff) — Single-file search-and-replace with fuzzy matching
- `apply_patch` — Multi-file operations with unified diff format
- [`write_to_file`](/advanced-usage/available-tools/write-to-file) — Creating entire new files
