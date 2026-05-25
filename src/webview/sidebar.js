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
  
  const contextDot = document.getElementById('context-dot');
  const contextFileName = document.getElementById('context-file-name');
  const acceptAllBtn = document.getElementById('accept-all-btn');
  
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
  let gitChanges = [];

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
  vscode.postMessage({ type: 'getChatSessions' });
  vscode.postMessage({ type: 'getChatHistory' });

  // Drawer Close Buttons
  document.querySelectorAll('.drawer-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const drawerId = btn.getAttribute('data-drawer');
      const drawer = document.getElementById(`${drawerId}-drawer`);
      if (drawer) drawer.classList.add('collapsed');
    });
  });

  // 1b. Git Drawer Toggle
  const toggleGitBtn = document.getElementById('toggle-git-btn');
  const gitDrawer = document.getElementById('git-drawer');
  const gitChangesList = document.getElementById('git-changes-list');
  const refreshGitBtn = document.getElementById('refresh-git-btn');
  const commitGitBtn = document.getElementById('commit-git-btn');
  const gitAddedCount = document.getElementById('git-added-count');
  const gitModifiedCount = document.getElementById('git-modified-count');
  const gitDeletedCount = document.getElementById('git-deleted-count');
  const gitUntrackedCount = document.getElementById('git-untracked-count');

  function refreshGitStatus() {
    vscode.postMessage({ type: 'getGitStatus' });
  }

  function closeAllDrawers() {
    settingsDrawer.classList.add('collapsed');
    historyDrawer.classList.add('collapsed');
    gitDrawer.classList.add('collapsed');
  }

  toggleGitBtn.addEventListener('click', () => {
    const isOpening = gitDrawer.classList.contains('collapsed');
    closeAllDrawers();
    if (isOpening) {
      gitDrawer.classList.remove('collapsed');
      refreshGitStatus();
    }
  });

  refreshGitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    refreshGitStatus();
  });

  commitGitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    vscode.postMessage({ type: 'commitGitChanges' });
  });

  // 1c. History Drawer Toggle
  toggleHistoryBtn.addEventListener('click', () => {
    const isOpening = historyDrawer.classList.contains('collapsed');
    closeAllDrawers();
    if (isOpening) {
      historyDrawer.classList.remove('collapsed');
    }
  });

  // 1d. Settings Drawer Toggle
  toggleSettingsBtn.addEventListener('click', () => {
    const isOpening = settingsDrawer.classList.contains('collapsed');
    closeAllDrawers();
    if (isOpening) {
      settingsDrawer.classList.remove('collapsed');
    }
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

  const toggleFigmaKeyVisibilityBtn = document.getElementById('toggle-figma-key-visibility');
  const figmaKeyInput = document.getElementById('figma-key');
  toggleFigmaKeyVisibilityBtn.addEventListener('click', () => {
    if (figmaKeyInput.type === 'password') {
      figmaKeyInput.type = 'text';
      toggleFigmaKeyVisibilityBtn.textContent = 'Hide';
    } else {
      figmaKeyInput.type = 'password';
      toggleFigmaKeyVisibilityBtn.textContent = 'Show';
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
    const figmaKey = document.getElementById('figma-key').value.trim();
    const maxTurns = parseInt(maxTurnsInput.value.trim(), 10) || 16;
    const turnsToRetain = parseInt(turnsToRetainInput.value.trim(), 10) || 6;

    vscode.postMessage({
      type: 'saveSettings',
      provider,
      ollamaHost,
      defaultOllamaModel,
      defaultDeepSeekModel,
      deepSeekKey: deepSeekKey || undefined, // only send key if typed
      figmaKey: figmaKey || undefined, // only send key if typed
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
      if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && e.ctrlKey)) {
        e.preventDefault();
        submitMessage();
      }
    }
  });

  sendBtn.addEventListener('click', submitMessage);

  if (acceptAllBtn) {
    acceptAllBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'acceptAllReviews' });
    });
  }

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

  
  // Drag-and-Drop Image Support
  promptInput.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    promptInput.style.borderColor = '#a855f7';
    promptInput.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.3)';
  });

  promptInput.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    promptInput.style.borderColor = '';
    promptInput.style.boxShadow = '';
  });

  promptInput.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    promptInput.style.borderColor = '';
    promptInput.style.boxShadow = '';
    
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.indexOf('image') !== -1) {
        const reader = new FileReader();
        reader.onload = function(event) {
          const base64 = event.target.result.split(',')[1];
          attachImage(base64);
        };
        reader.readAsDataURL(files[i]);
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

  // 7. Core Message Submission with Slash Command Support
  function submitMessage() {
    const rawText = promptInput.value.trim();

    // Slash command handling
    let text = rawText;
    let isSlashCommand = false;
    const slashMatch = text.match(/^\/(fix|explain|test)\b\s*(.*)/i);
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
        text = rest ? 'Fix the following code/issue: ' + rest : 'Fix this code:\n';
      } else if (command === 'explain') {
        text = rest ? 'Explain this: ' + rest : 'Explain this code:\n';
      } else if (command === 'test') {
        text = rest ? 'Write tests for: ' + rest : 'Write unit tests for this code:\n';
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
      userDisplayMessage += '\n\n_Slash command expanded to: ' + text.substring(0, 120) + (text.length > 120 ? '...' : '') + '_';
    }
    if (selectedFiles.length > 0) {
      userDisplayMessage += '\n\n_Referenced Context: ' + selectedFiles.map(function(f) { return ''; }).join(', ') + '_';
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
  }

  let currentToolCardElement = null;
  let isStreamingCardExpanded = false;

  function createToolCardDOM(toolName, status, target, result, checkpointId, isReverted = false, code = null, terminalName = null) {
    const card = document.createElement('div');
    card.className = `tool-card ${status}`;
    if (isReverted) {
      card.classList.add('reverted');
    }
    if (toolName === 'create_file' || toolName === 'write_file' || toolName === 'patch_file') {
      card.classList.add('write-tool-card');
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
    } else if (toolName === 'browser_evaluate_script') {
      friendlyName = 'Execute Script';
      iconHtml = '⚡';
    } else if (toolName === 'browser_screenshot') {
      friendlyName = 'Browser Screenshot';
      iconHtml = '📸';
    } else if (toolName === 'figma_inspect') {
      friendlyName = 'Figma Inspect';
      iconHtml = '🎨';
    } else if (toolName === 'rename_file') {
      friendlyName = 'Rename File';
      iconHtml = '🚚';
    } else if (toolName === 'delete_file') {
      friendlyName = 'Delete File';
      iconHtml = '🗑️';
    } else if (toolName === 'git_status') {
      friendlyName = 'Git Status';
      iconHtml = '📊';
    } else if (toolName === 'git_diff') {
      friendlyName = 'Git Diff';
      iconHtml = '📝';
    } else if (toolName === 'git_add') {
      friendlyName = 'Git Stage';
      iconHtml = '➕';
    } else if (toolName === 'git_commit') {
      friendlyName = 'Git Commit';
      iconHtml = '📦';
    } else if (toolName === 'symbol_search') {
      friendlyName = 'Symbol Search';
      iconHtml = '🔎';
    } else if (toolName === 'rename_symbol') {
      friendlyName = 'Rename Symbol';
      iconHtml = '✏️';
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

      // Retry button for failed tool cards
      if (status === 'error') {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'tool-revert-btn';
        retryBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 4px;">
            <path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
          </svg>
          Retry
        `;
        retryBtn.style.color = '#f59e0b';
        retryBtn.style.borderColor = 'rgba(245, 158, 11, 0.25)';
        retryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          retryBtn.disabled = true;
          retryBtn.innerHTML = 'Retrying...';
          vscode.postMessage({
            type: 'retryLastToolCall',
            toolName: toolName,
            target: target
          });
        });
        controlsContainer.insertBefore(retryBtn, controlsContainer.firstChild);
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
    const cleanTarget = unescapeHtml(target).trim();
    for (let i = 0; i < placeholders.length; i++) {
      const placeholderTool = placeholders[i].getAttribute('data-tool');
      const placeholderTarget = unescapeHtml(placeholders[i].getAttribute('data-target')).trim();
      if (placeholderTool === toolName && placeholderTarget === cleanTarget && placeholders[i].children.length === 0) {
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
      const match = res.match(/\[Tool Result for (\w+) on "([\s\S]*?)"]:\s*(Success|Error)\s*-\s*([\s\S]*)/i);
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
          
          promptInput.value = rawText.trim();
          promptInput.style.height = 'auto';
          promptInput.style.height = (promptInput.scrollHeight) + 'px';
          promptInput.focus();
        }
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
      textContainer.innerHTML = parseMarkdown(text);
      bindCodeBlockButtons(textContainer);
      applySyntaxHighlighting(textContainer);
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

        const figmaKeyStatus = document.getElementById('figma-key-status');
        if (s.hasFigmaKey) {
          figmaKeyStatus.textContent = 'Token is configured (Securely stored)';
          figmaKeyStatus.style.color = '#22c55e';
        } else {
          figmaKeyStatus.textContent = 'Token is not configured';
          figmaKeyStatus.style.color = '#ef4444';
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
        const html = parseMarkdown(currentStreamingText);

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
              
              bindCodeBlockButtons(existingCard);
              scrollChatToBottom();
              break;
            }
          }
        }

        currentStreamingBubble.innerHTML = html;
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

      case 'providerFallback': {
        const { message: fallbackMsg, newProvider } = message;
        selectProvider(newProvider);
        
        const msgElement = document.createElement('div');
        msgElement.className = 'message system-context';
        msgElement.innerHTML = `
          <div class="system-context-banner" style="background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.25);">
            <div class="system-context-header" style="color: #f59e0b; cursor: default;">
              <span>⚠️ Provider Failover</span>
            </div>
            <div class="system-context-body" style="color: var(--text-secondary); font-size: 11.5px; margin-top: 4px; line-height: 1.5; font-family: inherit;">
              ${fallbackMsg}
            </div>
          </div>
        `;
        chatMessages.appendChild(msgElement);
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

      case 'activeReviewsChanged': {
        const count = message.count;
        if (acceptAllBtn) {
          if (count > 0) {
            acceptAllBtn.textContent = `✨ Accept All (${count})`;
            acceptAllBtn.classList.remove('hidden');
          } else {
            acceptAllBtn.classList.add('hidden');
          }
        }
        break;
      }

      case 'prefillPrompt': {
        promptInput.value = message.text;
        promptInput.focus();
        autoGrowTextarea();
        break;
      }

      case 'tokenUsage': {
        const { input, output, total, cost } = message.usage;
        const dash = document.getElementById('usage-dashboard');
        const tokensEl = document.getElementById('usage-tokens');
        const costEl = document.getElementById('usage-cost');
        if (dash && tokensEl && costEl) {
          tokensEl.textContent = total.toLocaleString();
          costEl.textContent = `$${cost.toFixed(4)}`;
          dash.classList.remove('hidden');
        }
        break;
      }

      case 'avatarState': {
        setAvatarState(message.state);
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
            
            const metaRow = document.createElement('div');
            metaRow.className = 'session-meta-row';
            
            const time = document.createElement('span');
            time.className = 'session-time';
            time.textContent = formatRelativeTime(session.timestamp);
            
            const count = document.createElement('span');
            count.className = 'session-msg-count';
            const msgCount = session.messageCount || 0;
            count.textContent = msgCount > 0 ? `${msgCount} msg${msgCount !== 1 ? 's' : ''}` : 'empty';
            
            metaRow.appendChild(time);
            metaRow.appendChild(count);
            
            details.appendChild(title);
            details.appendChild(metaRow);
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
      
      case 'gitChanges': {
        renderGitChanges(message.changes);
        break;
      }

      case 'gitDiffContent': {
        renderInlineDiff(message.file, message.diff);
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

  // Window-level escape key listener to stop streaming
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSending) {
      e.preventDefault();
      if (stopBtn && !stopBtn.classList.contains('hidden')) {
        stopBtn.click();
      }
    }
  });

  function renderStreamingCard(tool, target, code) {
    const decodedTarget = unescapeHtml(target);
    const decodedCode = unescapeHtml(code);
    
    let friendlyName = tool;
    let iconHtml = '✏️';
    if (tool === 'create_file') {
      friendlyName = 'Creating File';
      iconHtml = '🆕';
    } else if (tool === 'write_file') {
      friendlyName = 'Writing File';
      iconHtml = '💾';
    } else if (tool === 'patch_file') {
      friendlyName = 'Patching File';
      iconHtml = '✏️';
    } else if (tool === 'rename_file') {
      friendlyName = 'Renaming File';
      iconHtml = '🚚';
    } else if (tool === 'git_commit') {
      friendlyName = 'Git Commit';
      iconHtml = '📦';
    }
    
    const fileExt = decodedTarget.split('.').pop() || 'plaintext';
    const escapedCode = escapeHtml(decodedCode.trim());
    
    const expandedClass = isStreamingCardExpanded ? 'expanded' : '';
    
    return `
      <div class="tool-card running streaming-write-card ${expandedClass}">
        <div class="tool-card-header" style="cursor: pointer;">
          <div class="tool-icon-wrapper">
            <span class="tool-icon">${iconHtml}</span>
          </div>
          <div class="tool-info">
            <span class="tool-name">${friendlyName}...</span>
            <span class="tool-target">${escapeHtml(decodedTarget)}</span>
          </div>
          <div class="tool-header-controls">
            <span class="tool-status-badge">Writing</span>
            <span class="tool-expand-chevron">
              <svg class="chevron-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
              </svg>
            </span>
          </div>
        </div>
        <div class="scanning-bar"></div>
        <div class="tool-card-body-wrapper">
          <div class="tool-card-body">
            <div class="code-block-wrapper">
              <div class="code-block-header">
                <span class="code-block-lang">${fileExt}</span>
                <span class="streaming-label">Generating...</span>
              </div>
              <pre><code>${escapedCode}</code></pre>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 9. Markdown Parser Implementation
  function parseMarkdown(text) {
    let cleanText = text;
    
    // Clean block tools: create_file, write_file, patch_file, send_terminal_input, rename_file, git_commit
    const blockTools = ['create_file', 'write_file', 'patch_file', 'send_terminal_input', 'rename_file', 'git_commit'];
    for (const tool of blockTools) {
      let tagInfo;
      let startFrom = 0;
      while ((tagInfo = findUnquotedTagEndEx(cleanText, tool, startFrom)) !== null) {
        const closeTagPattern = '</' + tool + '\\s*>';
        const closeRegex = new RegExp(closeTagPattern, 'i');
        const match = closeRegex.exec(cleanText.substring(tagInfo.end));
        if (match) {
          const closeIndex = tagInfo.end + match.index;
          const matchLength = match[0].length;
          
          let target = getAttrValue(tagInfo.attrs, 'path')
            || getAttrValue(tagInfo.attrs, 'query')
            || getAttrValue(tagInfo.attrs, 'terminal_name')
            || '';
          target = target.trim();
          
          let placeholderToken = `%%%TOOL_PLACEHOLDER::${tool}::${escapeHtml(target)}%%%`;
          cleanText = cleanText.substring(0, tagInfo.start) + placeholderToken + cleanText.substring(closeIndex + matchLength);
          startFrom = tagInfo.start + placeholderToken.length;
        } else {
          let actualCode = cleanText.substring(tagInfo.end);
          // Strip CDATA wrapping if present
          const cdataStart = '<![CDATA[';
          const trimmed = actualCode.trim();
          if (trimmed.startsWith(cdataStart)) {
            actualCode = trimmed.substring(cdataStart.length);
            if (actualCode.endsWith(']]>')) {
              actualCode = actualCode.substring(0, actualCode.length - 3);
            }
          }
          let pathExt = 'plaintext';
          const pathVal = getAttrValue(tagInfo.attrs, 'path');
          if (pathVal) {
            pathExt = pathVal.split('.').pop() || 'plaintext';
          }
          if (tool === 'create_file' || tool === 'write_file' || tool === 'patch_file' || tool === 'rename_file' || tool === 'git_commit') {
            let placeholderToken = `%%%STREAMING_TOOL_PLACEHOLDER::${tool}::${escapeHtml(pathVal || '')}::${escapeHtml(actualCode)}%%%`;
            cleanText = cleanText.substring(0, tagInfo.start) + placeholderToken;
          } else {
            cleanText = cleanText.substring(0, tagInfo.start) + `\n\`\`\`${pathExt}\n${actualCode}`;
          }
          break;
        }
      }
    }

    // Clean self-closing or simple tools
    const selfClosingTools = ['read_file', 'list_dir', 'grep_search', 'browser_navigate', 'browser_click', 'browser_type', 'browser_screenshot', 'run_command', 'close_terminal', 'read_terminal', 'list_terminals', 'delete_file', 'git_status', 'git_diff', 'git_add', 'symbol_search', 'rename_symbol'];
    for (const tool of selfClosingTools) {
      let tagInfo;
      let startFrom = 0;
      while ((tagInfo = findUnquotedTagEndEx(cleanText, tool, startFrom)) !== null) {
        let target = getAttrValue(tagInfo.attrs, 'path')
          || getAttrValue(tagInfo.attrs, 'query')
          || getAttrValue(tagInfo.attrs, 'url')
          || getAttrValue(tagInfo.attrs, 'selector')
          || getAttrValue(tagInfo.attrs, 'command')
          || getAttrValue(tagInfo.attrs, 'terminal_name')
          || '';
        target = target.trim();
        
        let placeholderToken = `%%%TOOL_PLACEHOLDER::${tool}::${escapeHtml(target)}%%%`;
        cleanText = cleanText.substring(0, tagInfo.start) + placeholderToken + cleanText.substring(tagInfo.end);
        startFrom = tagInfo.start + placeholderToken.length;
      }
    }

    // Catch-all: strip any remaining self-closing XML tags (unknown tool names like <ls_dir ... />)
    // This prevents the UI from showing raw XML if the model hallucinates a wrong tool name.
    {
      let startFrom = 0;
      const unknownTagRegex = /<([a-z_][a-z0-9_]*)([^>]*?)\s*\/\s*>/gi;
      let tagInfo;
      while ((tagInfo = unknownTagRegex.exec(cleanText)) !== null) {
        const fullTag = tagInfo[0];
        // Skip known HTML-like self-closing tags
        const skipTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
        if (skipTags.indexOf(tagInfo[1].toLowerCase()) !== -1) continue;
        // Skip if it looks like a math/technical expression like < something >
        if (tagInfo[1].length > 30) continue;
        cleanText = cleanText.replace(fullTag, '');
        unknownTagRegex.lastIndex = 0;
      }
    }
    
    // Handle currently streaming incomplete self-closing tags
    for (const tool of selfClosingTools) {
      const openTag = `<${tool}`;
      const openIndex = cleanText.toLowerCase().indexOf(openTag);
      if (openIndex !== -1) {
        // Only strip the incomplete tag itself, not everything before it
        cleanText = cleanText.substring(0, openIndex) + cleanText.substring(openIndex + openTag.length);
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
          const codeContent = codeBuffer.trim();
          let escapedCode = escapeHtml(codeContent);
          if (codeLang && codeLang !== 'plaintext') {
            escapedCode = highlightCode(escapedCode, codeLang);
          }
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

    html = html.replace(/<p>%%%STREAMING_TOOL_PLACEHOLDER::(.+?)::(.*?)::([\s\S]*?)%%%<\/p>/g, (match, tool, target, code) => renderStreamingCard(tool, target, code));
    html = html.replace(/%%%STREAMING_TOOL_PLACEHOLDER::(.+?)::(.*?)::([\s\S]*?)%%%/g, (match, tool, target, code) => renderStreamingCard(tool, target, code));

    html = html.replace(/<p>%%%TOOL_PLACEHOLDER::(.+?)::(.*?)%%%<\/p>/g, '<div class="tool-card-placeholder" data-tool="$1" data-target="$2"></div>');
    html = html.replace(/%%%TOOL_PLACEHOLDER::(.+?)::(.*?)%%%/g, '<div class="tool-card-placeholder" data-tool="$1" data-target="$2"></div>');

    return html.replace(/<\/ul>\s*<ul>/g, '').replace(/<\/ol>\s*<ol>/g, '');
  }

  function renderGitChanges(changes) {
    gitChanges = changes || [];
    
    // Update counts
    let added = 0, modified = 0, deleted = 0, untracked = 0;
    gitChanges.forEach(f => {
      if (f.status === 'A') added++;
      else if (f.status === 'M') modified++;
      else if (f.status === 'D') deleted++;
      else if (f.status === '?') untracked++;
    });
    gitAddedCount.textContent = added;
    gitModifiedCount.textContent = modified;
    gitDeletedCount.textContent = deleted;
    gitUntrackedCount.textContent = untracked;

    // Render list
    gitChangesList.innerHTML = '';
    if (gitChanges.length === 0) {
      gitChangesList.innerHTML = '<div class="no-changes">✅ All changes committed</div>';
      return;
    }

    gitChanges.forEach(file => {
      const item = document.createElement('div');
      item.className = 'git-change-item';
      
      const statusBadge = document.createElement('span');
      statusBadge.className = `git-change-status ${file.status}`;
      let statusLabel = file.status;
      if (statusLabel === '?') statusLabel = '?';
      else if (statusLabel === 'M') statusLabel = 'M';
      else if (statusLabel === 'A') statusLabel = 'A';
      else if (statusLabel === 'D') statusLabel = 'D';
      statusBadge.textContent = statusLabel;
      
      const filename = document.createElement('span');
      filename.className = 'git-change-filename';
      filename.textContent = file.file;
      filename.title = file.file;
      
      const actions = document.createElement('div');
      actions.className = 'git-change-actions';
      
      // View diff button (opens VS Code diff editor)
      const diffBtn = document.createElement('button');
      diffBtn.className = 'git-change-action-btn diff';
      diffBtn.title = 'View diff in VS Code';
      diffBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/></svg>`;
      diffBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openDiff', file: file.file });
      });
      
      // Inline diff button (opens inline accept/reject viewer)
      const inlineDiffBtn = document.createElement('button');
      inlineDiffBtn.className = 'git-change-action-btn';
      inlineDiffBtn.title = 'View inline diff with accept/reject';
      inlineDiffBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>`;
      inlineDiffBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'getGitDiff', file: file.file });
      });
      
      // Open file button
      const openBtn = document.createElement('button');
      openBtn.className = 'git-change-action-btn';
      openBtn.title = 'Open file';
      openBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>`;
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openFile', path: file.file });
      });
      
      actions.appendChild(diffBtn);
      actions.appendChild(inlineDiffBtn);
      actions.appendChild(openBtn);
      
      item.appendChild(statusBadge);
      item.appendChild(filename);
      item.appendChild(actions);
      
      // Click on item itself opens diff
      item.addEventListener('click', () => {
        vscode.postMessage({ type: 'openDiff', file: file.file });
      });
      
      gitChangesList.appendChild(item);
    });
  }

  // Inline Diff Viewer State
  let openDiffFile = null;

  function renderInlineDiff(file, diff) {
    openDiffFile = file;
    
    // Find the git change item and inject the diff viewer
    const items = gitChangesList.querySelectorAll('.git-change-item');
    let targetItem = null;
    items.forEach(item => {
      const filename = item.querySelector('.git-change-filename');
      if (filename && filename.textContent === file) {
        targetItem = item;
      }
    });
    
    if (!targetItem) return;
    
    // Remove any existing inline diff for this item
    const existingDiff = targetItem.nextElementSibling;
    if (existingDiff && existingDiff.classList.contains('inline-diff-viewer')) {
      existingDiff.remove();
      return; // toggle off
    }

    const diffViewer = document.createElement('div');
    diffViewer.className = 'inline-diff-viewer';
    diffViewer.style.margin = '4px 0 4px 24px';
    
    if (!diff || !diff.hunks || diff.hunks.length === 0) {
      diffViewer.innerHTML = `
        <div class="inline-diff-empty" style="padding: 8px; font-size: 10px; color: var(--text-muted); text-align: center;">
          No inline diff available (file is untracked or binary)
        </div>
      `;
    } else {
      let diffHtml = '';
      
      // Action bar
      diffHtml += `
        <div class="inline-diff-actions" style="display: flex; gap: 6px; padding: 6px 8px; background: rgba(255,255,255,0.03); border-radius: 6px 6px 0 0; border: 1px solid var(--border-glass); border-bottom: none;">
          <button class="diff-accept-btn" data-file="${escapeHtml(file)}" style="flex: 1; padding: 6px; border: none; border-radius: 4px; background: rgba(52, 211, 153, 0.12); color: #34d399; font-weight: 700; font-size: 10px; cursor: pointer; transition: all 0.15s ease;">
            ✅ Accept Changes
          </button>
          <button class="diff-reject-btn" data-file="${escapeHtml(file)}" style="flex: 1; padding: 6px; border: none; border-radius: 4px; background: rgba(248, 113, 113, 0.12); color: #f87171; font-weight: 700; font-size: 10px; cursor: pointer; transition: all 0.15s ease;">
            ⏪ Reject Changes
          </button>
        </div>
      `;
      
      // Diff hunks
      diffHtml += `<div class="inline-diff-hunks" style="border: 1px solid var(--border-glass); border-radius: 0 0 6px 6px; overflow: hidden;">`;
      
      diff.hunks.forEach((hunk, hunkIdx) => {
        diffHtml += `<div class="diff-hunk" style="border-bottom: ${hunkIdx < diff.hunks.length - 1 ? '1px solid var(--border-glass)' : 'none'};">`;
        
        // Hunk header
        diffHtml += `
          <div class="diff-hunk-header" style="padding: 3px 8px; font-size: 9px; font-family: var(--font-mono); background: rgba(255,255,255,0.02); color: var(--text-muted); border-bottom: 1px solid var(--border-glass);">
            @@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@
          </div>
        `;
        
        // Lines
        hunk.lines.forEach((line) => {
          let lineClass = 'diff-ctx-line';
          let prefix = ' ';
          let bgColor = 'transparent';
          let textColor = 'var(--text-secondary)';
          
          if (line.type === 'add') {
            lineClass = 'diff-add-line';
            prefix = '+';
            bgColor = 'rgba(52, 211, 153, 0.06)';
            textColor = '#34d399';
          } else if (line.type === 'del') {
            lineClass = 'diff-del-line';
            prefix = '-';
            bgColor = 'rgba(248, 113, 113, 0.06)';
            textColor = '#f87171';
          }
          
          const escapedContent = escapeHtml(line.content);
          diffHtml += `
            <div class="diff-line ${lineClass}" style="padding: 1px 8px; font-size: 10px; font-family: var(--font-mono); background: ${bgColor}; color: ${textColor}; white-space: pre-wrap; word-break: break-all; line-height: 1.5; border-bottom: 1px solid rgba(255,255,255,0.02);">
              <span style="opacity: 0.3; margin-right: 8px; user-select: none;">${prefix}</span>
              <span>${escapedContent || ' '}</span>
            </div>
          `;
        });
        
        diffHtml += `</div>`;
      });
      
      diffHtml += `</div>`;
      
      diffViewer.innerHTML = diffHtml;
      
      // Wire up accept/reject buttons
      const acceptBtn = diffViewer.querySelector('.diff-accept-btn');
      const rejectBtn = diffViewer.querySelector('.diff-reject-btn');
      
      if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
          acceptBtn.textContent = '⏳ Applying...';
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
          vscode.postMessage({ type: 'applyGitDiff', file, action: 'accept' });
          // Optimistically update
          setTimeout(() => {
            refreshGitStatus();
          }, 600);
        });
      }
      
      if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
          rejectBtn.textContent = '⏳ Reverting...';
          rejectBtn.disabled = true;
          acceptBtn.disabled = true;
          vscode.postMessage({ type: 'applyGitDiff', file, action: 'reject' });
          // Optimistically update
          setTimeout(() => {
            refreshGitStatus();
          }, 600);
        });
      }
    }
    
    // Insert after the target item
    targetItem.parentNode.insertBefore(diffViewer, targetItem.nextSibling);
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function unescapeHtml(safe) {
    if (!safe) return '';
    return safe
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");
  }

  function findUnquotedTagEndEx(text, toolName, startFrom = 0) {
    const openTag = '<' + toolName;
    const startIdx = text.toLowerCase().indexOf(openTag, startFrom);
    if (startIdx === -1) return null;

    const nextChar = text[startIdx + openTag.length];
    if (nextChar && !/\s|\/|>/.test(nextChar)) {
      return findUnquotedTagEndEx(text, toolName, startIdx + 1);
    }

    let inDq = false;
    let inSq = false;
    let escaped = false;
    for (let i = startIdx + openTag.length; i < text.length; i++) {
      const char = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"' && !inSq) {
        if (inDq) {
          const remaining = text.substring(i + 1).trim();
          if (remaining === '' || remaining.startsWith('/>') || remaining.startsWith('>') || /^[a-zA-Z_0-9\-]+\s*=/.test(remaining)) {
            inDq = false;
          }
        } else {
          inDq = true;
        }
        continue;
      }
      if (char === "'" && !inDq) {
        if (inSq) {
          const remaining = text.substring(i + 1).trim();
          if (remaining === '' || remaining.startsWith('/>') || remaining.startsWith('>') || /^[a-zA-Z_0-9\-]+\s*=/.test(remaining)) {
            inSq = false;
          }
        } else {
          inSq = true;
        }
        continue;
      }
      if (char === '>' && !inDq && !inSq) {
        const tagText = text.substring(startIdx, i + 1);
        const isSelfClosing = tagText.trim().endsWith('/>');
        const attrs = text.substring(openTag.length + startIdx, i - (isSelfClosing ? 1 : 0));
        return {
          start: startIdx,
          end: i + 1,
          attrs,
          isSelfClosing,
        };
      }
    }
    return null;
  }

  function getAttrValue(attrs, name) {
    if (!attrs) return null;
    const dq = new RegExp(`${name}\\s*=\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 'i').exec(attrs);
    if (dq) { return dq[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
    const sq = new RegExp(`${name}\\s*=\\s*'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'`, 'i').exec(attrs);
    if (sq) { return sq[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'); }
    // Fallback to simple match if quotes are missing or something
    const simple = new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(attrs);
    if (simple) return simple[1];
    return null;
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

    const streamingHeaders = bubbleElement.querySelectorAll('.streaming-write-card .tool-card-header');
    streamingHeaders.forEach((header) => {
      if (header.getAttribute('data-bound')) {
        return;
      }
      header.setAttribute('data-bound', 'true');
      header.addEventListener('click', () => {
        isStreamingCardExpanded = !isStreamingCardExpanded;
        const card = header.closest('.streaming-write-card');
        if (card) {
          card.classList.toggle('expanded', isStreamingCardExpanded);
        }
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
      // Hide and reset usage dashboard when history is empty
      const dash = document.getElementById('usage-dashboard');
      const tokensEl = document.getElementById('usage-tokens');
      const costEl = document.getElementById('usage-cost');
      if (dash && tokensEl && costEl) {
        tokensEl.textContent = '0';
        costEl.textContent = '$0.0000';
        dash.classList.add('hidden');
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
    const threshold = 15;
    const isAtBottom = (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight) <= threshold;
    userIsAtBottom = isAtBottom;

    if (chatMessages.scrollTop <= 10) {
      const totalMessages = chatHistory.length;
      if (totalMessages > renderedLimit) {
        loadMoreHistory();
      }
    }
  });

  // Buddy Avatar - Interactive Entertaining Mascot
  const buddyContainer = document.getElementById('buddy-container');
  const buddyEmoji = document.getElementById('buddy-emoji');
  const buddyTooltip = document.getElementById('buddy-tooltip');

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
    buddyContainer.classList.remove('state-idle', 'state-thinking', 'state-coding', 'state-tool_calling', 'state-error');
    buddyContainer.classList.add(`state-${state === 'click' ? 'idle' : state}`);
    
    if (idleInterval) {
      clearInterval(idleInterval);
      idleInterval = null;
    }
    if (errorResetTimeout) {
      clearTimeout(errorResetTimeout);
      errorResetTimeout = null;
    }

    const list = EMOJIS[state] || EMOJIS.idle;
    buddyEmoji.textContent = list[Math.floor(Math.random() * list.length)];

    // Update tooltip text
    const tooltips = {
      idle: 'Ready to help!',
      thinking: 'Thinking...',
      coding: 'Writing code...',
      tool_calling: 'Running tools...',
      error: 'Oops! Something went wrong',
      click: '👋 Hey!'
    };
    buddyTooltip.textContent = tooltips[state] || 'Ready to help!';

    if (state === 'idle') {
      startIdleRoutine();
    } else if (state === 'error') {
      buddyTooltip.textContent = '😰 Uh oh!';
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
          buddyEmoji.textContent = list[Math.floor(Math.random() * list.length)];
          // Random tooltip messages to entertain
          const messages = [
            'Ready to help!',
            'Waiting for your command...',
            'I can write code!',
            'Try asking me something',
            'Type @ to link files',
            'I support Ollama + DeepSeek'
          ];
          buddyTooltip.textContent = messages[Math.floor(Math.random() * messages.length)];
        }
      }
    }, 8000);
  }

  // Hook up winking/reactions on click
  if (buddyContainer) {
    buddyContainer.addEventListener('click', () => {
      const current = avatarState;
      
      buddyContainer.style.transform = 'scale(1.3) rotate(360deg)';
      buddyContainer.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
      
      const clicks = EMOJIS.click;
      buddyEmoji.textContent = clicks[Math.floor(Math.random() * clicks.length)];
      buddyTooltip.textContent = '👋 Hey there!';
      buddyTooltip.style.opacity = '1';
      buddyTooltip.style.transform = 'translateX(-50%) translateY(0)';
      
      setTimeout(() => {
        buddyContainer.style.transform = '';
        buddyContainer.style.transition = '';
        buddyTooltip.style.opacity = '';
        buddyTooltip.style.transform = '';
        if (avatarState !== 'error') {
          setAvatarState(current);
        }
      }, 1000);
    });
  }

  // Initialize avatar state
  setAvatarState('idle');

/**
 * tweight syntax highlighting for code blocks.
 * Applies token-wrapping in real-time after rendering.
 */
function applySyntaxHighlighting(container) {
  if (!container) return;
  const codeBlocks = container.querySelectorAll('pre code[class*="language-"]');
  codeBlocks.forEach(function(codeEl) {
    if (codeEl.getAttribute('data-highlighted')) return;
    codeEl.setAttribute('data-highlighted', 'true');
    
    const classes = codeEl.className;
    let lang = '';
    const match = classes.match(/language-(\w+)/);
    if (match) lang = match[1].toLowerCase();
    
    const code = codeEl.textContent || '';
    
    // Skip if empty or too short
    if (code.trim().length < 3) return;
    
    const highlighted = highlightCode(code, lang);
    if (highlighted) {
      codeEl.innerHTML = highlighted;
    }
  });
}

/**
 * Simple regex-based syntax highlighter.
 * Supports: JS/TS, Python, HTML, CSS, JSON, Bash, Diff
 */
function highlightCode(code, lang) {
  var lines = code.split('\n');
  var result = [];
  
  for (var i = 0; i < lines.length; i++) {
    var hl = highlightLine(lines[i], lang);
    result.push(hl);
  }
  return result.join('\n');
}

var JS_TS_LANGS = ['javascript', 'typescript', 'js', 'ts'];

function highlightLine(line, lang) {
  // Escape HTML first
  var escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  if (escaped.trim() === '') return '';
  
  if (JS_TS_LANGS.indexOf(lang) !== -1) {
    // Comments
    escaped = escaped.replace(/(\/\/.*$)/g, '<span class="hljs-comment">$1</span>');
    // Strings
    escaped = escaped.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hljs-string">$1</span>');
    // Numbers
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hljs-number">$1</span>');
    // Keywords
    var kw = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof', 'this', 'super', 'class', 'extends', 'import', 'export', 'from', 'async', 'await', 'yield', 'throw', 'try', 'catch', 'finally', 'in', 'of', 'with', 'void', 'null', 'undefined', 'true', 'false', 'static', 'get', 'set'];
    var kwRegex = new RegExp('\\b(' + kw.join('|') + ')\\b', 'g');
    escaped = escaped.replace(kwRegex, '<span class="hljs-keyword">$1</span>');
    // Function calls
    escaped = escaped.replace(/\b([a-zA-Z_$][\w$]*)\s*\(/g, '<span class="hljs-function">$1</span>(');
    // Built-in objects
    var bi = ['console', 'Math', 'JSON', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Date', 'RegExp', 'Error', 'setTimeout', 'setInterval', 'fetch', 'document', 'window', 'process', 'require', 'module', 'exports', 'Buffer', 'global'];
    var biRegex = new RegExp('\\b(' + bi.join('|') + ')\\b', 'g');
    escaped = escaped.replace(biRegex, '<span class="hljs-built_in">$1</span>');
  } else if (lang === 'python') {
    escaped = escaped.replace(/(#.*$)/g, '<span class="hljs-comment">$1</span>');
    escaped = escaped.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hljs-string">$1</span>');
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hljs-number">$1</span>');
    var pyKw = ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False', 'self', 'async', 'await', 'raise'];
    var pyKwRegex = new RegExp('\\b(' + pyKw.join('|') + ')\\b', 'g');
    escaped = escaped.replace(pyKwRegex, '<span class="hljs-keyword">$1</span>');
  } else if (lang === 'html') {
    escaped = escaped.replace(/(&lt;\/?[\w-]+)/g, '<span class="hljs-tag">$1</span>');
    escaped = escaped.replace(/\b(\w+)(?=\s*=)/g, '<span class="hljs-attr">$1</span>');
    escaped = escaped.replace(/("[^"]*"|'[^']*')/g, '<span class="hljs-string">$1</span>');
  } else if (lang === 'css') {
    escaped = escaped.replace(/\.[\w-]+|#[\w-]+|[\w-]+(?=\s*{)/g, '<span class="hljs-selector">$1</span>');
    escaped = escaped.replace(/([\w-]+)(?=\s*:)/g, '<span class="hljs-property">$1</span>');
    escaped = escaped.replace(/(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/g, '<span class="hljs-number">$1</span>');
    escaped = escaped.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hljs-string">$1</span>');
  } else if (lang === 'json') {
    escaped = escaped.replace(/("[^"]*")(\s*:)/g, '<span class="hljs-attr">$1</span>$2');
    escaped = escaped.replace(/("[^"]*")(?=\s*[,}\]])/g, '<span class="hljs-string">$1</span>');
    escaped = escaped.replace(/\b(true|false|null)\b/g, '<span class="hljs-literal">$1</span>');
    escaped = escaped.replace(/\b(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, '<span class="hljs-number">$1</span>');
  } else if (lang === 'bash' || lang === 'sh') {
    escaped = escaped.replace(/(#.*$)/g, '<span class="hljs-comment">$1</span>');
    escaped = escaped.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hljs-string">$1</span>');
    escaped = escaped.replace(/\b(echo|cd|ls|rm|cp|mv|mkdir|touch|cat|grep|find|npm|node|python|git|docker|sudo|export|source)\b/g, '<span class="hljs-built_in">$1</span>');
  } else if (lang === 'diff') {
    if (escaped.indexOf('+') === 0) escaped = '<span class="hljs-addition">' + escaped.substring(1) + '</span>';
    else if (escaped.indexOf('-') === 0) escaped = '<span class="hljs-deletion">' + escaped.substring(1) + '</span>';
  }
  
  return escaped || '&nbsp;';
}

})();


