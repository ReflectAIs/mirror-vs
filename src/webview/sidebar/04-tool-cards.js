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
    } else if (toolName === 'multi_patch_file' || toolName === 'multipatch_file') {
      friendlyName = 'Multi Patch File';
      iconHtml = '📑';
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
    if (targetSpan && target && (toolName === 'create_file' || toolName === 'write_file' || toolName === 'read_file' || toolName === 'patch_file' || toolName === 'multi_patch_file' || toolName === 'multipatch_file')) {
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
      
      // For read_file: show the full file content that the model read
      if (toolName === 'read_file' && code) {
        const header = document.createElement('div');
        header.className = 'tool-details-header';
        header.innerHTML = '📖 <span>File Content Read by Model</span>';
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
        const pre = document.createElement('pre');
        pre.className = 'tool-result-pre diff-display';
        pre.textContent = cleanResult;
        detailsContainer.appendChild(pre);
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
      }
      
      // Default: show summary for other tools
      if (toolName !== 'read_file' && toolName !== 'grep_search' && toolName !== 'patch_file' && toolName !== 'multi_patch_file' && toolName !== 'multipatch_file' && toolName !== 'write_file' && toolName !== 'create_file') {
        const cleanResult = result ? result.replace(/(?:Revert|Reverted) ID: \w+/, '').trim() : '';
        const details = document.createElement('div');
        details.className = 'tool-details';
        details.textContent = cleanResult || (status === 'success' ? 'Operation succeeded' : 'Operation failed');
        detailsContainer.appendChild(details);
      }
      
      // If there's a result for tools that also have code, show additional result text
      if ((toolName === 'read_file' || toolName === 'write_file' || toolName === 'create_file') && result) {
        const cleanResult = result.replace(/(?:Revert|Reverted) ID: \w+/, '').trim();
        if (cleanResult && cleanResult !== 'Operation succeeded') {
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
        card.classList.toggle('expanded');
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
