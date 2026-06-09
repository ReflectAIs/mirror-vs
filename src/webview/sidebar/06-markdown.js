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
    const routingRegex = /<architecture_routing>([\s\S]*?)<\/architecture_routing>/gi;
    cleanText = cleanText.replace(routingRegex, (match, inner) => {
      hasRouting = true;
      routingContent = inner.trim();
      return `%%%ROUTING_PLACEHOLDER%%%`;
    });

    let streamingRouting = false;
    if (cleanText.includes('<architecture_routing>') && !cleanText.includes('</architecture_routing>')) {
      const openIdx = cleanText.indexOf('<architecture_routing>');
      routingContent = cleanText.substring(openIdx + '<architecture_routing>'.length).trim();
      cleanText = cleanText.substring(0, openIdx) + `%%%STREAMING_ROUTING_PLACEHOLDER%%%`;
      streamingRouting = true;
    }

    // Intercept and wrap <implementation_plan> block in a gorgeous card, avoiding recursive infinite loops
    let hasPlan = false;
    let planContent = '';
    const planRegex = /<implementation_plan>([\s\S]*?)<\/implementation_plan>/gi;
    cleanText = cleanText.replace(planRegex, (match, inner) => {
      hasPlan = true;
      planContent = inner.trim();
      return `%%%PLAN_PLACEHOLDER%%%`;
    });

    // Also handle incomplete streaming tag
    let streamingPlan = false;
    if (cleanText.includes('<implementation_plan>') && !cleanText.includes('</implementation_plan>')) {
      const openIdx = cleanText.indexOf('<implementation_plan>');
      planContent = cleanText.substring(openIdx + '<implementation_plan>'.length).trim();
      cleanText = cleanText.substring(0, openIdx) + `%%%STREAMING_PLAN_PLACEHOLDER%%%`;
      streamingPlan = true;
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

