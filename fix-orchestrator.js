
const fs = require('fs');
let content = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Add new tools after FIGMA INSPECT section
// The new tools block to append
const newToolsBlock = `
19. GIT STATUS:
    Show the current git status of the workspace (modified, added, deleted, untracked files).
    Usage:
    <git_status />

20. GIT DIFF:
    Show the git diff for a specific file or all unstaged changes.
    Usage:
    <git_diff />
    Or for a specific file:
    <git_diff path="relative/path/to/file.ts" />

21. GIT ADD:
    Stage changes for commit. If no path is provided, all changes are staged.
    Usage:
    <git_add path="relative/path/to/file.ts" />
    Or to stage all:
    <git_add />

22. GIT COMMIT:
    Commit staged changes with a message.
    Usage:
    <git_commit>Your commit message here</git_commit>

23. SYMBOL SEARCH:
    Search for symbols (functions, classes, variables) in the workspace using VS Code's language server.
    Usage:
    <symbol_search query="MyFunctionName" />

24. RENAME SYMBOL:
    Rename a symbol across the entire workspace using VS Code's language server. Place cursor on the symbol first.
    Usage:
    <rename_symbol query="oldName" path="newName" />
`;

// Find the position after the last tool description and before EXECUTION WORKFLOW EXAMPLE
const insertMarker = '### EXECUTION WORKFLOW EXAMPLE:';
const insertIndex = content.indexOf(insertMarker);

if (insertIndex !== -1) {
  // Find the end of the FIGMA INSPECT section (blank line before EXECUTION WORKFLOW)
  const beforeWorkflow = content.substring(0, insertIndex);
  const afterWorkflow = content.substring(insertIndex);
  
  // Insert new tools before the workflow
  content = beforeWorkflow + newToolsBlock + '\n' + afterWorkflow;
  
  fs.writeFileSync('src/agent/orchestrator.ts', content, 'utf8');
  console.log('SUCCESS: New tools added to orchestrator.ts');
} else {
  console.log('ERROR: Could not find insert point in orchestrator.ts');
}
