const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'webview', 'sidebar.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the submitMessage function to add slash command support
const oldFunc = `  // 7. Core Message Submission
  function submitMessage() {
    const text = promptInput.value.trim();
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

    // Toggle stop button in place of send button
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    // Compile linked file references
    const selectedFiles = Array.from(linkedFiles);
    
    // Append User message bubble with linked tags and images
    let userDisplayMessage = text;
    if (selectedFiles.length > 0) {
      userDisplayMessage += \@' + f.split('/').pop() + '\;
    }
    appendMessageBubble('user', userDisplayMessage, attachedImages);
    scrollChatToBottom(true);

    // Append Assistant placeholder bubble
    const assistantBubble = appendMessageBubble('assistant', '');
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    assistantBubble.appendChild(typingIndicator);
    currentStreamingBubble = assistantBubble;
    currentStreamingText = '';

    scrollChatToBottom(true);

    // Forward message payload to host including explicit file linkages and attached images
    vscode.postMessage({
      type: 'sendMessage',
      text,
      history: chatHistory,
      linkedFiles: selectedFiles,
      images: attachedImages
    });

    // Clear context chips and attached images state
    linkedFiles.clear();
    renderChips();
    attachedImages = [];
    renderImageAttachments();
  }`;

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

if (content.includes(oldFunc)) {
  content = content.replace(oldFunc, newFunc);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully patched submitMessage with slash commands!');
} else {
  console.log('ERROR: Could not find the old submitMessage function in the file.');
  // Try to find the function signature
  const idx = content.indexOf('function submitMessage()');
  if (idx >= 0) {
    console.log('Found submitMessage at index: ' + idx);
    console.log('Context: ' + content.substring(idx - 30, idx + 60));
  }
}
