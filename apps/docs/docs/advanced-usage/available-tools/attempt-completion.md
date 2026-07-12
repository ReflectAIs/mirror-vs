---
description: Learn how the attempt_completion tool signals task completion, presents results, and enables iterative refinement in Mirror VS.
keywords:
    - attempt_completion
    - task completion
    - result presentation
    - Mirror VS tools
    - user feedback
    - task summary
---

# attempt_completion

The `attempt_completion` tool is Mirror VS's way of saying "I think I'm done — here's what I did." It signals task completion, presents results, and optionally runs a command to show off the finished work.

---

## Parameters

- `result` (required): A summary of what was accomplished
- `command` (optional): A CLI command to execute to demonstrate the result

---

## What It Does

Marks the end of a task with a clear summary. Think of it as the mic drop moment — Mirror VS presents what it did, optionally demonstrates it, and waits for your feedback.

---

## When Is It Used?

- When the AI believes the task is complete
- When summarizing changes or improvements made
- When demonstrating results via a command
- When providing a checkpoint for your feedback
- When transitioning work phases

---

## Key Features

- Clear "task done" signal to you and the system
- Concise summary of accomplishments
- Optional command to demonstrate results live
- Enables feedback for further refinement
- Special UI format distinct from regular messages
- Supports subtask completion within larger workflows
- Available in all modes

---

## Limitations

- Should only be used when genuinely done (patience is a virtue)
- Limited to one demonstration command
- Commands need your approval before running
- Can only demonstrate things visible via CLI

---

## How It Works

1. **Safety check** (guideline): Confirms previous tool uses were successful
2. **Presents** the completion message in a special UI format
3. **Executes** the optional demonstration command (with your approval)
4. **Collects** your feedback for any further refinements
5. **Marks** the task as complete and captures telemetry

---

## Usage Examples

Simple completion:

```xml
<attempt_completion>
<result>
I've updated the navigation bar CSS to match the design mockup:
1. Updated color scheme to new brand colors
2. Added responsive behavior for mobile
3. Fixed dropdown menu alignment
</result>
</attempt_completion>
```

Completion with demonstration:

```xml
<attempt_completion>
<result>
I've created a React application with:
1. A responsive landing page with the hero section
2. A working contact form with validation
3. Navigation between all three pages
</result>
<command>npm start</command>
</attempt_completion>
```
