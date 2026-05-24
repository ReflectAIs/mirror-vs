const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// The exact old function to replace - copied character by character from the file
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

// Check if oldFunc exists in the file
console.log('Old function found:', c.includes(oldFunc));
console.log('Length of oldFunc:', oldFunc.length);

// Try to find by trimming whitespace
const trimmedOld = oldFunc.trim();
console.log('Trimmed found:', c.includes(trimmedOld));

// Look for the unique comment text
console.log('Comment substring found:', c.includes('// 7. Core Message Submission'));
