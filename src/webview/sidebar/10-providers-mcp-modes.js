/**
 * Mirror VS - Providers, MCP, & Modes Module
 * Handles: multi-provider switching, MCP server management, agent mode selection.
 * Adapted from Roo Code's settings UI patterns.
 */

(function () {
  const vscode = window.vscode || acquireVsCodeApi();

  // ===== STATE =====
  let activeProvider = 'ollama'; // ollama | deepseek | gemini | openrouter | litellm | custom
  let activeMode = 'default';
  let mcpServers = [];
  let loadedModels = {};

  // ===== DOM ELEMENTS =====
  // Provider selector
  const providerSelect = document.getElementById('provider-select');
  const geminiPanel = document.getElementById('gemini-panel');
  const openrouterPanel = document.getElementById('openrouter-panel');
  const litellmPanel = document.getElementById('litellm-panel');

  // Provider-specific inputs
  const geminiKeyInput = document.getElementById('gemini-key');
  const geminiModelSelect = document.getElementById('gemini-model-select');
  const openrouterKeyInput = document.getElementById('openrouter-key');
  const openrouterModelSelect = document.getElementById('openrouter-model-select');
  const litellmBaseUrlInput = document.getElementById('litellm-base-url');
  const litellmModelInput = document.getElementById('litellm-model');
  const litellmKeyInput = document.getElementById('litellm-key');

  // Mode selector
  const modeSelect = document.getElementById('mode-select');
  const modeBadge = document.getElementById('mode-badge');
  const modeDescription = document.getElementById('mode-description');

  // MCP elements
  const mcpServersList = document.getElementById('mcp-servers-list');
  const mcpStatusDot = document.getElementById('mcp-status-dot');
  const mcpToolCount = document.getElementById('mcp-tool-count');
  const addMcpServerBtn = document.getElementById('add-mcp-server-btn');
  const mcpEditorPanel = document.getElementById('mcp-editor-panel');
  const mcpEditorTitle = document.getElementById('mcp-editor-title');
  const mcpServerNameInput = document.getElementById('mcp-server-name');
  const mcpServerCommandInput = document.getElementById('mcp-server-command');
  const mcpServerArgsInput = document.getElementById('mcp-server-args');
  const mcpServerCwdInput = document.getElementById('mcp-server-cwd');
  const mcpServerEnvInput = document.getElementById('mcp-server-env');
  const saveMcpServerBtn = document.getElementById('save-mcp-server-btn');
  const deleteMcpServerBtn = document.getElementById('delete-mcp-server-btn');
  const cancelMcpServerBtn = document.getElementById('cancel-mcp-server-btn');

  // Checkpoint toggle
  const checkpointToggle = document.getElementById('settings-checkpoint-toggle');

  // ===== INITIALIZATION =====
  function init() {
    // Request initial state
    vscode.postMessage({ type: 'getSetting', key: 'activeProvider' });
    vscode.postMessage({ type: 'getSetting', key: 'activeMode' });
    vscode.postMessage({ type: 'getMcpServers' });
    vscode.postMessage({ type: 'getSetting', key: 'geminiApiKey' });
    vscode.postMessage({ type: 'getSetting', key: 'geminiModel' });
    vscode.postMessage({ type: 'getSetting', key: 'openrouterApiKey' });
    vscode.postMessage({ type: 'getSetting', key: 'openrouterModel' });
    vscode.postMessage({ type: 'getSetting', key: 'checkpointEnabled' });

    // Provider select change
    if (providerSelect) {
      providerSelect.addEventListener('change', () => {
        switchProvider(providerSelect.value);
      });
    }

    // Mode select change
    if (modeSelect) {
      modeSelect.addEventListener('change', () => {
        setActiveMode(modeSelect.value);
      });
    }

    // MCP server management
    if (addMcpServerBtn) {
      addMcpServerBtn.addEventListener('click', () => showMcpEditor(null));
    }
    if (saveMcpServerBtn) {
      saveMcpServerBtn.addEventListener('click', saveCurrentMcpServer);
    }
    if (deleteMcpServerBtn) {
      deleteMcpServerBtn.addEventListener('click', deleteCurrentMcpServer);
    }
    if (cancelMcpServerBtn) {
      cancelMcpServerBtn.addEventListener('click', hideMcpEditor);
    }

    // Checkpoint toggle
    if (checkpointToggle) {
      checkpointToggle.addEventListener('change', () => {
        vscode.postMessage({ type: 'saveSetting', key: 'checkpointEnabled', value: checkpointToggle.checked });
      });
    }

    // Gemini key visibility
    const toggleGeminiKeyBtn = document.getElementById('toggle-gemini-key-visibility');
    if (toggleGeminiKeyBtn && geminiKeyInput) {
      toggleGeminiKeyBtn.addEventListener('click', () => {
        const isPassword = geminiKeyInput.type === 'password';
        geminiKeyInput.type = isPassword ? 'text' : 'password';
        toggleGeminiKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
      });
    }

    // OpenRouter key visibility
    const toggleOrKeyBtn = document.getElementById('toggle-openrouter-key-visibility');
    if (toggleOrKeyBtn && openrouterKeyInput) {
      toggleOrKeyBtn.addEventListener('click', () => {
        const isPassword = openrouterKeyInput.type === 'password';
        openrouterKeyInput.type = isPassword ? 'text' : 'password';
        toggleOrKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
      });
    }

    // LiteLLM key visibility
    const toggleLitellmKeyBtn = document.getElementById('toggle-litellm-key-visibility');
    if (toggleLitellmKeyBtn && litellmKeyInput) {
      toggleLitellmKeyBtn.addEventListener('click', () => {
        const isPassword = litellmKeyInput.type === 'password';
        litellmKeyInput.type = isPassword ? 'text' : 'password';
        toggleLitellmKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
      });
    }
  }

  // ===== PROVIDER SWITCHING =====
  function switchProvider(provider) {
    activeProvider = provider;
    vscode.postMessage({ type: 'saveSetting', key: 'activeProvider', value: provider });

    // Hide all panels
    const panels = document.querySelectorAll('.provider-panel');
    panels.forEach((p) => p.classList.add('hidden'));

    // Show selected panel
    const activePanel = document.getElementById(`${provider}-panel`);
    if (activePanel) {
      activePanel.classList.remove('hidden');
    }

    // Update quick provider selector if it exists
    const quickProvider = document.getElementById('quick-provider-select');
    if (quickProvider) quickProvider.value = provider;

    // Notify backend
    vscode.postMessage({ type: 'switchProvider', provider });
  }

  // ===== MODE MANAGEMENT =====
  function setActiveMode(modeId) {
    activeMode = modeId;
    vscode.postMessage({ type: 'saveSetting', key: 'activeMode', value: modeId });
    vscode.postMessage({ type: 'switchMode', mode: modeId });

    // Update badge
    if (modeBadge) {
      const modeNames = {
        default: 'Default',
        architect: '🏗️ Architect',
        'code-reviewer': '🔍 Code Review',
        debugger: '🐛 Debugger',
        'doc-writer': '📝 Doc Writer',
        'test-writer': '🧪 Test Writer',
      };
      modeBadge.textContent = modeNames[modeId] || modeId;
      if (modeId !== 'default') {
        modeBadge.classList.add('active');
      } else {
        modeBadge.classList.remove('active');
      }
    }

    // Update description
    if (modeDescription) {
      const descriptions = {
        default: '',
        architect: 'Read-only. System design & architecture.',
        'code-reviewer': 'Read-only. Code quality analysis.',
        debugger: 'Debugging focus. Can run commands.',
        'doc-writer': 'Documentation only.',
        'test-writer': 'Test writing only.',
      };
      modeDescription.textContent = descriptions[modeId] || '';
    }
  }

  // ===== MCP SERVER MANAGEMENT =====
  let editingMcpServerName = null;

  function showMcpEditor(serverName) {
    editingMcpServerName = serverName;

    if (serverName) {
      const server = mcpServers.find((s) => s.name === serverName);
      if (server) {
        if (mcpServerNameInput) mcpServerNameInput.value = server.name;
        if (mcpServerCommandInput) mcpServerCommandInput.value = server.command;
        if (mcpServerArgsInput) mcpServerArgsInput.value = (server.args || []).join(' ');
        if (mcpServerCwdInput) mcpServerCwdInput.value = server.cwd || '';
        if (mcpServerEnvInput) mcpServerEnvInput.value = server.env ? JSON.stringify(server.env, null, 2) : '';

        if (mcpEditorTitle) mcpEditorTitle.textContent = `Edit MCP Server: ${server.name}`;
        if (deleteMcpServerBtn) deleteMcpServerBtn.classList.remove('hidden');
      }
    } else {
      // New server
      if (mcpServerNameInput) mcpServerNameInput.value = '';
      if (mcpServerCommandInput) mcpServerCommandInput.value = '';
      if (mcpServerArgsInput) mcpServerArgsInput.value = '';
      if (mcpServerCwdInput) mcpServerCwdInput.value = '';
      if (mcpServerEnvInput) mcpServerEnvInput.value = '';

      if (mcpEditorTitle) mcpEditorTitle.textContent = 'Add MCP Server';
      if (deleteMcpServerBtn) deleteMcpServerBtn.classList.add('hidden');
    }

    if (mcpEditorPanel) mcpEditorPanel.classList.remove('hidden');
  }

  function hideMcpEditor() {
    editingMcpServerName = null;
    if (mcpEditorPanel) mcpEditorPanel.classList.add('hidden');
  }

  function saveCurrentMcpServer() {
    const name = mcpServerNameInput?.value.trim();
    const command = mcpServerCommandInput?.value.trim();
    const argsStr = mcpServerArgsInput?.value.trim();
    const cwd = mcpServerCwdInput?.value.trim();
    const envStr = mcpServerEnvInput?.value.trim();

    if (!name || !command) {
      vscode.postMessage({ type: 'showWarning', text: 'Server name and command are required.' });
      return;
    }

    let env;
    if (envStr) {
      try {
        env = JSON.parse(envStr);
      } catch {
        vscode.postMessage({ type: 'showWarning', text: 'Invalid JSON in environment variables.' });
        return;
      }
    }

    const args = argsStr ? argsStr.split(/\s+/).filter(Boolean) : [];

    vscode.postMessage({
      type: 'saveMcpServer',
      server: { name, command, args, cwd: cwd || undefined, env, disabled: false },
    });

    hideMcpEditor();
  }

  function deleteCurrentMcpServer() {
    if (editingMcpServerName) {
      vscode.postMessage({ type: 'deleteMcpServer', name: editingMcpServerName });
    }
    hideMcpEditor();
  }

  function renderMcpServers() {
    if (!mcpServersList) return;

    mcpServersList.innerHTML = '';

    if (mcpServers.length === 0) {
      mcpServersList.innerHTML =
        '<div class="no-mcp-servers" style="padding: 16px; text-align: center; font-size: 10.5px; color: var(--text-muted);">No MCP servers configured. Add one to extend the agent with custom tools.</div>';
      if (mcpStatusDot) mcpStatusDot.className = 'status-dot offline';
      if (mcpToolCount) mcpToolCount.textContent = '0 tools';
      return;
    }

    for (const server of mcpServers) {
      const row = document.createElement('div');
      row.className = 'mcp-server-row';

      const statusCls = server.disabled ? 'offline' : 'online';
      const statusText = server.disabled ? 'Disabled' : 'Connected';

      row.innerHTML = `
        <div class="mcp-server-info">
          <span class="mcp-server-status-dot ${statusCls}"></span>
          <div class="mcp-server-details">
            <span class="mcp-server-name">${escapeHtml(server.name)}</span>
            <span class="mcp-server-cmd">${escapeHtml(server.command)} ${(server.args || []).join(' ')}</span>
          </div>
        </div>
        <div class="mcp-server-actions">
          <span class="mcp-server-status-text ${statusCls}">${statusText}</span>
          <button class="mcp-edit-btn" data-server="${escapeHtml(server.name)}" title="Edit server">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
              <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10z"/>
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.mcp-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        showMcpEditor(server.name);
      });

      row.addEventListener('click', () => showMcpEditor(server.name));
      mcpServersList.appendChild(row);
    }

    // Update status
    const activeServers = mcpServers.filter((s) => !s.disabled);
    if (mcpStatusDot) {
      mcpStatusDot.className = activeServers.length > 0 ? 'status-dot online' : 'status-dot offline';
    }
    if (mcpToolCount) {
      mcpToolCount.textContent = `${activeServers.length} server${activeServers.length !== 1 ? 's' : ''}`;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== PROVIDER MODEL REFRESH =====
  function refreshProviderModels(provider) {
    vscode.postMessage({ type: 'fetchProviderModels', provider });
  }

  function populateModelSelect(selectEl, models) {
    if (!selectEl) return;
    const currentValue = selectEl.value;
    selectEl.innerHTML = '';
    for (const model of models) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      selectEl.appendChild(option);
    }
    if (currentValue && models.includes(currentValue)) {
      selectEl.value = currentValue;
    }
  }

  // ===== MESSAGE HANDLING =====
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      // Provider settings loaded
      case 'settingValue':
        if (msg.key === 'geminiApiKey' && geminiKeyInput) geminiKeyInput.value = msg.value || '';
        if (msg.key === 'geminiModel' && geminiModelSelect) {
          geminiModelSelect.value = msg.value || 'gemini-2.0-flash';
          refreshProviderModels('gemini');
        }
        if (msg.key === 'openrouterApiKey' && openrouterKeyInput) openrouterKeyInput.value = msg.value || '';
        if (msg.key === 'openrouterModel' && openrouterModelSelect) {
          openrouterModelSelect.value = msg.value || 'anthropic/claude-3.5-sonnet';
        }
        if (msg.key === 'activeProvider' && providerSelect) {
          providerSelect.value = msg.value || 'ollama';
          switchProvider(msg.value || 'ollama');
        }
        if (msg.key === 'activeMode' && modeSelect) {
          modeSelect.value = msg.value || 'default';
          setActiveMode(msg.value || 'default');
        }
        if (msg.key === 'checkpointEnabled' && checkpointToggle) {
          checkpointToggle.checked = msg.value !== false;
        }
        break;

      case 'mcpServers':
        mcpServers = msg.servers || [];
        renderMcpServers();
        break;

      case 'mcpStatus':
        if (mcpStatusDot) {
          mcpStatusDot.className = msg.connected ? 'status-dot online' : 'status-dot offline';
        }
        break;

      case 'providerModels':
        loadedModels[msg.provider] = msg.models || [];
        if (msg.provider === 'gemini') populateModelSelect(geminiModelSelect, msg.models);
        if (msg.provider === 'openrouter') populateModelSelect(openrouterModelSelect, msg.models);
        break;

      // Save provider settings when settings are saved globally
      case 'saveSettings':
        if (geminiKeyInput) {
          vscode.postMessage({ type: 'saveSetting', key: 'geminiApiKey', value: geminiKeyInput.value });
        }
        if (geminiModelSelect) {
          vscode.postMessage({ type: 'saveSetting', key: 'geminiModel', value: geminiModelSelect.value });
        }
        if (openrouterKeyInput) {
          vscode.postMessage({
            type: 'saveSetting',
            key: 'openrouterApiKey',
            value: openrouterKeyInput.value,
          });
        }
        if (openrouterModelSelect) {
          vscode.postMessage({
            type: 'saveSetting',
            key: 'openrouterModel',
            value: openrouterModelSelect.value,
          });
        }
        if (litellmKeyInput) {
          vscode.postMessage({ type: 'saveSetting', key: 'litellmApiKey', value: litellmKeyInput.value });
        }
        if (litellmBaseUrlInput) {
          vscode.postMessage({
            type: 'saveSetting',
            key: 'litellmBaseUrl',
            value: litellmBaseUrlInput.value,
          });
        }
        if (litellmModelInput) {
          vscode.postMessage({ type: 'saveSetting', key: 'litellmModel', value: litellmModelInput.value });
        }
        break;
    }
  });

  // ===== EXPORT TO GLOBAL SCOPE =====
  window.activeProvider = () => activeProvider;
  window.activeMode = () => activeMode;
  window.setActiveMode = setActiveMode;
  window.switchProvider = switchProvider;

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
