const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// The exact old function - start from the actual comment text
const oldFuncArray = [
  '  // 7. Core Message Submission',
  '  function submitMessage() {',
  "    const text = promptInput.value.trim();",
  "    if (!text && linkedFiles.size === 0 && attachedImages.length === 0) return;",
  "    if (isSending) return;",
  "",
  "    // Hide welcome card if present",
  "    if (welcomeCard) {",
  "      welcomeCard.style.display = 'none';",
  "    }",
  "",
  "    isSending = true;",
  "    promptInput.value = '';",
  "    promptInput.style.height = 'auto';",
  "    promptInput.disabled = true;",
  "    sendBtn.disabled = true;",
  "",
  "    // Toggle stop button in place of send button",
  "    sendBtn.classList.add('hidden');",
  "    stopBtn.classList.remove('hidden');",
  "",
  "    // Compile linked file references",
  "    const selectedFiles = Array.from(linkedFiles);",
  "    ",
  "    // Append User message bubble with linked tags and images",
  "    let userDisplayMessage = text;",
  "    if (selectedFiles.length > 0) {",
  '      userDisplayMessage += \@\' + f.split(\'/\').pop() + \';',
  "    }",
  "    appendMessageBubble('user', userDisplayMessage, attachedImages);",
  "    scrollChatToBottom(true);",
  "",
  "    // Append Assistant placeholder bubble",
  "    const assistantBubble = appendMessageBubble('assistant', '');",
  "    const typingIndicator = document.createElement('div');",
  "    typingIndicator.className = 'typing-indicator';",
  "    typingIndicator.innerHTML = '<span></span><span></span><span></span>';",
  "    assistantBubble.appendChild(typingIndicator);",
  "    currentStreamingBubble = assistantBubble;",
  "    currentStreamingText = '';",
  "",
  "    scrollChatToBottom(true);",
  "",
  "    // Forward message payload to host including explicit file linkages and attached images",
  "    vscode.postMessage({",
  "      type: 'sendMessage',",
  "      text,",
  "      history: chatHistory,",
  "      linkedFiles: selectedFiles,",
  "      images: attachedImages",
  "    });",
  "",
  "    // Clear context chips and attached images state",
  "    linkedFiles.clear();",
  "    renderChips();",
  "    attachedImages = [];",
  "    renderImageAttachments();",
  "  }"
];

const oldFunc = oldFuncArray.join('\n');

// Find the exact position of the old function in file
const commentIdx = c.indexOf('  // 7. Core Message Submission');
const funcIdx = c.indexOf('  function submitMessage() {');
console.log('Comment at:', commentIdx, 'Func at:', funcIdx);

// Extract 1855 chars from that position
const actualOldFunc = c.substring(commentIdx, commentIdx + 1855);
console.log('Actual func length:', actualOldFunc.length);
console.log('Ends with renderImageAttachments:', actualOldFunc.trim().endsWith('renderImageAttachments();'));
console.log('Last 30 chars:', JSON.stringify(actualOldFunc.substring(actualOldFunc.length - 30)));

// Now compare
const diffIdx = actualOldFunc.indexOf('`@');
if (diffIdx >= 0) {
  console.log('Found @ in actual:', diffIdx);
  console.log('Context:', JSON.stringify(actualOldFunc.substring(diffIdx-20, diffIdx+30)));
} else {
  console.log('No @ found in actualOldFunc');
  // Find first char difference
  for (let i = 0; i < Math.min(oldFunc.length, actualOldFunc.length); i++) {
    if (oldFunc[i] !== actualOldFunc[i]) {
      console.log('Diff at', i, 'old:', JSON.stringify(oldFunc[i]), 'actual:', JSON.stringify(actualOldFunc[i]));
      console.log('Context old:', JSON.stringify(oldFunc.substring(Math.max(0,i-10), i+10)));
      console.log('Context actual:', JSON.stringify(actualOldFunc.substring(Math.max(0,i-10), i+10)));
      break;
    }
  }
}
