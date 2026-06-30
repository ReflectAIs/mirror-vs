import * as vscode from 'vscode';

export function getToolSpecifications(isSubsequentTurn: boolean = false): string {
  let browserEnabled = true;
  try {
    const config = vscode.workspace.getConfiguration('mirror-vs');
    browserEnabled = config.get<boolean>('browserToolsEnabled', true);
  } catch {
    browserEnabled = true;
  }

  if (isSubsequentTurn) {
    return `
### 🛠️ QUICK TOOL CHEATSHEET (Subsequent Turn)
Remember to output ONLY ONE valid XML tag per response turn. Parameters must be double-quoted. Self-closing tags must end with '/>'.
Available tools:
- read_file: <read_file path="..." [start_line="..." end_line="..."] />
- create_file: <create_file path="...">content</create_file> (New files only)
- write_file: <write_file path="...">content</write_file> (Overwrite)
- patch_file: <patch_file path="..." start_line="..." end_line="..." expected_search_content="..." replace_content="..." /> (Prioritize this line-based format first! Expects exact matched range)
- multi_patch_file: <multi_patch_file><file path="..." start_line="..." end_line="..." expected_search_content="..." replace_content="..." /></multi_patch_file> (Patch multiple files using structured line range attributes)
- list_dir: <list_dir path="..." />
- grep_search: <grep_search query="..." [path="..."] />
- semantic_search: <semantic_search query="..." />
- web_search: <web_search query="..." />
- get_diagnostics: <get_diagnostics [path="..."] />
${browserEnabled ? `- browser_navigate / browser_click / browser_type / browser_screenshot / browser_evaluate_script\n` : ''}- run_command: <run_command command="..." />
- list_terminals / read_terminal / send_terminal_input / close_terminal
- figma_inspect: <figma_inspect url="..." />
- wait: <wait [ms="..."] [seconds="..."] />
- update_agent_memory: <update_agent_memory key="..." value="..." />
- delete_file: <delete_file path="..." />
- rename_file: <rename_file from="..." to="..." />
- git_checkpoint: <git_checkpoint />
- git_rollback: <git_rollback checkpoint_id="..." />
- create_artifact: <create_artifact type="html|svg|mermaid|code|markdown" title="..." [id="..."] [language="..."]>content</create_artifact>
- search_chat_history: <search_chat_history query="..." [limit="..."] />
- semantic_search: <semantic_search query="..." [top_k="5"] />

CRITICAL subsequent turn rule:
- STRICTLY NO CONVERSATION: Do NOT output any conversational text, explanations, justifications, preambles, or comments. Output ONLY the tool XML tag. Do not explain what you are doing, do not summarize previous outputs. Go straight to the tool call.
- Do not repeat long plans or repeat explanations. Focus entirely on immediate execution.
- If you have read/grep'd enough files to propose a fix, write the <patch_file> or <multi_patch_file> immediately!
- Use search_chat_history if you need to look up error traces, files, or decisions from earlier in the chat session that have been pruned from your active context.
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
    **PRIORITIZE LINE-TARGETED FORMAT**: Always prioritize the line-targeted format first. It is extremely robust and fast:
    <patch_file path="relative/path/to/existing_file.ts" start_line="10" end_line="15" expected_search_content="[exact lines 10 to 15 verbatim]" replace_content="[new replacement lines]" />
    Only if line numbers are completely unknown or shifts make matching impossible, fall back to the legacy SEARCH/REPLACE block format:
    <patch_file path="relative/path/to/existing_file.ts">
<<<<<<< SEARCH
[exact original lines]
=======
[new replacement lines]
>>>>>>> REPLACE
</patch_file>
    **CRITICAL PATCHING RULE**: Never output any conflict markers like \`<<<<<<< SEARCH\`, \`=======\`, or \`>>>>>>> REPLACE\` *inside* the replacement content of the file. Those lines are delimiters *only* to separate search and replace blocks. If you write them inside the file, they will be left in the code as syntax errors.
5. MULTI PATCH FILE (For modifying multiple existing files in a single turn):
    **PRIORITIZE LINE-TARGETED FORMAT**: Always prioritize the line-targeted format first:
    <multi_patch_file>
    <file path="relative/path/to/file1.ts" start_line="10" end_line="12" expected_search_content="[lines 10-12]" replace_content="[new lines]" />
    <file path="relative/path/to/file2.ts" start_line="45" end_line="50" expected_search_content="[lines 45-50]" replace_content="[new lines]" />
    </multi_patch_file>
    Only if line numbers are unknown, fall back to the legacy SEARCH/REPLACE block format:
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
7. SEMANTIC SEARCH (RAG): <semantic_search query="concept or keywords" [top_k="5"] />
   Use this to search the workspace semantically for related context or code concepts at a code-chunk level. Optional top_k specifies how many results to return.
8. WEB SEARCH: <web_search query="pattern" />
9. GET DIAGNOSTICS (all errors/warnings): <get_diagnostics />
   GET DIAGNOSTICS (scoped): <get_diagnostics path="src/screens" />
${browserEnabled ? `10. BROWSER NAVIGATE: <browser_navigate url="http://localhost:3000" />
11. BROWSER CLICK: <browser_click selector="#my-button" />
12. BROWSER TYPE: <browser_type selector="#search-input" text="hello world" />
13. BROWSER EVALUATE SCRIPT: <browser_evaluate_script script="..." />\n` : ''}14. CODEBASE ANALYSIS:
    <analyze_project /> (Overview)
    <analyze_dependencies /> (Import graph)
    <analyze_complexity /> (Complexity)
    <analyze_coverage /> (Test coverage)
    <analyze_dead_code /> (Unused exports)
    <analyze_impact path="src/file.ts" /> (Impact analysis)
    <graphify /> (Module index: per-file description, exports & import chains — use when you need to understand what each file does and how they connect)
15. WAIT: <wait ms="3000" />
${browserEnabled ? `16. BROWSER SCREENSHOT: <browser_screenshot />\n` : ''}17. RUN COMMAND: <run_command command="npm install" />
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
28. SEARCH CHAT HISTORY:
    <search_chat_history query="keyword or phrase" [limit="5"] />
    Search the current session's chat history (including system instructions, user queries, assistant replies, tool calls, and tool results) for a keyword or phrase. Useful to recall details (like error traces or files) that have been pruned from your active context.
29. GIT CHECKPOINT:
    <git_checkpoint />
    Create a temporary Git commit checkpoint of the workspace state. Returns the commit hash/ID.
30. GIT ROLLBACK:
    <git_rollback checkpoint_id="..." />
    Rollback the workspace state hard to a previously created Git checkpoint ID, discarding unstaged modifications.

`;
}
