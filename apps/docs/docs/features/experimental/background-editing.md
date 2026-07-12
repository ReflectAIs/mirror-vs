---
description: Learn about the experimental Background Editing setting that allows uninterrupted coding while Mirror VS makes file edits in the background.
keywords:
    - experimental features
    - editor focus
    - diff views
    - background editing
    - workflow optimization
    - uninterrupted coding
---

# Background Editing

Work without interruption while Mirror VS edits files in the background — no more losing your flow from automatic diff views popping up like uninvited party guests.

:::warning Experimental Feature
This is an experimental feature that changes how file edits are displayed. While it can significantly improve workflow, you'll need to manually review changes through source control or file history.
:::

---

## Overview

The "Background Editing" setting is an experimental feature that disables automatic diff view displays when Mirror VS edits files. Instead of switching your editor focus to show diffs, Mirror VS works silently in the background, allowing you to continue coding without interruption. This feature affects all file editing operations including write, apply diff, search/replace, insert content, and multi-file apply diff tools.

### Key Benefits

- **Uninterrupted Focus** — Stay in your current file while Mirror VS makes changes
- **Smoother Workflow** — No context switching between files
- **Background Processing** — File edits happen silently
- **Reduced Distractions** — Maintain your coding flow
- **Performance** — Faster file operations without UI updates
- **Batch Operations** — Ideal for large refactoring or multiple file updates

### Trade-offs

- **No Visual Confirmation** — You won't see diffs as changes are made
- **Manual Review Required** — Check changes through Git or file history
- **Less Immediate Feedback** — Changes aren't immediately visible
- **Silent Changes** — Files change without visual notification — check Git status regularly
- **Limited Environment Context** — Mirror VS won't see recently edited files as open tabs since they're not visually opened

---

## Enabling the Feature

1. Open Mirror VS settings (gear icon in the top right)
2. Navigate to the "Experimental" tab
3. Find "Background editing" in the list
4. Toggle the setting to enable it

<img src="/img/background-editing/background-editing.png" alt="Background editing setting in Mirror VS experimental features" width="400" />

---

## How It Works

### Default Behavior (Feature Disabled)

Without this feature, when Mirror VS edits a file:

1. The file opens in your editor
2. A diff view appears showing changes
3. Your focus shifts to the modified file
4. You review and potentially adjust changes

### With Feature Enabled

When enabled, Mirror VS's file edits:

1. Happen silently in the background
2. Don't open new editor tabs
3. Don't show diff views
4. Don't interrupt your current work
5. Still open files in memory for diagnostic detection (not visible)

### What Still Happens

Even with the feature enabled:

- Files are still modified on disk
- Changes appear in source control
- File watchers and build tools detect changes
- Mirror VS's chat shows what files were edited
- Error detection and diagnostics continue to work normally
- Files are opened in memory for diagnostic purposes (not visible in editor)
- Write delays for diagnostic detection are still respected

---

## Best Use Cases

This feature is particularly useful for:

- **Large Refactoring Operations** — When Mirror VS needs to update many files
- **Batch File Updates** — Making similar changes across multiple files
- **Performance-Sensitive Tasks** — When UI updates would slow down operations
- **Focused Coding Sessions** — When you want to avoid context switches
- **Automated Workflows** — Running multiple file operations in sequence

---

## Best Practices

1. **Use Version Control** — Regularly check Git status to track changes
2. **Review Periodically** — Don't let too many changes accumulate without review
3. **Enable Selectively** — Consider enabling for specific task types
4. **Monitor Chat** — Pay attention to Mirror VS's messages about file modifications
5. **Check Diagnostics** — Ensure your editor's problems panel stays visible

---

## FAQ

**Q: Can I still see what files Mirror VS edited?**
A: Yes, Mirror VS's chat messages list all modified files, and changes appear in source control.

**Q: What if I need to see a specific change immediately?**
A: You can manually open the file and use source control to view the diff.

**Q: Does this affect Mirror VS's ability to edit files?**
A: No, Mirror VS can still make all the same edits; only the display behavior changes.

**Q: Can I enable this for specific projects only?**
A: Currently, this is a global setting that affects all projects.

**Q: What happens to approval dialogs?**
A: File edit approvals still appear if you haven't auto-approved them; only the diff display is suppressed.

**Q: Do diagnostics and error detection still work?**
A: Yes, files are opened in memory for diagnostic detection, so error checking continues to function normally even though files aren't displayed.
