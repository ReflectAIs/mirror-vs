

  // Helper: Append a message bubble to DOM
  function appendMessageBubble(role, text, images, container = chatMessages) {
    if (role === 'system') {
      let innerText = text;
      const guardOpen = "<<<UNTRUSTED_SOURCE_DATA>>>";
      const guardClose = "<<<END_UNTRUSTED_SOURCE_DATA>>>";
      if (text.includes(guardOpen) && text.includes(guardClose)) {
        const startIndex = text.indexOf(guardOpen) + guardOpen.length;
        const endIndex = text.indexOf(guardClose);
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          const contentInside = text.substring(startIndex, endIndex).trim();
          const lines = contentInside.split('\n');
          if (lines[0] && lines[0].startsWith('Source:')) {
            lines.shift();
          }
          innerText = lines.join('\n').trim();
        }
      }

      if (innerText.startsWith('[Tool Result')) {
        appendToolCardFromHistory(innerText, container);
        return null;
      }
      if (innerText.includes('[CONSOLIDATED CONTEXT SUMMARY]')) {
        const msgElement = document.createElement('div');
        msgElement.className = 'message system-context';
        
        const banner = document.createElement('div');
        banner.className = 'system-context-banner';
        banner.innerHTML = `
          <div class="system-context-header">
            <span>🔄 Pair Programming Context Consolidated</span>
            <span class="system-context-toggle">Show Details</span>
          </div>
          <div class="system-context-body collapsed">
            ${parseMarkdown(innerText)}
          </div>
        `;
        
        banner.querySelector('.system-context-header').addEventListener('click', () => {
          const body = banner.querySelector('.system-context-body');
          const toggle = banner.querySelector('.system-context-toggle');
          body.classList.toggle('collapsed');
          toggle.textContent = body.classList.contains('collapsed') ? 'Show Details' : 'Hide Details';
        });
        
        msgElement.appendChild(banner);
        container.appendChild(msgElement);
        return banner;
      }
      return null;
    }

    if (role === 'assistant') {
      extractToolContents(text);
    }

    const msgElement = document.createElement('div');
    msgElement.className = `message ${role}`;

    // Compute message index based on current chatHistory
    const msgIndex = chatHistory.findIndex(m => m.role === role && m.content === text);
    
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = role === 'user' ? 'You' : 'Mirror VS';
    msgElement.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (role === 'user') {
      const editBtn = document.createElement('button');
      editBtn.className = 'message-action-btn';
      editBtn.innerHTML = '✏️ Edit';
      editBtn.title = 'Edit & revert chat to this point';
      editBtn.addEventListener('click', () => {
        const promptInput = document.getElementById('prompt-input');
        if (promptInput) {
          let rawText = text;
          const contextIndex = rawText.indexOf('\n\n[Additional Workspace Files Context]:');
          if (contextIndex !== -1) rawText = rawText.substring(0, contextIndex);
          const activeIndex = rawText.indexOf('\n\n[Active File Context - ');
          if (activeIndex !== -1) rawText = rawText.substring(0, activeIndex);
          
          promptInput.textContent = rawText.trim();
          promptInput.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(promptInput);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        isEditingHistory = true;
        // Use index-based revert for reliability
        vscode.postMessage({ type: 'revertHistory', text, role: 'user', inclusive: false, messageIndex: msgIndex });
      });
      actions.appendChild(editBtn);
    }
    
    if (actions.children.length > 0) {
      msgElement.appendChild(actions);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    if (images && images.length > 0) {
      const imagesContainer = document.createElement('div');
      imagesContainer.className = 'bubble-images-container';
      images.forEach((imgBase64) => {
        const img = document.createElement('img');
        img.className = 'bubble-inline-image';
        img.src = `data:image/png;base64,${imgBase64}`;
        imagesContainer.appendChild(img);
      });
      bubble.appendChild(imagesContainer);
    }
    
    if (text) {
      const textContainer = document.createElement('div');
      textContainer.className = 'bubble-text-container';
      
      let isApproved = false;
      if (role === 'assistant' && msgIndex !== -1) {
        for (let idx = msgIndex + 1; idx < chatHistory.length; idx++) {
          const nextMsg = chatHistory[idx];
          if (nextMsg.role === 'user' && nextMsg.content.includes("Approved. Proceed with the implementation plan.")) {
            isApproved = true;
            break;
          }
        }
      }

      textContainer.innerHTML = parseMarkdown(text, isApproved);
      bindCodeBlockButtons(textContainer);
      applySyntaxHighlighting(textContainer);
      bubble.appendChild(textContainer);
    }
    
    msgElement.appendChild(bubble);
    
    container.appendChild(msgElement);
    
    return bubble;
  }

  // 8. Listen to Messages from Extension Host
  window.addEventListener('message', (event) => {
    const message = event.data;

    // Autonomous mode setting sync from VS Code
    if (message.type === 'settingValue' && message.key === 'autonomousMode') {
      const toggle = document.getElementById('settings-autonomous-toggle');
      if (toggle) toggle.checked = message.value === true;
      return;
    }

    switch (message.type) {
      case 'updateSettings': {
        const s = message.settings;
        savedDefaultOllamaModel = s.defaultOllamaModel;
        
        if (ollamaHostInput) {
          ollamaHostInput.value = s.ollamaHost;
        }
        
        // Handle deepseek key display helper
        if (deepseekKeyStatus && deepseekKeyInput) {
          if (s.hasDeepSeekKey) {
            deepseekKeyStatus.textContent = 'Key is configured (Securely stored)';
            deepseekKeyStatus.style.color = '#22c55e';
            deepseekKeyInput.value = '••••••••';
          } else {
            deepseekKeyStatus.textContent = 'Key is not configured';
            deepseekKeyStatus.style.color = '#ef4444';
            deepseekKeyInput.value = '';
          }
        }

        const figmaKeyStatus = document.getElementById('figma-key-status');
        if (s.hasFigmaKey) {
          if (figmaKeyStatus) {
            figmaKeyStatus.textContent = 'Token is configured (Securely stored)';
            figmaKeyStatus.style.color = '#22c55e';
          }
          if (figmaKeyInput) {
            figmaKeyInput.value = '••••••••';
          }
        } else {
          if (figmaKeyStatus) {
            figmaKeyStatus.textContent = 'Token is not configured';
            figmaKeyStatus.style.color = '#ef4444';
          }
          if (figmaKeyInput) {
            figmaKeyInput.value = '';
          }
        }

        if (deepseekModelSelect) {
          deepseekModelSelect.value = s.defaultDeepSeekModel;
        }

        if (s.deepSeekThinking !== undefined) {
          if (settingsThinkingToggle) settingsThinkingToggle.checked = s.deepSeekThinking;
          if (quickThinkingToggle) quickThinkingToggle.checked = s.deepSeekThinking;
        }
        if (s.deepSeekThinkingLevel !== undefined) {
          if (settingsThinkingLevelSelect) settingsThinkingLevelSelect.value = s.deepSeekThinkingLevel;
          if (quickThinkingLevelSelect) quickThinkingLevelSelect.value = s.deepSeekThinkingLevel;
        }

        if (s.contextBudgetPercent !== undefined && contextBudgetInput) {
          contextBudgetInput.value = s.contextBudgetPercent;
        }
        if (s.turnsToRetain !== undefined && turnsToRetainInput) {
          turnsToRetainInput.value = s.turnsToRetain;
        }

        if (ollamaModelSelect && s.defaultOllamaModel) {
          const opt = ollamaModelSelect.querySelector(`option[value="${s.defaultOllamaModel}"]`);
          if (opt) {
            ollamaModelSelect.value = s.defaultOllamaModel;
          }
        }

        if (s.customEndpointUrl !== undefined) {
          defaultCustomUrl = s.customEndpointUrl;
        }
        if (s.customEndpointModel !== undefined) {
          defaultCustomModel = s.customEndpointModel;
        }
        if (s.hasCustomEndpointKey !== undefined) {
          defaultCustomHasKey = s.hasCustomEndpointKey;
          if (customEndpointKeyInput) {
            customEndpointKeyInput.value = defaultCustomHasKey ? '••••••••' : '';
          }
        }

        if (s.customApis !== undefined) {
          customApisList = s.customApis;
        }
        if (s.configuredCustomApiKeys !== undefined) {
          configuredCustomApiKeys = s.configuredCustomApiKeys;
        }

        updateCustomProvidersUI(s.provider);
        selectProvider(s.provider);

        if (s.agentMode !== undefined) {
          const agentModeSelect = document.getElementById('agent-mode-select');
          if (agentModeSelect) agentModeSelect.value = s.agentMode;
        }
        if (s.customSystemPrompt !== undefined) {
          const customPromptArea = document.getElementById('custom-system-prompt');
          if (customPromptArea) customPromptArea.value = s.customSystemPrompt;
        }
        if (s.autonomousMode !== undefined) {
          const autoToggle = document.getElementById('settings-autonomous-toggle');
          if (autoToggle) autoToggle.checked = s.autonomousMode;
        }
        if (s.autoApproveWrite !== undefined) {
          const writeToggle = document.getElementById('settings-approve-write-toggle');
          if (writeToggle) writeToggle.checked = s.autoApproveWrite;
        }
        if (s.autoApproveCommand !== undefined) {
          const cmdToggle = document.getElementById('settings-approve-command-toggle');
          if (cmdToggle) cmdToggle.checked = s.autoApproveCommand;
        }
        if (s.autoApproveBrowser !== undefined) {
          const browserToggle = document.getElementById('settings-approve-browser-toggle');
          if (browserToggle) browserToggle.checked = s.autoApproveBrowser;
        }

        if (s.planFirst !== undefined && planFirstToggle) {
          planFirstToggle.checked = s.planFirst;
        }
        if (s.enableTruncationGuardrail !== undefined && truncationGuardToggle) {
          truncationGuardToggle.checked = s.enableTruncationGuardrail;
        }
        if (s.aiReviewEnabled !== undefined && aiReviewToggle) {
          aiReviewToggle.checked = s.aiReviewEnabled;
        }
        if (s.multiFileRefactorEnabled !== undefined && multiFileToggle) {
          multiFileToggle.checked = s.multiFileRefactorEnabled;
        }
        if (s.maxTurnsBeforeSummarize !== undefined && maxTurnsSummarizeInput) {
          maxTurnsSummarizeInput.value = s.maxTurnsBeforeSummarize;
        }
        if (s.modelContextLengths !== undefined && modelContextLengthsInput) {
          modelContextLengthsInput.value = s.modelContextLengths ? JSON.stringify(s.modelContextLengths, null, 2) : '{}';
        }
        if (s.maxToolOutputLength !== undefined && maxToolOutputInput) {
          maxToolOutputInput.value = s.maxToolOutputLength;
        }
        if (s.embeddingModel !== undefined && embeddingModelInput) {
          embeddingModelInput.value = s.embeddingModel;
        }
        if (s.teacherEnabled !== undefined) {
          const teacherToggle = document.getElementById('settings-teacher-toggle');
          if (teacherToggle) teacherToggle.checked = s.teacherEnabled;
        }
        if (s.teacherModel !== undefined) {
          const teacherModelInput = document.getElementById('settings-teacher-model-input');
          if (teacherModelInput) teacherModelInput.value = s.teacherModel;
        }

        syncQuickModelSelect();

        // Trigger connection validation check
        if (s.ollamaHost) {
          vscode.postMessage({ type: 'validateHost', host: s.ollamaHost });
        }
        break;
      }

      case 'hostValidationResult': {
        if (message.isValid) {
          ollamaHostValidationIndicator.textContent = 'Online';
          ollamaHostValidationIndicator.className = 'validation-badge online';
          
          // Re-render select options dynamically if we received new models
          if (message.models && message.models.length > 0) {
            ollamaModelSelect.innerHTML = '';
            message.models.forEach((m) => {
              const opt = document.createElement('option');
              opt.value = m;
              opt.textContent = m;
              ollamaModelSelect.appendChild(opt);
            });
            if (ollamaModelSelect.querySelector(`option[value="${savedDefaultOllamaModel}"]`)) {
              ollamaModelSelect.value = savedDefaultOllamaModel;
            } else {
              ollamaModelSelect.value = message.models[0];
            }
          }
        } else {
          ollamaHostValidationIndicator.textContent = 'Offline';
          ollamaHostValidationIndicator.className = 'validation-badge offline';
        }
        break;
      }

      case 'updateModels': {
        const models = message.models;
        ollamaModelSelect.innerHTML = '';
        if (models && models.length > 0) {
          models.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            ollamaModelSelect.appendChild(opt);
          });
          if (ollamaModelSelect.querySelector(`option[value="${savedDefaultOllamaModel}"]`)) {
            ollamaModelSelect.value = savedDefaultOllamaModel;
          } else {
            ollamaModelSelect.value = models[0];
          }
        } else {
          ollamaModelSelect.innerHTML = '<option value="none">No models found</option>';
        }
        break;
      }

      case 'workspaceFiles': {
        workspaceFiles = message.files || [];
        const sel = window.getSelection();
        let text = promptInput.textContent || promptInput.innerText || '';
        let cursorPos = 0;
        if (sel && sel.rangeCount && promptInput.contains(sel.anchorNode)) {
          const preRange = document.createRange();
          preRange.selectNodeContents(promptInput);
          preRange.setEnd(sel.anchorNode, sel.anchorOffset);
          cursorPos = preRange.toString().length;
        }
        const textBeforeCursor = text.substring(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');
        if (atIndex !== -1 && (atIndex === 0 || /\s/.test(textBeforeCursor[atIndex - 1]))) {
          handleAutocompleteSearch();
        }
        break;
      }

      case 'chatResponseStart': {
        sendBtn.disabled = true;
        isSending = true;
        isStreamingCardExpanded = false;
        setAvatarState('thinking');

        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');

        if (!currentStreamingBubble) {
          const assistantBubble = appendMessageBubble('assistant', '');
          const typingIndicator = document.createElement('div');
          typingIndicator.className = 'typing-indicator';
          typingIndicator.innerHTML = '<span></span><span></span><span></span>';
          assistantBubble.appendChild(typingIndicator);
          currentStreamingBubble = assistantBubble;
          currentStreamingText = '';
          currentStreamingReasoningText = '';
        }
        break;
      }

      case 'chatResponseChunk': {
        if (!currentStreamingBubble) {
          return;
        }

        const loader = currentStreamingBubble.querySelector('.typing-indicator');
        if (loader) {
          currentStreamingBubble.removeChild(loader);
        }

        if (message.reasoningText) {
          currentStreamingReasoningText += message.reasoningText;
          setAvatarState('thinking');
        } else {
          setAvatarState('coding');
        }

        if (message.text) {
          currentStreamingText += message.text;
        }

        let html = '';
        if (currentStreamingReasoningText) {
          const escapedReasoning = escapeHtml(currentStreamingReasoningText).replace(/\n/g, '<br/>');
          html += `
            <details class="thought-process-container" open style="margin-bottom: 12px; border-left: 2px solid rgba(168, 85, 247, 0.4); padding-left: 10px; background: rgba(168, 85, 247, 0.03); border-radius: 0 6px 6px 0;">
              <summary style="cursor: pointer; font-size: 11px; color: #a855f7; font-weight: 600; user-select: none; outline: none; margin-bottom: 6px;">
                🧠 View Chain-of-Thought
              </summary>
              <div class="thought-process-content" style="font-size: 11px; line-height: 1.5; color: rgba(255, 255, 255, 0.65); font-style: italic; font-family: var(--vscode-editor-font-family, monospace);">
                ${escapedReasoning}
              </div>
            </details>
          `;
        }

        if (currentStreamingText) {
          html += parseMarkdown(currentStreamingText);
        }

        const existingCard = currentStreamingBubble.querySelector('.streaming-write-card');
        if (existingCard) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          const newCard = tempDiv.querySelector('.streaming-write-card');
          if (newCard) {
            const existingCode = existingCard.querySelector('.code-block-wrapper pre code');
            const newCode = newCard.querySelector('.code-block-wrapper pre code');
            if (existingCode && newCode) {
              if (existingCode.innerHTML !== newCode.innerHTML) {
                existingCode.innerHTML = newCode.innerHTML;
              }
              
              const existingTarget = existingCard.querySelector('.tool-target');
              const newTarget = newCard.querySelector('.tool-target');
              if (existingTarget && newTarget && existingTarget.textContent !== newTarget.textContent) {
                existingTarget.textContent = newTarget.textContent;
              }
              
              const existingLang = existingCard.querySelector('.code-block-lang');
              const newLang = newCard.querySelector('.code-block-lang');
              if (existingLang && newLang && existingLang.textContent !== newLang.textContent) {
                existingLang.textContent = newLang.textContent;
              }
              
              const existingLabel = existingCard.querySelector('.streaming-label');
              const newLabel = newCard.querySelector('.streaming-label');
              if (existingLabel && newLabel && existingLabel.textContent !== newLabel.textContent) {
                existingLabel.textContent = newLabel.textContent;
              }

              bindCodeBlockButtons(existingCard);
              scrollChatToBottom();
              break;
            }
          }
        } else {
          currentStreamingBubble.innerHTML = html;
          bindCodeBlockButtons(currentStreamingBubble);
        }
        
        scrollChatToBottom();
        break;
      }

      case 'chatResponseComplete': {
        setAvatarState('idle');
        if (!currentStreamingBubble) {
          updateStickyUserMessage();
          return;
        }

        const loader = currentStreamingBubble.querySelector('.typing-indicator');
        if (loader) {
          currentStreamingBubble.removeChild(loader);
        }

        currentStreamingText = message.fullText;
        currentStreamingReasoningText = message.reasoningText || currentStreamingReasoningText;
        extractToolContents(currentStreamingText);

        let html = '';
        if (currentStreamingReasoningText) {
          const escapedReasoning = escapeHtml(currentStreamingReasoningText).replace(/\n/g, '<br/>');
          html += `
            <details class="thought-process-container" style="margin-bottom: 12px; border-left: 2px solid rgba(168, 85, 247, 0.4); padding-left: 10px; background: rgba(168, 85, 247, 0.03); border-radius: 0 6px 6px 0;">
              <summary style="cursor: pointer; font-size: 11px; color: #a855f7; font-weight: 600; user-select: none; outline: none; margin-bottom: 6px;">
                🧠 View Chain-of-Thought
              </summary>
              <div class="thought-process-content" style="font-size: 11px; line-height: 1.5; color: rgba(255, 255, 255, 0.65); font-style: italic; font-family: var(--vscode-editor-font-family, monospace);">
                ${escapedReasoning}
              </div>
            </details>
          `;
        }
        html += parseMarkdown(currentStreamingText);

        currentStreamingBubble.innerHTML = html;
        bindCodeBlockButtons(currentStreamingBubble);

        currentStreamingBubble = null;
        currentStreamingText = '';
        currentStreamingReasoningText = '';
        updateStickyUserMessage();
        scrollChatToBottom();
        break;
      }

      case 'toolStatus': {
        const { toolName, status, target, result, checkpointId, code, terminalName } = message;
        if (status === 'running') {
          setAvatarState('tool_calling');
          const runningCard = createToolCardDOM(toolName, status, target, null, null, false, null, null);
          placeCardInPlaceholder(runningCard, toolName, target);
        } else {
          // Find any existing running card for this tool & target in the chatMessages container
          const cards = chatMessages.querySelectorAll('.tool-card.running');
          let existingCard = null;
          const cleanTarget = (target || '').trim();
          for (let i = 0; i < cards.length; i++) {
            if (cards[i].getAttribute('data-tool') === toolName &&
                cards[i].getAttribute('data-target') === cleanTarget) {
              existingCard = cards[i];
              break;
            }
          }
          if (existingCard) {
            const parent = existingCard.parentNode;
            if (parent) {
              const updatedCard = createToolCardDOM(toolName, status, target, result, checkpointId, false, code, terminalName);
              parent.replaceChild(updatedCard, existingCard);
            }
          } else {
            const card = createToolCardDOM(toolName, status, target, result, checkpointId, false, code, terminalName);
            placeCardInPlaceholder(card, toolName, target);
          }
        }
        scrollChatToBottom();
        break;
      }

        case 'loopComplete': {
          isSending = false;
          promptInput.contentEditable = 'true';
          sendBtn.disabled = false;
          processNextInQueue();
        promptInput.focus();
        currentStreamingBubble = null;
        currentStreamingText = '';
        currentStreamingReasoningText = '';
        setAvatarState('celebrate');
        triggerParticleExplosion();
        setTimeout(() => {
          if (avatarState === 'celebrate') {
            setAvatarState('idle');
          }
        }, 4000);
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        clearAllActiveAnimations();
        updateStickyUserMessage();
        scrollChatToBottom();
        break;
      }

      case 'chatResponseError': {
        setAvatarState('error');
        if (currentStreamingBubble) {
          const loader = currentStreamingBubble.querySelector('.typing-indicator');
          if (loader) {
            currentStreamingBubble.removeChild(loader);
          }
          currentStreamingBubble.innerHTML = `<div style="color: #ef4444; font-weight: 600;">Error: ${message.error}</div>`;
        } else {
          const bubble = appendMessageBubble('assistant', '');
          if (bubble) {
            bubble.innerHTML = `<div style="color: #ef4444; font-weight: 600;">Error: ${message.error}</div>`;
          }
        }

        isSending = false;
        promptInput.contentEditable = 'true';
        sendBtn.disabled = false;
        processNextInQueue();
        currentStreamingBubble = null;
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        clearAllActiveAnimations();
        scrollChatToBottom();
        break;
      }

      case 'requestSensitiveCommandApproval': {
        const { command, autonomousMode } = message;
        const iconEl = document.getElementById('approval-modal-icon');
        const titleEl = document.getElementById('approval-modal-title');
        const descEl = document.getElementById('approval-modal-description');
        const warningEl = document.getElementById('approval-modal-warning');
        
        if (iconEl) iconEl.textContent = '⚠️';
        if (titleEl) titleEl.textContent = 'Sensitive Command Request';
        if (descEl) descEl.textContent = 'Mirror VS is requesting to run a sensitive/destructive command:';
        if (approvalCommandText) {
          approvalCommandText.textContent = command;
        }
        if (warningEl) warningEl.textContent = 'Do you want to authorize this command?';
        if (approvalAllowBtn) {
          approvalAllowBtn.textContent = 'Allow Execution';
        }
        
        if (commandApprovalModal) {
          commandApprovalModal.classList.remove('hidden');
        }
        
        if (approvalTimerInterval) {
          clearInterval(approvalTimerInterval);
          approvalTimerInterval = null;
        }
        
        const handleResponse = (approved) => {
          if (approvalTimerInterval) {
            clearInterval(approvalTimerInterval);
            approvalTimerInterval = null;
          }
          if (commandApprovalModal) {
            commandApprovalModal.classList.add('hidden');
          }
          vscode.postMessage({ type: 'sensitiveCommandResponse', approved });
        };
        
        if (approvalAllowBtn) {
          approvalAllowBtn.onclick = () => handleResponse(true);
        }
        if (approvalDenyBtn) {
          approvalDenyBtn.onclick = () => handleResponse(false);
        }
        
        if (autonomousMode) {
          if (approvalTimerContainer) {
            approvalTimerContainer.classList.remove('hidden');
          }
          if (approvalTimerBar) {
            approvalTimerBar.style.width = '100%';
          }
          if (approvalTimerText) {
            approvalTimerText.textContent = 'Auto-allowing in 10s...';
          }
          
          const startTime = Date.now();
          approvalTimerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 10000 - elapsed);
            
            if (approvalTimerBar) {
              approvalTimerBar.style.width = `${(remaining / 10000) * 100}%`;
            }
            
            if (approvalTimerText) {
              const secondsLeft = Math.ceil(remaining / 1000);
              approvalTimerText.textContent = `Auto-allowing in ${secondsLeft}s...`;
            }
            
            if (remaining <= 0) {
              clearInterval(approvalTimerInterval);
              approvalTimerInterval = null;
              handleResponse(true);
            }
          }, 100);
        } else {
          if (approvalTimerContainer) {
            approvalTimerContainer.classList.add('hidden');
          }
        }
        break;
      }

      case 'requestToolApproval': {
        const { toolName, target, details, autonomousMode } = message;
        const iconEl = document.getElementById('approval-modal-icon');
        const titleEl = document.getElementById('approval-modal-title');
        const descEl = document.getElementById('approval-modal-description');
        const warningEl = document.getElementById('approval-modal-warning');
        
        if (iconEl) {
          iconEl.textContent = (toolName === 'run_command' || toolName === 'send_terminal_input') ? '💻' : toolName === 'write_file' ? '📂' : '🌐';
        }
        if (titleEl) {
          titleEl.textContent = (toolName === 'run_command' || toolName === 'send_terminal_input') ? 'Terminal Command Approval' : toolName === 'write_file' ? 'File Change Approval' : 'Browser Action Approval';
        }
        if (descEl) {
          descEl.textContent = `Mirror VS is requesting approval for tool "${toolName}" on:`;
        }
        if (approvalCommandText) {
          approvalCommandText.textContent = `${target}` + (details ? `\n\nContent Preview:\n${details.substring(0, 1000)}${details.length > 1000 ? '...' : ''}` : '');
        }
        if (warningEl) {
          warningEl.textContent = 'Do you want to authorize this action?';
        }
        if (approvalAllowBtn) {
          approvalAllowBtn.textContent = 'Allow';
        }
        
        if (commandApprovalModal) {
          commandApprovalModal.classList.remove('hidden');
        }
        
        if (approvalTimerInterval) {
          clearInterval(approvalTimerInterval);
          approvalTimerInterval = null;
        }
        
        const handleResponse = (approved) => {
          if (approvalTimerInterval) {
            clearInterval(approvalTimerInterval);
            approvalTimerInterval = null;
          }
          if (commandApprovalModal) {
            commandApprovalModal.classList.add('hidden');
          }
          vscode.postMessage({ type: 'toolApprovalResponse', approved });
        };
        
        if (approvalAllowBtn) {
          approvalAllowBtn.onclick = () => handleResponse(true);
        }
        if (approvalDenyBtn) {
          approvalDenyBtn.onclick = () => handleResponse(false);
        }
        
        if (autonomousMode) {
          if (approvalTimerContainer) {
            approvalTimerContainer.classList.remove('hidden');
          }
          if (approvalTimerBar) {
            approvalTimerBar.style.width = '100%';
          }
          if (approvalTimerText) {
            approvalTimerText.textContent = 'Auto-allowing in 10s...';
          }
          
          const startTime = Date.now();
          approvalTimerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 10000 - elapsed);
            
            if (approvalTimerBar) {
              approvalTimerBar.style.width = `${(remaining / 10000) * 100}%`;
            }
            
            if (approvalTimerText) {
              const secondsLeft = Math.ceil(remaining / 1000);
              approvalTimerText.textContent = `Auto-allowing in ${secondsLeft}s...`;
            }
            
            if (remaining <= 0) {
              clearInterval(approvalTimerInterval);
              approvalTimerInterval = null;
              handleResponse(true);
            }
          }, 100);
        } else {
          if (approvalTimerContainer) {
            approvalTimerContainer.classList.add('hidden');
          }
        }
        break;
      }

      case 'providerFallback': {
        const { message: fallbackMsg, newProvider } = message;
        selectProvider(newProvider);
        
        const msgElement = document.createElement('div');
