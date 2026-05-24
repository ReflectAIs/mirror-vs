
# Mirror VS - Enhancement Opportunities Implementation

## Current Status: ⏳ Working on Task 11 — Write Tool Collapsible UI

**All 10 previous enhancement areas are complete. Now implementing collapsible write_file/create_file tool cards.**

---

### ✅ 1-10: All Previous Enhancements Complete

---

### ⏳ 11. WRITE TOOL COLLAPSIBLE / TERMINAL-STYLE PROGRESS
- **Goal**: Make write_file (and similar long-content tools: create_file, patch_file) cards collapsed by default with accordion toggle
- **Goal**: For run_command / terminal commands, show a clean "in progress" indicator (similar to scanning bar) that collapses on completion
- **Plan**:
  1. ✅ Analyzed current tool card rendering in sidebar.js (lines 566-776) — `createToolCardDOM()`
  2. ✅ Identified CSS: `.tool-card-body-wrapper` uses `grid-template-rows: 0fr` → `1fr` on `.expanded`
  3. ✅ Identified toggle: header click toggles `.expanded` class (lines 766-768)
  4. ✅ Identified that currently ALL tool cards start expanded (no `expanded` class initially, but body wrapper animates)
  5. ❌ **Bug**: The `write_file` / `create_file` cards currently show their full code blocks on render without collapsing
  6. ⏳ **Fix**: Add `.collapsed-by-default` class to `write_file`, `create_file`, `patch_file` cards so body starts collapsed
  7. ⏳ **Enhancement**: Add distinct progress indicator for file-writing tools (different CSS from scanning bar)
  8. ⏳ **Enhancement**: Terminal commands (`run_command`) show "Running..." spinner instead of full output until complete

---

## Implementation Details

### Changes to `src/webview/sidebar.js`:
- In `createToolCardDOM()`: Add `'collapsed-by-default'` class for `write_file`, `create_file`, `patch_file` tools
- In `createToolCardDOM()`: For completed `run_command` cards, add a "Show Output" collapsed state
- Modify CSS to support `collapsed-by-default` class

### Changes to `src/webview/sidebar.css`:
- Add styles for `collapsed-by-default` tool cards (subtle "Expand to view" hint)
- Add distinct progress indicator for file-writing operations (different color from scanning bar)
- Add terminal-style progress animation
