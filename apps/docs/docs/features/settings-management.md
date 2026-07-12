---
sidebar_label: Settings Management
title: Settings Management
description: Import, export, reset, and fine-tune every knob and dial Mirror VS has to offer.
keywords:
    - settings
    - import
    - export
    - reset
    - configuration
    - customization
    - storage
---

# Settings Management

Mirror VS has a lot of settings. Like, _a lot_. This page is your guide to importing, exporting, resetting, and fine-tuning every last one of them — so you can stop fiddling and start coding.

## Export Settings

Need to clone your setup to another machine, share it with a teammate, or just keep a backup?

1. Open Mirror VS settings (`Cmd/Ctrl + ,`)
2. Click the **Export** button (look for the download icon)
3. Choose where to save your `mirror-vs-settings.json` file
4. That's it — everything's in there

**What gets exported:**

- All provider configurations (API keys included, if you want)
- All custom instructions (global, mode-specific, and workspace-level)
- Auto-approval settings
- Codebase indexing configuration
- UI preferences
- All the little tweaks you've made over time

## Import Settings

Got a settings file from your other machine, a teammate, or a past version of yourself?

1. Open Mirror VS settings (`Cmd/Ctrl + ,`)
2. Click the **Import** button (look for the upload icon)
3. Select your `mirror-vs-settings.json` file
4. Settings are merged with your current configuration

**What happens during import:**

- Existing settings are preserved unless the imported file explicitly overrides them
- Provider configurations are updated if present
- Custom instructions are replaced (not merged) to avoid duplication
- Everything else is merged sensibly

## Automatic Configuration Import

For the truly organized among us, Mirror VS can automatically import settings on startup. No manual clicking required — just set it and forget it.

### How it Works

When VS Code starts, Mirror VS checks for a settings file at the configured path. If found, it imports the settings automatically — just as if you'd clicked the Import button yourself.

### Use Case

- **Team setups:** Share a standardized configuration file across your entire team via a shared drive or dotfiles repo
- **CI/CD environments:** Pre-configure Mirror VS for automated workflows
- **Fresh installs:** Get up and running instantly on a new machine without reconfiguring everything

### Configuration

1. Open VS Code settings (`Cmd/Ctrl + ,`)
2. Search for "Auto Import Settings Path"
3. Enter the full path to your settings JSON file
4. Restart VS Code — Mirror VS imports the settings automatically

### FAQ

**Q: Will it overwrite my existing settings?**
A: It merges the same way manual import does — existing settings are preserved unless the imported file explicitly overrides them.

**Q: What if the file doesn't exist?**
A: Mirror VS logs a warning and continues. No harm, no fuss.

**Q: Can I use a remote path?**
A: Local file paths only. But you can use symlinks to point to a cloud-synced file.

## Reset Settings

Sometimes you just want to start fresh. Maybe you've tweaked too many knobs. Maybe you're debugging a configuration issue. Maybe you just enjoy the thrill of rebuilding from scratch.

**To reset all settings:**

1. Open Mirror VS settings (`Cmd/Ctrl + ,`)
2. Click the **Reset** button
3. Confirm — all settings return to their defaults

**What gets reset:**

- Provider configurations
- Custom instructions
- Auto-approval settings
- UI preferences
- Everything. Back to factory defaults.

:::caution
Reset is permanent. Your settings don't go to a recovery bin — they're gone. Export your settings first if you think you might want them back.
:::

## Command Palette Commands

For those who prefer commands over clicking through menus, Mirror VS registers several commands in VS Code's command palette (`Cmd/Ctrl + Shift + P`).

### Set Custom Storage Path

**Command:** `Mirror VS: Set Custom Storage Path`

This command lets you change where Mirror VS stores its data — task history, settings, and other files.

**Why you might want this:**

- Keep Mirror VS data on a different drive
- Sync storage across machines via cloud storage
- Isolate data per-project
- Free up space on your primary drive

**How to use it:**

1. Open the command palette (`Cmd/Ctrl + Shift + P`)
2. Search for "Mirror VS: Set Custom Storage Path"
3. Select or enter the new storage directory
4. Mirror VS moves its data to the new location

### Import Settings from File

**Command:** `Mirror VS: Import Settings from File`

This command does exactly what it sounds like — imports settings from a JSON file without navigating the settings UI.

**How to use it:**

1. Open the command palette (`Cmd/Ctrl + Shift + P`)
2. Search for "Mirror VS: Import Settings from File"
3. Select your settings JSON file in the file picker dialog
4. Settings are imported and merged with your current configuration

---

## UI Settings

### System Prompt Context Toggles

Control what contextual information appears in the system prompt:

- **Include Current Time** (Settings → General)

    - When enabled, adds the current timestamp to the system prompt
    - When disabled, omits time information from the prompt
    - Default: Enabled

- **Include Current Cost** (Settings → General)
    - When enabled, adds the current task cost to the system prompt
    - When disabled, omits cost information from the prompt
    - Default: Enabled

**Example Impact:**

With both enabled, the system prompt includes:

```
# Current Time
Current time in ISO 8601 UTC format: 2025-10-28T23:06:08.458Z
User time zone: America/Edmonton, UTC-6:00

# Current Cost
$0.14
```

With both disabled, these sections are omitted, reducing token usage when you don't need this context. Every token saved is a penny earned.

### Collapse thinking messages by default

- **Location:** Settings → UI
- **Default:** Enabled (thinking messages are collapsed by default)
- **Behavior:**
    - Enabled (default): Thinking blocks remain collapsed until you expand them
    - Disabled: Thinking blocks are expanded by default
- **Notes:**
    - Applies across conversations globally
    - Text is localized; labels may differ by language

---

## VS Code Settings Reference

Mirror VS provides VS Code settings that can be configured through your VS Code `settings.json` file. These settings offer fine-grained control over command execution, task management, API behavior, storage, indexing, and debugging.

To configure these settings, open your VS Code settings (`Ctrl/Cmd + ,`) and search for "mirror-vs", or edit your `settings.json` file directly (`Ctrl/Cmd + Shift + P` → "Preferences: Open User Settings (JSON)").

### Command & Execution

#### `mirror-vs.allowedCommands`

- **Type:** Array of strings
- **Default:** `["git log", "git diff", "git show"]`
- **Description:** Commands that can be auto-executed without approval. When Mirror VS requests to execute a command that matches an entry in this list, it will execute automatically without prompting for approval. Useful for safe, read-only commands.

#### `mirror-vs.deniedCommands`

- **Type:** Array of strings
- **Default:** `[]`
- **Description:** Commands that are always blocked. Mirror VS will refuse to execute any command matching an entry in this list — a safety net for potentially dangerous operations.

#### `mirror-vs.commandExecutionTimeout`

- **Type:** Number (seconds)
- **Default:** `0`
- **Range:** 0-600
- **Description:** Timeout for command execution. When set above 0, commands running longer than this duration are terminated. A value of `0` means no timeout. See `commandTimeoutAllowlist` for exempting specific commands.

#### `mirror-vs.commandTimeoutAllowlist`

- **Type:** Array of strings
- **Default:** `[]`
- **Description:** Commands exempt from execution timeout. Commands matching entries in this list won't be subject to the `commandExecutionTimeout` limit. Handy for known long-running operations like build processes or deployment scripts.

### Task Management

#### `mirror-vs.newTaskRequireTodos`

- **Type:** Boolean
- **Default:** `false`
- **Description:** When enabled, requires a todo list when creating new tasks via subtasks. Ensures structured planning for complex work.

#### `mirror-vs.preventCompletionWithOpenTodos`

- **Type:** Boolean
- **Default:** `false`
- **Description:** Prevents task completion when there are uncompleted todo items. Mirror VS won't let you mark a task as complete if the todo list still has pending items. Accountability! (Or annoyance — you decide.)

### API & Network

#### `mirror-vs.apiRequestTimeout`

- **Type:** Number (seconds)
- **Default:** `600`
- **Range:** 0-3600
- **Description:** Timeout for API requests. Determines how long Mirror VS waits for a response from AI provider APIs before timing out. `0` means no timeout.

### Storage & Import

#### `mirror-vs.customStoragePath`

- **Type:** String
- **Default:** `""` (empty)
- **Description:** Custom file path for Mirror VS's storage directory. By default, Mirror VS stores its data in the standard extension storage location. Use this to specify an alternative directory.

#### `mirror-vs.autoImportSettingsPath`

- **Type:** String
- **Default:** `""` (empty)
- **Description:** File path for automatic settings import on startup. When configured, Mirror VS automatically imports settings from the specified JSON file every time VS Code starts.

### Code Index

#### `mirror-vs.maximumIndexedFilesForFileSearch`

- **Type:** Number
- **Default:** `10000`
- **Range:** 5000-500000
- **Description:** Maximum number of files indexed for file search. Higher values increase search coverage but may impact performance.

#### `mirror-vs.codeIndex.embeddingBatchSize`

- **Type:** Number
- **Default:** `60`
- **Range:** 1-200
- **Description:** Batch size for embedding operations during code indexing. Lower values reduce memory usage but increase processing time; higher values are faster but use more memory. Find your sweet spot.

### Editor Integration

#### `mirror-vs.enableCodeActions`

- **Type:** Boolean
- **Default:** `true`
- **Description:** Controls whether Mirror VS actions appear in the editor context menu and lightbulb. When enabled, you can right-click or use the lightbulb menu to quickly send code selections to Mirror VS.

#### `mirror-vs.vsCodeLmModelSelector`

- **Type:** Object
- **Default:** `{}`
- **Description:** Configuration for VS Code Language Model API provider selection. Allows you to specify vendor and family properties to control which language model is used. See [VS Code LM API documentation](/providers/vscode-lm) for details.

### Rules & Instructions

#### `mirror-vs.useAgentRules`

- **Type:** Boolean
- **Default:** `true`
- **Description:** Enable loading of AGENTS.md files for agent-specific instructions. When enabled, Mirror VS looks for and loads `AGENTS.md` files in your project directories. Disable if you don't want automatic loading.

### Debug

#### `mirror-vs.debug`

- **Type:** Boolean
- **Default:** `false`
- **Description:** Enable debug mode for additional logging. Mirror VS outputs detailed debug information to the console for troubleshooting.

#### `mirror-vs.debugProxy.enabled`

- **Type:** Boolean
- **Default:** `false`
- **Description:** Enable debug proxy for intercepting API requests. All API requests are routed through a debug proxy server for inspection.

#### `mirror-vs.debugProxy.serverUrl`

- **Type:** String
- **Default:** `"http://127.0.0.1:8888"`
- **Description:** URL of the debug proxy server. Common tools like mitmproxy or Charles Proxy typically run on this default address.

#### `mirror-vs.debugProxy.tlsInsecure`

- **Type:** Boolean
- **Default:** `false`
- **Description:** Allow insecure TLS connections through the debug proxy. Certificate validation errors are ignored. Only enable this in development environments — and maybe not even then.
