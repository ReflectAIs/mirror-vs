

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
  
  const providerGeminiBtn = document.getElementById('provider-gemini-btn');
  const providerOpenrouterBtn = document.getElementById('provider-openrouter-btn');
  const providerLitellmBtn = document.getElementById('provider-litellm-btn');

  if (providerGeminiBtn) {
    providerGeminiBtn.addEventListener('click', () => {
      selectProvider('gemini');
      saveProviderSettings('gemini');
    });
  }
  if (providerOpenrouterBtn) {
    providerOpenrouterBtn.addEventListener('click', () => {
      selectProvider('openrouter');
      saveProviderSettings('openrouter');
    });
  }
  if (providerLitellmBtn) {
    providerLitellmBtn.addEventListener('click', () => {
      selectProvider('litellm');
      saveProviderSettings('litellm');
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
    const autoApproveWriteToggle = document.getElementById('settings-approve-write-toggle');
    const autoApproveWrite = autoApproveWriteToggle ? autoApproveWriteToggle.checked : false;
    const autoApproveCommandToggle = document.getElementById('settings-approve-command-toggle');
    const autoApproveCommand = autoApproveCommandToggle ? autoApproveCommandToggle.checked : false;
    const autoApproveBrowserToggle = document.getElementById('settings-approve-browser-toggle');
    const autoApproveBrowser = autoApproveBrowserToggle ? autoApproveBrowserToggle.checked : false;

    const planFirst = planFirstToggle ? planFirstToggle.checked : true;
    const truncationGuard = truncationGuardToggle ? truncationGuardToggle.checked : true;
    const aiReviewEnabled = aiReviewToggle ? aiReviewToggle.checked : false;
    const multiFileRefactor = multiFileToggle ? multiFileToggle.checked : true;
    const maxTurnsBeforeSummarize = maxTurnsSummarizeInput ? parseInt(maxTurnsSummarizeInput.value.trim(), 10) : 16;
    const maxToolOutputLength = maxToolOutputInput ? parseInt(maxToolOutputInput.value.trim(), 10) : 8000;
    const maxProjectMapLinesInput = document.getElementById('max-project-map-lines-input');
    const maxProjectMapLines = maxProjectMapLinesInput ? parseInt(maxProjectMapLinesInput.value.trim(), 10) : 250;
    const embeddingModel = embeddingModelInput ? embeddingModelInput.value.trim() : 'nomic-embed-text';

    let modelContextLengths = {};
    if (modelContextLengthsInput) {
      try {
        const val = modelContextLengthsInput.value.trim();
        if (val) {
          modelContextLengths = JSON.parse(val);
        }
      } catch (e) {
        console.error('Invalid JSON for model context lengths:', e);
      }
    }

    const agentInputTokenBudget = agentTokenBudgetInput ? parseInt(agentTokenBudgetInput.value.trim(), 10) : 6000;
    const agentInputTokenHardMax = agentTokenHardMaxInput ? parseInt(agentTokenHardMaxInput.value.trim(), 10) : 200000;
    const skillsEnabled = skillsEnabledToggle ? skillsEnabledToggle.checked : true;
    const maxSkillsToKeep = maxSkillsInput ? parseInt(maxSkillsInput.value.trim(), 10) : 20;

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
      autoApproveWrite,
      autoApproveCommand,
      autoApproveBrowser,
      customEndpointEnabled: provider === 'custom' || (typeof provider === 'string' && provider.startsWith('custom_')),
      customEndpointUrl: activeCustomId === 'custom' ? customEndpointUrl : (customApisList.find(a => a.id === activeCustomId)?.url || customEndpointUrl),
      customEndpointModel: activeCustomId === 'custom' ? customEndpointModel : (customApisList.find(a => a.id === activeCustomId)?.models[0] || customEndpointModel),
      customEndpointKey: activeCustomId === 'custom' ? customEndpointKey : undefined,
      agentMode,
      customSystemPrompt,
      customApis: customApisList,
      customApiKeys: customApiKeysData,
      modelContextLengths,
      agentInputTokenBudget,
      agentInputTokenHardMax,
      skillsEnabled,
      maxSkillsToKeep,
      maxProjectMapLines,
    });
  }

  function selectProvider(provider) {
    activeProvider = provider;
    
    const btnOllama = document.getElementById('provider-ollama-btn');
    const btnDeepseek = document.getElementById('provider-deepseek-btn');
    const btnGemini = document.getElementById('provider-gemini-btn');
    const btnOpenrouter = document.getElementById('provider-openrouter-btn');
    const btnLitellm = document.getElementById('provider-litellm-btn');
    const btnCustom = document.getElementById('provider-custom-btn');

    const panelOllama = document.getElementById('ollama-panel');
    const panelDeepseek = document.getElementById('deepseek-panel');
    const panelGemini = document.getElementById('gemini-panel');
    const panelOpenrouter = document.getElementById('openrouter-panel');
    const panelLitellm = document.getElementById('litellm-panel');
    const panelCustom = document.getElementById('custom-panel');

    // Remove active class from all buttons
    [btnOllama, btnDeepseek, btnGemini, btnOpenrouter, btnLitellm, btnCustom].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    // Add hidden class to all panels
    [panelOllama, panelDeepseek, panelGemini, panelOpenrouter, panelLitellm, panelCustom].forEach(panel => {
      if (panel) panel.classList.add('hidden');
    });

    // Activate the selected button and panel
    if (provider === 'ollama') {
      if (btnOllama) btnOllama.classList.add('active');
      if (panelOllama) panelOllama.classList.remove('hidden');
    } else if (provider === 'deepseek') {
      if (btnDeepseek) btnDeepseek.classList.add('active');
      if (panelDeepseek) panelDeepseek.classList.remove('hidden');
    } else if (provider === 'gemini') {
      if (btnGemini) btnGemini.classList.add('active');
      if (panelGemini) panelGemini.classList.remove('hidden');
    } else if (provider === 'openrouter') {
      if (btnOpenrouter) btnOpenrouter.classList.add('active');
      if (panelOpenrouter) panelOpenrouter.classList.remove('hidden');
    } else if (provider === 'litellm') {
      if (btnLitellm) btnLitellm.classList.add('active');
      if (panelLitellm) panelLitellm.classList.remove('hidden');
    } else {
      if (btnCustom) btnCustom.classList.add('active');
      if (panelCustom) panelCustom.classList.remove('hidden');
    }

    if (thinkingQuickControls) {
      if (provider === 'deepseek') {
        thinkingQuickControls.style.opacity = '1';
        thinkingQuickControls.style.pointerEvents = 'auto';
      } else {
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
    const autoApproveWriteToggle = document.getElementById('settings-approve-write-toggle');
    const autoApproveWrite = autoApproveWriteToggle ? autoApproveWriteToggle.checked : false;
    const autoApproveCommandToggle = document.getElementById('settings-approve-command-toggle');
    const autoApproveCommand = autoApproveCommandToggle ? autoApproveCommandToggle.checked : false;
    const autoApproveBrowserToggle = document.getElementById('settings-approve-browser-toggle');
    const autoApproveBrowser = autoApproveBrowserToggle ? autoApproveBrowserToggle.checked : false;

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

    let modelContextLengths = {};
    if (modelContextLengthsInput) {
      try {
        const val = modelContextLengthsInput.value.trim();
        if (val) {
          modelContextLengths = JSON.parse(val);
        }
      } catch (e) {
        console.error('Invalid JSON for model context lengths:', e);
      }
    }

    const agentInputTokenBudget = agentTokenBudgetInput ? parseInt(agentTokenBudgetInput.value.trim(), 10) : 6000;
    const agentInputTokenHardMax = agentTokenHardMaxInput ? parseInt(agentTokenHardMaxInput.value.trim(), 10) : 200000;
    const skillsEnabled = skillsEnabledToggle ? skillsEnabledToggle.checked : true;
    const maxSkillsToKeep = maxSkillsInput ? parseInt(maxSkillsInput.value.trim(), 10) : 20;

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
      autoApproveWrite,
      autoApproveCommand,
      autoApproveBrowser,
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
      modelContextLengths,
      agentInputTokenBudget,
      agentInputTokenHardMax,
      skillsEnabled,
      maxSkillsToKeep,
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

