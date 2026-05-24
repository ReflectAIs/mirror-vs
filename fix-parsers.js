
const fs = require('fs');
const content = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Add git_status, git_diff, git_commit, git_add, symbol_search, rename_symbol parsers
// Find the list_terminals regex section and add new tools after it

// First, let's add them to the _parseToolCalls method after list_terminals
const listTerminalsEnd = 'candidates.push({\n        index: match.index,\n        tool: { name: \'list_terminals\' },\n      });\n    }\n\n    if (candidates.length === 0) {';

const newParsers = `    // git_status
    const gitStatusRegex = /<git_status[\\s\\S]*?\\/?>/gi;
    while ((match = gitStatusRegex.exec(text)) !== null) {
      candidates.push({ index: match.index, tool: { name: 'git_status' } });
    }

    // git_diff
    const gitDiffRegex = /<git_diff([\\s\\S]*?)\\/?>/gi;
    while ((match = gitDiffRegex.exec(text)) !== null) {
      const p = attr(match[1], 'path');
      candidates.push({ index: match.index, tool: { name: 'git_diff', path: p ? p.trim() : undefined } });
    }

    // git_add
    const gitAddRegex = /<git_add([\\s\\S]*?)\\/?>/gi;
    while ((match = gitAddRegex.exec(text)) !== null) {
      const p = attr(match[1], 'path');
      candidates.push({ index: match.index, tool: { name: 'git_add', path: p ? p.trim() : undefined } });
    }

    // git_commit (block style)
    const gitCommitRegex = /<git_commit([\\s\\S]*?)>([\\s\\S]*?)<\\/git_commit\\s*>/gi;
    while ((match = gitCommitRegex.exec(text)) !== null) {
      const commitMsg = match[2] ? match[2].trim() : 'Mirror VS: automated commit';
      // Use query field to store the commit message
      candidates.push({ index: match.index, tool: { name: 'git_commit', query: commitMsg } });
    }

    // symbol_search
    const symbolSearchRegex = /<symbol_search([\\s\\S]*?)\\/?>/gi;
    while ((match = symbolSearchRegex.exec(text)) !== null) {
      const q = attr(match[1], 'query');
      if (q) {
        candidates.push({ index: match.index, tool: { name: 'symbol_search', query: q } });
      }
    }

    // rename_symbol
    const renameSymbolRegex = /<rename_symbol([\\s\\S]*?)\\/?>/gi;
    while ((match = renameSymbolRegex.exec(text)) !== null) {
      const q = attr(match[1], 'query');
      const p = attr(match[1], 'path');
      if (q && p) {
        candidates.push({ index: match.index, tool: { name: 'rename_symbol', query: q, path: p } });
      }
    }

    if (candidates.length === 0) {`;

const idx = content.indexOf(listTerminalsEnd);
if (idx !== -1) {
  const newContent = content.substring(0, idx) + newParsers + content.substring(idx + listTerminalsEnd.length);
  fs.writeFileSync('src/agent/orchestrator.ts', newContent, 'utf8');
  console.log('SUCCESS: Added new tool parsers to _parseToolCalls');
} else {
  console.log('ERROR: Could not find insertion point in _parseToolCalls');
  // Fall back: try to find a simpler match
  const fallback = 'if (candidates.length === 0) {';
  const idx2 = content.indexOf(fallback);
  if (idx2 !== -1) {
    // Find the last candidates.push for list_terminals
    const toolsSection = content.substring(0, idx2);
    const lastListTerminals = toolsSection.lastIndexOf('list_terminals');
    if (lastListTerminals !== -1) {
      const afterListTerminals = toolsSection.substring(lastListTerminals);
      const closingBraceIdx = afterListTerminals.indexOf('}');
      if (closingBraceIdx !== -1) {
        const insertPos = lastListTerminals + closingBraceIdx + 1;
        const newContent = content.substring(0, insertPos) + '\n' + newParsers.replace('if (candidates.length === 0) {', '') + content.substring(idx2);
        fs.writeFileSync('src/agent/orchestrator.ts', newContent, 'utf8');
        console.log('SUCCESS (fallback): Added new tool parsers');
      }
    }
  }
}
