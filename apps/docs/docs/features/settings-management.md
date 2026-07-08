---
sidebar_label: Import/Export/Reset Settings
description: Manage your Mirror VS settings by exporting, importing, or resetting them to defaults.
keywords:
    - settings management
    - import settings
    - export settings
    - reset settings
    - configuration backup
    - auto import
---

# Import, Export, and Reset Settings

Mirror VS allows you to manage your configuration settings effectively through export, import, and reset options. These features are useful for backing up your setup, sharing configurations with others, or restoring default settings if needed.

You can find these options at the bottom of the Mirror VS settings page, accessible via the gear icon (<i class="codicon codicon-gear"></i>) in the Mirror VS chat view.

<img src="/img/settings-management/settings-management.png" alt="Export, Import, and Reset buttons in Mirror VS settings" width="400" />
*Image: Export, Import, and Reset buttons.*

---

## Export Settings

Clicking the **Export** button saves your current Mirror VS settings to a JSON file.

- **What's Exported:** The file includes your configured API Provider Profiles and Global Settings (UI preferences, mode configurations, context settings, etc.).
- **Security Warning:** The exported JSON file contains **all** your configured API Provider Profiles and Global Settings. Crucially, this includes **API keys in plaintext**. Treat this file as highly sensitive. Do not share it publicly or with untrusted individuals, as it grants access to your API accounts.
- **Process:**
    1.  Click **Export**.
    2.  A file save dialog appears, suggesting `mirror-code-settings.json` as the filename (usually in your `~/Documents` folder).
    3.  Choose a location and save the file.

This creates a backup of your configuration or a file you can share.

---

## Import Settings

Clicking the **Import** button allows you to load settings from a previously exported JSON file.

- **Process:**
    1.  Click **Import**.
    2.  A file open dialog appears. Select the `mirror-code-settings.json` file (or similarly named file) you want to import.
    3.  Mirror VS reads the file, validates its contents against the expected schema, and applies the settings.
- **Merging:** Importing settings **merges** the configurations. It adds new API profiles and updates existing ones and global settings based on the file content. It does **not** delete configurations present in your current setup but missing from the imported file.
- **Validation:** Import validates the file, but it can still succeed with warnings.

    - If **some** API profiles reference a provider that no longer exists (or is otherwise invalid), Mirror imports the rest and reports warnings.
    - Import fails only if **all** profiles are invalid.

---

## Automatic Configuration Import

Automatically import your Mirror VS settings from a file every time you start VS Code. This is a powerful way to sync your configuration across multiple machines or standardize settings for your entire team.

### Key Features

- **Effortless Sync**: Keep your settings consistent across different workspaces and devices.
- **Team Standardization**: Share a single configuration file to ensure your whole team uses the same settings.
- **Flexible Pathing**: Works with absolute paths, or paths relative to your home directory (e.g., `~/Documents/mirror-settings.json`).
- **Silent & Safe**: If the file isn't found or contains errors, Mirror VS starts up normally without blocking your workflow.

### Use Case

**Before**: Manually exporting and importing settings every time you moved to a new machine or wanted to share your setup.

- Manually open the settings panel.
- Export your current settings to a file.
- Send the file to a teammate or a new machine.
- Manually import the file.

**With this feature**: Configure the path once, and Mirror VS handles the rest on every launch.

### How it Works

When VS Code starts, Mirror VS checks for a specific setting: `mirror-vs.autoImportSettingsPath`. If this setting contains a path to a valid Mirror VS configuration file (`.json`), Mirror VS will load it automatically.

- Upon successful import, you will see a notification: `Successfully imported settings from [your-file-name.json]`.
- If the file is invalid or can't be found, you'll get a non-intrusive warning, and the extension will start with your last known settings. The `autoImportSettings` function is designed to never block the extension from activating.

### Configuration

To use this feature, add the following to your VS Code `settings.json` file:

1.  **Open your `settings.json` file**:

    - Use the Command Palette (`Ctrl/Cmd + Shift + P`) and search for "Preferences: Open User Settings (JSON)".

2.  **Add the setting**:
    - Add the `mirror-vs.autoImportSettingsPath` key with the path to your configuration file.

**Examples**:

- **Absolute Path (Recommended)**

    ```json
    {
    	"mirror-vs.autoImportSettingsPath": "/Users/your-username/Documents/dev-configs/mirror-code.json"
    }
    ```

- **Home Directory Path** (using `~`)

    ```json
    {
    	"mirror-vs.autoImportSettingsPath": "~/mirror-code-settings.json"
    }
    ```

- **To disable**, simply leave the path empty or remove the line entirely:
    ```json
    {
    	"mirror-vs.autoImportSettingsPath": ""
    }
    ```

### FAQ

**"What happens if my file has an error?"**

- Mirror VS will show a warning notification with the error details. The extension will continue to load normally with your previously saved settings.

**"Where does Mirror VS look for relative paths?"**

- For safety and consistency, paths that are not absolute or home-directory-based are resolved relative to your home directory.

**"Can I use this to manage settings for my team?"**

- Yes. Place the configuration file in a shared location (like a synced cloud folder or a shared network drive) and have each team member point to that file.

---

## Reset Settings

Clicking the **Reset** button completely clears all Mirror VS configuration data and returns the extension to its default state. This is a destructive action intended for troubleshooting or starting fresh.

- **Warning:** This action is **irreversible**. It permanently deletes all API configurations (including keys stored in secret storage), custom modes, global settings, and task history.

- **Process:**

    1.  Click the red **Reset** button.
    2.  A confirmation dialog appears, warning that the action cannot be undone.
    3.  Click "Yes" to confirm.

- **What is Reset:**

    - **API Provider Profiles:** All configurations are deleted from settings and secret storage.
    - **Global Settings:** All preferences (UI, modes, approvals, browser, etc.) are reset to defaults.
    - **Custom Modes:** All user-defined modes are deleted.
    - **Secret Storage:** All API keys and other secrets managed by Mirror VS are cleared.
    - **Task History:** The current task stack is cleared.

- **Result:** Mirror VS returns to its initial state, as if freshly installed, with default settings and no user configurations.

Use this option only if you are certain you want to remove all Mirror VS data or if instructed during troubleshooting. Consider exporting your settings first if you might want to restore them later.

---

## Command Palette Commands

Mirror VS provides several useful commands accessible via the VS Code Command Palette (`Ctrl/Cmd + Shift + P`). These commands offer alternative ways to manage your settings and storage.

### Set Custom Storage Path

**Command:** `mirror-vs.setCustomStoragePath`

Opens a dialog to set a custom storage directory for Mirror VS data. By default, Mirror VS stores task history, settings, and other data in the standard VS Code extension storage location. This command allows you to choose an alternative location.

**Use cases:**

- **Team Collaboration**: Store Mirror VS data in a shared network folder so team members can access the same task history and settings
- **Drive Management**: Keep data on a specific drive (e.g., a larger secondary drive instead of your primary SSD)
- **Cloud Sync**: Store data in a cloud-synced folder (Dropbox, OneDrive, etc.) to sync across multiple machines
- **Backup Strategy**: Place data in a location that's included in your regular backup routine

**To use:**

1. Open the Command Palette (`Ctrl/Cmd + Shift + P`)
2. Type "Set Custom Storage Path" or search for `mirror-vs.setCustomStoragePath`
3. Select the command
4. Choose a directory in the file picker dialog
5. Restart VS Code for the change to take effect

**Note:** This setting can also be configured in VS Code settings as `mirror-vs.customStoragePath`. See the [VS Code Settings Reference](#vs-code-settings-reference) section below for details.

### Import Settings from File

**Command:** `mirror-vs.importSettings`

Imports Mirror VS settings from a JSON file via the Command Palette. This is an alternative to using the Import button in the settings UI.

**To use:**

1. Open the Command Palette (`Ctrl/Cmd + Shift + P`)
2. Type "Import Settings" or search for `mirror-vs.importSettings`
3. Select the command
4. Choose your settings JSON file in the file picker dialog
5. Settings will be imported and merged with your current configuration

This command provides the same functionality as the Import button described in the [Import Settings](#import-settings) section above.

---

## UI Setting

#### System Prompt Context Toggles

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

With both disabled, these sections are omitted, reducing token usage when you don't need this context.

#### Collapse thinking messages by default

- Location: Settings → UI
- Default: Enabled (thinking messages are collapsed by default)
- Behavior:
    - Enabled (default): Thinking blocks remain collapsed until you expand them.
    - Disabled: Thinking blocks are expanded by default.
- Notes:
    - Applies across conversations globally.
    - Text is localized; labels may differ by language.

---

## VS Code Settings Reference

Mirror VS provides VS Code settings that can be configured through your VS Code `settings.json` file. These settings offer fine-grained control over command execution, task management, API behavior, storage, indexing, and debugging.

To configure these settings, open your VS Code settings (`Ctrl/Cmd + ,`) and search for "mirror-vs", or edit your `settings.json` file directly (`Ctrl/Cmd + Shift + P` → "Preferences: Open User Settings (JSON)").

### Command & Execution

#### `mirror-vs.allowedCommands`

- **Type**: Array of strings
- **Default**: `["git log", "git diff", "git show"]`
- **Description**: Commands that can be auto-executed without approval. When Mirror VS requests to execute a command that matches an entry in this list, it will execute automatically without prompting for approval. This is useful for safe, read-only commands.

#### `mirror-vs.deniedCommands`

- **Type**: Array of strings
- **Default**: `[]`
- **Description**: Commands that are always blocked from execution. Mirror VS will refuse to execute any command that matches an entry in this list, providing a safety mechanism to prevent potentially dangerous operations.

#### `mirror-vs.commandExecutionTimeout`

- **Type**: Number (seconds)
- **Default**: `0`
- **Range**: 0-600
- **Description**: Timeout in seconds for command execution. When set to a value greater than 0, commands running longer than this duration will be terminated. A value of 0 means no timeout (commands can run indefinitely). See also `commandTimeoutAllowlist` for exempting specific commands.

#### `mirror-vs.commandTimeoutAllowlist`

- **Type**: Array of strings
- **Default**: `[]`
- **Description**: Commands exempt from execution timeout. Commands matching entries in this list will not be subject to the `commandExecutionTimeout` limit, allowing them to run without time restrictions. Useful for known long-running operations like build processes or deployment scripts.

### Task Management

#### `mirror-vs.newTaskRequireTodos`

- **Type**: Boolean
- **Default**: `false`
- **Description**: When enabled, requires a todo list when creating new tasks via boomerang/subtasks. This ensures structured planning for complex work by mandating that new tasks include a checklist of steps to complete.

#### `mirror-vs.preventCompletionWithOpenTodos`

- **Type**: Boolean
- **Default**: `false`
- **Description**: Prevents task completion when there are uncompleted todo items. When enabled, Mirror VS will not allow you to mark a task as complete if the todo list still has pending items, ensuring all planned work is finished.

### API & Network

#### `mirror-vs.apiRequestTimeout`

- **Type**: Number (seconds)
- **Default**: `600`
- **Range**: 0-3600
- **Description**: Timeout in seconds for API requests. Determines how long Mirror VS will wait for a response from AI provider APIs before timing out. A value of 0 means no timeout.

### Storage & Import

#### `mirror-vs.customStoragePath`

- **Type**: String
- **Default**: `""` (empty)
- **Description**: Custom file path for Mirror VS's storage directory. By default, Mirror VS stores its data in the standard extension storage location. Use this setting to specify an alternative directory for storing task history, settings, and other data.

#### `mirror-vs.autoImportSettingsPath`

- **Type**: String
- **Default**: `""` (empty)
- **Description**: File path for automatic settings import on startup. When configured, Mirror VS will automatically import settings from the specified JSON file every time VS Code starts. See the [Automatic Configuration Import](#automatic-configuration-import) section above for detailed usage instructions.

### Code Index

#### `mirror-vs.maximumIndexedFilesForFileSearch`

- **Type**: Number
- **Default**: `10000`
- **Range**: 5000-500000
- **Description**: Maximum number of files indexed for file search. Controls the upper limit of files that Mirror VS will index for semantic search functionality. Higher values increase search coverage but may impact performance.

#### `mirror-vs.codeIndex.embeddingBatchSize`

- **Type**: Number
- **Default**: `60`
- **Range**: 1-200
- **Description**: Batch size for embedding operations during code indexing. Determines how many code chunks are processed together when generating embeddings for semantic search. Lower values reduce memory usage but increase processing time; higher values are faster but use more memory.

### Editor Integration

#### `mirror-vs.enableCodeActions`

- **Type**: Boolean
- **Default**: `true`
- **Description**: Controls whether Mirror VS actions appear in the editor context menu and lightbulb. When enabled, you can right-click in the editor or use the lightbulb menu to quickly send code selections to Mirror VS with contextual prompts.

#### `mirror-vs.vsCodeLmModelSelector`

- **Type**: Object
- **Default**: `{}`
- **Description**: Configuration for VS Code Language Model API provider selection. Allows you to specify vendor and family properties to control which language model is used when the VS Code LM API provider is selected. See [VS Code LM API documentation](/providers/vscode-lm) for details.

### Rules & Instructions

#### `mirror-vs.useAgentRules`

- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable loading of AGENTS.md files for agent-specific instructions. When enabled, Mirror VS will look for and load `AGENTS.md` files in your project directories to provide context-specific guidance to the AI. Disable this if you want to prevent automatic loading of these instruction files.

### Debug

#### `mirror-vs.debug`

- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable debug mode for additional logging. When enabled, Mirror VS will output detailed debug information to the console, useful for troubleshooting issues or understanding internal behavior.

#### `mirror-vs.debugProxy.enabled`

- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable debug proxy for intercepting API requests. When enabled, all API requests will be routed through a debug proxy server, allowing you to inspect and debug API communications.

#### `mirror-vs.debugProxy.serverUrl`

- **Type**: String
- **Default**: `"http://127.0.0.1:8888"`
- **Description**: URL of the debug proxy server. Specifies the proxy server address used when `debugProxy.enabled` is true. Common debug proxy tools like mitmproxy or Charles Proxy typically run on this default address.

#### `mirror-vs.debugProxy.tlsInsecure`

- **Type**: Boolean
- **Default**: `false`
- **Description**: Allow insecure TLS connections through the debug proxy. When enabled, certificate validation errors will be ignored, which is necessary when using self-signed certificates with debug proxies. Only enable this in development environments.
