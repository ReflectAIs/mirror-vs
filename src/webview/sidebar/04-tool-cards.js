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
      let runFriendlyName = 'Working...';
      if (toolName === 'read_file') runFriendlyName = 'Reading';
      else if (toolName === 'list_dir') runFriendlyName = 'Listing';
      else if (toolName === 'write_file' || toolName === 'patch_file' || toolName === 'multi_patch_file' || toolName === 'multipatch_file' || toolName === 'create_file') runFriendlyName = 'Editing';
      else if (toolName === 'delete_file') runFriendlyName = 'Deleting';
      else if (toolName === 'grep_search') runFriendlyName = 'Searching';
      else if (toolName === 'run_command') runFriendlyName = 'Running';

      const runIconHtml = (toolName === 'run_command') ? '💻' : 
                          (toolName === 'grep_search') ? '🔍' : 
                          getFileIcon(target);

      const runDisplayTarget = target ? (target.includes('/') || target.includes('\\') ? target.split(/[/\\]/).pop() : target) : '';

      header.innerHTML = `
        <div class="tool-info">
          <span class="tool-name" style="color: var(--text-secondary); font-style: italic;">${runFriendlyName}...</span>
          ${runIconHtml ? `<span class="tool-icon-wrapper">${runIconHtml}</span>` : ''}
          ${runDisplayTarget ? `<span class="tool-target">${runDisplayTarget}</span>` : ''}
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
    let historyAccordion = null;
    let cardCount = 0;
    
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
        
        if (!historyAccordion) {
          historyAccordion = document.createElement('div');
          historyAccordion.className = 'worked-accordion collapsed';
          
          const header = document.createElement('div');
          header.className = 'worked-accordion-header';
          header.innerHTML = `
            <span class="worked-accordion-label">Worked (History)</span>
            <span class="worked-accordion-chevron">
              <svg class="chevron-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </span>
          `;
          
          const content = document.createElement('div');
          content.className = 'worked-accordion-content';
          
          historyAccordion.appendChild(header);
          historyAccordion.appendChild(content);
          
          header.addEventListener('click', () => {
            historyAccordion.classList.toggle('collapsed');
          });
          
          container.appendChild(historyAccordion);
        }
        
        const contentContainer = historyAccordion.querySelector('.worked-accordion-content');
        placeCardInPlaceholder(card, toolName, target, contentContainer);
        cardCount++;
      }
    });
    
    if (historyAccordion && cardCount > 0) {
      const label = historyAccordion.querySelector('.worked-accordion-label');
      if (label) {
        label.textContent = `Worked (${cardCount} action${cardCount > 1 ? 's' : ''})`;
      }
    }
  }
