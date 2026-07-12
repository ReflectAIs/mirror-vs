---
sidebar_label: Keyboard Shortcuts
title: Keyboard Shortcuts
description: Keep your hands on the keyboard where they belong — every shortcut you need to fly through Mirror VS.
keywords:
    - keyboard shortcuts
    - keybindings
    - keyboard navigation
    - prompt history
    - accessibility
---

# Keyboard Shortcuts

Mice are for mousing. Keyboards are for _shredding_. Mirror VS comes with a set of keyboard shortcuts and navigation features that'll have you zipping around like a terminal wizard — no trackpad required.

## Available Keyboard Commands

Mirror VS registers several VS Code commands that you can bind to keyboard shortcuts for rapid access:

| Command ID                | What It Does                           | Default Binding |
| ------------------------- | -------------------------------------- | :-------------: |
| `mirror-vs.acceptInput`   | Submit the current prompt              | ⚡ Configurable |
| `mirror-vs.fixWithAI`     | Run AI fix on selected code            | ⚡ Configurable |
| `mirror-vs.explainWithAI` | Get AI explanation for selected code   | ⚡ Configurable |
| `mirror-vs.addToContext`  | Add selection as context for Mirror VS | ⚡ Configurable |

### Key Benefits of Keyboard Commands

- **Speed** — Submit prompts and trigger actions without leaving the keyboard
- **Flow** — Maintain your coding rhythm without context-switching to a mouse
- **Accessibility** — Essential for users who prefer or require keyboard-based navigation
- **Customization** — Bind to any key combination that works for you

## mirror-vs.acceptInput Command

This is the big one. The `mirror-vs.acceptInput` command submits whatever you've typed in the chat input, just like clicking the send button — but with keyboard swagger.

### What It Does

- Submits the current prompt in the chat input
- Works from anywhere in VS Code (not just the chat panel)
- Respects the same validation as the send button

### Setting It Up

#### Method 1: Using the VS Code UI

1. Open VS Code
2. Press `Cmd/Ctrl + K`, then `Cmd/Ctrl + S` to open Keyboard Shortcuts
3. Search for "Mirror VS: Accept Input"
4. Click the plus icon to add a keybinding
5. Press your desired key combination (e.g., `Cmd+Enter`)

#### Method 2: Editing keybindings.json directly

For the control freaks (we see you), edit `keybindings.json`:

```json
[
	{
		"key": "cmd+enter",
		"command": "mirror-vs.acceptInput",
		"when": "view == mirror-vs.SidebarProvider || activeWebviewPanelId == mirror-vs.TabPanelProvider"
	},
	{
		"key": "cmd+k cmd+a",
		"command": "mirror-vs.addToContext",
		"when": "editorTextFocus"
	},
	{
		"key": "cmd+k cmd+f",
		"command": "mirror-vs.fixWithAI",
		"when": "editorTextFocus"
	},
	{
		"key": "cmd+k cmd+e",
		"command": "mirror-vs.explainWithAI",
		"when": "editorTextFocus"
	}
]
```

The `when` clause ensures the command only fires when Mirror VS is active. You can customize this to your liking.

#### Recommended Key Combinations

| Key Combo     | Why It Works                  |
| ------------- | ----------------------------- |
| `Cmd+Enter`   | Easy to reach, feels natural  |
| `Ctrl+Enter`  | Windows equivalent            |
| `Alt+Enter`   | If Cmd/Ctrl is already taken  |
| `Shift+Enter` | For multiline input workflows |

## Add to Context Shortcut

This shortcut adds your current code selection as context for Mirror VS — without leaving the editor.

**Default binding:** `Cmd+K Cmd+A` (Mac) / `Ctrl+K Ctrl+A` (Windows/Linux)

### Quick Development Workflows

- Select a function, hit the shortcut — Mirror VS now has context on that function
- Select an error message, hit the shortcut — Mirror VS can help debug it
- Select a comment describing what you want, hit the shortcut — Mirror VS knows what to build

### Keyboard-Centric Development

- Copy code → no need to switch to chat panel
- Add context from anywhere → keeps you in the zone
- No mouse required → ergonomics win

### Accessibility Use Cases

- **Reduced mobility:** Complete workflows without precise mouse movements
- **Screen reader users:** Consistent, predictable keyboard interactions
- **Power users:** Maximize efficiency with custom key combinations

### Accessibility Benefits

- **Predictable behavior:** Commands work reliably across sessions
- **Redundant interaction:** Mouse-dependent features also available via keyboard
- **Customizable:** Adapt keybindings to individual needs

### Keyboard-Centric Workflows

#### Development Workflow Example

1. Select code in editor
2. Press `Cmd+K Cmd+A` to add to context
3. Switch to chat with `Ctrl+Tab` (or your panel shortcut)
4. Type "refactor this" and press `Cmd+Enter` (your acceptInput binding)
5. Watch Mirror VS work its magic

#### Code Review Workflow

1. Select a suspicious block of code
2. Press `Cmd+K Cmd+F` to trigger AI fix
3. Review the suggestion
4. Accept or reject with a single keypress

### Troubleshooting

**Command not firing?**

- Check that the `when` clause matches your current context
- Ensure no other extension is using the same keybinding
- Try restarting VS Code

**Want different keybindings?**

- Open Keyboard Shortcuts (`Cmd/Ctrl + K, Cmd/Ctrl + S`)
- Search for the Mirror VS command
- Double-click to reassign

### Technical Implementation

The `acceptInput` command works by posting a message to the Mirror VS webview, which triggers the same submission logic as clicking the send button. It's not magic — it's just well-wired event handling.

### Limitations

- The command only works when Mirror VS is active (that's what the `when` clause is for)
- It respects all input validation — malformed prompts won't be submitted
- Custom keybindings may conflict with other extensions

---

## Command Line Style Prompt History Navigation

Remember when you could press Up Arrow in the terminal and your last command magically appeared? Mirror VS brings that same superpower to your chat input.

Navigate your prompt history with a terminal-like experience using the arrow keys. This feature makes it easy to reuse and refine previous prompts, whether from your current conversation or past tasks.

### Key Features

- **Up/Down Arrows** — Cycle through previous prompts
- **Context-Aware** — Switches between conversation and task history
- **Preserves Input** — Remembers what you were typing

### Why This Matters

**Before:** Reusing a prompt meant scrolling up, copying, and pasting. Tedious, slow, and interruptive.

**With Prompt History Navigation:** Quickly access past prompts without leaving the keyboard. Your flow stays intact.

### How it Works

The navigation is designed to be intuitive and adapt to your current context.

#### In an Active Conversation

- **Arrow Up** — Shows the last prompt you sent. Keep pressing to go further back.
- **Arrow Down** — Moves forward through the conversation history, eventually returning to the text you were typing.

#### Starting a New Chat

- **Arrow Up** — Shows the most recent prompt from your task history in the current workspace.
- **Arrow Down** — Moves forward through your task history.

#### Edge Cases

- If you start typing while navigating, the history is dismissed and your new text is preserved.
- Navigation only works when your cursor is on the first or last line of the input box — to avoid interfering with multi-line editing.

### Configuration

This feature is enabled by default. There's nothing to configure — just start pressing arrow keys.

### Benefits

- **Faster Workflow** — Reuse prompts without using the mouse
- **Better Context** — Easily access and build upon previous interactions
- **Less Interruption** — Stay focused on the task at hand

### Common Questions

**"Why doesn't anything happen when I press the up arrow?"**

- You might be in the middle of a multi-line prompt. The cursor must be on the first line.
- There might be no history available for the current context.

**"What's the difference between conversation and task history?"**

- **Conversation history** includes prompts from your current, active chat session.
- **Task history** includes the initial prompts from all previous tasks in your current workspace.

---

## See Also

- [The Chat Interface](/basic-usage/the-chat-interface) — Understanding the chat panel
- [Typing Your Requests](/basic-usage/typing-your-requests) — Crafting effective prompts
