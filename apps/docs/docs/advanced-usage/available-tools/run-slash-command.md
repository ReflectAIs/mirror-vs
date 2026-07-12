---
description: Execute predefined slash commands that provide templated instructions for common tasks, with support for built-in, global, and project-specific commands in Mirror VS.
keywords:
    - run_slash_command
    - slash commands
    - command templates
    - Mirror VS tools
    - workflow automation
    - instruction templates
    - custom commands
    - experimental feature
---

# `run_slash_command` — Predefined Workflows at Your Fingertips

Think of [`run_slash_command`](run-slash-command.md) as Mirror VS's collection of macro shortcuts — reusable instruction templates for common tasks. Need to init a project? Run a deployment checklist? There's a command for that.

> ⚠️ **Experimental Feature**: This tool must be explicitly enabled in Settings → Experimental Settings → "Run Slash Command".

## Parameters

| Parameter | Type     | Required | Description                                         |
| --------- | -------- | -------- | --------------------------------------------------- |
| `command` | `string` | ✅       | Name of the slash command (without the leading `/`) |
| `args`    | `string` | ❌       | Additional context to pass to the command           |

## What It Does

[`run_slash_command`](run-slash-command.md) retrieves and executes instruction templates defined as markdown files in designated command directories. Commands can exist at three levels — built-in, global (`~/.mirror/commands/`), and project-specific (`.mirror/commands/`) — with a clear priority hierarchy: project > global > built-in.

## When Is It Used?

- When executing standardized workflows that require consistent steps
- When retrieving project-specific or team-wide instruction templates
- When initializing codebases with analysis and documentation (built-in `/init`)
- When accessing complex multi-step processes as single commands
- When maintaining consistency across team development practices

## Key Features

- **Three-Level Command System**: Built-in, global (`~/.mirror/commands/`), and project-specific (`.mirror/commands/`) commands
- **Priority Hierarchy**: Project commands override global, which override built-in
- **Markdown-Based Templates**: Simple `.md` files with optional YAML frontmatter for metadata
- **Dynamic Arguments**: Pass context-specific arguments to customize command execution
- **Automatic Discovery**: Commands are automatically found from their respective directories
- **Safe Execution**: Commands are text-only instructions (not executable code) requiring user approval
- **No Registration Required**: Just drop `.md` files in the right directory

## Requirements

This tool must be explicitly enabled: Settings → Experimental Settings → "Run Slash Command" → enable → restart VS Code if necessary.

## Limitations

- **Experimental** — Disabled by default, requires explicit opt-in
- **Text-only instructions** — Commands provide guidance, not executable code
- **Approval required** — All command executions need the green light
- **Directory-based** — Commands must be in specific directory locations
- **Case-sensitive** — Command names are matched with case sensitivity

## How It Works

1. **Experimental flag check** — Verifies the feature is enabled
2. **Command resolution** — Searches project directory (`.mirror/commands/`) → global directory (`~/.mirror/commands/`) → built-in commands
3. **Command loading** — Reads the markdown file, parses optional YAML frontmatter
4. **Response formatting** — Returns command name, source location, description, and full content

### Built-in Commands

- **`/init`** — The only current built-in command. Analyzes your codebase structure, creates AGENTS.md documentation, identifies coding patterns, and provides AI-friendly project context.

### Creating Custom Commands

```bash
# Project-specific commands
mkdir -p .mirror/commands
touch .mirror/commands/deploy.md
```

Commands are markdown files with optional frontmatter:

```markdown
---
description: Brief description of what this command does
argument-hint: What arguments this command accepts
---

# Command Content

Step-by-step instructions, code templates, configuration examples...
```

## Usage Examples

```
<run_slash_command>
<command>init</command>
</run_slash_command>
```

A custom deployment command with arguments:

```
<run_slash_command>
<command>deploy</command>
<args>staging version=2.1.0</args>
</run_slash_command>
```

## Relation to Other Tools

[`run_slash_command`](run-slash-command.md) is the workflow automation tool — it's like having reusable playbooks for Mirror VS. While [`new_task`](new-task.md) delegates to different modes, slash commands give you structured, repeatable instruction sets within the current conversation.
