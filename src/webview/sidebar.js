(function () {
  const vscode = acquireVsCodeApi();
  window.vscode = vscode;


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
  const figmaKeyInput = document.getElementById('figma-key');
  const contextBudgetInput = document.getElementById('context-budget-input');
  const turnsToRetainInput = document.getElementById('turns-to-retain-input');
  
  const planFirstToggle = document.getElementById('settings-plan-first-toggle');
  const truncationGuardToggle = document.getElementById('settings-truncation-guard-toggle');
  const aiReviewToggle = document.getElementById('settings-ai-review-toggle');
  const multiFileToggle = document.getElementById('settings-multi-file-toggle');
  const maxTurnsSummarizeInput = document.getElementById('max-turns-summarize-input');
  const maxToolOutputInput = document.getElementById('max-tool-output-input');
  const embeddingModelInput = document.getElementById('embedding-model-input');
  
  const quickProviderSelect = document.getElementById('quick-provider-select');
  const quickModelSelect = document.getElementById('quick-model-select');
  const quickThinkingToggle = document.getElementById('thinking-toggle');
  
  // Autonomous Mode toggle element
  let autonomousToggleEl = document.getElementById('settings-autonomous-toggle');
  const quickThinkingLevelSelect = document.getElementById('thinking-level-select');
  const settingsThinkingToggle = document.getElementById('settings-thinking-toggle');
  const settingsThinkingLevelSelect = document.getElementById('settings-thinking-level-select');
  const thinkingQuickControls = document.getElementById('thinking-quick-controls');
  
  const chatMessages = document.getElementById('chat-messages');
  const welcomeCard = document.getElementById('welcome-card');
  
  const contextDot = document.getElementById('context-dot');
  const contextFileName = document.getElementById('context-file-name');
  const acceptAllBtn = document.getElementById('accept-all-btn');
  
  const promptInput = document.getElementById('prompt-input');
  const sendBtn = document.getElementById('send-btn');

  // Advanced Agent Feature Elements
  const providerCustomBtn = document.getElementById('provider-custom-btn');
  const customPanel = document.getElementById('custom-panel');
  const customEndpointUrlInput = document.getElementById('custom-endpoint-url');
  const customEndpointModelInput = document.getElementById('custom-endpoint-model');
  const customEndpointKeyInput = document.getElementById('custom-endpoint-key');
  const toggleCustomKeyVisibilityBtn = document.getElementById('toggle-custom-key-visibility');

  const settingsCustomProviderSelect = document.getElementById('settings-custom-provider-select');
  const deleteCustomProviderBtn = document.getElementById('delete-custom-provider-btn');
  const customEndpointNameInput = document.getElementById('custom-endpoint-name');
  const saveCustomProviderBtn = document.getElementById('save-custom-provider-btn');
  const newCustomProviderBtn = document.getElementById('new-custom-provider-btn');
  const customApiEditorTitle = document.getElementById('custom-api-editor-title');

  let customApisList = [];
  let customApiKeysData = {};
  let configuredCustomApiKeys = {};

  const toggleCheckpointBtn = document.getElementById('toggle-checkpoint-btn');
  const checkpointsDrawer = document.getElementById('checkpoints-drawer');
  const checkpointsList = document.getElementById('checkpoints-list');

  const openMultiDiffBtn = document.getElementById('open-multi-diff-btn');
  const multiDiffDrawer = document.getElementById('multi-diff-drawer');
  const multiDiffContainer = document.getElementById('multi-diff-container');
  const multiDiffAcceptAll = document.getElementById('multi-diff-accept-all');
  const multiDiffRejectAll = document.getElementById('multi-diff-reject-all');
  
  const genTestsBtn = document.getElementById('gen-tests-btn');
  const genDocsBtn = document.getElementById('gen-docs-btn');

  const exportTelemetryJsonBtn = document.getElementById('export-telemetry-json-btn');
  const exportTelemetryCsvBtn = document.getElementById('export-telemetry-csv-btn');

  const templatesPopup = document.getElementById('templates-popup');
  const templatesPopupList = document.getElementById('templates-popup-list');
  const popupCreateTemplateBtn = document.getElementById('popup-create-template-btn');
  const templatesSearchInput = document.getElementById('templates-search-input');
  const templatesMenuBtn = document.getElementById('templates-menu-btn');
  let promptTemplates = [];

  // Command Approval Modal elements
  const commandApprovalModal = document.getElementById('command-approval-modal');
  const approvalCommandText = document.getElementById('approval-command-text');
  const approvalTimerContainer = document.getElementById('approval-timer-container');
  const approvalTimerBar = document.getElementById('approval-timer-bar');
  const approvalTimerText = document.getElementById('approval-timer-text');
  const approvalDenyBtn = document.getElementById('approval-deny-btn');
  const approvalAllowBtn = document.getElementById('approval-allow-btn');
  let approvalTimerInterval = null;

  // Scroll container is <main class="chat-container">
  const chatScrollContainer = document.querySelector('.chat-container');

  function updateStickyUserMessage() {
    if (!chatMessages) return;
    
    // First: reset all user bubbles (remove sticky from non-targets)
    const userBubbles = chatMessages.querySelectorAll('.message.user');
    userBubbles.forEach(bubble => {
      bubble.classList.remove('sticky-user-message', 'is-stuck');
      // Clear inline sticky styles
      bubble.style.position = '';
      bubble.style.top = '';
      bubble.style.bottom = '';
      bubble.style.zIndex = '';
      bubble.style.background = '';
      bubble.style.borderBottom = '';
      bubble.style.paddingBottom = '';
      bubble.style.boxShadow = '';
    });
    
    // Apply sticky to the LAST user message
    if (userBubbles.length > 0) {
      const lastBubble = userBubbles[userBubbles.length - 1];
      lastBubble.classList.add('sticky-user-message');
      
      // Apply sticky via inline styles (guaranteed to work regardless of CSS specificity)
      lastBubble.style.position = 'sticky';
      lastBubble.style.top = '-12px';
      lastBubble.style.bottom = '0px';
      lastBubble.style.zIndex = '10';
    }
    
    updateStickyVisibility();
    updatePinnedUserMessage();
  }

  function updateStickyVisibility() {
    if (!chatScrollContainer || !chatMessages) return;
    const userBubbles = chatMessages.querySelectorAll('.message.user.sticky-user-message');
    if (userBubbles.length === 0) return;
    const lastBubble = userBubbles[userBubbles.length - 1];
    
    // Detect if scrolled past the top (stuck at top)
    const rect = lastBubble.getBoundingClientRect();
    const containerRect = chatScrollContainer.getBoundingClientRect();
    const isStuck = rect.top <= containerRect.top + 5;
    
    if (isStuck) {
      lastBubble.classList.add('is-stuck');
      lastBubble.style.background = 'var(--vscode-editorWidget-background, rgba(12,12,20,0.98))';
      lastBubble.style.borderBottom = '1.5px solid rgba(99, 102, 241, 0.25)';
      lastBubble.style.paddingBottom = '8px';
      lastBubble.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.12), 0 1px 0 rgba(99, 102, 241, 0.2)';
    } else {
      lastBubble.classList.remove('is-stuck');
      lastBubble.style.background = '';
      lastBubble.style.borderBottom = '';
      lastBubble.style.paddingBottom = '';
      lastBubble.style.boxShadow = '';
    }
  }

  function updatePinnedUserMessage() {
    const pinBar = document.getElementById('pinned-user-msg-bar');
    if (pinBar) {
      pinBar.classList.add('hidden');
    }
  }




  // Contenteditable keyboard handler: Enter sends, Shift+Enter newline
  if (promptInput) {
    promptInput.addEventListener('keydown', function contenteditableKeydown(e) {
      if (!e.shiftKey && e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        if (typeof triggerSend === 'function') {
          triggerSend();
        }
        return;
      }
    });
  }

  let activeFilePath = '';

  // ── Inline toast notification (VS Code webview has no alert/confirm) ──
  function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    const color = type === 'error' ? '#ef4444' : type === 'warn' ? '#f59e0b' : '#10b981';
    toast.style.cssText = `
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      background: rgba(12,12,20,0.97); color: ${color};
      border: 1px solid ${color}40; border-radius: 8px;
      padding: 8px 16px; font-size: 11.5px; font-weight: 600;
      z-index: 9999; pointer-events: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      animation: toast-in 0.2s ease forwards;
    `;
    if (!document.getElementById('toast-style')) {
      const s = document.createElement('style');
      s.id = 'toast-style';
      s.textContent = '@keyframes toast-in{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(s);
    }
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  // Autocomplete & Context Chips Elements
  const contextChipsContainer = document.getElementById('context-chips-container');
  const autocompleteDropdown = document.getElementById('autocomplete-dropdown');

  // Application State
  let chatHistory = [];
  let allSessions = [];
  let searchMatchedIds = null;
  let searchQuery = '';
  let currentStreamingBubble = null;
  let currentStreamingText = '';
  let currentStreamingReasoningText = '';
  let activeProvider = 'ollama';
  let isSending = false;
  let messageQueue = [];  // Array of { text, images, selectedFiles, userDisplayMessage, rawText }
  
  function renderQueueChips() {
    const container = document.getElementById('queue-chips-container');
    if (!container) return;
    
    if (messageQueue.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    
    container.classList.remove('hidden');
    container.innerHTML = '';
    
    messageQueue.forEach((item, idx) => {
      const chip = document.createElement('div');
      chip.className = 'queue-chip';
      
      const numSpan = document.createElement('span');
      numSpan.className = 'queue-chip-num';
      numSpan.textContent = '#' + (idx + 1);
      
      const textSpan = document.createElement('span');
      textSpan.className = 'queue-chip-text';
      const displayText = item.userDisplayMessage || item.text;
      textSpan.textContent = displayText.length > 40 ? displayText.substring(0, 37) + '...' : displayText;
      textSpan.title = displayText;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'queue-chip-remove';
      removeBtn.innerHTML = '✕';
      removeBtn.title = 'Remove queued message';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        messageQueue.splice(idx, 1);
        renderQueueChips();
        if (messageQueue.length === 0) {
          container.classList.add('hidden');
        }
      });
      
      chip.appendChild(numSpan);
      chip.appendChild(textSpan);
      chip.appendChild(removeBtn);
      container.appendChild(chip);
    });
  }
  
  function processNextInQueue() {
    if (messageQueue.length === 0) return;
    if (isSending) return;
    
    const next = messageQueue.shift();
    renderQueueChips();
    
    // Actually send the message
    executeSend(next.text, next.images, next.selectedFiles, next.userDisplayMessage, next.rawText);
  }
  
  function clearQueue() {
    messageQueue = [];
    renderQueueChips();
    showToast('Queued messages cleared', 'success');
  }

  // Actual send execution - separated so it can be called from both submitMessage and processNextInQueue
  function executeSend(text, imagesOpt, selectedFilesOpt, userDisplayMessage) {
  // Read from contenteditable if no text provided
  if (!text && promptInput) {
    // Walk the DOM, converting .inline-file-tag spans to [full/path] markers
    var parts = [];
    var childNodes = promptInput.childNodes;
    for (var i = 0; i < childNodes.length; i++) {
      var node = childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent);
      } else if (node.classList && node.classList.contains('inline-file-tag')) {
        var path = node.dataset.path || node.textContent.replace('@', '');
        parts.push('[' + path + ']');
      } else {
        parts.push(node.textContent || ' ');
      }
    }
    text = parts.join('');
    promptInput.innerHTML = '';
    autoGrowTextarea();
  }
    const images = imagesOpt || [];
    
    // Build user display message — text already contains [filepath] markers inline from autocomplete
    let displayMsg = userDisplayMessage || text;
    appendMessageBubble('user', displayMsg, images);
    scrollChatToBottom(true);

    const assistantBubble = appendMessageBubble('assistant', '');
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    assistantBubble.appendChild(typingIndicator);
    currentStreamingBubble = assistantBubble;
    currentStreamingText = '';
    currentStreamingReasoningText = '';

    scrollChatToBottom(true);

    vscode.postMessage({
      type: 'sendMessage',
      text: text,
      history: chatHistory,
      images: images
    });
  }

  let savedDefaultOllamaModel = 'llama3';
  let activeSessionId = null;
  let gitChanges = [];

  const stopBtn = document.getElementById('stop-btn');
  const imageAttachmentsContainer = document.getElementById('image-attachments-container');
  const exportMdBtn = document.getElementById('export-md-btn');
  const exportJsonBtn = document.getElementById('export-json-btn');
  const gitPrDescBtn = document.getElementById('git-pr-desc-btn');
  const gitCommitMsgBtn = document.getElementById('git-commit-msg-btn');

  if (exportMdBtn) {
    exportMdBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportChatMarkdown' });
    });
  }
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportChatSession' });
    });
  }
  // Initialize autonomous mode toggle
  const autoToggle = document.getElementById('settings-autonomous-toggle');
  if (autoToggle) {
    vscode.postMessage({ type: 'getSetting', key: 'autonomousMode' });
    autoToggle.addEventListener('change', function() {
      vscode.postMessage({ type: 'saveSetting', key: 'autonomousMode', value: this.checked ? true : false });
    });
  }

  if (gitPrDescBtn) {
    gitPrDescBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'generatePRDescription' });
      const gitDrawer = document.getElementById('git-drawer');
      if (gitDrawer) gitDrawer.classList.add('collapsed');
    });
  }

  if (gitCommitMsgBtn) {
    gitCommitMsgBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'generateCommitMessage' });
      const gitDrawer = document.getElementById('git-drawer');
      if (gitDrawer) gitDrawer.classList.add('collapsed');
    });
  }



  const sessionSearchInput = document.getElementById('session-search-input');
  if (sessionSearchInput) {
    sessionSearchInput.addEventListener('input', () => {
      const query = sessionSearchInput.value.toLowerCase().trim();
      searchQuery = query;
      if (query) {
        vscode.postMessage({ type: 'searchSessions', query });
      } else {
        searchMatchedIds = null;
        renderChatSessions();
      }
    });
  }
  const voiceInputBtn = document.getElementById('voice-input-btn');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isRecording = true;
      voiceInputBtn.style.color = '#ef4444';
      voiceInputBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
      voiceInputBtn.title = 'Recording... Click to stop';
    };

    recognition.onend = () => {
      isRecording = false;
      voiceInputBtn.style.color = '';
      voiceInputBtn.style.backgroundColor = '';
      voiceInputBtn.title = 'Voice Input (Speech-to-Text)';
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (promptInput) {
        promptInput.focus();
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(transcript);
          range.insertNode(textNode);
          
          // Position cursor after the inserted text
          const newRange = document.createRange();
          newRange.setStartAfter(textNode);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        } else {
          promptInput.appendChild(document.createTextNode(transcript));
        }
        if (typeof autoGrowTextarea === 'function') {
          autoGrowTextarea();
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      isRecording = false;
      voiceInputBtn.style.color = '';
      voiceInputBtn.style.backgroundColor = '';
    };
  }

  if (voiceInputBtn) {
    voiceInputBtn.addEventListener('click', () => {
      if (!SpeechRecognition) {
        vscode.postMessage({
          type: 'showWarning',
          text: 'Voice input (Speech Recognition) is not supported in this environment. Please ensure microphone access is enabled.'
        });
        return;
      }
      if (isRecording) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
  }
  // Attached Images State
  let attachedImages = [];

  // New features state
  let workspaceFiles = [];
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

    const multiPatchRegex = /<(multi_patch_file|multipatch_file)([\s\S]*?)>([\s\S]*?)<\/\1\s*>/gi;
    while ((match = multiPatchRegex.exec(text)) !== null) {
      const content = match[3];
      const fileRegex = /<file\s+path="([^"]+)"\s*>([\s\S]*?)<\/file>/gi;
      let fileMatch;
      while ((fileMatch = fileRegex.exec(content)) !== null) {
        parsedToolContents.set(fileMatch[1].trim(), fileMatch[2]);
      }
    }
  }


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
    if (!settingsDrawer.classList.contains('collapsed')) {
      saveSettingsBtn.click();
    }
    settingsDrawer.classList.add('collapsed');
    historyDrawer.classList.add('collapsed');
    gitDrawer.classList.add('collapsed');
    if (checkpointsDrawer) checkpointsDrawer.classList.add('collapsed');
    if (multiDiffDrawer) multiDiffDrawer.classList.add('collapsed');
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

  // Checkpoints Drawer Toggle
  if (toggleCheckpointBtn && checkpointsDrawer) {
    toggleCheckpointBtn.addEventListener('click', () => {
      const isOpening = checkpointsDrawer.classList.contains('collapsed');
      closeAllDrawers();
      if (isOpening) {
        checkpointsDrawer.classList.remove('collapsed');
        vscode.postMessage({ type: 'getCheckpoints' });
      }
    });
  }

  // Multi-Diff Drawer Toggle
  if (openMultiDiffBtn && multiDiffDrawer) {
    openMultiDiffBtn.addEventListener('click', () => {
      const isOpening = multiDiffDrawer.classList.contains('collapsed');
      closeAllDrawers();
      if (isOpening) {
        multiDiffDrawer.classList.remove('collapsed');
        vscode.postMessage({ type: 'getActiveReviews' });
      }
    });
  }

  // 1c. New Chat Session Action
  newChatBtn.addEventListener('click', () => {
    closeAllDrawers();
    vscode.postMessage({ type: 'newSession' });
  });

  // 2. Provider Switch Tabs
  providerOllamaBtn.addEventListener('click', () => {
    selectProvider('ollama');
    vscode.postMessage({ type: 'fetchModels' });
    saveProviderSettings('ollama');
  });
  providerDeepseekBtn.addEventListener('click', () => {
    selectProvider('deepseek');
    saveProviderSettings('deepseek');
  });
  if (providerCustomBtn) {
    providerCustomBtn.addEventListener('click', () => {
      selectProvider('custom');
      saveProviderSettings('custom');
    });
  }

  let defaultCustomUrl = 'https://api.openai.com/v1';
  let defaultCustomModel = 'gpt-4o';
  let defaultCustomHasKey = false;

  function saveProviderSettings(provider) {
    const ollamaHost = ollamaHostInput ? ollamaHostInput.value.trim() : 'http://localhost:11434';
    const defaultOllamaModel = ollamaModelSelect ? ollamaModelSelect.value : 'llama3';
    const defaultDeepSeekModel = deepseekModelSelect ? deepseekModelSelect.value : 'deepseek-v4-pro';
    const contextBudget = (contextBudgetInput && contextBudgetInput.value) ? parseInt(contextBudgetInput.value.trim(), 10) : 75;
    const turnsToRetain = (turnsToRetainInput && turnsToRetainInput.value) ? parseInt(turnsToRetainInput.value.trim(), 10) : 6;

    const customEndpointUrl = customEndpointUrlInput ? customEndpointUrlInput.value.trim() : '';
    const customEndpointModel = customEndpointModelInput ? customEndpointModelInput.value.trim() : '';
    let customEndpointKey = customEndpointKeyInput ? customEndpointKeyInput.value.trim() : '';
    if (customEndpointKey === '••••••••') {
      customEndpointKey = undefined;
    }

    const activeCustomId = settingsCustomProviderSelect ? settingsCustomProviderSelect.value : 'custom';
    if (activeCustomId === 'custom') {
      if (customEndpointKey !== undefined) {
        customApiKeysData['custom'] = customEndpointKey;
      }
    } else {
      if (customEndpointKey !== undefined) {
        customApiKeysData[activeCustomId] = customEndpointKey;
      }
    }

    const agentMode = document.getElementById('agent-mode-select') ? document.getElementById('agent-mode-select').value : 'normal';
    const customSystemPrompt = document.getElementById('custom-system-prompt') ? document.getElementById('custom-system-prompt').value : '';
    const deepSeekThinking = settingsThinkingToggle ? settingsThinkingToggle.checked : true;
    const deepSeekThinkingLevel = settingsThinkingLevelSelect ? settingsThinkingLevelSelect.value : 'high';
    const autoToggle = document.getElementById('settings-autonomous-toggle');
    const autonomousMode = autoToggle ? autoToggle.checked : false;

    const planFirst = planFirstToggle ? planFirstToggle.checked : true;
    const truncationGuard = truncationGuardToggle ? truncationGuardToggle.checked : true;
    const aiReviewEnabled = aiReviewToggle ? aiReviewToggle.checked : false;
    const multiFileRefactor = multiFileToggle ? multiFileToggle.checked : true;
    const maxTurnsBeforeSummarize = maxTurnsSummarizeInput ? parseInt(maxTurnsSummarizeInput.value.trim(), 10) : 16;
    const maxToolOutputLength = maxToolOutputInput ? parseInt(maxToolOutputInput.value.trim(), 10) : 20000;
    const embeddingModel = embeddingModelInput ? embeddingModelInput.value.trim() : 'nomic-embed-text';

    vscode.postMessage({
      type: 'saveSettings',
      provider,
      ollamaHost,
      defaultOllamaModel,
      defaultDeepSeekModel,
      contextBudgetPercent: contextBudget,
      turnsToRetain: turnsToRetain,
      deepSeekThinking,
      deepSeekThinkingLevel,
      autonomousMode,
      planFirst,
      enableTruncationGuardrail: truncationGuard,
      aiReviewEnabled,
      multiFileRefactorEnabled: multiFileRefactor,
      maxTurnsBeforeSummarize,
      maxToolOutputLength,
      embeddingModel,
      customEndpointEnabled: provider === 'custom' || (typeof provider === 'string' && provider.startsWith('custom_')),
      customEndpointUrl: activeCustomId === 'custom' ? customEndpointUrl : (customApisList.find(a => a.id === activeCustomId)?.url || customEndpointUrl),
      customEndpointModel: activeCustomId === 'custom' ? customEndpointModel : (customApisList.find(a => a.id === activeCustomId)?.models[0] || customEndpointModel),
      customEndpointKey: activeCustomId === 'custom' ? customEndpointKey : undefined,
      agentMode,
      customSystemPrompt,
      customApis: customApisList,
      customApiKeys: customApiKeysData,
    });
  }

  function selectProvider(provider) {
    activeProvider = provider;
    
    providerOllamaBtn.classList.remove('active');
    providerDeepseekBtn.classList.remove('active');
    if (providerCustomBtn) providerCustomBtn.classList.remove('active');
    
    ollamaPanel.classList.add('hidden');
    deepseekPanel.classList.add('hidden');
    if (customPanel) customPanel.classList.add('hidden');

    if (provider === 'ollama') {
      providerOllamaBtn.classList.add('active');
      ollamaPanel.classList.remove('hidden');
      if (thinkingQuickControls) {
        thinkingQuickControls.style.opacity = '0.5';
        thinkingQuickControls.style.pointerEvents = 'none';
      }
    } else if (provider === 'deepseek') {
      providerDeepseekBtn.classList.add('active');
      deepseekPanel.classList.remove('hidden');
      if (thinkingQuickControls) {
        thinkingQuickControls.style.opacity = '1';
        thinkingQuickControls.style.pointerEvents = 'auto';
      }
    } else {
      if (providerCustomBtn) providerCustomBtn.classList.add('active');
      if (customPanel) customPanel.classList.remove('hidden');
      if (thinkingQuickControls) {
        thinkingQuickControls.style.opacity = '0.5';
        thinkingQuickControls.style.pointerEvents = 'none';
      }
    }
    
    if (quickProviderSelect) {
      quickProviderSelect.value = provider;
    }
    syncQuickModelSelect();
  }

  function syncQuickModelSelect() {
    if (!quickProviderSelect || !quickModelSelect) return;
    quickModelSelect.innerHTML = '';
    if (activeProvider === 'ollama') {
      Array.from(ollamaModelSelect.options).forEach(opt => {
        const newOpt = document.createElement('option');
        newOpt.value = opt.value;
        newOpt.textContent = opt.textContent;
        quickModelSelect.appendChild(newOpt);
      });
      quickModelSelect.value = ollamaModelSelect.value;
    } else if (activeProvider === 'deepseek') {
      Array.from(deepseekModelSelect.options).forEach(opt => {
        const newOpt = document.createElement('option');
        newOpt.value = opt.value;
        newOpt.textContent = opt.textContent;
        quickModelSelect.appendChild(newOpt);
      });
      quickModelSelect.value = deepseekModelSelect.value;
    } else if (activeProvider === 'custom' || (typeof activeProvider === 'string' && activeProvider.startsWith('custom_'))) {
      const activeCustom = customApisList.find(api => api.id === activeProvider);
      if (activeCustom && activeCustom.models && activeCustom.models.length > 0) {
        activeCustom.models.forEach(model => {
          const newOpt = document.createElement('option');
          newOpt.value = model;
          newOpt.textContent = model;
          quickModelSelect.appendChild(newOpt);
        });
        const savedModel = customEndpointModelInput ? customEndpointModelInput.value : '';
        if (activeCustom.models.includes(savedModel)) {
          quickModelSelect.value = savedModel;
        } else {
          quickModelSelect.value = activeCustom.models[0];
          if (customEndpointModelInput) customEndpointModelInput.value = activeCustom.models[0];
        }
      } else {
        const newOpt = document.createElement('option');
        const val = customEndpointModelInput ? (customEndpointModelInput.value || 'custom') : 'custom';
        newOpt.value = val;
        newOpt.textContent = val;
        quickModelSelect.appendChild(newOpt);
        quickModelSelect.value = val;
      }
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
  if (toggleFigmaKeyVisibilityBtn && figmaKeyInput) {
    toggleFigmaKeyVisibilityBtn.addEventListener('click', () => {
      if (figmaKeyInput.type === 'password') {
        figmaKeyInput.type = 'text';
        toggleFigmaKeyVisibilityBtn.textContent = 'Hide';
      } else {
        figmaKeyInput.type = 'password';
        toggleFigmaKeyVisibilityBtn.textContent = 'Show';
      }
    });
  }

  if (toggleCustomKeyVisibilityBtn && customEndpointKeyInput) {
    toggleCustomKeyVisibilityBtn.addEventListener('click', () => {
      if (customEndpointKeyInput.type === 'password') {
        customEndpointKeyInput.type = 'text';
        toggleCustomKeyVisibilityBtn.textContent = 'Hide';
      } else {
        customEndpointKeyInput.type = 'password';
        toggleCustomKeyVisibilityBtn.textContent = 'Show';
      }
    });
  }

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
    let deepSeekKey = deepseekKeyInput.value.trim();
    if (deepSeekKey === '••••••••') {
      deepSeekKey = undefined;
    }
    let figmaKey = figmaKeyInput ? figmaKeyInput.value.trim() : '';
    if (figmaKey === '••••••••') {
      figmaKey = undefined;
    }
    const contextBudget = parseInt(contextBudgetInput.value.trim(), 10) || 75;
    const turnsToRetain = parseInt(turnsToRetainInput.value.trim(), 10) || 6;

    const deepSeekThinking = settingsThinkingToggle.checked;
    const deepSeekThinkingLevel = settingsThinkingLevelSelect.value;

    const activeCustomId = settingsCustomProviderSelect ? settingsCustomProviderSelect.value : 'custom';
    const customEndpointUrl = customEndpointUrlInput ? customEndpointUrlInput.value.trim() : defaultCustomUrl;
    const customEndpointModel = customEndpointModelInput ? customEndpointModelInput.value.trim() : defaultCustomModel;
    let customEndpointKey = customEndpointKeyInput ? customEndpointKeyInput.value.trim() : '';
    if (customEndpointKey === '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
      customEndpointKey = undefined;
    }
    if (activeCustomId === 'custom') {
      if (customEndpointKey !== undefined) {
        customApiKeysData['custom'] = customEndpointKey;
      }
    } else {
      if (customEndpointKey !== undefined) {
        customApiKeysData[activeCustomId] = customEndpointKey;
      }
    }

    const agentMode = document.getElementById('agent-mode-select') ? document.getElementById('agent-mode-select').value : 'normal';
    const customSystemPrompt = document.getElementById('custom-system-prompt') ? document.getElementById('custom-system-prompt').value : '';

    const autoToggle = document.getElementById('settings-autonomous-toggle');
    const autonomousMode = autoToggle ? autoToggle.checked : false;

    const planFirst = planFirstToggle ? planFirstToggle.checked : true;
    const truncationGuard = truncationGuardToggle ? truncationGuardToggle.checked : true;
    const aiReviewEnabled = aiReviewToggle ? aiReviewToggle.checked : false;
    const multiFileRefactor = multiFileToggle ? multiFileToggle.checked : true;
    const maxTurnsBeforeSummarize = maxTurnsSummarizeInput ? parseInt(maxTurnsSummarizeInput.value.trim(), 10) : 16;
    const maxToolOutputLength = maxToolOutputInput ? parseInt(maxToolOutputInput.value.trim(), 10) : 20000;
    const embeddingModel = embeddingModelInput ? embeddingModelInput.value.trim() : 'nomic-embed-text';

    const teacherToggle = document.getElementById('settings-teacher-toggle');
    const teacherEnabled = teacherToggle ? teacherToggle.checked : false;
    const teacherModelInput = document.getElementById('settings-teacher-model-input');
    const teacherModel = teacherModelInput ? teacherModelInput.value.trim() : 'deepseek-v4-pro';

    vscode.postMessage({
      type: 'saveSettings',
      provider,
      ollamaHost,
      defaultOllamaModel,
      defaultDeepSeekModel,
      deepSeekKey: deepSeekKey !== undefined ? deepSeekKey : undefined,
      figmaKey: figmaKey || undefined, // only send key if typed
      contextBudgetPercent: contextBudget,
      turnsToRetain: turnsToRetain,
      deepSeekThinking,
      deepSeekThinkingLevel,
      autonomousMode,
      planFirst,
      enableTruncationGuardrail: truncationGuard,
      aiReviewEnabled,
      multiFileRefactorEnabled: multiFileRefactor,
      maxTurnsBeforeSummarize,
      maxToolOutputLength,
      embeddingModel,
      customEndpointEnabled: provider === 'custom' || (typeof provider === 'string' && provider.startsWith('custom_')),
      customEndpointUrl: activeCustomId === 'custom' ? customEndpointUrl : (customApisList.find(a => a.id === activeCustomId)?.url || customEndpointUrl),
      customEndpointModel: activeCustomId === 'custom' ? customEndpointModel : (customApisList.find(a => a.id === activeCustomId)?.models[0] || customEndpointModel),
      customEndpointKey: activeCustomId === 'custom' ? customEndpointKey : undefined,
      agentMode,
      customSystemPrompt,
      customApis: customApisList,
      customApiKeys: customApiKeysData,
      teacherEnabled,
      teacherModel,
    });

    settingsDrawer.classList.add('collapsed');
  });

  // 5x. Bind event listeners for quick input settings controls
  if (quickProviderSelect) {
    quickProviderSelect.addEventListener('change', (e) => {
      selectProvider(e.target.value);
      saveSettingsBtn.click();
    });
  }

  if (quickModelSelect) {
    quickModelSelect.addEventListener('change', (e) => {
      if (activeProvider === 'ollama') {
        ollamaModelSelect.value = e.target.value;
      } else if (activeProvider === 'deepseek') {
        deepseekModelSelect.value = e.target.value;
      } else {
        if (customEndpointModelInput) customEndpointModelInput.value = e.target.value;
      }
      saveSettingsBtn.click();
    });
  }

  function updateCustomProvidersUI(selectedProvider) {
    const customApiListEl = document.getElementById('custom-api-list');
    const customApiEditor = document.getElementById('custom-api-editor');
    const customApiPlaceholder = document.getElementById('custom-api-placeholder');
    
    // Render the list of custom APIs
    if (customApiListEl) {
      if (customApisList.length === 0) {
        customApiListEl.innerHTML = '';
      } else {
        customApiListEl.innerHTML = customApisList.map(api => {
          const isActive = selectedProvider === api.id;
          return `<div class="custom-api-item ${isActive ? 'active' : ''}" data-id="${api.id}" style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; margin-bottom:4px; border-radius:6px; cursor:pointer; background:${isActive ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${isActive ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}; transition:all 0.15s;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              <span style="font-size:9px; opacity:0.5;">🔌</span>
              <span style="font-size:12px; font-weight:${isActive ? '600' : '400'}; color:${isActive ? 'var(--color-primary-light)' : 'inherit'};">${api.name}</span>
            </div>
            <span style="font-size:10px; opacity:0.4; white-space:nowrap;">${api.models.slice(0,2).join(', ')}${api.models.length > 2 ? '...' : ''}</span>
          </div>`;
        }).join('');
        
        // Click handler for items
        customApiListEl.querySelectorAll('.custom-api-item').forEach(el => {
          el.addEventListener('click', () => {
            const id = el.dataset.id;
            fillCustomApiEditorFields(id);
          });
        });
      }
    }

    // Update the quick provider select (top dropdown) - remove default 'custom' option
    quickProviderSelect.innerHTML = `
      <option value="ollama">Ollama</option>
      <option value="deepseek">DeepSeek</option>
    `;
    customApisList.forEach(api => {
      const opt = document.createElement('option');
      opt.value = api.id;
      opt.textContent = api.name;
      quickProviderSelect.appendChild(opt);
    });

    const isCustomId = typeof selectedProvider === 'string' && selectedProvider.startsWith('custom_');
    if (isCustomId) {
      quickProviderSelect.value = selectedProvider;
    }
    if (customApiPlaceholder) {
      customApiPlaceholder.style.display = customApisList.length === 0 ? 'block' : 'none';
    }

    fillCustomApiEditorFields(isCustomId ? selectedProvider : '');
  }

  function fillCustomApiEditorFields(providerId) {
    const editor = document.getElementById('custom-api-editor');
    const activeItem = document.querySelector('.custom-api-item.active');
    
    // Deselect all items first
    document.querySelectorAll('.custom-api-item').forEach(el => el.classList.remove('active'));
    
    if (!providerId || providerId === 'custom') {
      // No API selected or invalid — hide editor
      if (editor) editor.classList.add('hidden');
      return;
    }
    
    const api = customApisList.find(a => a.id === providerId);
    if (!api) {
      if (editor) editor.classList.add('hidden');
      return;
    }
    
    // Mark this item as active
    const itemEl = document.querySelector(`.custom-api-item[data-id="${providerId}"]`);
    if (itemEl) itemEl.classList.add('active');
    
    if (editor) editor.classList.remove('hidden');
    
    if (customEndpointNameInput) {
      customEndpointNameInput.value = api.name;
      customEndpointNameInput.disabled = false;
    }
    if (customEndpointUrlInput) customEndpointUrlInput.value = api.url;
    if (customEndpointModelInput) customEndpointModelInput.value = api.models.join(', ');
    
    const hasKey = configuredCustomApiKeys[api.id] || customApiKeysData[api.id];
    if (customEndpointKeyInput) {
      if (customApiKeysData[api.id]) {
        customEndpointKeyInput.value = customApiKeysData[api.id];
        customEndpointKeyInput.placeholder = 'Key configured (unsaved)';
      } else {
        customEndpointKeyInput.placeholder = hasKey ? 'Key is configured' : 'Key...';
        customEndpointKeyInput.value = hasKey ? '••••••••' : '';
      }
    }
  }

  // Wire up the Add Custom API button
  const addCustomApiBtn = document.getElementById('add-custom-api-btn');
  if (addCustomApiBtn) {
    addCustomApiBtn.addEventListener('click', () => {
      if (customEndpointNameInput) {
        customEndpointNameInput.value = '';
        customEndpointNameInput.disabled = false;
        customEndpointNameInput.focus();
      }
      if (customEndpointUrlInput) customEndpointUrlInput.value = '';
      if (customEndpointModelInput) customEndpointModelInput.value = '';
      if (customEndpointKeyInput) {
        customEndpointKeyInput.value = '';
        customEndpointKeyInput.placeholder = 'Key...';
      }
      // Show the editor in "new" mode with a clear editor title
      const editor = document.getElementById('custom-api-editor');
      const title = editor ? editor.querySelector('.settings-card-title') : null;
      if (title) title.textContent = 'New Custom API';
      if (editor) editor.classList.remove('hidden');
    });
  }

  if (saveCustomProviderBtn) {
    saveCustomProviderBtn.addEventListener('click', () => {
      const name = customEndpointNameInput ? customEndpointNameInput.value.trim() : '';
      const url = customEndpointUrlInput ? customEndpointUrlInput.value.trim() : '';
      const modelsStr = customEndpointModelInput ? customEndpointModelInput.value.trim() : '';
      let key = customEndpointKeyInput ? customEndpointKeyInput.value.trim() : '';

      if (!name || !url) {
        showToast('Please specify connection name and endpoint URL.', 'error');
        return;
      }

      const models = modelsStr.split(',').map(m => m.trim()).filter(m => m.length > 0);
      if (models.length === 0) {
        showToast('Please specify at least one model name.', 'error');
        return;
      }

      // Determine if we are editing an existing API or creating a new one
      const activeItem = document.querySelector('.custom-api-item.active');
      let targetId = '';
      let isNew = true;

      if (activeItem) {
        targetId = activeItem.dataset.id;
        const existing = customApisList.find(a => a.id === targetId);
        if (existing) {
          isNew = false;
          existing.name = name;
          existing.url = url;
          existing.models = models;
        }
      }

      if (isNew) {
        targetId = 'custom_' + Date.now();
        customApisList.push({ id: targetId, name, url, models });
      }

      if (key && key !== '••••••••') {
        customApiKeysData[targetId] = key;
      } else if (key === '') {
        customApiKeysData[targetId] = '';
      }

      updateCustomProvidersUI(targetId);
      selectProvider(targetId);
      saveProviderSettings(targetId);
      showToast(name + ' saved!');
    });
  }

  if (deleteCustomProviderBtn) {
    deleteCustomProviderBtn.addEventListener('click', () => {
      const activeItem = document.querySelector('.custom-api-item.active');
      if (!activeItem) {
        showToast('Select a custom connection to delete.', 'info');
        return;
      }

      const targetId = activeItem.dataset.id;
      customApisList = customApisList.filter(a => a.id !== targetId);
      customApiKeysData[targetId] = '';

      // If the deleted API was the active provider, switch to Ollama
      const wasActiveProvider = activeProvider === targetId;
      
      updateCustomProvidersUI('');
      
      if (wasActiveProvider) {
        selectProvider('ollama');
        saveProviderSettings('ollama');
      }
      showToast('Connection deleted.');
    });
  }

  if (quickThinkingToggle) {
    quickThinkingToggle.addEventListener('change', (e) => {
      settingsThinkingToggle.checked = e.target.checked;
      saveSettingsBtn.click();
    });
  }

  if (quickThinkingLevelSelect) {
    quickThinkingLevelSelect.addEventListener('change', (e) => {
      settingsThinkingLevelSelect.value = e.target.value;
      saveSettingsBtn.click();
    });
  }

  if (settingsThinkingToggle) {
    settingsThinkingToggle.addEventListener('change', (e) => {
      quickThinkingToggle.checked = e.target.checked;
    });
  }

  if (settingsThinkingLevelSelect) {
    settingsThinkingLevelSelect.addEventListener('change', (e) => {
      quickThinkingLevelSelect.value = e.target.value;
    });
  }

  // Bind Enter key to save settings on input fields
  [
    ollamaHostInput,
    deepseekKeyInput,
    contextBudgetInput,
    turnsToRetainInput,
    customEndpointUrlInput,
    customEndpointModelInput,
    customEndpointKeyInput,
    figmaKeyInput
  ].forEach(input => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveSettingsBtn.click();
        }
      });
    }
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
    promptInput.style.height = '';
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

  // Implementation Plan approval button handler
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.approve-plan-btn');
    if (btn) {
      const container = btn.parentNode;
      if (container) {
        container.innerHTML = `<span style="font-size: 11px; font-weight: 600; color: #10b981; display: flex; align-items: center; gap: 4px;">Approved &amp; Executing ⚡</span>`;
      }
      
      promptInput.innerHTML = "Approved. Proceed with the implementation plan.";
      submitMessage();
    }
  });

  // 6b. Autocomplete Logic
  function handleAutocompleteSearch() {
    const sel = window.getSelection();
    let text = promptInput.textContent || promptInput.innerText || '';
    let cursorPos = 0;
    if (sel && sel.rangeCount && promptInput.contains(sel.anchorNode)) {
      const preRange = document.createRange();
      preRange.selectNodeContents(promptInput);
      preRange.setEnd(sel.anchorNode, sel.anchorOffset);
      cursorPos = preRange.toString().length;
    }
    
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
      
      if (workspaceFiles.length === 0) {
        vscode.postMessage({ type: 'requestWorkspaceFiles' });
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
    // Insert a styled file tag into the contenteditable div
    const sel = window.getSelection();
    if (!sel.rangeCount) { promptInput.focus(); return; }
    const range = sel.getRangeAt(0);
    
    // Find and remove the @query text by scanning backward
    const walker = document.createTreeWalker(range.startContainer, NodeFilter.SHOW_TEXT, null, false);
    walker.currentNode = range.startContainer;
    let node = walker.previousNode();
    let atNode = range.startContainer;
    let atOffset = range.startOffset;
    
    // Walk backward to find the '@' character
    let found = false;
    if (atNode.nodeType === Node.TEXT_NODE && atNode.textContent) {
      const text = atNode.textContent;
      const idx = text.lastIndexOf('@', atOffset);
      if (idx !== -1) {
        // Replace '@query' text with file tag
        atNode.textContent = text.substring(0, idx) + text.substring(atOffset);
        const tagSpan = document.createElement('span');
        tagSpan.className = 'inline-file-tag';
        tagSpan.contentEditable = 'false';
        const fileName = filePath.split('/').pop() || filePath;
        tagSpan.textContent = '@' + fileName;
        tagSpan.dataset.path = filePath;
        tagSpan.title = filePath;
        
        // Insert tag at the position where @ was
        const tagRange = document.createRange();
        tagRange.setStart(atNode, idx);
        tagRange.collapse(true);
        tagRange.insertNode(tagSpan);
        
        // Move cursor after the tag
        const newRange = document.createRange();
        newRange.setStartAfter(tagSpan);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        found = true;
      }
    }
    
    if (!found) {
      // Fallback: just insert [filepath] text directly
      const tagSpan = document.createElement('span');
      tagSpan.className = 'inline-file-tag';
      tagSpan.contentEditable = 'false';
      const fileName = filePath.split('/').pop() || filePath;
      tagSpan.textContent = '@' + fileName;
      tagSpan.dataset.path = filePath;
      tagSpan.title = filePath;
      range.insertNode(tagSpan);
      const newRange = document.createRange();
      newRange.setStartAfter(tagSpan);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    
    closeAutocomplete();
    promptInput.focus();
    autoGrowTextarea();
  }


  function closeAutocomplete() {
    isAutocompleteOpen = false;
    autocompleteDropdown.classList.add('hidden');
  }

  // Global Window-level Paste Event Listener for Images
  window.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
    if (!clipboardData) return;

    let imageAttached = false;

    // 1. Check files array first (handles files copied/pasted from file explorer)
    const files = clipboardData.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type && files[i].type.indexOf('image') !== -1) {
          const reader = new FileReader();
          reader.onload = function(event) {
            const base64 = event.target.result.split(',')[1];
            attachImage(base64);
          };
          reader.readAsDataURL(files[i]);
          imageAttached = true;
        }
      }
    }

    // 2. Fall back to items list (handles snipped screenshots and raw clipboard prints)
    const items = clipboardData.items;
    if (items && !imageAttached) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
              const base64 = event.target.result.split(',')[1];
              attachImage(base64);
            };
            reader.readAsDataURL(file);
            imageAttached = true;
          }
        }
      }
    }

    if (imageAttached) {
      e.preventDefault();
      promptInput.focus();
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

  function clearAllActiveAnimations() {
    // 1. Clear any running tool cards
    const runningCards = document.querySelectorAll('.tool-card.running');
    runningCards.forEach(card => {
      const toolName = card.getAttribute('data-tool') || 'tool';
      const target = card.getAttribute('data-target') || '';
      const parent = card.parentNode;
      if (parent) {
        const updatedCard = createToolCardDOM(toolName, 'error', target, 'Interrupted/Stopped', null, false, null, null);
        parent.replaceChild(updatedCard, card);
      }
    });
    currentToolCardElement = null;


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

    if (!text && attachedImages.length === 0) return;
    
    // If already sending, queue the message instead of discarding
    if (isSending) {
      messageQueue.push({
        text: text,
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
      chatHistory.push({ role: 'user', content: text });
      vscode.postMessage({
        type: 'saveHistory',
        history: chatHistory
      });
      
      promptInput.innerHTML = '';
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

    executeSend(text, attachedImages, undefined, userDisplayMessage);

    
    attachedImages = [];
    renderImageAttachments();
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
    

    function getFileIcon(filePath) {
      if (!filePath) return '';
      const filename = filePath.split(/[/\\]/).pop().toLowerCase();
      const ext = filePath.split('.').pop().toLowerCase();
      
      if (filename === 'implementation plan' || filename === 'implementation_plan.md' || filename === 'implementation_plan') {
        return '<span class="file-icon" style="color: #c084fc; margin-right: 4px;">📄</span>';
      }
      if (filename === 'task.md' || filename === 'task') {
        return '<span class="file-icon" style="color: #c084fc; margin-right: 4px;">📄</span>';
      }
      if (ext === 'html' || ext === 'htm') {
        return '<span class="file-icon html-icon" style="color: #f97316; font-weight: bold; font-family: monospace; margin-right: 4px;">&lt;/&gt;</span>';
      }
      if (ext === 'js' || ext === 'jsx') {
        return '<span class="file-icon js-icon" style="color: #eab308; font-weight: bold; font-family: monospace; margin-right: 4px;">JS</span>';
      }
      if (ext === 'ts' || ext === 'tsx') {
        return '<span class="file-icon ts-icon" style="color: #eab308; font-weight: bold; font-family: monospace; margin-right: 4px;">TS</span>';
      }
      if (ext === 'css') {
        return '<span class="file-icon css-icon" style="color: #3b82f6; font-weight: bold; font-family: monospace; margin-right: 4px;">#</span>';
      }
      return '<span class="file-icon" style="color: #a855f7; margin-right: 4px;">📄</span>';
    }

    let friendlyName = toolName;
    let iconHtml = '';
    let displayTarget = target || '';
    
    if (status === 'running') {
      friendlyName = 'Working...';
      displayTarget = '';
      iconHtml = '';
    } else if (toolName === 'read_file') {
      friendlyName = 'Explored';
      displayTarget = '1 file';
      iconHtml = '';
    } else if (toolName === 'list_dir') {
      friendlyName = 'Exploring';
      displayTarget = '1 folder';
      iconHtml = '';
    } else if (toolName === 'write_file' || toolName === 'patch_file' || toolName === 'multi_patch_file' || toolName === 'multipatch_file' || toolName === 'create_file') {
      friendlyName = 'Edited';
      displayTarget = (target || '').split(/[/\\]/).pop() || '';
      iconHtml = getFileIcon(target);
    } else if (toolName === 'delete_file') {
      friendlyName = 'Deleted';
      displayTarget = (target || '').split(/[/\\]/).pop() || '';
      iconHtml = getFileIcon(target);
    } else if (toolName === 'grep_search') {
      friendlyName = 'Searched';
      displayTarget = 'Workspace';
      iconHtml = '🔍';
    } else if (toolName === 'run_command') {
      friendlyName = 'Ran';
      displayTarget = 'Command';
      iconHtml = '💻';
    }

    function extractReadFileLines(resStr) {
      if (!resStr) return null;
      const lines = resStr.split('\n');
      const codeLines = [];
      let startLine = null;
      let endLine = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(\d+): (.*)/);
        if (match) {
          const lineNum = parseInt(match[1]);
          if (startLine === null) startLine = lineNum;
          endLine = lineNum;
          codeLines.push(match[2]);
        }
      }
      if (codeLines.length === 0) return null;
      return {
        code: codeLines.join('\n'),
        startLine,
        endLine
      };
    }

    let linesDiffHtml = '';
    if (result) {
      const match = result.match(/\(\+(\d+),\s*-(\d+)\)/);
      if (match) {
        const added = parseInt(match[1]);
        const removed = parseInt(match[2]);
        let parts = [];
        if (added > 0) parts.push(`<span class="lines-added">+${added}</span>`);
        if (removed > 0) parts.push(`<span class="lines-removed">-${removed}</span>`);
        if (parts.length > 0) {
          linesDiffHtml = `<span class="tool-lines-diff">${parts.join(' ')}</span>`;
        }
      } else if (toolName === 'read_file') {
        const readRangeMatch = result.match(/showing lines (\d+)-(\d+)/);
        if (readRangeMatch) {
          const linesRead = parseInt(readRangeMatch[2]) - parseInt(readRangeMatch[1]) + 1;
          linesDiffHtml = `<span class="tool-lines-diff" style="color:var(--color-primary-light);opacity:0.8;">read ${linesRead} lines</span>`;
        }
      }
    }

    const header = document.createElement('div');
    header.className = 'tool-card-header';
    if (status === 'running') {
      header.innerHTML = `
        <div class="tool-info">
          <span class="tool-name" style="color: var(--text-secondary); font-style: italic;">Working...</span>
        </div>
      `;
    } else {
      header.innerHTML = `
        <div class="tool-info">
          <span class="tool-name">${friendlyName}</span>
          ${iconHtml ? `<span class="tool-icon-wrapper">${iconHtml}</span>` : ''}
          <span class="tool-target" title="Click to open file in editor">${displayTarget}</span>
        </div>
        ${linesDiffHtml}
        <div class="tool-header-controls">
          <span class="tool-status-badge">${isReverted ? 'Reverted' : (status === 'success' ? 'Completed' : 'Failed')}</span>
          <span class="tool-expand-chevron">
            <svg class="chevron-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </span>
        </div>
      `;
    }
    card.appendChild(header);

    const targetSpan = header.querySelector('.tool-target');
    if (targetSpan && target && (toolName === 'create_file' || toolName === 'write_file' || toolName === 'read_file' || toolName === 'patch_file' || toolName === 'multi_patch_file' || toolName === 'multipatch_file')) {
      targetSpan.style.cursor = 'pointer';
      targetSpan.style.textDecoration = 'underline';
      targetSpan.style.color = '#a855f7';
      targetSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        let startLine = undefined;
        let endLine = undefined;
        if (toolName === 'read_file' && result) {
          const readRangeMatch = result.match(/showing lines (\d+)-(\d+)/);
          if (readRangeMatch) {
            startLine = parseInt(readRangeMatch[1]);
            endLine = parseInt(readRangeMatch[2]);
          }
        }
        vscode.postMessage({
          type: 'openFile',
          path: target,
          startLine: startLine,
          endLine: endLine
        });
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

      if (toolName === 'run_command') {
        const consoleStream = document.createElement('pre');
        consoleStream.className = 'terminal-console-stream';
        consoleStream.style.maxHeight = '150px';
        consoleStream.style.overflowY = 'auto';
        consoleStream.style.margin = '8px';
        consoleStream.style.padding = '6px';
        consoleStream.style.background = 'rgba(0, 0, 0, 0.4)';
        consoleStream.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        consoleStream.style.borderRadius = '4px';
        consoleStream.style.fontFamily = 'var(--font-mono)';
        consoleStream.style.fontSize = '10px';
        consoleStream.style.color = '#38bdf8';
        consoleStream.style.whiteSpace = 'pre-wrap';
        consoleStream.style.wordBreak = 'break-all';
        consoleStream.innerHTML = '<code></code>';
        card.appendChild(consoleStream);
      }
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

      const detailsContainer = document.createElement('div');
      detailsContainer.className = 'tool-details-container';
      
      // For read_file: show exactly the lines read with selected highlight
      if (toolName === 'read_file' && result) {
        const readInfo = extractReadFileLines(result);
        if (readInfo) {
          const header = document.createElement('div');
          header.className = 'tool-details-header';
          header.innerHTML = `📖 <span>File Content Read (Lines ${readInfo.startLine}-${readInfo.endLine})</span>`;
          detailsContainer.appendChild(header);
          
          const fileExt = target.split('.').pop() || 'txt';
          const escapedCode = escapeHtml(readInfo.code.trim());
          const codeBlock = document.createElement('div');
          codeBlock.className = 'code-block-wrapper';
          codeBlock.style.marginTop = '4px';
          codeBlock.innerHTML = `
            <div class="code-block-header">
              <span class="code-block-lang">${fileExt}</span>
              <div class="code-block-actions">
                <button class="code-action-btn copy-btn">Copy</button>
              </div>
            </div>
            <pre class="highlight-selected-lines"><code class="language-${fileExt}">${escapedCode}</code></pre>
          `;
          detailsContainer.appendChild(codeBlock);
          bindCodeBlockButtons(codeBlock);
          if (typeof applySyntaxHighlighting === 'function') {
            applySyntaxHighlighting(codeBlock);
          }
        }
      }
      
      // For grep_search: show search matches
      if (toolName === 'grep_search' && result) {
        const header = document.createElement('div');
        header.className = 'tool-details-header';
        header.innerHTML = '🔍 <span>Search Results</span>';
        detailsContainer.appendChild(header);
        
        const cleanResult = result.replace(/(?:Revert|Reverted) ID: \w+/, '').trim();
        const pre = document.createElement('pre');
        pre.className = 'tool-result-pre';
        pre.textContent = cleanResult;
        detailsContainer.appendChild(pre);
      }
      
      // For patch_file / multi_patch_file: show the diff in a highlighted code block
      if ((toolName === 'patch_file' || toolName === 'multi_patch_file' || toolName === 'multipatch_file') && result) {
        const header = document.createElement('div');
        header.className = 'tool-details-header';
        header.innerHTML = '✏️ <span>Patch Applied</span>';
        detailsContainer.appendChild(header);
        
        const cleanResult = result.replace(/(?:Revert|Reverted) ID: \w+/, '').trim();
        let diffText = cleanResult;
        
        if (code && (code.includes('<<<<') || code.includes('<file'))) {
          try {
            let output = '';
            const fileRegex = /<file\s+path="([^"]+)"\s*>([\s\S]*?)<\/file>/gi;
            let match;
            let hasFiles = false;
            
            const processBlocks = (content) => {
              let res = '';
              const blockRegex = /<<<<\n([\s\S]*?)\n====\n([\s\S]*?)\n>>>>/g;
              let bMatch;
              let lastIdx = 0;
              while ((bMatch = blockRegex.exec(content)) !== null) {
                const search = bMatch[1];
                const replace = bMatch[2];
                res += '@@\n';
                if (search) res += search.split('\n').map(l => '-' + l).join('\n') + '\n';
                if (replace) res += replace.split('\n').map(l => '+' + l).join('\n') + '\n';
                lastIdx = blockRegex.lastIndex;
              }
              return lastIdx === 0 ? content : res;
            };

            while ((match = fileRegex.exec(code)) !== null) {
              hasFiles = true;
              output += `--- ${match[1]}\n+++ ${match[1]}\n`;
              output += processBlocks(match[2]);
            }
            if (!hasFiles) {
              output = processBlocks(code);
            }
            diffText = output.trim();
          } catch (e) {
            diffText = code;
          }
        }
        
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block-wrapper';
        codeBlock.style.marginTop = '4px';
        codeBlock.innerHTML = `
          <div class="code-block-header">
            <span class="code-block-lang">diff</span>
            <div class="code-block-actions">
              <button class="code-action-btn copy-btn">Copy</button>
            </div>
          </div>
          <pre><code class="language-diff">${escapeHtml(diffText)}</code></pre>
        `;
        detailsContainer.appendChild(codeBlock);
        bindCodeBlockButtons(codeBlock);
        if (typeof applySyntaxHighlighting === 'function') {
          applySyntaxHighlighting(codeBlock);
        }
      }
      
      // For write_file / create_file: show what was written
      if ((toolName === 'write_file' || toolName === 'create_file') && code) {
        const header = document.createElement('div');
        header.className = 'tool-details-header';
        header.innerHTML = (toolName === 'create_file' ? '🆕' : '💾') + ' <span>File Content Written</span>';
        detailsContainer.appendChild(header);
        
        const fileExt = target.split('.').pop() || 'txt';
        const escapedCode = escapeHtml(code.trim());
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block-wrapper';
        codeBlock.style.marginTop = '4px';
        codeBlock.innerHTML = `
          <div class="code-block-header">
            <span class="code-block-lang">${fileExt}</span>
            <div class="code-block-actions">
              <button class="code-action-btn copy-btn">Copy</button>
            </div>
          </div>
          <pre><code class="language-${fileExt}">${escapedCode}</code></pre>
        `;
        detailsContainer.appendChild(codeBlock);
        bindCodeBlockButtons(codeBlock);
        if (typeof applySyntaxHighlighting === 'function') {
          applySyntaxHighlighting(codeBlock);
        }
      }
      
      // Default: show summary for other tools
      if (toolName !== 'read_file' && toolName !== 'grep_search' && toolName !== 'patch_file' && toolName !== 'multi_patch_file' && toolName !== 'multipatch_file' && toolName !== 'write_file' && toolName !== 'create_file') {
        if (toolName === 'list_dir') {
          const expandedRow = document.createElement('div');
          expandedRow.className = 'list-dir-expanded-row';
          expandedRow.style.display = 'flex';
          expandedRow.style.alignItems = 'center';
          expandedRow.style.gap = '6px';
          expandedRow.style.padding = '4px 0 4px 12px';
          expandedRow.style.fontSize = '11px';
          expandedRow.style.color = 'var(--text-primary)';
          
          expandedRow.innerHTML = `
            <span>Analyzed</span>
            <span style="color: #3b82f6;">📁</span>
            <span class="tool-target" style="font-weight: 700; cursor: pointer; text-decoration: underline; color: #a855f7;">${target}</span>
            <span style="margin-left: auto; color: var(--text-muted); opacity: 0.6; font-size: 9px; padding-right: 4px;">&gt;</span>
          `;
          
          const dirTarget = expandedRow.querySelector('.tool-target');
          if (dirTarget) {
            dirTarget.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({
                type: 'openFile',
                path: target
              });
            });
          }
          detailsContainer.appendChild(expandedRow);
        } else {
          const cleanResult = result ? result.replace(/(?:Revert|Reverted) ID: \w+/, '').trim() : '';
          const details = document.createElement('div');
          details.className = 'tool-details';
          if (cleanResult) {
            details.innerHTML = parseMarkdown(cleanResult);
          } else {
            details.textContent = status === 'success' ? 'Operation succeeded' : 'Operation failed';
          }
          detailsContainer.appendChild(details);
        }
      }
      
      // If there's a result for tools that also have code, show additional result text
      if ((toolName === 'read_file' || toolName === 'write_file' || toolName === 'create_file') && result) {
        const cleanResult = result.replace(/(?:Revert|Reverted) ID: \w+/, '').trim();
        if (cleanResult && cleanResult !== 'Operation succeeded' && toolName !== 'read_file') {
          const extraInfo = document.createElement('div');
          extraInfo.className = 'tool-details-extra';
          extraInfo.textContent = cleanResult;
          detailsContainer.appendChild(extraInfo);
        }
      }
      
      body.appendChild(detailsContainer);
      bodyWrapper.appendChild(body);
      card.appendChild(bodyWrapper);

      // Handle card toggle interactions
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        const isExpanding = !card.classList.contains('expanded');
        card.classList.toggle('expanded');
        if (isExpanding && target && (toolName === 'create_file' || toolName === 'write_file' || toolName === 'read_file' || toolName === 'patch_file' || toolName === 'multi_patch_file' || toolName === 'multipatch_file')) {
          let startLine = undefined;
          let endLine = undefined;
          if (toolName === 'read_file' && result) {
            const readRangeMatch = result.match(/showing lines (\d+)-(\d+)/);
            if (readRangeMatch) {
              startLine = parseInt(readRangeMatch[1]);
              endLine = parseInt(readRangeMatch[2]);
            }
          }
          vscode.postMessage({
            type: 'openFile',
            path: target,
            startLine: startLine,
            endLine: endLine
          });
        }
      });
    }

    return card;
  }

  function placeCardInPlaceholder(card, toolName, target, container = chatMessages) {
    const placeholders = container.querySelectorAll('.tool-card-placeholder');
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
      container.appendChild(card);
    }
  }

  function appendToolCardFromHistory(text, container = chatMessages) {
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
        placeCardInPlaceholder(card, toolName, target, container);
      }
    });
  }



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
        if (approvalCommandText) {
          approvalCommandText.textContent = command;
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
        activeFilePath = message.filePath || '';
        if (file) {
          contextDot.classList.remove('offline');
          contextFileName.textContent = `Context: ${file}`;
          if (genTestsBtn) genTestsBtn.classList.remove('hidden');
          if (genDocsBtn) genDocsBtn.classList.remove('hidden');
        } else {
          contextDot.classList.add('offline');
          contextFileName.textContent = 'No active file open';
          if (genTestsBtn) genTestsBtn.classList.add('hidden');
          if (genDocsBtn) genDocsBtn.classList.add('hidden');
        }
        break;
      }

      case 'activeReviewsChanged': {
        const count = message.count;
        if (acceptAllBtn) {
          if (count > 0) {
            acceptAllBtn.textContent = `✨ Accept All (${count})`;
            acceptAllBtn.classList.remove('hidden');
            if (openMultiDiffBtn) openMultiDiffBtn.classList.remove('hidden');
          } else {
            acceptAllBtn.classList.add('hidden');
            if (openMultiDiffBtn) openMultiDiffBtn.classList.add('hidden');
            if (multiDiffDrawer) multiDiffDrawer.classList.add('collapsed');
          }
        }
        break;
      }

      case 'promptTemplatesList': {
        promptTemplates = message.templates || [];
        renderTemplatesList();
        break;
      }

      case 'activeReviewsList': {
        renderMultiDiffList(message.reviews);
        break;
      }

      case 'checkpointsList': {
        renderCheckpoints(message.checkpoints);
        break;
      }

      case 'terminalStream': {
        const { terminalName, data } = message;
        const activeTerminalCard = document.querySelector('.tool-card.running[data-tool="run_command"]');
        if (activeTerminalCard) {
          const consoleStream = activeTerminalCard.querySelector('.terminal-console-stream code');
          if (consoleStream) {
            const cleanData = escapeHtml(data);
            consoleStream.innerHTML += cleanData;
            const pre = activeTerminalCard.querySelector('.terminal-console-stream');
            if (pre) {
              pre.scrollTop = pre.scrollHeight;
            }
          }
        }
        break;
      }

      case 'prefillPrompt': {
        promptInput.textContent = message.text;
        promptInput.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(promptInput);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        break;
      }

      case 'tokenUsage': {
        const { input, output, total, cost } = message.usage;
        const dash = document.getElementById('usage-dashboard');
        const tokensEl = document.getElementById('usage-tokens');
        const costEl = document.getElementById('usage-cost');
        const progressBar = document.getElementById('token-progress-bar');
        if (dash && tokensEl && costEl) {
          tokensEl.textContent = total.toLocaleString();
          costEl.textContent = `$${cost.toFixed(4)}`;
          if (progressBar) {
            const maxTokens = activeProvider === 'deepseek' ? 64000 : 16384;
            const pct = Math.min(100, (total / maxTokens) * 100);
            progressBar.style.width = pct + '%';
            progressBar.title = `Context utilization: ${pct.toFixed(1)}%`;
          }
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
        
        renderVisibleHistory(isEditingHistory);
        updateStickyUserMessage();
        isEditingHistory = false;
        break;
      }

      case 'updateChatSessions': {
        allSessions = message.sessions || [];
        activeSessionId = message.activeSessionId;
        renderChatSessions();
        break;
      }
      
      case 'searchSessionsResult': {
        if (message.query === searchQuery) {
          searchMatchedIds = message.matchingIds;
          renderChatSessions();
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
    } else if (tool === 'multi_patch_file' || tool === 'multipatch_file') {
      friendlyName = 'Multi Patching File';
      iconHtml = '📑';
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
  function parseMarkdown(text, isPlanApproved = false) {
    if (!text) return '';
    let cleanText = text;

    // Intercept and wrap <architecture_routing> block in a gorgeous card, avoiding recursive infinite loops
    let hasRouting = false;
    let routingContent = '';
    const routingRegex = /<architecture_routing(?:\s+[^>]*?)?>([\s\S]*?)<\/architecture_routing>/gi;
    cleanText = cleanText.replace(routingRegex, (match, inner) => {
      hasRouting = true;
      routingContent = inner.trim();
      return `%%%ROUTING_PLACEHOLDER%%%`;
    });

    let streamingRouting = false;
    const routingOpenMatch = /<architecture_routing(?:\s+[^>]*?)?>/i.exec(cleanText);
    if (routingOpenMatch && !cleanText.toLowerCase().includes('</architecture_routing>')) {
      const openIdx = routingOpenMatch.index;
      routingContent = cleanText.substring(openIdx + routingOpenMatch[0].length).trim();
      cleanText = cleanText.substring(0, openIdx) + `%%%STREAMING_ROUTING_PLACEHOLDER%%%`;
      streamingRouting = true;
    }

    // Intercept and wrap <implementation_plan> block in a gorgeous card, avoiding recursive infinite loops
    let hasPlan = false;
    let planContent = '';
    const planRegex = /<implementation_plan(?:\s+[^>]*?)?>([\s\S]*?)<\/implementation_plan>/gi;
    cleanText = cleanText.replace(planRegex, (match, inner) => {
      hasPlan = true;
      planContent = inner.trim();
      return `%%%PLAN_PLACEHOLDER%%%`;
    });

    // Also handle incomplete streaming tag
    let streamingPlan = false;
    const planOpenMatch = /<implementation_plan(?:\s+[^>]*?)?>/i.exec(cleanText);
    if (planOpenMatch && !cleanText.toLowerCase().includes('</implementation_plan>')) {
      const openIdx = planOpenMatch.index;
      planContent = cleanText.substring(openIdx + planOpenMatch[0].length).trim();
      cleanText = cleanText.substring(0, openIdx) + `%%%STREAMING_PLAN_PLACEHOLDER%%%`;
      streamingPlan = true;
    }

    // Intercept and wrap <walkthrough> block in a gorgeous card, avoiding recursive infinite loops
    let hasWalkthrough = false;
    let walkthroughContent = '';
    const walkthroughRegex = /<walkthrough(?:\s+[^>]*?)?>([\s\S]*?)<\/walkthrough>/gi;
    cleanText = cleanText.replace(walkthroughRegex, (match, inner) => {
      hasWalkthrough = true;
      walkthroughContent = inner.trim();
      return `%%%WALKTHROUGH_PLACEHOLDER%%%`;
    });

    // Also handle incomplete streaming tag for walkthrough
    let streamingWalkthrough = false;
    const walkthroughOpenMatch = /<walkthrough(?:\s+[^>]*?)?>/i.exec(cleanText);
    if (walkthroughOpenMatch && !cleanText.toLowerCase().includes('</walkthrough>')) {
      const openIdx = walkthroughOpenMatch.index;
      walkthroughContent = cleanText.substring(openIdx + walkthroughOpenMatch[0].length).trim();
      cleanText = cleanText.substring(0, openIdx) + `%%%STREAMING_WALKTHROUGH_PLACEHOLDER%%%`;
      streamingWalkthrough = true;
    }
    
    // Clean block tools: create_file, write_file, patch_file, multi_patch_file, send_terminal_input, rename_file, git_commit
    const blockTools = ['create_file', 'write_file', 'patch_file', 'multi_patch_file', 'multipatch_file', 'send_terminal_input', 'rename_file', 'git_commit'];
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
          if (tool === 'create_file' || tool === 'write_file' || tool === 'patch_file' || tool === 'multi_patch_file' || tool === 'multipatch_file' || tool === 'rename_file' || tool === 'git_commit') {
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
    const selfClosingTools = [
      'read_file', 'list_dir', 'grep_search', 'browser_navigate', 'browser_click', 'browser_type', 'browser_screenshot',
      'run_command', 'close_terminal', 'read_terminal', 'list_terminals', 'delete_file', 'git_status', 'git_diff', 'git_add',
      'symbol_search', 'rename_symbol', 'wait',
      'analyze_project', 'analyze_dependencies', 'analyze_complexity', 'analyze_coverage', 'analyze_dead_code', 'analyze_impact', 'graphify'
    ];
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
      // Strip any closing tag for this self-closing tool
      const closeTagPattern = new RegExp(`</${tool}\\s*>`, 'gi');
      cleanText = cleanText.replace(closeTagPattern, '');
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
          let escapedCode;
          let isHighlighted = false;
          if (codeLang && codeLang !== 'plaintext') {
            escapedCode = highlightCode(codeContent, codeLang);
            isHighlighted = true;
          } else {
            escapedCode = escapeHtml(codeContent);
          }
          html += `
            <div class="code-block-wrapper">
              <div class="code-block-header">
                <span class="code-block-lang">${codeLang || 'code'}</span>
                <div class="code-block-actions">
                  <button class="code-action-btn copy-btn">Copy</button>
                </div>
              </div>
              <pre><code class="language-${codeLang}"${isHighlighted ? ' data-highlighted="true"' : ''}>${escapedCode}</code></pre>
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
            <span class="streaming-label" style="font-size: 9px; opacity: 0.5; color: #38bdf8;">Generating...</span>
          </div>
          <pre><code>${escapedCode}</code></pre>
        </div>
      `;
    }

    html = html.replace(/<p>%%%STREAMING_TOOL_PLACEHOLDER::(.+?)::(.*?)::([\s\S]*?)%%%<\/p>/g, (match, tool, target, code) => renderStreamingCard(tool, target, code));
    html = html.replace(/%%%STREAMING_TOOL_PLACEHOLDER::(.+?)::(.*?)::([\s\S]*?)%%%/g, (match, tool, target, code) => renderStreamingCard(tool, target, code));

    html = html.replace(/<p>%%%TOOL_PLACEHOLDER::(.+?)::(.*?)%%%<\/p>/g, '<div class="tool-card-placeholder" data-tool="$1" data-target="$2"></div>');
    html = html.replace(/%%%TOOL_PLACEHOLDER::(.+?)::(.*?)%%%/g, '<div class="tool-card-placeholder" data-tool="$1" data-target="$2"></div>');

    // Replace architecture routing placeholders
    if (hasRouting) {
      const formattedRouting = formatRoutingContent(routingContent);
      const cardHtml = `
        <div class="architecture-routing-card" style="background: rgba(168, 85, 247, 0.04); border: 1.5px solid rgba(168, 85, 247, 0.2); border-radius: 8px; padding: 12px 14px; margin: 10px 0; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25); position: relative; overflow: hidden; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #a855f7; font-size: 11px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.7px; border-bottom: 1px solid rgba(168, 85, 247, 0.25); padding-bottom: 6px;">
            <span>🌐</span>
            <span>Architecture Scope Routing Lock</span>
          </div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.95); line-height: 1.6; font-family: var(--font-system);">
            ${formattedRouting}
          </div>
        </div>
      `;
      html = html.replace('<p>%%%ROUTING_PLACEHOLDER%%%</p>', cardHtml);
      html = html.replace('%%%ROUTING_PLACEHOLDER%%%', cardHtml);
    }

    if (streamingRouting) {
      const formattedRouting = formatRoutingContent(routingContent);
      const cardHtml = `
        <div class="architecture-routing-card streaming" style="background: rgba(168, 85, 247, 0.02); border: 1.2px dashed rgba(168, 85, 247, 0.2); border-radius: 8px; padding: 12px 14px; margin: 10px 0; position: relative;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed rgba(168, 85, 247, 0.15); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #a855f7; font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px;">
              <span>🌐</span>
              <span>Locking Search Scope...</span>
            </div>
          </div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.7); line-height: 1.6; font-family: var(--font-system);">
            ${formattedRouting}
          </div>
        </div>
      `;
      html = html.replace('<p>%%%STREAMING_ROUTING_PLACEHOLDER%%%</p>', cardHtml);
      html = html.replace('%%%STREAMING_ROUTING_PLACEHOLDER%%%', cardHtml);
    }

    // Replace planning cards placeholders
    if (hasPlan) {
      const innerHtml = parseMarkdown(planContent, isPlanApproved);
      const approveBtnHtml = isPlanApproved ? `
        <span style="font-size: 11px; font-weight: 600; color: #10b981; display: flex; align-items: center; gap: 4px;">Approved &amp; Executing ⚡</span>
      ` : `
        <button class="approve-plan-btn" style="background: linear-gradient(135deg, #2563eb, #38bdf8); border: none; border-radius: var(--radius-sm, 6px); color: #fff; font-family: var(--font-system); font-size: 11px; font-weight: 600; padding: 6px 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25); transition: transform 0.2s var(--ease-out);">
          <span>✅</span> Approve &amp; Execute
        </button>
      `;
      const cardHtml = `
        <div class="implementation-plan-card" style="background: rgba(14, 165, 233, 0.04); border: 1.5px solid rgba(14, 165, 233, 0.15); border-radius: 8px; padding: 12px 14px; margin: 10px 0; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35); position: relative; overflow: hidden; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
          <div class="plan-card-glow" style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(14, 165, 233, 0.08) 0%, transparent 70%); pointer-events: none; z-index: 1;"></div>
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #38bdf8; font-size: 11px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.7px; z-index: 2; position: relative; border-bottom: 1px solid rgba(14, 165, 233, 0.2); padding-bottom: 6px;">
            <span>📋</span>
            <span>Proposed Implementation Plan</span>
          </div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.9); line-height: 1.6; z-index: 2; position: relative;" class="plan-inner-content">
            ${innerHtml}
          </div>
          <div style="margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; z-index: 2; position: relative;">
            ${approveBtnHtml}
          </div>
        </div>
      `;
      html = html.replace('<p>%%%PLAN_PLACEHOLDER%%%</p>', cardHtml);
      html = html.replace('%%%PLAN_PLACEHOLDER%%%', cardHtml);
    }

    if (streamingPlan) {
      const innerHtml = parseMarkdown(planContent);
      const cardHtml = `
        <div class="implementation-plan-card streaming" style="background: rgba(14, 165, 233, 0.02); border: 1.2px dashed rgba(14, 165, 233, 0.25); border-radius: 8px; padding: 12px 14px; margin: 10px 0; position: relative; overflow: hidden; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed rgba(14, 165, 233, 0.15); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #38bdf8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px;">
              <span>📋</span>
              <span>Drafting Plan...</span>
            </div>
            <span class="streaming-label" style="font-size: 9px; opacity: 0.6; color: #38bdf8; font-weight: 600; animation: pulse 1.5s infinite alternate;">Generating...</span>
          </div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.65); line-height: 1.6;" class="plan-inner-content">
            ${innerHtml}
          </div>
        </div>
      `;
      html = html.replace('<p>%%%STREAMING_PLAN_PLACEHOLDER%%%</p>', cardHtml);
      html = html.replace('%%%STREAMING_PLAN_PLACEHOLDER%%%', cardHtml);
    }

    // Replace walkthrough cards placeholders
    if (hasWalkthrough) {
      const innerHtml = parseMarkdown(walkthroughContent, isPlanApproved);
      const cardHtml = `
        <div class="walkthrough-card" style="background: rgba(16, 185, 129, 0.04); border: 1.5px solid rgba(16, 185, 129, 0.15); border-radius: 8px; padding: 12px 14px; margin: 10px 0; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35); position: relative; overflow: hidden; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
          <div class="walkthrough-card-glow" style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%); pointer-events: none; z-index: 1;"></div>
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #34d399; font-size: 11px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.7px; z-index: 2; position: relative; border-bottom: 1px solid rgba(16, 185, 129, 0.2); padding-bottom: 6px;">
            <span>📖</span>
            <span>Task Walkthrough &amp; Verification</span>
          </div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.9); line-height: 1.6; z-index: 2; position: relative;" class="walkthrough-inner-content">
            ${innerHtml}
          </div>
        </div>
      `;
      html = html.replace('<p>%%%WALKTHROUGH_PLACEHOLDER%%%</p>', cardHtml);
      html = html.replace('%%%WALKTHROUGH_PLACEHOLDER%%%', cardHtml);
    }

    if (streamingWalkthrough) {
      const innerHtml = parseMarkdown(walkthroughContent);
      const cardHtml = `
        <div class="walkthrough-card streaming" style="background: rgba(16, 185, 129, 0.02); border: 1.2px dashed rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 12px 14px; margin: 10px 0; position: relative; overflow: hidden; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed rgba(16, 185, 129, 0.15); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #34d399; font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px;">
              <span>📖</span>
              <span>Summarizing Changes...</span>
            </div>
            <span class="streaming-label" style="font-size: 9px; opacity: 0.6; color: #34d399; font-weight: 600; animation: pulse 1.5s infinite alternate;">Generating...</span>
          </div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.65); line-height: 1.6;" class="walkthrough-inner-content">
            ${innerHtml}
          </div>
        </div>
      `;
      html = html.replace('<p>%%%STREAMING_WALKTHROUGH_PLACEHOLDER%%%</p>', cardHtml);
      html = html.replace('%%%STREAMING_WALKTHROUGH_PLACEHOLDER%%%', cardHtml);
    }


    // Convert [path/to/file.ext] markers into styled, clickable file chips for history messages
    html = html.replace(/\[([A-Za-z0-9_\-\\\/\.]+\.[A-Za-z0-9]{1,10})\]/g, function(match, filePath) {
      var normalized = filePath.replace(/\\/g, '/');
      var fileName = normalized.split('/').pop();
      var escapedPath = escapeHtml(filePath);
      var escapedFileName = escapeHtml(fileName);
      return '<span class="history-file-tag" data-file-path="' + escapedPath + '" title="' + escapedPath + ' (click to open)">&#128196; ' + escapedFileName + '</span>';
    });
    return html.replace(/<\/ul>\s*<ul>/g, '').replace(/<\/ol>\s*<ol>/g, '');
  }

  function formatRoutingContent(raw) {
    const lines = raw.split('\n');
    let html = '';
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(':').trim();
        
        let labelColor = '#a855f7';
        let valStyle = '';
        if (key === 'SEARCH_SCOPE_ALLOWED') {
          labelColor = '#10b981';
          valStyle = 'background: rgba(16, 185, 129, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.2); font-family: monospace; font-size: 10px;';
        } else if (key === 'SEARCH_SCOPE_BLOCKED') {
          labelColor = '#ef4444';
          valStyle = 'background: rgba(239, 68, 68, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.2); font-family: monospace; font-size: 10px;';
        } else if (key === 'FEATURE_OWNER') {
          labelColor = '#38bdf8';
          valStyle = 'font-weight: bold; color: #38bdf8;';
        } else if (key === 'JUSTIFICATION') {
          labelColor = '#eab308';
          valStyle = 'font-style: italic; color: rgba(255,255,255,0.8);';
        }
        
        html += `<div style="margin-bottom: 6px;"><span style="color: ${labelColor}; font-weight: 600; font-size: 10px; text-transform: uppercase;">${escapeHtml(key)}:</span> <span style="${valStyle}">${escapeHtml(val)}</span></div>`;
      }
    }
    return html;
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

        const onSuccess = () => {
          const oldText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.color = '#22c55e';
          setTimeout(() => {
            btn.textContent = oldText;
            btn.style.color = '';
          }, 1500);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(onSuccess, () => {
            vscode.postMessage({ type: 'copyToClipboard', text: textToCopy });
            onSuccess();
          });
        } else {
          vscode.postMessage({ type: 'copyToClipboard', text: textToCopy });
          onSuccess();
        }
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
  let isRebuildingDOM = false;
  let isEditingHistory = false;

  function scrollChatToBottom(force = false) {
    const container = chatScrollContainer || chatMessages;
    if (force || userIsAtBottom) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
        userIsAtBottom = true;
        isRebuildingDOM = false;
      }, 50);
    } else {
      isRebuildingDOM = false;
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

  function renderChatSessions() {
    sessionsList.innerHTML = '';
    
    const filtered = allSessions.filter(s => {
      if (!searchQuery) return true;
      if (searchMatchedIds) {
        return searchMatchedIds.includes(s.id);
      }
      return (s.title && s.title.toLowerCase().includes(searchQuery)) || s.id.toLowerCase().includes(searchQuery);
    });
    
    if (filtered.length > 0) {
      filtered.forEach((session) => {
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
      sessionsList.innerHTML = '<div class="no-sessions">No sessions found</div>';
    }
  }

  // ==========================================================================
  // Infinite Scroll & Avatar State Manager Implementations
  // ==========================================================================
  let renderedLimit = 15;



  function renderVisibleHistory(preserveScroll = false) {
    isRebuildingDOM = true;
    const container = chatScrollContainer || chatMessages;
    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;

    // Hide the container during rebuild to prevent flash/scroll jump from empty state
    container.style.visibility = 'hidden';
    
    if (chatHistory.length === 0) {
      chatMessages.innerHTML = '';
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
      updateStickyUserMessage();
      container.style.visibility = '';
      isRebuildingDOM = false;
      return;
    }

    if (welcomeCard) {
      welcomeCard.style.display = 'none';
    }

    const totalMessages = chatHistory.length;
    const startIdx = Math.max(0, totalMessages - renderedLimit);
    
    // Find the last user message and check if it is outside the visible slice
    let lastUserMsg = null;
    let lastUserMsgIdx = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'user') {
        lastUserMsg = chatHistory[i];
        lastUserMsgIdx = i;
        break;
      }
    }

    // Build new content in a document fragment to avoid flash of empty container
    const fragment = document.createDocumentFragment();
    
    // Prepend the load more trigger if we have older logs
    if (startIdx > 0) {
      const loadTrigger = document.createElement('div');
      loadTrigger.className = 'history-loading-trigger';
      loadTrigger.innerHTML = '<span>💬</span> Load older messages...';
      loadTrigger.addEventListener('click', () => {
        loadMoreHistory();
      });
      fragment.appendChild(loadTrigger);
    }

    // Prepend the last user message as a sticky reference if it was sliced out
    if (lastUserMsgIdx !== -1 && lastUserMsgIdx < startIdx && lastUserMsg) {
      appendMessageBubble(lastUserMsg.role, lastUserMsg.content, lastUserMsg.images, fragment);
    }

    // Append visible messages
    const visibleSlice = chatHistory.slice(startIdx);
    visibleSlice.forEach((msg) => {
      appendMessageBubble(msg.role, msg.content, msg.images, fragment);
    });

    // Atomic swap: replace all children in one paint cycle
    chatMessages.replaceChildren(fragment);

    // Restore visibility now that all content is loaded
    container.style.visibility = '';

    if (preserveScroll) {
      // If user was at the top, stay at the top after loading older messages
      if (oldScrollTop <= 5) {
        container.scrollTop = 0;
      } else {
        // Maintain relative scroll position so content doesn't jump
        container.scrollTop = container.scrollHeight - oldScrollHeight + oldScrollTop;
      }
      setTimeout(() => {
        isRebuildingDOM = false;
      }, 80);
    } else {
      scrollChatToBottom(true);
    }

    // Update sticky user message status
    updateStickyUserMessage();
  }

  function loadMoreHistory() {
    if (chatHistory.length > renderedLimit) {
      renderedLimit += 15;
      renderVisibleHistory(true);
    }
  }

  // Sticky bar visibility only (no auto-load on scroll)
  if (chatScrollContainer) {
    chatScrollContainer.addEventListener('scroll', () => {
      if (isRebuildingDOM) return;
      const threshold = 15;
      userIsAtBottom = (chatScrollContainer.scrollHeight - chatScrollContainer.scrollTop - chatScrollContainer.clientHeight) <= threshold;
      updateStickyVisibility();
    }, { passive: true });
  }

  // Buddy Avatar - Interactive Entertaining Cute Vector Mascot Expressor
  const buddyContainer = document.getElementById('buddy-container');
  const buddyEyes = document.getElementById('buddy-eyes');
  const buddyTooltip = document.getElementById('buddy-tooltip');
  const buddyCheeks = document.getElementById('buddy-cheeks');

  let avatarState = 'idle';
  let idleInterval = null;
  let errorResetTimeout = null;

  // Multi-expression dynamic SVG definitions
  const FACES = {
    idle: [
      `<!-- happy open eyes -->
       <circle cx="6.5" cy="10" r="2.5" />
       <circle cx="17.5" cy="10" r="2.5" />
       <path d="M9.5 14 Q12 16.5 14.5 14" stroke-width="2" stroke-linecap="round" fill="none" />`,
      `<!-- happy blink -->
       <path d="M4.5 10 Q6.5 8 8.5 10 M15.5 10 Q17.5 8 19.5 10" stroke-width="2" stroke-linecap="round" fill="none" />
       <path d="M9.5 14.5 Q12 16.5 14.5 14.5" stroke-width="2" stroke-linecap="round" fill="none" />`,
      `<!-- happy wink -->
       <circle cx="6.5" cy="10" r="2.5" />
       <path d="M15.5 10 Q17.5 8 19.5 10" stroke-width="2" stroke-linecap="round" fill="none" />
       <path d="M9.5 14 Q12 16.5 14.5 14" stroke-width="2" stroke-linecap="round" fill="none" />`
    ],
    thinking: [
      `<!-- thinking / curious -->
       <ellipse cx="6.5" cy="9.5" rx="2.5" ry="1.8" />
       <ellipse cx="17.5" cy="9.5" rx="2.5" ry="1.8" />
       <path d="M5 6.5 Q7 5.5 9 6.5 M15 6.5 Q17 5.5 19 6.5" stroke-width="1.8" stroke-linecap="round" fill="none" />
       <path d="M10.5 14.5 Q12 13 13.5 14.5" stroke-width="2" stroke-linecap="round" fill="none" />`
    ],
    coding: [
      `<!-- coding cute squint -->
       <path d="M4.5 9 L8.5 11 M19.5 9 L15.5 11" stroke-width="2.2" stroke-linecap="round" />
       <path d="M9.5 14.5 Q12 17 14.5 14.5" stroke-width="2" stroke-linecap="round" fill="none" />`
    ],
    tool_calling: [
      `<!-- focus scanning gear eyes -->
       <circle cx="6.5" cy="10" r="2.5" stroke-width="1.5" stroke-dasharray="3,1" fill="none" />
       <circle cx="17.5" cy="10" r="2.5" stroke-width="1.5" stroke-dasharray="3,1" fill="none" />
       <path d="M9 14.5 Q12 17 15 14.5" stroke-width="2" stroke-linecap="round" fill="none" />`
    ],
    error: [
      `<!-- dizzy sad but cute -->
       <path d="M5 8 L8 11 M8 8 L5 11 M16 8 L19 11 M19 8 L16 11" stroke-width="1.8" stroke-linecap="round" />
       <path d="M10 15 Q12 13.5 14 15" stroke-width="2" stroke-linecap="round" fill="none" />`
    ],
    click: [
      `<!-- heart eyes! -->
       <path d="M4 9 Q4 7 5.5 7 Q6.5 7 7.5 8.2 Q8.5 7 9.5 7 Q11 7 11 9 Q11 11 7.5 13.5 Q4 11 4 9 Z" fill="#f43f5e" stroke="none" />
       <path d="M13 9 Q13 7 14.5 7 Q15.5 7 16.5 8.2 Q17.5 7 18.5 7 Q20 7 20 9 Q20 11 16.5 13.5 Q13 11 13 9 Z" fill="#f43f5e" stroke="none" />
       <path d="M10 15.5 Q12 17.5 14 15.5" stroke-width="2" stroke-linecap="round" fill="none" />`
    ],
    celebrate: [
      `<!-- starry eyes and happy mouth -->
       <path d="M6.5 7 L7.5 9.5 L10 10 L7.5 10.5 L6.5 13 L5.5 10.5 L3 10 L5.5 9.5 Z" fill="#fbbf24" stroke="none" />
       <path d="M17.5 7 L18.5 9.5 L21 10 L18.5 10.5 L17.5 13 L16.5 10.5 L14 10 L16.5 9.5 Z" fill="#fbbf24" stroke="none" />
       <path d="M9.5 14.5 Q12 18 14.5 14.5 Z" fill="#fbbf24" stroke="none" />`
    ]
  };

  const FACE_COLORS = {
    idle: '#22d3ee', // brighter glowing cyan
    thinking: '#38bdf8',
    coding: '#34d399', // brighter green
    tool_calling: '#a78bfa', // beautiful glowing purple
    error: '#fb7185', // soft bright rose
    click: '#fb7185',
    celebrate: '#fbbf24' // warm glowing gold
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

    // Render the beautiful SVG path
    if (buddyEyes) {
      const list = FACES[state] || FACES.idle;
      const selectedFace = list[Math.floor(Math.random() * list.length)];
      buddyEyes.innerHTML = selectedFace;
      
      // Update color stroke and fills matching state
      const color = FACE_COLORS[state] || FACE_COLORS.idle;
      buddyEyes.setAttribute('fill', color);
      // Make sure the strokes in the face also use the matching state color
      const paths = buddyEyes.querySelectorAll('path');
      paths.forEach(p => {
        if (p.getAttribute('stroke') !== 'none') {
          p.setAttribute('stroke', color);
        }
      });

      // Update cheeks matching the mood/state
      if (buddyCheeks) {
        if (state === 'error') {
          buddyCheeks.setAttribute('fill', '#a78bfa'); // purple embarrassed cheeks
          buddyCheeks.setAttribute('opacity', '0.6');
        } else if (state === 'celebrate' || state === 'click') {
          buddyCheeks.setAttribute('fill', '#f43f5e'); // bright red cheeks
          buddyCheeks.setAttribute('opacity', '0.7');
        } else if (state === 'thinking') {
          buddyCheeks.setAttribute('fill', '#38bdf8'); // cyan cheeks
          buddyCheeks.setAttribute('opacity', '0.3');
        } else {
          buddyCheeks.setAttribute('fill', '#f472b6'); // default soft pink cheeks
          buddyCheeks.setAttribute('opacity', '0.45');
        }
      }
    }

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
        
        // Idle animation / blink / wink change
        if (buddyEyes) {
          const list = FACES.idle;
          const selectedFace = list[Math.floor(Math.random() * list.length)];
          buddyEyes.innerHTML = selectedFace;
          
          const color = FACE_COLORS.idle;
          buddyEyes.setAttribute('fill', color);
          const paths = buddyEyes.querySelectorAll('path');
          paths.forEach(p => {
            if (p.getAttribute('stroke') !== 'none') {
              p.setAttribute('stroke', color);
            }
          });
        }

        if (chance < 0.35) {
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
    }, 6000);
  }

  function triggerParticleExplosion() {
    const canvas = document.getElementById('buddy-particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;
    
    const particles = [];
    const colors = ['#38bdf8', '#a855f7', '#10b981', '#f43f5e', '#fbbf24'];
    
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: 64,
        y: 64,
        angle: Math.random() * Math.PI * 2,
        speed: 1 + Math.random() * 3,
        radius: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.015 + Math.random() * 0.02
      });
    }
    
    function animate() {
      ctx.clearRect(0, 0, 128, 128);
      let alive = false;
      
      particles.forEach(p => {
        if (p.alpha > 0) {
          p.x += Math.cos(p.angle) * p.speed;
          p.y += Math.sin(p.angle) * p.speed + 0.1;
          p.alpha -= p.decay;
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.fill();
          
          alive = true;
        }
      });
      
      if (alive) {
        requestAnimationFrame(animate);
      }
    }
    animate();
  }

  // Hook up premium interactive winking, 3D rotations, and dev jokes/quotes on click
  const CLICK_EASTER_EGGS = [
    "Why do programmers wear glasses?\nBecause they can't C#! 🤓",
    "There are 10 types of people:\nthose who understand binary, and those who don't. 🔢",
    "A SQL query walks into a bar,\nwalks up to two tables and asks:\n'Can I join you?' 📊",
    "How many programmers does it take to change a light bulb?\nNone, it's a hardware problem! 💡",
    "['hip', 'hip']\n(hip hip array!) 🎁",
    "No place like localhost\n(127.0.0.1) 🏠",
    "To understand recursion, you must first understand recursion. 🔄",
    "Why did the programmer quit his job?\nBecause he didn't get arrays. 💸",
    "Hardware: The parts of a computer system that you can kick. 🖥️",
    "An optimist says the glass is half full.\nA pessimist says it's half empty.\nA programmer says the glass is twice as large as necessary. 🥛",
    "\"Talk is cheap. Show me the code.\"\n— Linus Torvalds 🐧",
    "\"First, solve the problem. Then, write the code.\"\n— John Johnson 🧩",
    "\"Clean code always looks like it was written by someone who cares.\"\n— Michael Feathers ✨",
    "\"Coding is the closest thing we have to magic!\" 🔮",
    "\"Simplicity is the ultimate sophistication.\"\n— Leonardo da Vinci 🎨",
    "\"Before software can be reusable it first has to be reusable.\"\n— Ralph Johnson ⚙️",
    "Hey! You clicked me! Let's build something awesome today! 🚀",
    "My circuits are fully charged and ready to write some clean code! ⚡",
    "Need a code audit, a debug session, or a coffee break? I've got your back! ☕"
  ];

  if (buddyContainer) {
    buddyContainer.addEventListener('click', () => {
      const current = avatarState;
      
      // Dynamic 3D rotation, bounce and pulse scale
      buddyContainer.style.transform = 'translateY(-10px) scale(1.3) rotate(360deg)';
      buddyContainer.style.transition = 'transform 0.7s cubic-bezier(0.34, 1.6, 0.64, 1)';
      
      // Set happy winking face
      if (buddyEyes) {
        buddyEyes.innerHTML = FACES.click[0];
        const color = FACE_COLORS.click;
        buddyEyes.setAttribute('fill', color);
        const paths = buddyEyes.querySelectorAll('path');
        paths.forEach(p => {
          if (p.getAttribute('stroke') !== 'none') {
            p.setAttribute('stroke', color);
          }
        });
      }
      
      // Select a random fun developer quote or joke
      const randomEgg = CLICK_EASTER_EGGS[Math.floor(Math.random() * CLICK_EASTER_EGGS.length)];
      buddyTooltip.textContent = randomEgg;
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
      }, 3500); // Allow developer time to read the joke/quote
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
    if (escaped.indexOf('+') === 0) escaped = '<span class="hljs-addition">' + escaped + '</span>';
    else if (escaped.indexOf('-') === 0) escaped = '<span class="hljs-deletion">' + escaped + '</span>';
  }
  
  return escaped || '&nbsp;';
}

  // ==========================================================================
  // Checkpoint, Diff, Templates & Telemetry Integration
  // ==========================================================================

  // Request templates list on init
  vscode.postMessage({ type: 'getPromptTemplates' });

  // Bind Telemetry Export Actions
  if (exportTelemetryJsonBtn) {
    exportTelemetryJsonBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportTelemetryJson' });
    });
  }
  if (exportTelemetryCsvBtn) {
    exportTelemetryCsvBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportTelemetryCsv' });
    });
  }

  function renderTemplatesList() {
    if (!templatesPopupList) return;
    templatesPopupList.innerHTML = '';
    
    const query = templatesSearchInput ? templatesSearchInput.value.toLowerCase().trim() : '';
    const filtered = promptTemplates.filter(t => 
      t.name.toLowerCase().includes(query) || 
      (t.content && t.content.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
      templatesPopupList.innerHTML = `<div class="templates-popup-empty">${query ? 'No matching templates found.' : 'No templates yet. Click + New to create one!'}</div>`;
      return;
    }

    filtered.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'templates-popup-item';
      
      let preview = t.content || '';
      preview = preview
        .replace(/^#+\s+/gm, '') // Remove markdown headers
        .replace(/\r?\n/g, ' ') // Replace newlines with spaces
        .trim();
      if (preview.length > 55) {
        preview = preview.substring(0, 55) + '...';
      }

      item.innerHTML = `
        <div class="templates-popup-item-name">${t.name}</div>
        <div class="templates-popup-item-preview">${preview || 'Empty template'}</div>
      `;
      item.title = `Click to load template: ${t.name}`;
      item.addEventListener('click', () => {
        promptInput.textContent = t.content;
        promptInput.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(promptInput);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        if (templatesPopup) templatesPopup.classList.add('hidden');
      });
      templatesPopupList.appendChild(item);
    });
  }

  if (templatesSearchInput) {
    templatesSearchInput.addEventListener('input', () => {
      renderTemplatesList();
    });
    templatesSearchInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });
  }

  // Bind Prompt Library Custom Popup
  if (templatesMenuBtn && templatesPopup) {
    templatesMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = templatesPopup.classList.contains('hidden');
      templatesPopup.classList.toggle('hidden');
      if (isHidden) {
        if (templatesSearchInput) {
          templatesSearchInput.value = '';
          templatesSearchInput.focus();
        }
        renderTemplatesList();
      }
    });

    document.addEventListener('click', (e) => {
      if (!templatesMenuBtn.contains(e.target) && !templatesPopup.contains(e.target)) {
        templatesPopup.classList.add('hidden');
      }
    });
  }

  if (popupCreateTemplateBtn) {
    popupCreateTemplateBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'createPromptTemplate' });
      if (templatesPopup) templatesPopup.classList.add('hidden');
    });
  }

  // Bind settings create template button
  const settingsCreateTemplateBtn = document.getElementById('settings-create-template-btn');
  if (settingsCreateTemplateBtn) {
    settingsCreateTemplateBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'createPromptTemplate' });
    });
  }

  // Bind Active File Context Quick Actions
  if (genTestsBtn) {
    genTestsBtn.addEventListener('click', () => {
      if (!activeFilePath) return;
      
      promptInput.textContent = `/test Write comprehensive unit tests for this file.`;
      submitMessage();
    });
  }

  if (genDocsBtn) {
    genDocsBtn.addEventListener('click', () => {
      if (!activeFilePath) return;
      
      promptInput.textContent = `Generate JSdoc/TSdoc/docstrings documentation for functions and classes in this file.`;
      submitMessage();
    });
  }

  // Bind Multi-Diff Global Actions
  if (multiDiffAcceptAll) {
    multiDiffAcceptAll.addEventListener('click', () => {
      vscode.postMessage({ type: 'acceptAllReviews' });
      if (multiDiffDrawer) multiDiffDrawer.classList.add('collapsed');
    });
  }
  if (multiDiffRejectAll) {
    multiDiffRejectAll.addEventListener('click', () => {
      vscode.postMessage({ type: 'rejectAllReviews' });
      if (multiDiffDrawer) multiDiffDrawer.classList.add('collapsed');
    });
  }

  function renderCheckpoints(checkpoints) {
    if (!checkpointsList) return;
    checkpointsList.innerHTML = '';
    
    if (!checkpoints || checkpoints.length === 0) {
      checkpointsList.innerHTML = `<div class="no-checkpoints" style="padding: 12px; font-size: 10.5px; color: var(--text-muted); text-align: center;">No checkpoints recorded yet.</div>`;
      return;
    }
    
    const sorted = [...checkpoints].reverse();
    sorted.forEach((cp) => {
      const item = document.createElement('div');
      item.className = 'checkpoint-item';
      
      const header = document.createElement('div');
      header.className = 'checkpoint-item-header';
      
      const typeBadge = document.createElement('span');
      typeBadge.className = `checkpoint-type-badge ${cp.type || 'replace'}`;
      typeBadge.textContent = cp.type || 'replace';
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'checkpoint-time';
      timeSpan.textContent = formatRelativeTime(cp.timestamp);
      
      header.appendChild(typeBadge);
      header.appendChild(timeSpan);
      
      const fileDiv = document.createElement('div');
      fileDiv.className = 'checkpoint-file';
      const fileBasename = cp.filePath.split(/[/\\]/).pop() || cp.filePath;
      fileDiv.textContent = fileBasename;
      fileDiv.title = cp.filePath;
      
      const revertBtn = document.createElement('button');
      revertBtn.className = 'btn btn-secondary checkpoint-revert-action';
      revertBtn.style.padding = '3px 8px';
      revertBtn.style.fontSize = '9px';
      revertBtn.style.height = '20px';
      revertBtn.style.lineHeight = '1';
      revertBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 3px;">
          <path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
          <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
        </svg> Revert
      `;
      
      revertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        revertBtn.disabled = true;
        revertBtn.textContent = 'Reverting...';
        vscode.postMessage({ type: 'revertCheckpoint', checkpointId: cp.id });
      });
      
      item.appendChild(header);
      item.appendChild(fileDiv);
      item.appendChild(revertBtn);
      
      checkpointsList.appendChild(item);
    });
  }

  function renderMultiDiffList(reviews) {
    if (!multiDiffContainer) return;
    multiDiffContainer.innerHTML = '';
    
    if (!reviews || reviews.length === 0) {
      multiDiffContainer.innerHTML = `
        <div class="no-changes" style="padding: 16px; font-size: 10.5px; color: var(--text-muted); text-align: center;">
          No changes to review.
        </div>
      `;
      return;
    }
    
    reviews.forEach((review) => {
      const fileDiv = document.createElement('div');
      fileDiv.className = 'multi-diff-file';
      
      const header = document.createElement('div');
      header.className = 'multi-diff-file-header';
      
      const filenameSpan = document.createElement('span');
      filenameSpan.textContent = review.filePath;
      filenameSpan.title = review.absolutePath;
      
      const actions = document.createElement('div');
      actions.className = 'multi-diff-file-actions';
      
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'multi-diff-file-btn accept';
      acceptBtn.textContent = 'Accept';
      acceptBtn.addEventListener('click', () => {
        acceptBtn.disabled = true;
        acceptBtn.textContent = '⏳';
        vscode.postMessage({ type: 'acceptReview', filePath: review.absolutePath });
      });
      
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'multi-diff-file-btn reject';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', () => {
        rejectBtn.disabled = true;
        rejectBtn.textContent = '⏳';
        vscode.postMessage({ type: 'rejectReview', filePath: review.absolutePath });
      });
      
      actions.appendChild(acceptBtn);
      actions.appendChild(rejectBtn);
      
      header.appendChild(filenameSpan);
      header.appendChild(actions);
      fileDiv.appendChild(header);
      
      const hunksContainer = document.createElement('div');
      hunksContainer.className = 'inline-diff-hunks';
      hunksContainer.style.borderTop = '1px solid var(--border-glass)';
      
      if (!review.hunks || review.hunks.length === 0) {
        hunksContainer.innerHTML = `
          <div style="padding: 8px; font-size: 10px; color: var(--text-muted); text-align: center;">
            No hunks available (file might be empty)
          </div>
        `;
      } else {
        review.hunks.forEach((hunk) => {
          const hunkDiv = document.createElement('div');
          hunkDiv.className = 'diff-hunk';
          hunkDiv.style.borderBottom = '1px solid var(--border-glass)';
          
          const hunkHeader = document.createElement('div');
          hunkHeader.className = 'diff-hunk-header';
          hunkHeader.style.padding = '3px 8px';
          hunkHeader.style.fontSize = '9px';
          hunkHeader.style.fontFamily = 'var(--font-mono)';
          hunkHeader.style.background = 'rgba(255,255,255,0.02)';
          hunkHeader.style.color = 'var(--text-muted)';
          hunkHeader.textContent = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
          hunkDiv.appendChild(hunkHeader);
          
          hunk.lines.forEach((line) => {
            let prefix = ' ';
            let bgColor = 'transparent';
            let textColor = 'var(--text-secondary)';
            
            if (line.type === 'add') {
              prefix = '+';
              bgColor = 'rgba(52, 211, 153, 0.06)';
              textColor = '#34d399';
            } else if (line.type === 'del') {
              prefix = '-';
              bgColor = 'rgba(248, 113, 113, 0.06)';
              textColor = '#f87171';
            }
            
            const lineDiv = document.createElement('div');
            lineDiv.style.padding = '1px 8px';
            lineDiv.style.fontSize = '10px';
            lineDiv.style.fontFamily = 'var(--font-mono)';
            lineDiv.style.background = bgColor;
            lineDiv.style.color = textColor;
            lineDiv.style.whiteSpace = 'pre-wrap';
            lineDiv.style.wordBreak = 'break-all';
            lineDiv.style.lineHeight = '1.5';
            lineDiv.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
            
            const prefixSpan = document.createElement('span');
            prefixSpan.style.opacity = '0.3';
            prefixSpan.style.marginRight = '8px';
            prefixSpan.style.userSelect = 'none';
            prefixSpan.textContent = prefix;
            
            const contentSpan = document.createElement('span');
            contentSpan.textContent = line.content || ' ';
            
            lineDiv.appendChild(prefixSpan);
            lineDiv.appendChild(contentSpan);
            hunkDiv.appendChild(lineDiv);
          });
          
          hunksContainer.appendChild(hunkDiv);
        });
      }
      
      fileDiv.appendChild(hunksContainer);
      multiDiffContainer.appendChild(fileDiv);
    });
  }

  // Initialize after all message handlers and UI renderers are fully set up
  vscode.postMessage({ type: 'getSettings' });
  vscode.postMessage({ type: 'fetchModels' });
  vscode.postMessage({ type: 'getChatSessions' });
  vscode.postMessage({ type: 'getChatHistory' });
  vscode.postMessage({ type: 'getActiveReviews' });

})();




// ===== Artifacts Module =====
// Handles artifact rendering, drawer toggling, and interaction with the artifact service.

const vscode = window.vscode;

const artifactsState = {
  list: [],
  selectedId: null,
  drawerVisible: false,
};

/**
 * Initialize the artifacts drawer and event listeners.
 */
function initArtifacts() {
  const toggleBtn = document.getElementById('toggle-artifact-btn');
  const drawer = document.getElementById('artifacts-drawer');
  const closeBtn = drawer?.querySelector('.drawer-close-btn');
  const openInPanelBtn = document.getElementById('artifact-open-in-panel');
  const artifactsList = document.getElementById('artifacts-list');

  // Toggle drawer
  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleArtifactsDrawer();
  });

  closeBtn?.addEventListener('click', () => {
    hideArtifactsDrawer();
  });

  // Open selected artifact in a new VS Code window panel
  openInPanelBtn?.addEventListener('click', () => {
    if (artifactsState.selectedId) {
      vscode.postMessage({
        type: 'openArtifact',
        artifactId: artifactsState.selectedId,
      });
    }
  });

  // Listen for artifact updates from the extension host
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'updateArtifacts') {
      artifactsState.list = message.artifacts || [];
      renderArtifactsList();
    } else if (message.type === 'newArtifact') {
      // Scroll to artifact -> open drawer briefly to show it
      showArtifactsDrawer();
      if (message.artifact) {
        artifactsState.list.unshift(message.artifact);
        renderArtifactsList();
      }
    }
  });

  // Request initial artifacts on load
  vscode.postMessage({ type: 'getArtifacts' });
}

function toggleArtifactsDrawer() {
  if (artifactsState.drawerVisible) {
    hideArtifactsDrawer();
  } else {
    showArtifactsDrawer();
  }
}

function showArtifactsDrawer() {
  const drawer = document.getElementById('artifacts-drawer');
  if (!drawer) return;
  // Close other drawers first
  document.querySelectorAll('.drawer:not(.collapsed)').forEach((d) => {
    if (d.id !== 'artifacts-drawer') {
      d.classList.add('collapsed');
    }
  });
  drawer.classList.remove('collapsed');
  artifactsState.drawerVisible = true;
  // Sync with extension to get latest artifacts
  vscode.postMessage({ type: 'getArtifacts' });
}

function hideArtifactsDrawer() {
  const drawer = document.getElementById('artifacts-drawer');
  if (!drawer) return;
  drawer.classList.add('collapsed');
  artifactsState.drawerVisible = false;
}

function renderArtifactsList() {
  const container = document.getElementById('artifacts-list');
  const openBtn = document.getElementById('artifact-open-in-panel');
  if (!container) return;

  if (!artifactsState.list || artifactsState.list.length === 0) {
    container.innerHTML = `
      <div class="no-artifacts" style="padding:16px;font-size:11px;color:var(--text-muted);text-align:center;">
        No artifacts yet. Ask the agent to create one (e.g., "Create an HTML tooltip component as an artifact").
      </div>
    `;
    if (openBtn) openBtn.disabled = true;
    return;
  }

  if (openBtn) openBtn.disabled = false;

  const typeIcons = { html: '🌐', svg: '🎨', mermaid: '📊', code: '💻', markdown: '📝' };
  const typeLabels = { html: 'HTML Preview', svg: 'SVG Graphic', mermaid: 'Diagram', code: 'Code Snippet', markdown: 'Document' };

  container.innerHTML = artifactsState.list.map((artifact) => {
    const icon = typeIcons[artifact.type] || '📦';
    const label = typeLabels[artifact.type] || artifact.type;
    const timeAgo = getTimeAgo(artifact.createdAt);
    const selected = artifact.id === artifactsState.selectedId ? ' selected' : '';
    const preview = (artifact.content || '').substring(0, 60).replace(/\n/g, ' ').trim();
    return `
      <div class="artifact-item${selected}" data-id="${artifact.id}">
        <div class="artifact-icon ${artifact.type}">${icon}</div>
        <div class="artifact-details">
          <div class="artifact-title">${escapeHtml(artifact.title || 'Untitled')}</div>
          <div class="artifact-meta">${label} · ${timeAgo} · ${(artifact.content || '').length} chars</div>
          <div class="artifact-meta" style="font-size:9px;opacity:0.6;">${escapeHtml(preview)}${(artifact.content || '').length > 60 ? '...' : ''}</div>
        </div>
        <button class="artifact-delete-btn" data-id="${artifact.id}" title="Delete artifact">✕</button>
      </div>
    `;
  }).join('');

  // Add event listeners for selection and deletion
  container.querySelectorAll('.artifact-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      // Ignore if clicking delete button
      if (e.target.closest('.artifact-delete-btn')) return;
      const id = item.dataset.id;
      artifactsState.selectedId = id;
      // Open in new window panel immediately on click
      vscode.postMessage({
        type: 'openArtifact',
        artifactId: id,
      });
      renderArtifactsList();
    });
  });

  container.querySelectorAll('.artifact-delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      vscode.postMessage({
        type: 'deleteArtifact',
        artifactId: id,
      });
      artifactsState.list = artifactsState.list.filter((a) => a.id !== id);
      if (artifactsState.selectedId === id) {
        artifactsState.selectedId = null;
      }
      renderArtifactsList();
    });
  });
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initArtifacts();
  });
} else {
  initArtifacts();
}

// ===== Dashboard Module (v0.2.0) =====
// Handles dashboard drawer visibility, widgets data updates, skill list rendering, and event stream.

(function () {
  const vscode = window.vscode;
  // DOM Elements
  const toggleBtn = document.getElementById('toggle-dashboard-btn');
  const drawer = document.getElementById('dashboard-drawer');
  const closeBtn = drawer?.querySelector('.drawer-close-btn');
  const skillsList = document.getElementById('dash-skills-list');
  const eventLogsContainer = document.getElementById('dash-event-logs');

  let dashboardState = {
    drawerVisible: false,
    skills: [],
    eventCount: 0,
  };

  /**
   * Initialize dashboard events and message listeners
   */
  function initDashboard() {
    // Toggle drawer
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDashboardDrawer();
    });

    closeBtn?.addEventListener('click', () => {
      hideDashboardDrawer();
    });

    // Listen to messages from host
    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'updateSkills': {
          dashboardState.skills = message.skills || [];
          renderSkillsList();
          updateSkillsCountWidget(dashboardState.skills.length);
          break;
        }
        case 'dashboardStats': {
          updateStats(message);
          break;
        }
        case 'eventFired': {
          if (message.event) {
            appendEventLog(message.event);
            dashboardState.eventCount++;
            const eventsVal = document.getElementById('stat-val-events');
            if (eventsVal) eventsVal.textContent = dashboardState.eventCount;
          }
          break;
        }
      }
    });

    // Initial query
    requestDashboardData();
  }

  function toggleDashboardDrawer() {
    if (dashboardState.drawerVisible) {
      hideDashboardDrawer();
    } else {
      showDashboardDrawer();
    }
  }

  function showDashboardDrawer() {
    if (!drawer) return;
    // Close other drawers
    document.querySelectorAll('.drawer:not(.collapsed)').forEach((d) => {
      if (d.id !== 'dashboard-drawer') {
        d.classList.add('collapsed');
      }
    });
    drawer.classList.remove('collapsed');
    dashboardState.drawerVisible = true;
    requestDashboardData();
  }

  function hideDashboardDrawer() {
    if (!drawer) return;
    drawer.classList.add('collapsed');
    dashboardState.drawerVisible = false;
  }

  function requestDashboardData() {
    if (typeof vscode !== 'undefined') {
      vscode.postMessage({ type: 'getSkills' });
      vscode.postMessage({ type: 'getDashboardStats' });
    }
  }

  function updateStats(data) {
    const budgetVal = document.getElementById('stat-val-budget');
    const budgetFill = document.getElementById('stat-fill-budget');
    const skillsVal = document.getElementById('stat-val-skills');
    const eventsVal = document.getElementById('stat-val-events');

    if (budgetVal) {
      budgetVal.textContent = `${(data.budget || 6000).toLocaleString()} tokens`;
    }
    if (budgetFill) {
      // Show budget as fully active capacity
      budgetFill.style.width = '100%';
    }
    if (skillsVal) {
      skillsVal.textContent = data.skillsCount || 0;
    }
    if (eventsVal) {
      dashboardState.eventCount = data.eventLogs ? data.eventLogs.length : 0;
      eventsVal.textContent = dashboardState.eventCount;
    }

    // Populate events list
    if (eventLogsContainer && data.eventLogs) {
      eventLogsContainer.innerHTML = '';
      data.eventLogs.forEach(appendEventLog);
    }
  }

  function renderSkillsList() {
    if (!skillsList) return;

    if (dashboardState.skills.length === 0) {
      skillsList.innerHTML = `
        <div class="no-skills" style="padding:16px;font-size:11px;color:var(--text-muted);text-align:center;">
          No distilled skills found yet. Run tasks to learn skills automatically.
        </div>
      `;
      return;
    }

    skillsList.innerHTML = dashboardState.skills.map((skill) => {
      const name = skill.name || 'untitled-procedure';
      const desc = skill.description || 'No description provided.';
      const category = skill.category || 'general';
      return `
        <div class="dash-skill-item" data-name="${name}">
          <div class="dash-skill-header">
            <div class="dash-skill-title" title="${name}">${name}</div>
            <span class="dash-skill-category">${category}</span>
          </div>
          <div class="dash-skill-desc">${escapeHtml(desc)}</div>
        </div>
      `;
    }).join('');

    // Add click listeners to open the skill file in editor
    skillsList.querySelectorAll('.dash-skill-item').forEach((item) => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        if (typeof vscode !== 'undefined' && name) {
          vscode.postMessage({
            type: 'openFile',
            path: `.mirror-vs/skills/${name}.md`
          });
        }
      });
    });
  }

  function updateSkillsCountWidget(count) {
    const skillsVal = document.getElementById('stat-val-skills');
    if (skillsVal) {
      skillsVal.textContent = count;
    }
  }

  function appendEventLog(log) {
    if (!eventLogsContainer) return;

    const item = document.createElement('div');
    item.className = `event-log-item ${log.eventName}`;

    const meta = document.createElement('div');
    meta.className = 'event-log-meta';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'event-log-name';
    nameSpan.textContent = log.eventName.replace(/_/g, ' ');
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'event-log-time';
    const d = new Date(log.timestamp);
    timeSpan.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    meta.appendChild(nameSpan);
    meta.appendChild(timeSpan);
    item.appendChild(meta);

    const dataDiv = document.createElement('div');
    dataDiv.className = 'event-log-data';

    // Format display content depending on event types
    let displayData = '';
    if (log.eventName === 'file_saved' || log.eventName === 'file_modified') {
      displayData = log.data?.path || log.data?.filePath || JSON.stringify(log.data || {});
      // Shorten workspace folder path if possible
      const parts = displayData.split(/[\\/]/);
      displayData = parts[parts.length - 1] || displayData;
    } else if (log.eventName === 'error_detected') {
      displayData = log.data?.reason || log.data?.error || JSON.stringify(log.data || {});
    } else if (log.eventName === 'session_started') {
      displayData = `Model: ${log.data?.model || 'default'}`;
    } else if (log.eventName === 'task_completed') {
      displayData = `Finished in ${log.data?.turns || 1} turns`;
    } else {
      displayData = JSON.stringify(log.data || {});
    }
    
    dataDiv.textContent = displayData;
    item.appendChild(dataDiv);

    eventLogsContainer.appendChild(item);

    // Auto-scroll log container to bottom
    const parent = eventLogsContainer.parentNode;
    if (parent) {
      parent.scrollTop = parent.scrollHeight;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // DOM Loaded listener
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initDashboard();
    });
  } else {
    initDashboard();
  }
})();

