    // 2. Remove typing indicator / think animations
    const typingIndicators = document.querySelectorAll('.typing-indicator');
    typingIndicators.forEach(indicator => {
      const parent = indicator.parentNode;
      if (parent) {
        parent.removeChild(indicator);
      }
    });

    // 3. Clear any streaming code blocks / write cards
    const streamingWriteCards = document.querySelectorAll('.tool-card.streaming-write-card');
    streamingWriteCards.forEach(card => {
      card.classList.remove('running');
      const badge = card.querySelector('.tool-status-badge');
      if (badge) badge.textContent = 'Interrupted';
      const scanBar = card.querySelector('.scanning-bar');
      if (scanBar) scanBar.parentNode.removeChild(scanBar);
    });
  }

  // Stop button handler
  stopBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'cancelStream' });
    isSending = false;
    promptInput.contentEditable = 'true';
    sendBtn.disabled = false;
    clearQueue();
    stopBtn.classList.add('hidden');
    sendBtn.classList.remove('hidden');
    setAvatarState('idle');
    clearAllActiveAnimations();
    if (typeof showToast === 'function') showToast('Response cancelled', 'warning', 2000);
  });

  function getPromptInputValue() {
    if (!promptInput) return '';
    const parts = [];
    const childNodes = promptInput.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent);
      } else if (node.classList && node.classList.contains('inline-file-tag')) {
        const path = node.dataset.path || node.textContent.replace('@', '');
        parts.push('[' + path + ']');
      } else {
        parts.push(node.textContent || ' ');
      }
    }
    return parts.join('');
  }

  // 7. Core Message Submission with Slash Command Support
  function submitMessage() {
    const rawText = getPromptInputValue().trim();

    // Slash command handling
    let text = rawText;
    let isSlashCommand = false;
    const slashMatch = text.match(/^\/(fix|explain|test|commit|refactor|review|docs|ask)\b\s*(.*)/is);
    if (slashMatch) {
      const command = slashMatch[1].toLowerCase();
      const rest = slashMatch[2].trim();
      isSlashCommand = true;

      if (command === 'fix') {
        text = rest ? 'Fix the following code/issue: ' + rest : 'Analyze the active file and fix any bugs, errors, or issues you find. Explain each fix.';
      } else if (command === 'explain') {
        text = rest ? 'Explain this: ' + rest : 'Explain the current file or selected code in detail — what it does, why it works that way, and any potential issues.';
      } else if (command === 'test') {
        text = rest ? 'Write tests for: ' + rest : 'Write comprehensive unit tests for the active file. Use the existing test framework in this project.';
      } else if (command === 'commit') {
        text = 'Generate a concise, conventional commit message for the current staged git changes. Run `git diff --staged` first to see the changes, then output ONLY the commit message (no extra commentary).';
      } else if (command === 'refactor') {
        text = rest ? 'Refactor this: ' + rest : 'Refactor the active file for better readability, maintainability, and performance. Preserve all functionality. Explain each refactoring decision.';
      } else if (command === 'review') {
        text = rest ? 'Code review: ' + rest : 'Perform a thorough code review of the active file. Check for bugs, performance issues, security vulnerabilities, missing error handling, and style inconsistencies.';
      } else if (command === 'docs') {
        text = rest ? 'Generate documentation for: ' + rest : 'Generate comprehensive JSDoc/TSDoc comments for all exported functions, classes, and types in the active file.';
      } else if (command === 'ask') {
        text = rest || 'What can I help you with?';
      }
    }

    let textToSend = text;
    if (typeof attachedFiles !== 'undefined' && attachedFiles.length > 0) {
      const fileBlocks = attachedFiles.map(file => {
        const ext = file.name.split('.').pop() || 'txt';
        return `\n\n[Attached File: ${file.name}]\n\`\`\`${ext}\n${file.content}\n\`\`\``;
      }).join('');
      textToSend += fileBlocks;
    }

    if (!textToSend && attachedImages.length === 0) return;
    
    // If already sending, queue the message instead of discarding
    if (isSending) {
      messageQueue.push({
        text: textToSend,
        images: [...attachedImages],
        userDisplayMessage: isSlashCommand ? rawText : text,
        rawText: rawText
      });
      renderQueueChips();
      showToast('Message queued (' + messageQueue.length + ' pending)', 'info');
      
      // Show queued user bubble so user sees it was accepted
      let displayText = isSlashCommand ? rawText : text;
      appendMessageBubble('system', '⏳ <em>Queued for sending...</em>');
      scrollChatToBottom(true);
      
      // Also add to chatHistory as a real user message so it's preserved
      chatHistory.push({ role: 'user', content: textToSend });
      vscode.postMessage({
        type: 'saveHistory',
        history: chatHistory
      });
      
      promptInput.innerHTML = '';
      if (typeof attachedFiles !== 'undefined') {
        attachedFiles.length = 0;
      }
      attachedImages = [];
      if (typeof renderAttachments === 'function') {
        renderAttachments();
      }
      return;
    }

    // Hide welcome card if present
    if (welcomeCard) {
      welcomeCard.style.display = 'none';
    }

    isSending = true;
    promptInput.innerHTML = '';
    sendBtn.disabled = true;

    // Toggle stop button
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    
    let userDisplayMessage = isSlashCommand ? rawText : text;
    if (isSlashCommand) {
      userDisplayMessage += '\n\n_Slash command expanded to: ' + text.substring(0, 120) + (text.length > 120 ? '...' : '') + '_';
    }

    executeSend(textToSend, attachedImages, undefined, userDisplayMessage);

    
    attachedImages = [];
    if (typeof attachedFiles !== 'undefined') {
      attachedFiles.length = 0;
    }
    if (typeof renderAttachments === 'function') {
      renderAttachments();
    }
  }

  let currentToolCardElement = null;
  let isStreamingCardExpanded = false;

  function createToolCardDOM(toolName, status, target, result, checkpointId, isReverted = false, code = null, terminalName = null) {
    const card = document.createElement('div');
    card.className = `tool-card ${status}`;
    card.setAttribute('data-tool', toolName);
    card.setAttribute('data-target', target || '');
    if (isReverted) {
      card.classList.add('reverted');
    }
    if (toolName === 'create_file' || toolName === 'write_file' || toolName === 'patch_file' || toolName === 'multi_patch_file' || toolName === 'multipatch_file') {
      card.classList.add('write-tool-card');
    }
    if (checkpointId) {
      card.setAttribute('data-checkpoint-id', checkpointId);
    }
    
