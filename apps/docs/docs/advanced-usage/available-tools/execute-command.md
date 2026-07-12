---
description: Master the execute_command tool for running CLI commands, managing terminals, and automating system operations in Mirror VS.
keywords:
    - execute_command
    - CLI commands
    - terminal
    - system operations
    - Mirror VS tools
    - command execution
    - shell integration
---

# execute_command

The `execute_command` tool is Mirror VS's hands. When the AI needs to run something in your terminal — install packages, build projects, start servers — this is the tool it reaches for.

---

## Parameters

- `command` (required): The CLI command to execute. Must be valid for your operating system.
- `cwd` (optional): The working directory to run the command in. Defaults to the current directory.

---

## What It Does

Executes terminal commands directly on your system. Commands run in managed terminal instances with real-time output capture, integrated with VS Code's terminal system. Think of it as giving Mirror VS its own terminal window — one it shares with you, transparently.

---

## When Is It Used?

- Installing dependencies (`npm install`, `pip install`, etc.)
- Building or compiling code (`make`, `npm run build`)
- Starting development servers or running applications
- Initializing projects (`git init`, `npm init`)
- Running tests or linting
- Any terminal operation that needs doing

---

## Key Features

- Integrates with VS Code's shell API for reliable execution
- Reuses terminal instances when possible (no terminal explosion)
- Captures output line by line with real-time feedback
- Supports long-running commands (servers, watchers, etc.)
- Allows custom working directories
- Maintains terminal history across commands
- Handles complex command chains (&&, ||, pipes)
- Provides detailed exit code interpretation
- Shows terminals during execution for full transparency
- Validates commands for security (blocks dangerous patterns like `$(...)`)
- Respects `.mirrorignore` rules for file access
- Strips ANSI escape sequences for clean output

---

## Limitations

- Command access may be restricted by `.mirrorignore` and security rules
- Elevated permission commands may need user configuration
- Behavior varies across operating systems
- Very long-running commands need specific handling
- File paths should be escaped per OS shell rules

---

## How It Works

1. **Validation & Security** — Parses the command, checks for dangerous patterns, validates against `.mirrorignore`
2. **Terminal Management** — Gets or creates a terminal, sets up working directory, prepares output capture
3. **Execution** — Runs via VS Code's shell integration, captures output with 100ms throttling
4. **Result Processing** — Strips escape sequences, interprets exit codes, provides status

---

## Usage Examples

Running a dev server:

```xml
<execute_command>
<command>npm run dev</command>
</execute_command>
```

Installing dependencies:

```xml
<execute_command>
<command>npm install express mongoose dotenv</command>
</execute_command>
```

Running in a specific directory:

```xml
<execute_command>
<command>git status</command>
<cwd>./my-project</cwd>
</execute_command>
```

Chaining commands:

```xml
<execute_command>
<command>npm run build && npm start</command>
</execute_command>
```
