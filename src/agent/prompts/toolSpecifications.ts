export function getToolSpecifications(isSubsequentTurn: boolean = false): string {
  if (isSubsequentTurn) {
    return `
### 🛠️ QUICK TOOL CHEATSHEET (Subsequent Turn)
Remember to output ONLY ONE valid XML tag per response turn. Parameters must be double-quoted. Self-closing tags must end with '/>'.
Available tools:
- read_file: <read_file path="..." [start_line="..." end_line="..."] />
- create_file: <create_file path="...">content</create_file> (New files only)
- write_file: <write_file path="...">content</write_file> (Overwrite)
- patch_file: <patch_file path="...">\n<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE\n</patch_file>
- list_dir: <list_dir path="..." />
- grep_search: <grep_search query="..." [path="..."] />
- web_search: <web_search query="..." />
- get_diagnostics: <get_diagnostics [path="..."] />
- browser_navigate / browser_click / browser_type / browser_screenshot / browser_evaluate_script
- run_command: <run_command command="..." />
- list_terminals / read_terminal / send_terminal_input / close_terminal
- figma_inspect: <figma_inspect url="..." />

CRITICAL subsequent turn rule:
- Do not repeat long plans or repeat explanations. Focus entirely on immediate execution.
- If you have read/grep'd enough files to propose a fix, write the <patch_file> immediately!
`;
  }

  return `
### 🛠️ TOOL USAGE RULES
- Output valid XML tags. Parameters must be in double quotes. Self-closing tags must end with \`/>\`.
- Call ONLY ONE tool per response turn. After outputting a tool tag, immediately STOP GENERATING.
- **File Reading Efficiency**: Avoid "keyholing" (reading files in tiny 20-line chunks). Read larger blocks (500-800 lines) or the entire file to get context quickly.
- **Patching Files Safely**: To edit existing files, use \`patch_file\`. To ensure your \`SEARCH\` block is a 1:1 exact character-for-character match with the current file state (including whitespace and indentation), verify you have the exact file contents in context.
- **Handling Long New Files**: Create a basic scaffold first using \`create_file\`, then build incrementally using \`patch_file\`.

### 🧰 AVAILABLE TOOLS

1. READ FILE:
   <read_file path="relative/path/to/file.ts" />
   For extremely long files, you can read specific line ranges (up to 800 lines per turn):
   <read_file path="relative/path/to/file.ts" start_line="1" end_line="800" />
2. CREATE FILE (Only for completely new files):
   <create_file path="relative/path/to/new_file.ts">content here</create_file>
3. WRITE FILE (Overwrites whole file):
   <write_file path="relative/path/to/existing_file.ts">content here</write_file>
4. PATCH FILE (For modifying existing files):
   <patch_file path="relative/path/to/existing_file.ts">
<<<<<<< SEARCH
[exact original lines]
=======
[new replacement lines]
>>>>>>> REPLACE
</patch_file>
5. LIST DIRECTORY: <list_dir path="relative/path/to/directory" />
6. GREP SEARCH (full workspace): <grep_search query="pattern" />
   GREP SEARCH (scoped to directory): <grep_search query="pattern" path="src/screens" />
   **Best practice**: Always scope with \`path\` when you know the relevant area.
7. WEB SEARCH: <web_search query="pattern" />
8. GET DIAGNOSTICS (all errors/warnings): <get_diagnostics />
   GET DIAGNOSTICS (scoped): <get_diagnostics path="src/screens" />
9. BROWSER NAVIGATE: <browser_navigate url="http://localhost:3000" />
10. BROWSER CLICK: <browser_click selector="#my-button" />
11. BROWSER TYPE: <browser_type selector="#search-input" text="hello world" />
12. BROWSER EVALUATE SCRIPT: <browser_evaluate_script script="..." />
13. CODEBASE ANALYSIS:
    <analyze_project /> (Overview)
    <analyze_dependencies /> (Import graph)
    <analyze_complexity /> (Complexity)
    <analyze_coverage /> (Test coverage)
    <analyze_dead_code /> (Unused exports)
    <analyze_impact path="src/file.ts" /> (Impact analysis)
    <graphify /> (Mermaid structure graph)
14. WAIT: <wait ms="3000" />
15. BROWSER SCREENSHOT: <browser_screenshot />
16. RUN COMMAND: <run_command command="npm install" />
17. SEND TERMINAL INPUT: <send_terminal_input terminal_name="...">Ctrl+C</send_terminal_input>
18. CLOSE TERMINAL: <close_terminal terminal_name="..." />
19. READ TERMINAL: <read_terminal terminal_name="..." />
20. LIST TERMINALS: <list_terminals />
21. FIGMA INSPECT: <figma_inspect url="..." />
`;
}
