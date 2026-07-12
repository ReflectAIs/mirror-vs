---
sidebar_label: Custom Instructions
title: Custom Instructions
description: Teach Mirror VS your preferences, standards, and workflows so it doesn't have to guess.
keywords:
    - custom instructions
    - rules
    - global rules
    - workspace rules
    - mode-specific instructions
    - AGENTS.md
    - .mirrorrules
---

# Custom Instructions

Mirror VS is smart, but it's not a mind reader (yet). Custom instructions are how you tell it exactly how you want things done — your coding style, your standards, your pet peeves. Think of it as the difference between "write some code" and "write code that passes our code review on the first try."

## What Are Custom Instructions?

Custom instructions are rules and guidelines you define that Mirror VS follows automatically. They can be:

- **Global** — Apply to every project, every mode, everywhere
- **Workspace-specific** — Apply only to the current project
- **Mode-specific** — Apply only when using a particular mode (Code, Architect, Debug, etc.)
- **Agent-level** — Apply via `AGENTS.md` for standardized AI behavior across teams

## Setting Up Custom Instructions

### Global Custom Instructions

Global instructions apply everywhere, all the time. Set them once, and Mirror VS carries them across every project you work on.

**How to set them:**

1. Open Mirror VS settings (`Cmd/Ctrl + ,`)
2. Navigate to the "Custom Instructions" section
3. Enter your global instructions in the text area

### Global Rules Directory

For a more organized approach, use the global rules directory:

**Location:** `~/.mirror/rules/` and `~/.mirror/rules-{modeSlug}/`

```
~/.mirror/
├── rules/
│   ├── 00-general-standards.md
│   ├── 10-testing-requirements.md
│   └── 20-security-practices.md
├── rules-code/
│   └── typescript-style-guide.md
├── rules-architect/
│   └── architecture-documentation.md
└── rules-debug/
    └── debugging-protocol.md
```

#### Key Benefits

- **Organized** — Separate concerns into different files instead of one giant wall of text
- **Versioned** — Keep your rules in a separate dotfiles repo if you want
- **Mode-specific** — Different modes get different rules
- **Alphabetical loading** — Files are loaded in alphabetical order, so prefix them to control priority

#### Setting Up Global Rules

1. Create the directory structure:

    ```bash
    mkdir -p ~/.mirror/rules
    mkdir -p ~/.mirror/rules-code
    mkdir -p ~/.mirror/rules-architect
    ```

2. Add your rule files:

    ```bash
    echo "Always use TypeScript strict mode" > ~/.mirror/rules/00-typescript-strict.md
    echo "Write unit tests for all new functions" > ~/.mirror/rules/10-test-requirements.md
    ```

3. That's it. Mirror VS picks them up automatically.

#### Rule Loading Order

Rules are loaded in a specific order to ensure predictable behavior:

1. **Global rules** (`~/.mirror/rules/`) — Apply to all modes, all projects
2. **Global mode-specific rules** (`~/.mirror/rules-{modeSlug}/`) — Apply to a specific mode globally
3. **Workspace rules** (`.mirror/rules/`) — Apply to the current project
4. **Workspace mode-specific rules** (`.mirror/rules-{modeSlug}/`) — Apply to a specific mode in the current project

Later rules add to (not replace) earlier ones. So global rules + workspace rules = both apply.

### Workspace-Level Instructions

Workspace instructions apply only to the current project. Perfect for project-specific conventions and team standards.

#### Workspace-Wide Instructions via Files/Directories

- **Preferred Method: Directory-Based (`.mirror/rules/`)**

    - Create a directory named `.mirror/rules/` in your workspace root.
    - Place instruction files (`.md`, `.txt`) inside. Mirror VS reads files recursively, appending their content to the system prompt in **alphabetical order** based on filename.
    - When this directory exists and contains files, its contents are loaded along with any global rules directories.
    - Note: If the `.mirror/rules/` directory exists but is empty, Mirror VS will fall back to using the `.mirrorrules` file instead.

- **Fallback Method: File-Based (`.mirrorrules`)**
    - If `.mirror/rules/` doesn't exist or is empty, Mirror VS looks for a single `.mirrorrules` file in the workspace root.
    - If found, its content is loaded.

#### Mode-Specific Instructions

Mode-specific instructions can be set in two independent ways:

**1. Using the Prompts Tab:**

<img src="/img/custom-instructions/custom-instructions-2.png" alt="Mirror VS Prompts tab showing mode-specific custom instructions interface" width="600" />

- **Open Tab:** Click the <Codicon name="notebook" /> icon in the Mirror VS top menu bar
- **Select Mode:** Under the Modes heading, click the button for the mode you want to customize
- **Enter Instructions:** Type your instructions in the text area under "Mode-specific Custom Instructions (optional)"
- **Save Changes:** Click "Done" to save

:::info Global Mode Rules
If the mode itself is global (not workspace-specific), any custom instructions you set for it will also apply globally for that mode across all workspaces.
:::

**2. Using Rule Files/Directories:**

- **Preferred Method: Directory-Based (`.mirror/rules-{modeSlug}/`)**

    - Create a directory named `.mirror/rules-{modeSlug}/` (e.g., `.mirror/rules-docs-writer/`) in your workspace root.
    - Place instruction files inside (recursive loading, including subdirectories). Files are read and appended to the system prompt in **alphabetical order** by filename.
    - This method takes precedence over the fallback file method for the specific mode if the directory exists and contains files.

- **Fallback Method: File-Based (`.mirrorrules-{modeSlug}`)**
    - If `.mirror/rules-{modeSlug}/` doesn't exist or is empty, Mirror VS looks for a single `.mirrorrules-{modeSlug}` file (e.g., `.mirrorrules-code`) in the workspace root.
    - If found, its content is loaded for that mode.

Instructions from the Prompts tab, global rules, workspace rules, and mode-specific rules are all combined. See the section below for the exact order.

---

## How Instructions are Combined

Instructions are placed in the system prompt in this exact format:

```
====
USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

Language Preference:
[Language preference if set]

Global Instructions:
[Global Instructions from Prompts Tab]

Mode-specific Instructions:
[Mode-specific Instructions from Prompts Tab for the current mode]

Rules:

# Rules from rules-{modeSlug} directories:
[Contents of ALL files from ~/.mirror/rules-{modeSlug}/ AND .mirror/rules-{modeSlug}/ if they exist]

# Rules from .mirrorrules-{modeSlug}:
[Contents of .mirrorrules-{modeSlug} file if no mode-specific directories have files]

# Rules from .mirrorignore:
[.mirrorignore-related instructions if applicable]

# Agent Rules Standard (AGENTS.md):
[Contents of AGENTS.md or AGENT.md from workspace root if present and enabled]

# Rules from rules directories:
[Contents of ALL files from ~/.mirror/rules/ AND .mirror/rules/ if they exist]

# Rules from .mirrorrules:
[Contents of .mirrorrules file if no general rules directories have files]

====
```

_Note: The system loads rules from ALL applicable directories (both global `~/.mirror/` and workspace `.mirror/`), not just the first one with files. Mode-specific rules appear before general rules. Directory-based rules take precedence over file-based fallbacks only when determining which method to use, but all applicable directories are read._

---

## Rules about .rules Files

- **File Location:** The preferred method uses directories within `.mirror/` (`.mirror/rules/` and `.mirror/rules-{modeSlug}/`). The fallback method uses single files (`.mirrorrules` and `.mirrorrules-{modeSlug}`) located directly in the workspace root.
- **Recursive Reading:** Rules directories are read recursively, including all files in subdirectories
- **File Filtering:** System automatically excludes cache and temporary files (`.DS_Store`, `*.bak`, `*.cache`, `*.log`, `*.tmp`, `Thumbs.db`, etc.)
- **Empty Files:** Empty or missing rule files are silently skipped
- **Source Headers:** Directory-based rules include per-file headers `# Rules from {absolute path}:`, while file-based rules include `# Rules from {filename}:` headers
- **Aggregation:** Both global and workspace rules directories are aggregated for mode-specific and generic rules (not either-or)
- **Sorting:** Files are sorted by basename only, case-insensitive
- **Header Paths:** Header paths are absolute and follow symlinks
- **Rule Interaction:** Mode-specific rules complement global rules rather than replacing them
- **Symbolic Links:** Fully supported for both files and directories, with a maximum resolution depth of 5 to prevent infinite loops

---

## AGENTS.md Support

Mirror VS also supports loading rules from an `AGENTS.md` (or `AGENT.md` as fallback) file in your workspace root:

- **Purpose:** Provides agent-specific rules and guidelines for AI behavior
- **Location:** Must be in the workspace root directory
- **Loading:** Automatically loaded by default. To disable, set `"mirror-vs.useAgentRules": false` in your VS Code settings
- **Setting:** `mirror-vs.useAgentRules` (default: `true`)
- **Preference:** If both exist, `AGENTS.md` is preferred over `AGENT.md`
- **Priority:** Loaded after mode-specific rules and `.mirrorignore`, before generic rules from both `~/.mirror/rules` and `.mirror/rules`
- **Header:** Added to system prompt with header `# Agent Rules Standard (AGENTS.md):` or `(AGENT.md):` accordingly
- **Empty Files:** Empty or whitespace-only `AGENTS.md` is ignored
- **Symbolic Links:** Symbolic links to files or directories are resolved before reading

This feature allows teams to maintain standardized AI agent behavior rules that can be version-controlled alongside the project code. No more "but that's how we've always done it" conversations — just commit the rules and let Mirror VS handle the rest.

---

## Examples of Custom Instructions

Here's some inspiration for what you might want to tell Mirror VS:

- "Always use spaces for indentation, with a width of 4 spaces"
- "Use camelCase for variable names"
- "Write unit tests for all new functions"
- "Explain your reasoning before providing code"
- "Focus on code readability and maintainability"
- "Prioritize using the most common library in the community"
- "When adding new features to websites, ensure they are responsive and accessible"

:::tip Pro Tip: Team Standardization

For team environments, consider these approaches:

**Project Standards:** Use workspace `.mirror/rules/` directories under version control to standardize Mirror VS's behavior for specific projects. This ensures consistent code style and development workflows across team members.

**Organization Standards:** Use global rules (`~/.mirror/rules/`) to establish organization-wide coding standards that apply to all projects. Team members can set up identical global rules for consistency across all work.

**Hybrid Approach:** Combine global rules for organization standards with project-specific workspace rules for project-specific requirements. When rules conflict, workspace rules take precedence.

The directory-based approach offers better organization than single `.mirrorrules` files and supports both global and project-level customization.
:::

---

## Combining with Custom Modes

For advanced customization, combine with [Custom Modes](/features/custom-modes) to create specialized environments with specific tool access, file restrictions, and tailored instructions. Think of it as giving each mode its own personalized handbook.
