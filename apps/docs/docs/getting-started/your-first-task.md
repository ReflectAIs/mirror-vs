---
sidebar_label: Your First Task
description: Learn how to start your first task with Mirror VS AI assistant. Step-by-step guide for beginners to understand the approval workflow and iterative process.
keywords:
    - Mirror VS tutorial
    - first task
    - getting started
    - AI coding assistant tutorial
    - approval workflow
---

import KangamirrorIcon from '@site/src/components/KangamirrorIcon';

# Your first task

Now that you've [configured your AI provider and model](/getting-started/connecting-api-provider), you're ready to start using Mirror VS! This guide walks you through your first interaction.

---

## Step 1: Open the Mirror VS Panel

Click the Mirror VS icon (<KangamirrorIcon />) in the VS Code Activity Bar (vertical bar on the side of the window) to open the chat interface. If you don't see the icon, verify the extension is installed and enabled.

<figure>
  <img src="/img/your-first-task/your-first-task.png" alt="Mirror VS icon in VS Code Activity Bar" width="600" />
  <figcaption>The Mirror VS icon in the Activity Bar opens the chat interface. You can drag it to position Mirror elsewhere.</figcaption>
</figure>

## Step 2: Type Your Task

Type a clear, concise description of what you want Mirror VS to do in the chat box at the bottom of the panel. Examples of effective tasks:

- "Create a file named `hello.txt` containing 'Hello, world!'."
- "Write a Python function that adds two numbers."
- "Create an HTML file for a simple website with the title 'Mirror test'"

No special commands or syntax needed—just use plain English.

<figure>
  <img src="/img/your-first-task/your-first-task-6.png" alt="Typing a task in the Mirror VS chat interface" width="400" />
  <figcaption>Enter your task in natural language - no special syntax required.</figcaption>
</figure>

## Step 3: Send Your Task

Press Enter or click the Send icon (<Codicon name="send" />) to the right of the input box.

## Step 4: Review and Approve Actions

Mirror VS analyzes your request and proposes specific actions. These may include:

- **Reading files:** Shows file contents it needs to access
- **Writing to files:** Displays a diff with proposed changes (added lines in green, removed in red)
- **Executing commands:** Shows the exact command to run in your terminal
- **Using the Browser:** Outlines browser actions (click, type, etc.)
- **Asking questions:** Requests clarification when needed to proceed

<figure>
  <img src="/img/your-first-task/your-first-task-7.png" alt="Reviewing a proposed file creation action" width="800" />
  <figcaption>Mirror VS shows exactly what action it wants to perform and waits for your approval.</figcaption>
</figure>

**Each action requires your explicit approval** (unless auto-approval is enabled):

- **Approve:** Click the "Approve" button to execute the proposed action
- **Reject:** Click the "Reject" button and provide feedback if needed

## Step 5: Iterate

Mirror VS works iteratively. After each action, it waits for your feedback before proposing the next step. Continue this review-approve cycle until your task is complete.

<figure>
  <img src="/img/your-first-task/your-first-task-8.png" alt="Final result of a completed task showing the iteration process" width="500" />
  <figcaption>After completing the task, Mirror VS shows the final result and awaits your next instruction.</figcaption>
</figure>

---

## Conclusion

You've now completed your first task with Mirror VS! Through this process, you've learned:

- How to interact with Mirror VS using natural language
- The approval-based workflow that keeps you in control
- The iterative approach Mirror VS uses to solve problems step-by-step

This iterative, approval-based workflow is at the core of how Mirror VS works—letting AI handle the tedious parts of coding while you maintain complete oversight. Now that you understand the basics, you're ready to tackle more complex tasks, explore different [modes](/basic-usage/using-modes) for specialized workflows, or try the [auto-approval feature](/features/auto-approving-actions) to speed up repetitive tasks.
