const fs = require('fs');
const path = require('path');

// Read the syntax highlighter code
const highlighterCode = fs.readFileSync('src/webview/syntax-highlighter.js', 'utf8');

// Read the sidebar js
let c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// Find the end of the file - the last closing paren of the IIFE
const lastIdx = c.lastIndexOf('})();');
if (lastIdx < 0) {
  console.log('ERROR: Could not find IIFE end');
  process.exit(1);
}

// Insert the highlighter code just before the IIFE end
const newContent = c.substring(0, lastIdx) + '\n' + highlighterCode + '\n' + c.substring(lastIdx);
fs.writeFileSync('src/webview/sidebar.js', newContent, 'utf8');

// Now modify appendMessageBubble to call applySyntaxHighlighting
c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// Replace bindCodeBlockButtons(textContainer) calls
c = c.replace(
  "bindCodeBlockButtons(textContainer);",
  "bindCodeBlockButtons(textContainer);\n      applySyntaxHighlighting(textContainer);"
);

// Find the streaming bubble code where bindCodeBlockButtons(bubble) is called
// Look for the pattern in streaming message handling
c = c.replace(
  "bindCodeBlockButtons(document.getElementById('chat-messages'));",
  "bindCodeBlockButtons(document.getElementById('chat-messages'));\n    applySyntaxHighlighting(document.getElementById('chat-messages'));"
);

fs.writeFileSync('src/webview/sidebar.js', c, 'utf8');
console.log('Syntax highlighting integrated successfully');
console.log('Final file size:', fs.statSync('src/webview/sidebar.js').size);

// Count function calls
var count1 = (c.match(/applySyntaxHighlighting/g) || []).length;
var count2 = (c.match(/function applySyntaxHighlighting/g) || []).length;
console.log('Function definition count:', count2);
console.log('Function call count:', count1);
