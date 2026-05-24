const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

const commentIdx = c.indexOf('  // 7. Core Message Submission');
const endIdx = c.indexOf('\n  }\n\n  let currentToolCardElement', commentIdx);
console.log('Function start at:', commentIdx, 'end at:', endIdx);
console.log('Function length:', endIdx - commentIdx);

// Extract the exact function
const actualFunc = c.substring(commentIdx, endIdx + 4); // include the closing "  }"
console.log('Actual func:', actualFunc.length);

// Display it
console.log('=== EXACT FUNCTION CONTENT ===');
console.log(actualFunc);
console.log('=== END ===');

// Now build the replacement
const replacement = actualFunc.replace(
  '  // 7. Core Message Submission',
  '  // 7. Core Message Submission with Slash Command Support'
);

// Replace the template literal line
const oldTemplateLine = actualFunc.substring(907, actualFunc.indexOf('appendMessageBubble', 907)).trim();
console.log('Old template line:', oldTemplateLine);

// Write the new content
const newContent = c.substring(0, commentIdx) + replacement + c.substring(endIdx + 4);
fs.writeFileSync('src/webview/sidebar.js', newContent, 'utf8');
console.log('Comment replaced successfully!');

// Now add the slash command logic by replacing the submitMessage function body
// We need to find the function body start
const newFuncStart = newContent.indexOf('function submitMessage()', commentIdx);
console.log('New func start at:', newFuncStart);
