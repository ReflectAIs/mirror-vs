
# Git Changes UI Design

## Current State
The orchestrator already creates a git baseline commit before each agent task via `_ensureGitBaseline()`. This means every file the agent modifies shows up as colored diff gutters in VS Code's editor. But there's no unified UX in the webview sidebar.

## Required Changes

### Backend (sidear-provider.ts)
- Add a `handleGetGitStatus` handler that runs `git status --porcelain` and `git diff` to get changes
- Add a `handleOpenDiff` handler to open VS Code diff editor with baseline
- Send `gitChanges` message to webview with file list

### Frontend (sidebar.html)
- Add a "Git Changes" button in the header area (next to settings/history)
- Add a `git-drawer` panel (collapsible, same as settings/history)
- Show list of changed files grouped: "Modified", "Added", "Deleted", "Untracked"
- Each file shows: filename, status badge, click to view diff
- Support clearing/resetting git changes

### Frontend (sidebar.js)
- Handle `gitChanges` message from extension host
- Render file items in the git drawer
- Wire click handlers to postMessage for `openDiff`
- Wire "refresh" and "reset/undo" buttons

### Frontend (sidebar.css)
- Styles for git drawer, file items, status badges (green/red/yellow)
- File item hover effects for clickability
- Badge colors: M=blue/yellow, A=green, D=red, ?=gray
