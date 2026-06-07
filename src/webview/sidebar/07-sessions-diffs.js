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

  let avatarState = 'idle';
  let idleInterval = null;
  let errorResetTimeout = null;

  // Multi-expression dynamic SVG definitions
  const FACES = {
    idle: [
      `<!-- cute open eyes -->
       <circle cx="7" cy="11" r="2.2" />
       <circle cx="17" cy="11" r="2.2" />
       <path d="M9 15 Q12 17 15 15" stroke-width="1.5" stroke-linecap="round" fill="none" />`,
      `<!-- cute blink -->
       <path d="M5 11 L9 11 M15 11 L19 11" stroke-width="1.8" stroke-linecap="round" />
       <path d="M9 15 Q12 17 15 15" stroke-width="1.5" stroke-linecap="round" fill="none" />`,
      `<!-- cute wink -->
       <circle cx="7" cy="11" r="2.2" />
       <path d="M15 11 Q17 9 19 11" stroke-width="1.8" stroke-linecap="round" fill="none" />
       <path d="M9 15 Q12 16.5 15 15" stroke-width="1.5" stroke-linecap="round" fill="none" />`
    ],
    thinking: [
      `<!-- eyes looking up/curious -->
       <ellipse cx="7" cy="9.5" rx="2.2" ry="1.5" />
       <ellipse cx="17" cy="9" rx="1.8" ry="2.2" />
       <path d="M10 15 L14 14.5" stroke-width="1.5" stroke-linecap="round" fill="none" />`
    ],
    coding: [
      `<!-- dynamic matrix squint coding eyes -->
       <path d="M5 11 L9 11 M15 11 L19 11" stroke-width="2" stroke-linecap="round" />
       <path d="M10 15 Q12 16 14 15" stroke-width="1.5" stroke-linecap="round" fill="none" />`
    ],
    tool_calling: [
      `<!-- focus scanning gear eyes -->
       <circle cx="7" cy="11" r="2.2" stroke-width="1.5" stroke-dasharray="2,1" fill="none" />
       <circle cx="17" cy="11" r="2.2" stroke-width="1.5" stroke-dasharray="2,1" fill="none" />
       <circle cx="12" cy="15" r="1.2" />`
    ],
    error: [
      `<!-- cute dizzy sad/worried look -->
       <ellipse cx="7" cy="11.5" rx="1.8" ry="1.2" />
       <ellipse cx="17" cy="11.5" rx="1.8" ry="1.2" />
       <path d="M6 8.5 Q7.5 10 9 8.5 M15 8.5 Q16.5 10 18 8.5" stroke-width="1.2" stroke-linecap="round" fill="none" />
       <path d="M10 16 Q12 14.5 14 16" stroke-width="1.5" stroke-linecap="round" fill="none" />`
    ],
    click: [
      `<!-- happy star/wink heart eyes -->
       <path d="M5 10 Q7 8 9 10 M15 10 Q17 8 19 10" stroke-width="1.8" stroke-linecap="round" fill="none" />
       <path d="M9 14.5 Q12 17.5 15 14.5 Z" />`
    ],
    celebrate: [
      `<!-- extremely happy starry/celebration eyes with wide smile -->
       <path d="M3 11 L6 8 L9 11 M15 11 L18 8 L21 11" stroke-width="2" stroke-linecap="round" fill="none" />
       <path d="M8 15 Q12 19 16 15 Z" />`
    ]
  };

  const FACE_COLORS = {
    idle: '#38bdf8',
    thinking: '#0ea5e9',
    coding: '#10b981',
    tool_calling: '#06b6d4',
    error: '#f472b6', // Playful pink instead of dark red
    click: '#fbbf24', // Warm playful amber
    celebrate: '#10b981'
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
    if (escaped.indexOf('+') === 0) escaped = '<span class="hljs-addition">' + escaped.substring(1) + '</span>';
    else if (escaped.indexOf('-') === 0) escaped = '<span class="hljs-deletion">' + escaped.substring(1) + '</span>';
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

})();



