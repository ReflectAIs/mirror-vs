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
- multi_patch_file: <multi_patch_file><file path="...">\n<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE\n</file></multi_patch_file> (Patch multiple files)
- list_dir: <list_dir path="..." />
- grep_search: <grep_search query="..." [path="..."] />
- semantic_search: <semantic_search query="..." />
- web_search: <web_search query="..." />
- get_diagnostics: <get_diagnostics [path="..."] />
- browser_navigate / browser_click / browser_type / browser_screenshot / browser_evaluate_script
- run_command: <run_command command="..." />
- list_terminals / read_terminal / send_terminal_input / close_terminal
- figma_inspect: <figma_inspect url="..." />
- wait: <wait [ms="..."] [seconds="..."] />
- update_agent_memory: <update_agent_memory key="..." value="..." />
- delete_file: <delete_file path="..." />
- rename_file: <rename_file from="..." to="..." />
- create_artifact: <create_artifact type="html|svg|mermaid|code|markdown" title="..." [id="..."] [language="..."]>content</create_artifact>

CRITICAL subsequent turn rule:
- Do not repeat long plans or repeat explanations. Focus entirely on immediate execution.
- If you have read/grep'd enough files to propose a fix, write the <patch_file> or <multi_patch_file> immediately!
`;
  }

  return `
### 🛠️ TOOL USAGE RULES
- Output valid XML tags. Parameters must be in double quotes. Self-closing tags must end with \`/>\`.
- **ONE TOOL PER TURN (STRICTLY ENFORCED)**: Call exactly ONE tool per response turn. After outputting a tool tag, immediately STOP GENERATING. The system will reject and discard any extra tools — only the first one gets executed.
- **File Reading Efficiency**: Avoid "keyholing" (reading files in tiny 20-line chunks). Read larger blocks (500-800 lines) or the entire file to get context quickly.
- **Patching Files Safely**: To edit existing files, use \`patch_file\` or \`multi_patch_file\`. Always prefer patch over write. Avoid using \`write_file\` to overwrite existing files unless you have no other option (e.g. the file is too small to patch or the structure must be completely replaced). Copy your \`SEARCH\` block directly from the \`read_file\` output to ensure character-for-character accuracy. The fuzzy matcher compensates for minor tab/space differences, but exact line-for-line copy is safest.
- **read_file Output**: The tool displays the actual line range read (e.g. "showing lines 1-800"). When content is evicted, the eviction notice includes the original line range so you know exactly which lines to re-request.
=======
- **Never Generate Files Larger Than 500 Lines in One Shot**: Both \`create_file\` and \`write_file\` can silently fail for large content (over ~500 lines). Never create a new file in one call. Always:
  1. Use \`create_file\` with a minimal skeleton (imports, class/function signature, types — ~20-40 lines max).
  2. Then use \`patch_file\` repeatedly, each adding a logical section (e.g. one method or handler at a time, ~50-150 lines per patch).
  3. Keep each patch small and focused — a single function, method, or logical block.
  4. If you catch yourself writing more than 500 lines in a \`create_file\` or \`write_file\` call, stop immediately. Replace it with the skeleton approach.
- **read_file Output**: The tool displays the actual line range read (e.g. "showing lines 1-800"). When content is evicted, the eviction notice includes the original line range so you know exactly which lines to re-request.

### 🧰 AVAILABLE TOOLS

1. READ FILE:
   <read_file path="relative/path/to/file.ts" />
   For extremely long files, you can read specific line ranges (up to 800 lines per turn):
   <read_file path="relative/path/to/file.ts" start_line="1" end_line="800" />
   *IMAGE SUPPORT*: You can call read_file on workspace image files (PNG, JPG, JPEG, GIF, WEBP, etc.). The system will automatically encode the image to base64 and feed it into your vision model so you can inspect/understand it.
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
    **CRITICAL PATCHING RULE**: Never output any conflict markers like \`<<<<<<< SEARCH\`, \`=======\`, or \`>>>>>>> REPLACE\` *inside* the replacement content of the file. Those lines are delimiters *only* to separate search and replace blocks. If you write them inside the file, they will be left in the code as syntax errors.
5. MULTI PATCH FILE (For modifying multiple existing files in a single turn):
    <multi_patch_file>
    <file path="relative/path/to/file1.ts">
<<<<<<< SEARCH
[exact original lines in file1]
=======
[new replacement lines in file1]
>>>>>>> REPLACE
    </file>
    <file path="relative/path/to/file2.ts">
<<<<<<< SEARCH
[exact original lines in file2]
=======
[new replacement lines in file2]
>>>>>>> REPLACE
    </file>
    </multi_patch_file>
    **CRITICAL MULTI-PATCHING RULE**: Never output any conflict markers like \`<<<<<<< SEARCH\`, \`=======\`, or \`>>>>>>> REPLACE\` *inside* the replacement content of the file. Those lines are delimiters *only* to separate search and replace blocks. If you write them inside the file, they will be left in the code as syntax errors.
6. LIST DIRECTORY: <list_dir path="relative/path/to/directory" />
6. GREP SEARCH (full workspace): <grep_search query="pattern" />
   GREP SEARCH (scoped to directory): <grep_search query="pattern" path="src/screens" />
   **Best practice**: Always scope with \`path\` when you know the relevant area.
7. SEMANTIC SEARCH (RAG): <semantic_search query="concept or keywords" />
   Use this to search the workspace semantically for related context or code concepts.
8. WEB SEARCH: <web_search query="pattern" />
9. GET DIAGNOSTICS (all errors/warnings): <get_diagnostics />
   GET DIAGNOSTICS (scoped): <get_diagnostics path="src/screens" />
10. BROWSER NAVIGATE: <browser_navigate url="http://localhost:3000" />
11. BROWSER CLICK: <browser_click selector="#my-button" />
12. BROWSER TYPE: <browser_type selector="#search-input" text="hello world" />
13. BROWSER EVALUATE SCRIPT: <browser_evaluate_script script="..." />
14. CODEBASE ANALYSIS:
    <analyze_project /> (Overview)
    <analyze_dependencies /> (Import graph)
    <analyze_complexity /> (Complexity)
    <analyze_coverage /> (Test coverage)
    <analyze_dead_code /> (Unused exports)
    <analyze_impact path="src/file.ts" /> (Impact analysis)
    <graphify /> (Module index: per-file description, exports & import chains — use when you need to understand what each file does and how they connect)
15. WAIT: <wait ms="3000" />
16. BROWSER SCREENSHOT: <browser_screenshot />
17. RUN COMMAND: <run_command command="npm install" />
18. SEND TERMINAL INPUT: <send_terminal_input terminal_name="...">Ctrl+C</send_terminal_input>
19. CLOSE TERMINAL: <close_terminal terminal_name="..." />
20. READ TERMINAL: <read_terminal terminal_name="..." />
21. LIST TERMINALS: <list_terminals />
22. FIGMA INSPECT: <figma_inspect url="..." />
23. UPDATE AGENT MEMORY:
    <update_agent_memory key="preferences" value="Always use functional React components." />
    Saves developer preferences, key architectural decisions, or code patterns in the local workspace.
    - debug_inspect_variables: <debug_inspect_variables /> (dumps active threads, callstack, scopes, and variables)
25. CREATE ARTIFACT:
    <create_artifact type="html|svg|mermaid|code|markdown" title="My Title" [id="unique_id"] [language="typescript"]>content</create_artifact>
    Creates or updates an interactive previewable artifact rendered in a side-by-side webview panel. If an id is provided, it updates the existing panel. Use type="markdown" for planning docs, checklists, or walkthroughs.
26. DELETE FILE:
    <delete_file path="relative/path/to/file.ts" />
    Permanently deletes a file. A checkpoint is created so the action can be reverted. Requires user approval.
27. RENAME / MOVE FILE:
    <rename_file from="old/path/file.ts" to="new/path/file.ts" />
    Renames or moves a file. Parent directories for the destination are created automatically. Requires user approval.

`;
}
