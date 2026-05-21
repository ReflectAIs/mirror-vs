(function () {
  const vscode = acquireVsCodeApi();

  // DOM Elements
  const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
  const settingsDrawer = document.getElementById('settings-drawer');
  
  const toggleHistoryBtn = document.getElementById('toggle-history-btn');
  const newChatBtn = document.getElementById('new-chat-btn');
  const historyDrawer = document.getElementById('history-drawer');
  const sessionsList = document.getElementById('sessions-list');
  
  const providerOllamaBtn = document.getElementById('provider-ollama-btn');
  const providerDeepseekBtn = document.getElementById('provider-deepseek-btn');
  const ollamaPanel = document.getElementById('ollama-panel');
  const deepseekPanel = document.getElementById('deepseek-panel');
  
  const ollamaHostInput = document.getElementById('ollama-host');
  const ollamaHostValidationIndicator = document.getElementById('ollama-host-validation-indicator');
  const ollamaModelSelect = document.getElementById('ollama-model-select');
  const refreshModelsBtn = document.getElementById('refresh-models-btn');
  
  const deepseekKeyInput = document.getElementById('deepseek-key');
  const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
  const deepseekKeyStatus = document.getElementById('deepseek-key-status');
  const deepseekModelSelect = document.getElementById('deepseek-model-select');
  
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const maxTurnsInput = document.getElementById('max-turns-input');
  const turnsToRetainInput = document.getElementById('turns-to-retain-input');
  
  const chatMessages = document.getElementById('chat-messages');
  const welcomeCard = document.getElementById('welcome-card');
  
  const contextDot = document.querySelector('.context-dot');
  const contextFileName = document.getElementById('context-file-name');
  
  const promptInput = document.getElementById('prompt-input');
  const sendBtn = document.getElementById('send-btn');

  // Autocomplete & Context Chips Elements
  const contextChipsContainer = document.getElementById('context-chips-container');
  const autocompleteDropdown = document.getElementById('autocomplete-dropdown');

  // Application State
  let chatHistory = [];
  let currentStreamingBubble = null;
  let currentStreamingText = '';
  let activeProvider = 'ollama';
  let isSending = false;
  let savedDefaultOllamaModel = 'llama3';
  let activeSessionId = null;

  const stopBtn = document.getElementById('stop-btn');
  const imageAttachmentsContainer = document.getElementById('image-attachments-container');

  // Attached Images State
  let attachedImages = [];

  // New features state
  let workspaceFiles = [];
  let linkedFiles = new Set();
  let autocompleteQuery = '';
  let autocompleteActiveIndex = 0;
  let isAutocompleteOpen = false;
  let validationTimeout = null;

  // Map to store parsed created/updated file contents from assistant messages
  const parsedToolContents = new Map();

  function extractToolContents(text) {
    if (!text) return;
    
    // Parse out create_file and write_file contents
    let match;
    const createFileRegex = /<create_file([\s\S]*?)>([\s\S]*?)<\/create_file\s*>/gi;
    while ((match = createFileRegex.exec(text)) !== null) {
      const attrs = match[1];
      const content = match[2];
      const pathMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i);
      if (pathMatch) {
        parsedToolContents.set(pathMatch[1].trim(), content);
      }
    }

    const writeFileRegex = /<write_file([\s\S]*?)>([\s\S]*?)<\/write_file\s*>/gi;
    while ((match = writeFileRegex.exec(text)) !== null) {
      const attrs = match[1];
      const content = match[2];
      const pathMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i);
      if (pathMatch) {
        parsedToolContents.set(pathMatch[1].trim(), content);
      }
    }

    const patchFileRegex = /<patch_file([\s\S]*?)>([\s\S]*?)<\/patch_file\s*>/gi;
    while ((match = patchFileRegex.exec(text)) !== null) {
      const attrs = match[1];
      const content = match[2];
      const pathMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i);
      if (pathMatch) {
        parsedToolContents.set(pathMatch[1].trim(), content);
      }
    }
  }

  // Initialize
  vscode.postMessage({ type: 'getSettings' });
  vscode.postMessage({ type: 'fetchModels' });

  // 1. Settings Drawer Toggle
  toggleSettingsBtn.addEventListener('click', () => {
    settingsDrawer.classList.toggle('collapsed');
    historyDrawer.classList.add('collapsed');
  });

  // 1b. History Drawer Toggle
  toggleHistoryBtn.addEventListener('click', () => {
    historyDrawer.classList.toggle('collapsed');
    settingsDrawer.classList.add('collapsed');
  });

  // 1c. New Chat Session Action
  newChatBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'newSession' });
    historyDrawer.classList.add('collapsed');
    settingsDrawer.classList.add('collapsed');
  });

  // 2. Provider Switch Tabs
  providerOllamaBtn.addEventListener('click', () => {
    selectProvider('ollama');
    vscode.postMessage({ type: 'fetchModels' });
  });
  providerDeepseekBtn.addEventListener('click', () => selectProvider('deepseek'));

  function selectProvider(provider) {
    activeProvider = provider;
    if (provider === 'ollama') {
      providerOllamaBtn.classList.add('active');
      providerDeepseekBtn.classList.remove('active');
      ollamaPanel.classList.remove('hidden');
      deepseekPanel.classList.add('hidden');
    } else {
      providerOllamaBtn.classList.remove('active');
      providerDeepseekBtn.classList.add('active');
      ollamaPanel.classList.add('hidden');
      deepseekPanel.classList.remove('hidden');
    }
  }

  // 3. Password / Key Visibility Toggle
  toggleKeyVisibilityBtn.addEventListener('click', () => {
    if (deepseekKeyInput.type === 'password') {
      deepseekKeyInput.type = 'text';
      toggleKeyVisibilityBtn.textContent = 'Hide';
    } else {
      deepseekKeyInput.type = 'password';
      toggleKeyVisibilityBtn.textContent = 'Show';
    }
  });

  // 4. Refresh Models button
  refreshModelsBtn.addEventListener('click', () => {
    ollamaModelSelect.innerHTML = '<option value="loading">Loading models...</option>';
    vscode.postMessage({ type: 'fetchModels' });
  });

  // 5. Save Settings button
  saveSettingsBtn.addEventListener('click', () => {
    const provider = activeProvider;
    const ollamaHost = ollamaHostInput.value.trim();
    const defaultOllamaModel = ollamaModelSelect.value;
    const defaultDeepSeekModel = deepseekModelSelect.value;
    const deepSeekKey = deepseekKeyInput.value.trim();
    const maxTurns = parseInt(maxTurnsInput.value.trim(), 10) || 16;
    const turnsToRetain = parseInt(turnsToRetainInput.value.trim(), 10) || 6;

    vscode.postMessage({
      type: 'saveSettings',
      provider,
      ollamaHost,
      defaultOllamaModel,
      defaultDeepSeekModel,
      deepSeekKey: deepSeekKey || undefined, // only send key if typed
      maxTurnsBeforeSummarize: maxTurns,
      turnsToRetain: turnsToRetain
    });

    settingsDrawer.classList.add('collapsed');
  });

  // 5b. Ollama Host Live Validation on Type (Debounced)
  ollamaHostInput.addEventListener('input', () => {
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }
    ollamaHostValidationIndicator.textContent = 'Checking...';
    ollamaHostValidationIndicator.className = 'validation-badge checking';
    
    validationTimeout = setTimeout(() => {
      vscode.postMessage({
        type: 'validateHost',
        host: ollamaHostInput.value.trim()
      });
    }, 600);
  });

  // 6. Textarea Auto-grow & Enter Key Submit & Autocomplete Keys
  promptInput.addEventListener('input', () => {
    autoGrowTextarea();
    handleAutocompleteSearch();
  });

  function autoGrowTextarea() {
    promptInput.style.height = 'auto';
    promptInput.style.height = promptInput.scrollHeight + 'px';
  }

  promptInput.addEventListener('keydown', (e) => {
    if (isAutocompleteOpen) {
      const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex + 1) % items.length;
        updateAutocompleteHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex - 1 + items.length) % items.length;
        updateAutocompleteHighlight(items);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items[autocompleteActiveIndex]) {
          selectAutocompleteItem(items[autocompleteActiveIndex].getAttribute('data-path'));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAutocomplete();
      }
    } else {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitMessage();
      }
    }
  });

  sendBtn.addEventListener('click', submitMessage);

  // 6b. Autocomplete Logic
  function handleAutocompleteSearch() {
    const text = promptInput.value;
    const cursorPos = promptInput.selectionStart;
    
    // Find if we are typing a file path reference starting with '@'
    const textBeforeCursor = text.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1 && (atIndex === 0 || /\s/.test(textBeforeCursor[atIndex - 1]))) {
      const query = textBeforeCursor.substring(atIndex + 1);
      
      // Stop showing autocomplete if there are spaces after '@'
      if (/\s/.test(query)) {
        closeAutocomplete();
        return;
      }
      
      autocompleteQuery = query;
      filterAndShowAutocomplete(query);
    } else {
      closeAutocomplete();
    }
  }

  function filterAndShowAutocomplete(query) {
    const filtered = workspaceFiles.filter(f => 
      f.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10); // cap at 10 items for speed

    if (filtered.length === 0) {
      closeAutocomplete();
      return;
    }

    autocompleteDropdown.innerHTML = '';
    autocompleteActiveIndex = 0;
    isAutocompleteOpen = true;

    filtered.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = `autocomplete-item${index === 0 ? ' active' : ''}`;
      item.setAttribute('data-path', file);
      
      const fileExt = file.split('.').pop() || 'txt';
      item.innerHTML = `
        <span class="autocomplete-item-icon">&#128196;</span>
        <span class="autocomplete-item-path" style="flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${file}</span>
        <span class="autocomplete-item-ext" style="opacity: 0.4; font-size: 9px; text-transform: uppercase;">${fileExt}</span>
      `;
      
      item.addEventListener('click', () => {
        selectAutocompleteItem(file);
      });
      
      autocompleteDropdown.appendChild(item);
    });

    autocompleteDropdown.classList.remove('hidden');
  }

  function updateAutocompleteHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === autocompleteActiveIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  function selectAutocompleteItem(filePath) {
    linkedFiles.add(filePath);
    renderChips();
    
    // Replace the '@query' segment in promptInput with clean text
    const text = promptInput.value;
    const cursorPos = promptInput.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const textAfterCursor = text.substring(cursorPos);
      promptInput.value = text.substring(0, atIndex) + textAfterCursor;
      promptInput.selectionStart = atIndex;
      promptInput.selectionEnd = atIndex;
    }
    
    closeAutocomplete();
    promptInput.focus();
    autoGrowTextarea();
  }

  function renderChips() {
    contextChipsContainer.innerHTML = '';
    linkedFiles.forEach((file) => {
      const chip = document.createElement('div');
      chip.className = 'context-chip';
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = file.split('/').pop() || file;
      nameSpan.title = file;
      
      const removeBtn = document.createElement('span');
      removeBtn.className = 'context-chip-remove';
      removeBtn.innerHTML = '&#x2715;';
      removeBtn.addEventListener('click', () => {
        linkedFiles.delete(file);
        renderChips();
      });
      
      chip.appendChild(nameSpan);
      chip.appendChild(removeBtn);
      contextChipsContainer.appendChild(chip);
    });
  }

  function closeAutocomplete() {
    isAutocompleteOpen = false;
    autocompleteDropdown.classList.add('hidden');
  }

  // Paste Event Listener for Images
  promptInput.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = function(event) {
          const base64 = event.target.result.split(',')[1];
          attachImage(base64);
        };
        reader.readAsDataURL(file);
        e.preventDefault(); // Stop default pasting of image as raw text
      }
    }
  });

  function attachImage(base64) {
    attachedImages.push(base64);
    renderImageAttachments();
  }

  function removeAttachedImage(index) {
    attachedImages.splice(index, 1);
    renderImageAttachments();
  }

  function renderImageAttachments() {
    imageAttachmentsContainer.innerHTML = '';
    attachedImages.forEach((base64, index) => {
      const chip = document.createElement('div');
      chip.className = 'image-attachment-chip';
      chip.style.backgroundImage = `url(data:image/png;base64,${base64})`;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'image-attachment-remove';
      removeBtn.innerHTML = '&#x2715;';
      removeBtn.addEventListener('click', () => removeAttachedImage(index));

      chip.appendChild(removeBtn);
      imageAttachmentsContainer.appendChild(chip);
    });
  }

  // Stop button handler
  stopBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'cancelStream' });
    isSending = false;
    promptInput.disabled = false;
    sendBtn.disabled = false;
    stopBtn.classList.add('hidden');
    sendBtn.classList.remove('hidden');
    setAvatarState('idle');
  });

  // 7. Core Message Submission
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
      userDisplayMessage += `\n\n_Referenced Context: ${selectedFiles.map(f => '`@' + f.split('/').pop() + '`').join(', ')}_`;
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
  }

  let currentToolCardElement = null;

  function createToolCardDOM(toolName, status, target, result, checkpointId, isReverted = false, code = null, terminalName = null) {
    const card = document.createElement('div');
    card.className = `tool-card ${status}`;
    if (isReverted) {
      card.classList.add('reverted');
    }
    if (checkpointId) {
      card.setAttribute('data-checkpoint-id', checkpointId);
    }
    
    let friendlyName = toolName;
    let iconHtml = '🔧';
    if (toolName === 'read_file') {
      friendlyName = 'Read File';
      iconHtml = '📖';
    } else if (toolName === 'create_file') {
      friendlyName = 'Create File';
      iconHtml = '🆕';
    } else if (toolName === 'write_file') {
      friendlyName = 'Update File';
      iconHtml = '💾';
    } else if (toolName === 'patch_file') {
      friendlyName = 'Patch File';
      iconHtml = '✏️';
    } else if (toolName === 'list_dir') {
      friendlyName = 'List Folder';
      iconHtml = '📁';
    } else if (toolName === 'grep_search') {
      friendlyName = 'Search Workspace';
      iconHtml = '🔍';
    } else if (toolName === 'run_command') {
      friendlyName = 'Run Command';
      iconHtml = '💻';
    } else if (toolName === 'send_terminal_input') {
      friendlyName = 'Send Terminal Input';
      iconHtml = '⌨️';
    } else if (toolName === 'close_terminal') {
      friendlyName = 'Close Terminal';
      iconHtml = '🛑';
    } else if (toolName === 'browser_navigate') {
      friendlyName = 'Browser Navigate';
      iconHtml = '🌐';
    } else if (toolName === 'browser_click') {
      friendlyName = 'Browser Click';
      iconHtml = '🖱️';
    } else if (toolName === 'browser_type') {
      friendlyName = 'Browser Type';
      iconHtml = '🔤';
    } else if (toolName === 'browser_screenshot') {
      friendlyName = 'Browser Screenshot';
      iconHtml = '📸';
    }

    const header = document.createElement('div');
    header.className = 'tool-card-header';
    header.innerHTML = `
      <div class="tool-icon-wrapper">
        <span class="tool-icon">${iconHtml}</span>
      </div>
      <div class="tool-info">
        <span class="tool-name">${friendlyName}</span>
        <span class="tool-target" title="Click to open file in editor">${target}</span>
      </div>
      <div class="tool-header-controls">
        <span class="tool-status-badge">${isReverted ? 'Reverted' : (status === 'running' ? 'Running' : (status === 'success' ? 'Completed' : 'Failed'))}</span>
        ${status !== 'running' ? `
          <span class="tool-expand-chevron">
            <svg class="chevron-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
            </svg>
          </span>
        ` : ''}
      </div>
    `;
    card.appendChild(header);

    const targetSpan = header.querySelector('.tool-target');
    if (targetSpan && target && (toolName === 'create_file' || toolName === 'write_file' || toolName === 'read_file' || toolName === 'patch_file')) {
      targetSpan.style.cursor = 'pointer';
      targetSpan.style.textDecoration = 'underline';
      targetSpan.style.color = '#a855f7';
      targetSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openFile', path: target });
      });
    }

    // run_command: clicking the command string opens it in a live VS Code terminal
    if (targetSpan && target && toolName === 'run_command') {
      targetSpan.style.cursor = 'pointer';
      targetSpan.style.fontFamily = 'monospace';
      targetSpan.style.color = '#22d3ee';
      targetSpan.title = 'Click to open in VS Code Terminal';
      targetSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openTerminal', command: target });
      });
    }

    if (status === 'running') {
      const scanning = document.createElement('div');
      scanning.className = 'scanning-bar';
      card.appendChild(scanning);
    } else {
      const controlsContainer = header.querySelector('.tool-header-controls');

      // For run_command cards: add an "Open Terminal" button next to the status badge
      if (toolName === 'run_command' && target) {
        const termBtn = document.createElement('button');
        termBtn.className = 'tool-revert-btn';
        const hasExistingTerminal = !!terminalName;
        termBtn.title = hasExistingTerminal ? `Show terminal: ${terminalName}` : 'Re-run in VS Code Terminal';
        termBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16" style="margin-right:4px">
            <path d="M6 9a.5.5 0 0 1 .5-.5h3.793l-1.147-1.146a.5.5 0 0 1 .708-.708l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L10.293 9.5H6.5A.5.5 0 0 1 6 9z"/>
            <path d="M3.854 2.146a.5.5 0 0 0-.707 0l-2.5 2.5a.5.5 0 0 0 0 .707l2.5 2.5a.5.5 0 1 0 .707-.707L1.707 5H11.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 0 1 0v-7A1.5 1.5 0 0 0 11.5 4H1.707l2.147-2.146a.5.5 0 0 0 0-.708z"/>
          </svg>
          ${hasExistingTerminal ? 'Show Terminal' : 'Terminal'}
        `;
        termBtn.style.color = '#22d3ee';
        termBtn.style.borderColor = 'rgba(34,211,238,0.25)';
        termBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'openTerminal', command: target, terminalName: terminalName || null });
        });
        controlsContainer.insertBefore(termBtn, controlsContainer.firstChild);
      }

      if (checkpointId) {
        const revertBtn = document.createElement('button');
        revertBtn.className = 'tool-revert-btn';
        if (isReverted) {
          revertBtn.disabled = true;
          revertBtn.textContent = 'Reverted';
          revertBtn.style.background = 'rgba(255, 255, 255, 0.05)';
          revertBtn.style.color = '#888';
        } else {
          revertBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 4px;">
              <path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
            </svg>
            Revert
          `;
          revertBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid expanding/collapsing the card
            revertBtn.disabled = true;
            revertBtn.innerHTML = 'Reverting...';
            vscode.postMessage({
              type: 'revertCheckpoint',
              checkpointId: checkpointId
            });
          });
        }
        // Insert revert button before the status badge
        controlsContainer.insertBefore(revertBtn, controlsContainer.firstChild);
      }

      // Collapsible accordion body wrapper using CSS Grid trick
      const bodyWrapper = document.createElement('div');
      bodyWrapper.className = 'tool-card-body-wrapper';

      const body = document.createElement('div');
      body.className = 'tool-card-body';

      const details = document.createElement('div');
      details.className = 'tool-details';
      const cleanResult = result ? result.replace(/(?:Revert|Reverted) ID: \w+/, '').trim() : '';
      details.textContent = cleanResult || (status === 'success' ? 'Operation succeeded' : 'Operation failed');
      body.appendChild(details);

      if (code) {
        const fileExt = target.split('.').pop() || 'plaintext';
        const escapedCode = escapeHtml(code.trim());
        const codeWrapper = document.createElement('div');
        codeWrapper.className = 'code-block-wrapper';
        codeWrapper.style.marginTop = '8px';
        codeWrapper.innerHTML = `
          <div class="code-block-header">
            <span class="code-block-lang">${fileExt}</span>
            <div class="code-block-actions">
              <button class="code-action-btn copy-btn">Copy</button>
            </div>
          </div>
          <pre><code class="language-${fileExt}">${escapedCode}</code></pre>
        `;
        body.appendChild(codeWrapper);
      }

      bodyWrapper.appendChild(body);
      card.appendChild(bodyWrapper);

      // Handle card toggle interactions
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        card.classList.toggle('expanded');
      });

      if (code) {
        bindCodeBlockButtons(bodyWrapper);
      }
    }

    return card;
  }

  function placeCardInPlaceholder(card, toolName, target) {
    const placeholders = document.querySelectorAll('.tool-card-placeholder');
    let placed = false;
    for (let i = 0; i < placeholders.length; i++) {
      if (placeholders[i].getAttribute('data-tool') === toolName && placeholders[i].getAttribute('data-target') === target && placeholders[i].children.length === 0) {
        placeholders[i].appendChild(card);
        placed = true;
        break;
      }
    }
    if (!placed) {
      chatMessages.appendChild(card);
    }
  }

  function appendToolCardFromHistory(text) {
    const results = text.split('\n\n');
    results.forEach(res => {
      const match = res.match(/\[Tool Result for (\w+) on "([^"]*)"]:\s*(Success|Error)\s*-\s*([\s\S]*)/i);
      if (match) {
        const [_, toolName, target, statusString, details] = match;
        const status = statusString.toLowerCase() === 'success' ? 'success' : 'error';
        
        let checkpointId;
        let isReverted = false;
        
        const revertedMatch = details.match(/Reverted ID: (\w+)/);
        if (revertedMatch) {
          checkpointId = revertedMatch[1];
          isReverted = true;
        } else {
          const cpMatch = details.match(/Revert ID: (\w+)/);
          if (cpMatch) {
            checkpointId = cpMatch[1];
          }
        }
        
        const code = parsedToolContents.get(target);
        const card = createToolCardDOM(toolName, status, target, details, checkpointId, isReverted, code);
        placeCardInPlaceholder(card, toolName, target);
      }
    });
  }

  // Helper: Append a message bubble to DOM
  function appendMessageBubble(role, text, images) {
    if (role === 'system') {
      if (text.startsWith('[Tool Result')) {
        appendToolCardFromHistory(text);
        return null;
      }
      if (text.includes('[CONSOLIDATED CONTEXT SUMMARY]')) {
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
            ${parseMarkdown(text)}
          </div>
        `;
        
        banner.querySelector('.system-context-header').addEventListener('click', () => {
          const body = banner.querySelector('.system-context-body');
          const toggle = banner.querySelector('.system-context-toggle');
          body.classList.toggle('collapsed');
          toggle.textContent = body.classList.contains('collapsed') ? 'Show Details' : 'Hide Details';
        });
        
        msgElement.appendChild(banner);
        chatMessages.appendChild(msgElement);
        return banner;
      }
      return null;
    }

    if (role === 'assistant') {
      extractToolContents(text);
    }

    const msgElement = document.createElement('div');
    msgElement.className = `message ${role}`;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = role === 'user' ? 'You' : 'Mirror VS';
    msgElement.appendChild(meta);

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
      textContainer.innerHTML = parseMarkdown(text);
      bindCodeBlockButtons(textContainer);
      bubble.appendChild(textContainer);
    }
    
    msgElement.appendChild(bubble);
    chatMessages.appendChild(msgElement);
    return bubble;
  }

  // 8. Listen to Messages from Extension Host
  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'updateSettings': {
        const s = message.settings;
        savedDefaultOllamaModel = s.defaultOllamaModel;
        
        selectProvider(s.provider);
        ollamaHostInput.value = s.ollamaHost;
        
        // Handle deepseek key display helper
        if (s.hasDeepSeekKey) {
          deepseekKeyStatus.textContent = 'Key is configured (Securely stored)';
          deepseekKeyStatus.style.color = '#22c55e';
        } else {
          deepseekKeyStatus.textContent = 'Key is not configured';
          deepseekKeyStatus.style.color = '#ef4444';
        }

        deepseekModelSelect.value = s.defaultDeepSeekModel;

        if (s.maxTurnsBeforeSummarize !== undefined) {
          maxTurnsInput.value = s.maxTurnsBeforeSummarize;
        }
        if (s.turnsToRetain !== undefined) {
          turnsToRetainInput.value = s.turnsToRetain;
        }

        if (ollamaModelSelect.querySelector(`option[value="${s.defaultOllamaModel}"]`)) {
          ollamaModelSelect.value = s.defaultOllamaModel;
        }

        // Trigger connection validation check
        vscode.postMessage({ type: 'validateHost', host: s.ollamaHost });
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
        break;
      }

      case 'chatResponseStart': {
        promptInput.disabled = true;
        sendBtn.disabled = true;
        isSending = true;
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
        }
        break;
      }

      case 'chatResponseChunk': {
        if (!currentStreamingBubble) {
          return;
        }
        setAvatarState('coding');

        const loader = currentStreamingBubble.querySelector('.typing-indicator');
        if (loader) {
          currentStreamingBubble.removeChild(loader);
        }

        currentStreamingText += message.text;
        currentStreamingBubble.innerHTML = parseMarkdown(currentStreamingText);
        bindCodeBlockButtons(currentStreamingBubble);
        scrollChatToBottom();
        break;
      }

      case 'chatResponseComplete': {
        setAvatarState('idle');
        if (!currentStreamingBubble) {
          return;
        }

        const loader = currentStreamingBubble.querySelector('.typing-indicator');
        if (loader) {
          currentStreamingBubble.removeChild(loader);
        }

        currentStreamingText = message.fullText;
        extractToolContents(currentStreamingText);
        currentStreamingBubble.innerHTML = parseMarkdown(currentStreamingText);
        bindCodeBlockButtons(currentStreamingBubble);

        currentStreamingBubble = null;
        currentStreamingText = '';
        scrollChatToBottom();
        break;
      }

      case 'toolStatus': {
        const { toolName, status, target, result, checkpointId, code, terminalName } = message;
        if (status === 'running') {
          setAvatarState('tool_calling');
          currentToolCardElement = createToolCardDOM(toolName, status, target, null, null, false, null, null);
          placeCardInPlaceholder(currentToolCardElement, toolName, target);
        } else if (currentToolCardElement) {
          const parent = currentToolCardElement.parentNode;
          if (parent) {
            const updatedCard = createToolCardDOM(toolName, status, target, result, checkpointId, false, code, terminalName);
            parent.replaceChild(updatedCard, currentToolCardElement);
            currentToolCardElement = null;
          }
        } else {
          const card = createToolCardDOM(toolName, status, target, result, checkpointId, false, code, terminalName);
          placeCardInPlaceholder(card, toolName, target);
        }
        scrollChatToBottom();
        break;
      }

      case 'loopComplete': {
        isSending = false;
        promptInput.disabled = false;
        sendBtn.disabled = false;
        promptInput.focus();
        currentStreamingBubble = null;
        currentStreamingText = '';
        setAvatarState('idle');
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
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
        promptInput.disabled = false;
        sendBtn.disabled = false;
        currentStreamingBubble = null;
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        scrollChatToBottom();
        break;
      }

      case 'activeFileChanged': {
        const file = message.fileName;
        if (file) {
          contextDot.classList.remove('offline');
          contextFileName.textContent = `Context: ${file}`;
        } else {
          contextDot.classList.add('offline');
          contextFileName.textContent = 'No active file open';
        }
        break;
      }

      case 'updateChatHistory': {
        const history = message.history;
        chatHistory = history || [];
        
        renderedLimit = 15;
        parsedToolContents.clear();
        currentStreamingBubble = null;
        
        renderVisibleHistory();
        break;
      }

      case 'updateChatSessions': {
        const sessions = message.sessions || [];
        activeSessionId = message.activeSessionId;
        
        sessionsList.innerHTML = '';
        if (sessions.length > 0) {
          sessions.forEach((session) => {
            const item = document.createElement('div');
            item.className = `session-item${session.id === activeSessionId ? ' active' : ''}`;
            item.setAttribute('data-id', session.id);
            
            const details = document.createElement('div');
            details.className = 'session-details';
            
            const title = document.createElement('span');
            title.className = 'session-title';
            title.textContent = session.title || 'New Session';
            
            const time = document.createElement('span');
            time.className = 'session-time';
            time.textContent = formatRelativeTime(session.timestamp);
            
            details.appendChild(title);
            details.appendChild(time);
            item.appendChild(details);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'session-delete-btn';
            deleteBtn.title = 'Delete Session';
            deleteBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
            `;
            
            deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ type: 'deleteSession', sessionId: session.id });
            });
            
            item.appendChild(deleteBtn);
            
            item.addEventListener('click', () => {
              vscode.postMessage({ type: 'selectSession', sessionId: session.id });
              historyDrawer.classList.add('collapsed');
            });
            
            sessionsList.appendChild(item);
          });
        } else {
          sessionsList.innerHTML = '<div class="no-sessions">No previous sessions</div>';
        }
        break;
      }
      
      case 'checkpointReverted': {
        const { checkpointId, success } = message;
        const card = document.querySelector(`.tool-card[data-checkpoint-id="${checkpointId}"]`);
        if (card) {
          const revertBtn = card.querySelector('.tool-revert-btn');
          const badge = card.querySelector('.tool-status-badge');
          
          if (success) {
            card.classList.add('reverted');
            if (revertBtn) {
              revertBtn.textContent = 'Reverted';
              revertBtn.style.background = 'rgba(255, 255, 255, 0.05)';
              revertBtn.style.color = '#888';
            }
            if (badge) {
              badge.textContent = 'Reverted';
            }
          } else {
            if (revertBtn) {
              revertBtn.disabled = false;
              revertBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 4px;">
                  <path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
                  <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
                </svg>
                Revert
              `;
            }
          }
        }
        break;
      }
    }
  });

  // 9. Markdown Parser Implementation
  function parseMarkdown(text) {
    let cleanText = text;
    
    // Clean block tools: create_file, write_file, patch_file, send_terminal_input
    const blockTools = ['create_file', 'write_file', 'patch_file', 'send_terminal_input'];
    for (const tool of blockTools) {
      const openTag = `<${tool}`;
      
      let openIndex = cleanText.toLowerCase().indexOf(openTag);
      while (openIndex !== -1) {
        const closeRegex = new RegExp(`</${tool}\\s*>`, 'i');
        const match = closeRegex.exec(cleanText.substring(openIndex));
        if (match) {
          const closeIndex = openIndex + match.index;
          const matchLength = match[0].length;
          let tagContent = cleanText.substring(openIndex, closeIndex + matchLength);
          let targetMatch = tagContent.match(/path\s*=\s*["']([^"']+)["']/i) 
            || tagContent.match(/query\s*=\s*["']([^"']+)["']/i)
            || tagContent.match(/terminal_name\s*=\s*["']([^"']+)["']/i);
          let target = targetMatch ? targetMatch[1].trim() : '';
          
          let placeholderToken = `%%%TOOL_PLACEHOLDER::${tool}::${escapeHtml(target)}%%%`;
          cleanText = cleanText.substring(0, openIndex) + placeholderToken + cleanText.substring(closeIndex + matchLength);
        } else {
          let streamingContent = cleanText.substring(openIndex);
          let firstCloseBracket = streamingContent.indexOf('>');
          
          if (firstCloseBracket !== -1) {
            let actualCode = streamingContent.substring(firstCloseBracket + 1);
            let pathExt = 'plaintext';
            let pathMatch = streamingContent.match(/path\s*=\s*["']([^"']+)["']/i);
            if (pathMatch) {
              pathExt = pathMatch[1].split('.').pop() || 'plaintext';
            }
            cleanText = cleanText.substring(0, openIndex) + `\n\`\`\`${pathExt}\n${actualCode}`;
          } else {
            cleanText = cleanText.substring(0, openIndex);
          }
          break;
        }
        openIndex = cleanText.toLowerCase().indexOf(openTag);
      }
    }

    // Clean self-closing or simple tools
    const selfClosingTools = ['read_file', 'list_dir', 'grep_search', 'browser_navigate', 'browser_click', 'browser_type', 'browser_screenshot', 'run_command', 'close_terminal'];
    for (const tool of selfClosingTools) {
      const regex = new RegExp(`<${tool}([\\s\\S]*?)\\/?>`, 'gi');
      cleanText = cleanText.replace(regex, (match, attrs) => {
        let targetMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i) 
          || attrs.match(/query\s*=\s*["']([^"']+)["']/i)
          || attrs.match(/url\s*=\s*["']([^"']+)["']/i)
          || attrs.match(/selector\s*=\s*["']([^"']+)["']/i)
          || attrs.match(/command\s*=\s*["']([^"']+)["']/i)
          || attrs.match(/terminal_name\s*=\s*["']([^"']+)["']/i);
        let target = targetMatch ? targetMatch[1].trim() : '';
        return `%%%TOOL_PLACEHOLDER::${tool}::${escapeHtml(target)}%%%`;
      });
    }
    
    // Handle currently streaming incomplete self-closing tags
    for (const tool of selfClosingTools) {
      const openTag = `<${tool}`;
      const openIndex = cleanText.toLowerCase().indexOf(openTag);
      if (openIndex !== -1) {
        const closeIndex = cleanText.indexOf('>', openIndex);
        if (closeIndex !== -1) {
          cleanText = cleanText.substring(0, openIndex) + cleanText.substring(closeIndex + 1);
        } else {
          cleanText = cleanText.substring(0, openIndex);
        }
      }
    }

    let html = '';
    let inCodeBlock = false;
    let codeBuffer = '';
    let codeLang = '';

    const lines = cleanText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
          const escapedCode = escapeHtml(codeBuffer.trim());
          html += `
            <div class="code-block-wrapper">
              <div class="code-block-header">
                <span class="code-block-lang">${codeLang || 'code'}</span>
                <div class="code-block-actions">
                  <button class="code-action-btn copy-btn">Copy</button>
                </div>
              </div>
              <pre><code class="language-${codeLang}">${escapedCode}</code></pre>
            </div>
          `;
          codeBuffer = '';
          codeLang = '';
        } else {
          inCodeBlock = true;
          codeLang = line.replace('```', '').trim() || 'plaintext';
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer += line + '\n';
      } else {
        let processedLine = line;

        // Escape generic HTML tags
        processedLine = processedLine.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Inline Bold (**text**)
        processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Inline Code (`code`)
        processedLine = processedLine.replace(/`(.*?)`/g, '<code>$1</code>');

        // Headers
        if (processedLine.startsWith('### ')) {
          html += `<h3>${processedLine.substring(4)}</h3>`;
        } else if (processedLine.startsWith('## ')) {
          html += `<h2>${processedLine.substring(3)}</h2>`;
        } else if (processedLine.startsWith('# ')) {
          html += `<h1>${processedLine.substring(2)}</h1>`;
        }
        // Bullets
        else if (processedLine.trim().startsWith('- ') || processedLine.trim().startsWith('* ')) {
          const itemText = processedLine.trim().substring(2);
          html += `<ul><li>${itemText}</li></ul>`;
        }
        // Ordered List
        else if (/^\d+\.\s/.test(processedLine.trim())) {
          const itemText = processedLine.trim().replace(/^\d+\.\s/, '');
          html += `<ol><li>${itemText}</li></ol>`;
        }
        // Spacer on blank lines
        else if (processedLine.trim() === '') {
          html += '<div class="spacer" style="height: 6px;"></div>';
        } else {
          html += `<p>${processedLine}</p>`;
        }
      }
    }

    if (inCodeBlock && codeBuffer.trim()) {
      const escapedCode = escapeHtml(codeBuffer);
      html += `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span class="code-block-lang">${codeLang}</span>
            <span class="streaming-label" style="font-size: 9px; opacity: 0.5; color: #a855f7;">Generating...</span>
          </div>
          <pre><code>${escapedCode}</code></pre>
        </div>
      `;
    }

    html = html.replace(/<p>%%%TOOL_PLACEHOLDER::(.+?)::(.*?)%%%<\/p>/g, '<div class="tool-card-placeholder" data-tool="$1" data-target="$2"></div>');
    html = html.replace(/%%%TOOL_PLACEHOLDER::(.+?)::(.*?)%%%/g, '<div class="tool-card-placeholder" data-tool="$1" data-target="$2"></div>');

    return html.replace(/<\/ul>\s*<ul>/g, '').replace(/<\/ol>\s*<ol>/g, '');
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 10. Bind Click Events to Dynamic Code Block Buttons
  function bindCodeBlockButtons(bubbleElement) {
    const copyButtons = bubbleElement.querySelectorAll('.copy-btn');
    copyButtons.forEach((btn) => {
      if (btn.getAttribute('data-bound')) {
        return;
      }
      btn.setAttribute('data-bound', 'true');

      btn.addEventListener('click', () => {
        const wrapper = btn.closest('.code-block-wrapper');
        const codeElement = wrapper.querySelector('pre code');
        const textToCopy = codeElement.innerText;

        navigator.clipboard.writeText(textToCopy).then(() => {
          const oldText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.color = '#22c55e';
          setTimeout(() => {
            btn.textContent = oldText;
            btn.style.color = '';
          }, 1500);
        });
      });
    });
  }

  let userIsAtBottom = true;

  function scrollChatToBottom(force = false) {
    if (force || userIsAtBottom) {
      setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        userIsAtBottom = true;
      }, 50);
    }
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    
    if (secs < 60) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ==========================================================================
  // Infinite Scroll & Avatar State Manager Implementations
  // ==========================================================================
  let renderedLimit = 15;

  function renderVisibleHistory(preserveScroll = false) {
    const oldScrollHeight = chatMessages.scrollHeight;
    const oldScrollTop = chatMessages.scrollTop;

    chatMessages.innerHTML = '';
    
    if (chatHistory.length === 0) {
      if (welcomeCard) {
        welcomeCard.style.display = 'block';
        chatMessages.appendChild(welcomeCard);
      }
      return;
    }

    if (welcomeCard) {
      welcomeCard.style.display = 'none';
    }

    const totalMessages = chatHistory.length;
    const startIdx = Math.max(0, totalMessages - renderedLimit);
    
    // Prepend the load more trigger if we have older logs
    if (startIdx > 0) {
      const loadTrigger = document.createElement('div');
      loadTrigger.className = 'history-loading-trigger';
      loadTrigger.innerHTML = '<span>💬</span> Load older messages...';
      loadTrigger.addEventListener('click', () => {
        loadMoreHistory();
      });
      chatMessages.appendChild(loadTrigger);
    }

    // Append visible messages
    const visibleSlice = chatHistory.slice(startIdx);
    visibleSlice.forEach((msg) => {
      appendMessageBubble(msg.role, msg.content, msg.images);
    });

    if (preserveScroll) {
      // Maintain scroll position perfectly so there are no sudden jumps
      chatMessages.scrollTop = chatMessages.scrollHeight - oldScrollHeight + oldScrollTop;
    } else {
      scrollChatToBottom();
    }
  }

  function loadMoreHistory() {
    if (chatHistory.length > renderedLimit) {
      renderedLimit += 15;
      renderVisibleHistory(true);
    }
  }

  // Scroll pagination trigger
  chatMessages.addEventListener('scroll', () => {
    const threshold = 40;
    const isAtBottom = (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight) <= threshold;
    userIsAtBottom = isAtBottom;

    if (chatMessages.scrollTop <= 10) {
      const totalMessages = chatHistory.length;
      if (totalMessages > renderedLimit) {
        loadMoreHistory();
      }
    }
  });

  // Avatar Interactive Emoji Controller
  const avatarContainer = document.getElementById('avatar-container');
  const avatarEmoji = document.getElementById('avatar-emoji');

  let avatarState = 'idle';
  let idleInterval = null;
  let errorResetTimeout = null;

  const EMOJIS = {
    idle: ['🤖', '🤖', '🤖', '👾', '🤖', '😉', '🥱', '🤓', '🤪'],
    thinking: ['🤔', '💭', '🧠', '🧐'],
    coding: ['💻', '⌨️', '🚀', '👨‍💻', '👩‍💻'],
    tool_calling: ['🛠️', '⚙️', '🔨', '🔧'],
    error: ['💥', '❌', '😱', '🤕', '😭'],
    click: ['😮', '🥰', '🤪', '😎', '🎉']
  };

  function setAvatarState(state) {
    avatarState = state;
    
    // Remove state classes and add new one
    avatarContainer.classList.remove('state-idle', 'state-thinking', 'state-coding', 'state-tool_calling', 'state-error');
    avatarContainer.classList.add(`state-${state === 'click' ? 'idle' : state}`);
    
    if (idleInterval) {
      clearInterval(idleInterval);
      idleInterval = null;
    }
    if (errorResetTimeout) {
      clearTimeout(errorResetTimeout);
      errorResetTimeout = null;
    }

    const list = EMOJIS[state] || EMOJIS.idle;
    avatarEmoji.textContent = list[Math.floor(Math.random() * list.length)];

    if (state === 'idle') {
      startIdleRoutine();
    } else if (state === 'error') {
      errorResetTimeout = setTimeout(() => {
        setAvatarState('idle');
      }, 5000);
    }
  }

  function startIdleRoutine() {
    if (idleInterval) clearInterval(idleInterval);
    idleInterval = setInterval(() => {
      if (avatarState === 'idle') {
        const chance = Math.random();
        if (chance < 0.35) {
          const list = EMOJIS.idle;
          avatarEmoji.textContent = list[Math.floor(Math.random() * list.length)];
        }
      }
    }, 6000);
  }

  // Hook up winking/reactions on click
  if (avatarContainer) {
    avatarContainer.addEventListener('click', () => {
      const current = avatarState;
      
      avatarContainer.style.transform = 'scale(1.25) rotate(360deg)';
      
      const clicks = EMOJIS.click;
      avatarEmoji.textContent = clicks[Math.floor(Math.random() * clicks.length)];
      
      setTimeout(() => {
        avatarContainer.style.transform = '';
        if (avatarState !== 'error') {
          setAvatarState(current);
        }
      }, 800);
    });
  }

  // Initialize avatar state
  setAvatarState('idle');
})();
