---
description: Master the apply_diff tool for making surgical code changes using fuzzy matching and line hints in Mirror VS with multi-file support.
keywords:
    - apply_diff
    - file editing
    - code modifications
    - fuzzy matching
    - diff tool
    - Mirror VS tools
    - multi-file edits
---

# apply_diff

The `apply_diff` tool is Mirror VS's scalpel. It makes precise, surgical changes to files by specifying exactly what content to replace — no more, no less. Think of it as the difference between renovating a single room vs. demolishing the whole house.

---

## Parameters

- `path` (required): The file to modify, relative to the current working directory.
- `diff` (required): The search/replace block defining changes.
- `start_line` (optional): A hint for where the search content begins.
- `end_line` (optional): A hint for where the search content ends.

---

## What It Does

Applies targeted changes to existing files using fuzzy matching (Levenshtein distance on normalized strings) guided by line number hints. Instead of matching exact text character-for-character, it's smart enough to find the right block even if there are minor differences — like a detective who can identify a suspect even with a bad sketch.

---

## When Is It Used?

- When Mirror VS needs to make precise changes without rewriting entire files
- When refactoring specific sections while keeping surrounding context intact
- When fixing bugs with surgical precision
- When implementing enhancements that touch only parts of a file

---

## Key Features

- **Fuzzy matching** with configurable confidence thresholds (typically 0.8-1.0)
- **Context window** of 40 lines around matches for reliable identification
- **Middle-out search** around the hinted start line
- **Preserves formatting** — indentation, spacing, and style stay as-is
- **Diff preview** — you see changes before they're applied
- **Error tracking** — prevents repeated failures on the same file
- **`.mirrorignore` aware** — respects your ignore rules
- **Multi-line edits** — handles blocks of code, not just single lines

---

## Limitations

- Works best with unique, distinctive code sections
- Performance varies with very large files or repetitive patterns
- Fuzzy matching can occasionally pick wrong locations with ambiguous content
- Complex edits may need manual review

---

## How It Works

1. **Validates** the `path` and `diff` parameters
2. **Checks `.mirrorignore`** rules for the target file
3. **Loads** the target file content
4. **Finds the match** using fuzzy algorithms around the hinted line
5. **Prepares** the replacement
6. **Shows you** the diff for review (you can edit it!)
7. **Applies** changes if approved
8. **Reports** success or failure

---

## Diff Format

The `diff` parameter uses a specific format that supports one or more changes. Each block needs a `:start_line:` hint:

```diff
<<<<<<< SEARCH
:start_line:10
:end_line:12
-------
    // Old calculation logic
    const result = value * 0.9;
    return result;
=======
    // Updated calculation with logging
    console.log(`Calculating for value: ${value}`);
    const result = value * 0.95; // Adjusted factor
    return result;
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line:25
-------
    const defaultTimeout = 5000;
=======
    const defaultTimeout = 10000; // Increased timeout
>>>>>>> REPLACE
```

The `SEARCH` block must closely match existing content (within the fuzzy threshold), including whitespace and indentation. If the file contains `<<<<<<<` markers, they need to be escaped (`\\`).
