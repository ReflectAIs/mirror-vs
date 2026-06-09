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
      lastBubble.style.bottom = '';
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
