---
sidebar_label: Your First Task
description: Time to make Mirror VS actually do something. A beginner-friendly walkthrough of your first interaction — approvals, iterations, and all.
keywords:
    - Mirror VS tutorial
    - first task
    - getting started
    - AI coding assistant tutorial
    - approval workflow
---

import KangamirrorIcon from '@site/src/components/KangamirrorIcon';

# Your first task

You've [connected your AI provider](/getting-started/connecting-api-provider). Now let's make Mirror VS earn its keep.

---

## Step 1: Open the Mirror VS Panel

Spot the Mirror VS icon (<KangamirrorIcon />) in the Activity Bar (that vertical strip on the side of VS Code). Click it.

<figure>
  <img src="/img/your-first-task/your-first-task.png" alt="Mirror VS icon in VS Code Activity Bar" width="600" />
  <figcaption>That little icon is your portal to AI-assisted development. Try not to abuse it. (Okay, you can abuse it.)</figcaption>
</figure>

## Step 2: Type Your Task

At the bottom of the panel, type what you want — plain English, no incantations required. Try something like:

- "Create a file named `hello.txt` containing 'Hello, world!'."
- "Write a Python function that adds two numbers."
- "Create an HTML file for a simple website with the title 'Mirror test'"

No magic words. No `/commands` to memorize. Just... say it.

<figure>
  <img src="/img/your-first-task/your-first-task-6.png" alt="Typing a task in the Mirror VS chat interface" width="400" />
  <figcaption>See? You just type stuff. It's almost disappointingly simple.</figcaption>
</figure>

## Step 3: Send It

Hit Enter or click the Send icon (<Codicon name="send" />). Watch the AI spring into action.

## Step 4: Review and Approve

Mirror VS will analyze your request and propose actions. Here's what you might see:

- **Reading files:** It shows what it needs to peek at
- **Writing to files:** A diff view — green for new stuff, red for bye-bye stuff
- **Executing commands:** The exact terminal command it wants to run (no surprises)
- **Using the Browser:** It'll outline what it's clicking and typing
- **Asking questions:** Yep, it knows when it doesn't know

<figure>
  <img src="/img/your-first-task/your-first-task-7.png" alt="Reviewing a proposed file creation action" width="800" />
  <figcaption>Mirror VS shows you the plan before pulling the trigger. You're the boss.</figcaption>
</figure>

**Every action needs your OK** (unless you've turned on auto-approval, you rebel):

- **Approve:** Click the button. Let it cook.
- **Reject:** Click reject and tell it why. It learns.

## Step 5: Rinse and Repeat

Mirror VS works iteratively. It does something, waits for your feedback, then does the next thing. Back and forth until the job's done.

<figure>
  <img src="/img/your-first-task/your-first-task-8.png" alt="Final result of a completed task showing the iteration process" width="500" />
  <figcaption>Task complete. Mirror VS awaits your next command. You're basically a manager now.</figcaption>
</figure>

---

## You Did It

You've completed your first task with Mirror VS. Here's what you've learned:

- Natural language works — no syntax bootcamp required
- You're always in the driver's seat with the approval workflow
- Mirror VS solves problems one step at a time (no skipping ahead)

Now go tackle something real. Explore different [modes](/basic-usage/using-modes) for specialized workflows, or enable [auto-approval](/features/auto-approving-actions) once you've built up enough trust. The IDE is yours.
