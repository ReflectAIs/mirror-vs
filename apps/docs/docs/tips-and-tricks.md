---
description: Discover expert tips and tricks for using Mirror VS effectively. Learn best practices, productivity hacks, and advanced techniques.
keywords:
    - Mirror VS tips
    - productivity tips
    - best practices
    - AI coding tips
    - advanced techniques
---

# Tips & Tricks

A collection of hard-earned wisdom to help you get the most out of Mirror VS. Some of these will make you faster. Some will save your bacon. All of them are free.

- **Drag Mirror VS to the [Secondary Sidebar](https://code.visualstudio.com/api/ux-guidelines/sidebars#secondary-sidebar)** so you can see the Explorer, Search, Source Control, etc., all at the same time. It's like having two monitors without the ergonomic guilt.

    <img src="/img/right-column-mirror.gif" alt="Put Mirror on the Right Column" width="900" />

- **Drag files from the explorer into the chat.** Once Mirror is in its own sidebar, you can drag files (even multiple at once) directly into the chat. Hold down the Shift key after you start dragging. Magic.

- **Turn off MCP if you're not using it.** Go to the <Codicon name="server" /> MCP Servers tab and disable it. It significantly cuts down the system prompt size. Less clutter, more speed.

- **Limit what your custom modes can edit.** To keep your [custom modes](/features/custom-modes) on the straight and narrow, restrict the file types they're allowed to touch. A documentation mode has no business editing your `.env` file.

- **Survive context limit errors.** If you hit the dreaded `input length and max tokens exceed context limit` error, don't panic. Delete a message, roll back to a checkpoint, or switch to a model with a long context window like Gemini for one message. You've got options.

- **Be smart about Max Tokens.** Every token you allocate to thinking takes away from conversation history storage. Use high `Max Tokens` / `Max Thinking Tokens` settings for Architect and Debug modes where deep thinking matters. Keep Code mode at 16k max tokens or less — it's got work to do.

- **Turn job postings into custom modes.** Found a job listing for a role you want Mirror to play? Ask Code mode to `Create a custom mode based on the job posting at @[url]`. Free career-aligned AI, courtesy of corporate America.

- **Run multiple copies in parallel.** Clone your repo multiple times and run Mirror VS on all of them simultaneously (use Git to resolve conflicts, the same way human devs do). The acceleration is real.

- **Start Debug mode tasks separately.** When using Debug mode, ask Mirror to "start a new task in Debug mode with all of the necessary context needed to figure out X". This keeps the debugging process in its own context window and stops it from polluting your main task. Clean and mean.

- **Add your own tips** by clicking "Edit this page" at the bottom. This is an open-source project — your wisdom belongs here.

- **Adjust the file read auto-truncate threshold** for large files. Lower values improve performance with huge files but may require more read operations. Find it in Mirror VS settings under 'Advanced Settings'.

- **Set up a keyboard shortcut** for the [`mirror.acceptInput` command](/features/keyboard-shortcuts) to submit text without touching your mouse. Your hands will thank you.

- **Use Sticky Models** to assign specialized models to different modes. Reasoning model for planning, non-reasoning model for coding. Mirror automatically switches when you change modes.

- **Customize the [context reduction prompt](/features/intelligent-context-condensing#customizing-the-context-condensing-prompt)** if Mirror keeps forgetting things specific to your domain. Teach it what matters to you.
