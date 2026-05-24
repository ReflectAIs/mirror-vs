
const fs = require('fs');
let content = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
let changes = 0;

// 1. Add new tools to the allToolNames array in the malformed tag recovery section
const allToolNamesPattern = `'list_terminals',`;
const updatedAllToolNames = `'list_terminals',
          // New tools
          'git_status',
          'git_diff',
          'git_add',
          'git_commit',
          'symbol_search',
          'rename_symbol',`;

if (content.includes(allToolNamesPattern)) {
  content = content.replace(allToolNamesPattern, updatedAllToolNames);
  changes++;
  console.log('1. Added new tools to allToolNames array');
}

// 2. Add new tools to selfClosingTools in getCleanedToolResponse
const selfClosingPattern2 = `'list_terminals',`;
const updatedSelfClosing2 = `'list_terminals',
      // New tools
      'git_status',
      'git_diff',
      'git_add',
      'symbol_search',
      'rename_symbol',`;

// Find the getCleanedToolResponse method specifically
const getCleanedIdx = content.indexOf('private getCleanedToolResponse');
if (getCleanedIdx !== -1) {
  const getCleanedMethod = content.substring(getCleanedIdx, getCleanedIdx + 1000);
  const selfClosingStart = getCleanedMethod.indexOf('selfClosingTools');
  if (selfClosingStart !== -1) {
    const selfClosingSection = getCleanedMethod.substring(selfClosingStart, selfClosingStart + 500);
    const target = selfClosingSection.match(/'list_terminals',/);
    if (target) {
      const globalIdx = getCleanedIdx + selfClosingStart + target.index;
      const before = content.substring(0, globalIdx + target[0].length);
      const after = content.substring(globalIdx + target[0].length);
      content = before + '\n      // New tools\n      \'git_status\',\n      \'git_diff\',\n      \'git_add\',\n      \'symbol_search\',\n      \'rename_symbol\',' + after;
      changes++;
      console.log('2. Added new tools to selfClosingTools in getCleanedToolResponse');
    }
  }
}

// 3. Add to selfClosingTools in hasCompleteToolCall
const hasCompleteIdx = content.indexOf('private hasCompleteToolCall');
if (hasCompleteIdx !== -1) {
  const hasCompleteMethod = content.substring(hasCompleteIdx, hasCompleteIdx + 800);
  const selfClosingStart2 = hasCompleteMethod.indexOf('selfClosingTools');
  if (selfClosingStart2 !== -1) {
    const selfClosingSection2 = hasCompleteMethod.substring(selfClosingStart2, selfClosingStart2 + 500);
    const target2 = selfClosingSection2.match(/'list_terminals',/);
    if (target2) {
      const globalIdx2 = hasCompleteIdx + selfClosingStart2 + target2.index;
      const before2 = content.substring(0, globalIdx2 + target2[0].length);
      const after2 = content.substring(globalIdx2 + target2[0].length);
      content = before2 + '\n      \'git_status\',\n      \'git_diff\',\n      \'git_add\',\n      \'symbol_search\',\n      \'rename_symbol\',' + after2;
      changes++;
      console.log('3. Added new tools to selfClosingTools in hasCompleteToolCall');
    }
  }
}

// 4. Add git_commit to blockTools in getCleanedToolResponse
const blockToolsPattern = `'send_terminal_input'`;
const blockToolsIdx = content.indexOf('blockTools');
if (blockToolsIdx !== -1) {
  const blockSection = content.substring(blockToolsIdx, blockToolsIdx + 300);
  if (blockSection.includes("'send_terminal_input'")) {
    content = content.replace("'send_terminal_input'", "'send_terminal_input', 'git_commit'");
    changes++;
    console.log('4. Added git_commit to blockTools');
  }
}

// 5. Add git_commit to blockTools in hasCompleteToolCall
const hasCompleteBlockIdx = content.indexOf('blockTools', hasCompleteIdx);
if (hasCompleteBlockIdx !== -1) {
  const hasCompleteBlockSection = content.substring(hasCompleteBlockIdx, hasCompleteBlockIdx + 300);
  if (hasCompleteBlockSection.includes("'send_terminal_input'") && !hasCompleteBlockSection.includes("'git_commit'")) {
    // Find the specific occurrence 
    const beforeTarget = content.substring(0, hasCompleteBlockIdx);
    const lastSendTerminalInputBlock = beforeTarget.lastIndexOf("'send_terminal_input'");
    if (lastSendTerminalInputBlock !== -1) {
      content = content.substring(0, lastSendTerminalInputBlock + "'send_terminal_input'".length) + ", 'git_commit'" + content.substring(lastSendTerminalInputBlock + "'send_terminal_input'".length);
      changes++;
      console.log('5. Added git_commit to blockTools in hasCompleteToolCall');
    }
  }
}

fs.writeFileSync('src/agent/orchestrator.ts', content, 'utf8');
console.log(`\nTotal changes made: ${changes}`);
