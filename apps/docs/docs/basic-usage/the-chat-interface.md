---
description: Learn how to use the Mirror VS chat interface effectively. Understand the layout, features, and best practices for communicating with your AI coding assistant.
keywords:
    - Mirror VS chat interface
    - AI assistant interaction
    - chat features
    - user interface
    - VS Code extension
---

import KangamirrorIcon from '@site/src/components/KangamirrorIcon';

# The Chat Interface

The Mirror VS chat interface is your cockpit, your command center, your bridge on the starship Enterprise. It's where you and Mirror VS have conversations that actually get things done.

To open it, click the Mirror VS icon (<KangamirrorIcon />) in the VS Code Activity Bar — that little sidebar on the left that's been collecting dust while you memorized keyboard shortcuts.

---

## Components of the Chat Interface

Here's what you'll see, broken down like a UI designer's sketchbook:

1. **Chat History:** The scrollable story of you and Mirror VS. Every request, every response, every file edit and command execution — it's all there. Relive the glory. Learn from the mistakes.

2. **Input Field:** The big blank box where you type things. Use plain English. Full sentences. Emojis. Whatever works. Mirror VS speaks fluent human.

3. **Action Buttons:** These pop up when Mirror proposes doing something — like editing a file or running a command. Approve or reject with a single click. You are the gatekeeper. Use your power wisely.

4. **Send Button:** A little paper plane icon to the far right of the input field. Click it to launch your message into the AI ether. Or just press `Enter`. We won't judge.

5. **Plus Button (+):** Located at the top in the header. Click it to start a fresh conversation. Think of it as a reset button for your brain — but for Mirror VS.

6. **Settings Button (⚙️):** A gear icon for customizing features and behavior. Tweak away. Break things. Then fix them. It's fine.

7. **Mode Selector:** A dropdown to the left of the chat input. Pick which mode Mirror should use — Code, Ask, Architect, Debug, or Orchestrator. Its little gear icon opens the Modes tab (not general settings — don't get confused).

<img src="/img/the-chat-interface/the-chat-interface-1.png" alt="Chat interface components labeled with numbered callouts" width="900" />

_Numbered interface elements showing the key components of the Mirror VS chat interface._

---

## Tip: Using the Secondary Sidebar

Here's a pro tip that'll change your life: drag Mirror VS to VS Code's [Secondary Sidebar](https://code.visualstudio.com/api/ux-guidelines/sidebars#secondary-sidebar).

Why? Because now you can keep Mirror VS open on the right **while** still having Explorer, Search, Source Control, and everything else on the left. It's like having two monitors without buying a second monitor.

To set this up:

1. Click and drag the Mirror VS icon from the Activity Bar
2. Drop it on the right side of your editor
3. Boom. Dual-pane productivity. You're welcome.

For more productivity tips, check out our [Tips & Tricks](/tips-and-tricks) guide.

---

## Interacting with Messages

- **Clickable Links:** File paths, URLs, and other mentions in the chat are clickable. Click a file path → it opens in the editor. Click a URL → your browser pops up. It's like magic, but powered by electrons.
- **Copying Text:** Select text and use the standard copy command (Ctrl/Cmd + C). Code blocks even have a dedicated "Copy" button, because we know you're going to paste that code somewhere.
- **Expanding and Collapsing:** Click on a message to expand or collapse it. Tame the chat history beast.

---

## Status Indicators

- **Loading Spinner:** Mirror VS is thinking. Processing. Pondering the mysteries of your codebase. Be patient — good things take time.
- **Error Messages:** Red means something broke. Don't panic. Read the message, fix the thing, try again.
- **Success Messages:** Green means victory. Celebrate internally. Then move on to the next task.
