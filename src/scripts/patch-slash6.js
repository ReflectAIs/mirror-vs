const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// Find the exact old function
const commentIdx = c.indexOf('  // 7. Core Message Submission with Slash Command Support');
const endIdx = c.indexOf('\n  }\n\n  let currentToolCardElement', commentIdx);
const actualFunc = c.substring(commentIdx, endIdx + 4);

console.log('Found function:', actualFunc.substring(0, 60));

// Build the new function
const newFunc = `  // 7. Core Message Submission with Slash Command Support
  function submitMessage() {
    const rawText = promptInput.value.trim();

    // Slash command handling
    let text = rawText;
    let isSlashCommand = false;
    const slashMatch = text.match(/^\\/(fix|explain|test)\\b\\s*(.*)/i);
    if (slashMatch) {
      const command = slashMatch[1].toLowerCase();
      const rest = slashMatch[2].trim();
      isSlashCommand = true;
      const selection = window.getSelection()?.toString() || '';

      if ((command === 'fix' || command === 'explain') && !selection && !rest) {
        appendMessageBubble('system', 'Please select code in the editor first, or add a description after the slash command (e.g., /fix this bug where...).');
        scrollChatToBottom(true);
        return;
      }

      if (command === 'fix') {
        text = rest ? 'Fix the following code/issue: ' + rest : 'Fix this code:\\n\\\';
      } else if (command === 'explain') {
        text = rest ? 'Explain this: ' + rest : 'Explain this code:\\n\\\';
      } else if (command === 'test') {
        text = rest ? 'Write tests for: ' + rest : 'Write unit tests for this code:\\n\\\';
      }
    }

    if (!text && linkedFiles.size === 0 && attachedImages.length === 0) return;
    if (isSending) return;

    // Hide welcome card if present
    if (welcomeCard) {
      welcomeCard.style.display = 'none';
    }

    isSending = true;
    promptInput.value = '';
    promptInput.style.height = 'auto';
    promptInput.disabled = true;
    sendBtn.disabled = true;

    // Toggle stop button
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    const selectedFiles = Array.from(linkedFiles);
    
    let userDisplayMessage = isSlashCommand ? rawText : text;
    if (isSlashCommand) {
      userDisplayMessage += '\\n\\n_Slash command expanded to: ' + text.substring(0, 120) + (text.length > 120 ? '...' : '') + '_';
    }
    if (selectedFiles.length > 0) {
      userDisplayMessage += '\\n\\n_Referenced Context: ' + selectedFiles.map(function(f) { return '\'; }).join(', ') + '_';
    }
    appendMessageBubble('user', userDisplayMessage, attachedImages);
    scrollChatToBottom(true);

    const assistantBubble = appendMessageBubble('assistant', '');
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    assistantBubble.appendChild(typingIndicator);
    currentStreamingBubble = assistantBubble;
    currentStreamingText = '';

    scrollChatToBottom(true);

    vscode.postMessage({
      type: 'sendMessage',
      text: text,
      history: chatHistory,
      linkedFiles: selectedFiles,
      images: attachedImages
    });

    linkedFiles.clear();
    renderChips();
    attachedImages = [];
    renderImageAttachments();
  }`;

const result = c.replace(actualFunc, newFunc);
fs.writeFileSync('src/webview/sidebar.js', result, 'utf8');
console.log('Full replacement done!');
console.log('New file length:', result.length);
