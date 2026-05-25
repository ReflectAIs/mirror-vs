const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'webview', 'sidebar.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the exact insertion point
const marker = `  vscode.postMessage({ type: 'getChatHistory' });`;

const insertAfter = content.indexOf(marker);
if (insertAfter === -1) {
  console.error('Could not find insertion marker');
  process.exit(1);
}

const afterPos = insertAfter + marker.length;
const beforePart = content.substring(0, afterPos);
const afterPart = content.substring(afterPos);

// Check if we already have a message handler
if (content.includes("window.addEventListener('message'")) {
  console.log('Message handler already exists, skipping');
  process.exit(0);
}

const handlerCode = `

  // ===== MESSAGE HANDLER: Receive all messages from extension =====
  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || !message.type) return;

    switch (message.type) {
      case 'chatResponseStart': {
        if (message.sessionId) activeSessionId = message.sessionId;
        isSending = true;
        stopBtn.classList.remove('hidden');
        sendBtn.disabled = true;
        const container = document.getElementById('chat-messages');
        if (!container) break;
        const assistantDiv = document.createElement('div');
        assistantDiv.className = 'message assistant-message';
        assistantDiv.id = 'current-response';
        assistantDiv.innerHTML = '<div class="message-content"><div class="streaming-dots"><span></span><span></span><span></span></div></div>';
        container.appendChild(assistantDiv);
        container.scrollTop = container.scrollHeight;
        showUsageDashboard(true);
        break;
      }
      case 'chatResponse': {
        const currentResponse = document.getElementById('current-response');
        if (!currentResponse) break;
        let contentEl = currentResponse.querySelector('.message-content');
        if (!contentEl) {
          contentEl = document.createElement('div');
          contentEl.className = 'message-content';
          currentResponse.appendChild(contentEl);
        }
        if (message.text) {
          const textNode = document.createTextNode(message.text);
          contentEl.appendChild(textNode);
        }
        currentResponse.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        break;
      }
      case 'chatResponseComplete': {
        isSending = false;
        sendBtn.disabled = false;
        stopBtn.classList.add('hidden');
        const currentResponse = document.getElementById('current-response');
        if (currentResponse) {
          const contentEl = currentResponse.querySelector('.message-content');
          if (contentEl) {
            const rawText = contentEl.textContent || '';
            extractToolContents(rawText);
            contentEl.innerHTML = parseMarkdown(rawText);
            currentResponse.querySelectorAll('pre code').forEach(codeBlock => {
              const langClass = Array.from(codeBlock.classList).find(c => c.startsWith('language-'));
              if (langClass) {
                const lang = langClass.replace('language-', '');
                if (lang && lang !== 'plaintext') {
                  codeBlock.innerHTML = highlightCode(codeBlock.textContent, lang);
                }
              }
            });
            currentResponse.querySelectorAll('.copy-btn').forEach(btn => {
              btn.addEventListener('click', () => {
                const code = btn.closest('.code-block-wrapper')?.querySelector('code')?.textContent || '';
                navigator.clipboard.writeText(code).catch(() => {});
              });
            });
          }
          currentResponse.removeAttribute('id');
        }
        if (message.tokens) {
          updateUsageDashboard(message.tokens, message.cost || 0);
        }
        if (message.sessionId) activeSessionId = message.sessionId;
        break;
      }
      case 'chatResponseError': {
        isSending = false;
        sendBtn.disabled = false;
        stopBtn.classList.add('hidden');
        const currentResponse = document.getElementById('current-response');
        if (currentResponse) {
          const contentEl = currentResponse.querySelector('.message-content');
          if (contentEl) {
            contentEl.innerHTML = '<div class="error-message">' + escapeHtml(message.error || 'Unknown error') + '</div>';
          }
          currentResponse.removeAttribute('id');
        } else {
          const container = document.getElementById('chat-messages');
          if (container) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'message assistant-message';
            errorDiv.innerHTML = '<div class="message-content"><div class="error-message">' + escapeHtml(message.error || 'Unknown error') + '</div></div>';
            container.appendChild(errorDiv);
            container.scrollTop = container.scrollHeight;
          }
        }
        break;
      }
      case 'updateChatHistory': {
        displayChatHistory(message.history);
        break;
      }
      case 'getChatHistoryResponse': {
        if (message.history && message.history.length > 0) {
          displayChatHistory(message.history);
        }
        break;
      }
      case 'chatSessions': {
        renderSessionsList(message.sessions);
        break;
      }
      case 'toolStatus': {
        updateToolCard(message.toolName, message.status, message.target, message.result, message.checkpointId, message.code, message.terminalName);
        break;
      }
      case 'gitChanges': {
        renderGitChanges(message.changes);
        break;
      }
      case 'gitDiffContent': {
        showGitDiff(message.file, message.diff);
        break;
      }
      case 'hostValidationResult': {
        handleHostValidation(message.isValid, message.models);
        break;
      }
      case 'avatarState': {
        updateAvatarState(message.state);
        break;
      }
      case 'updateSettingsResponse': {
        const indicator = document.getElementById('settings-indicator');
        if (indicator) {
          indicator.textContent = '\\u2713';
          indicator.className = 'settings-indicator success';
          setTimeout(() => { indicator.textContent = ''; indicator.className = 'settings-indicator'; }, 2000);
        }
        break;
      }
      case 'modelsFetched': {
        populateModelSelect(message.models);
        break;
      }
      case 'screenshotCapture': {
        handleScreenshotCapture(message.base64);
        break;
      }
      case 'loopComplete': {
        isSending = false;
        sendBtn.disabled = false;
        stopBtn.classList.add('hidden');
        break;
      }
      case 'providerFallback': {
        const container = document.getElementById('chat-messages');
        if (container) {
          const notice = document.createElement('div');
          notice.className = 'message system-message';
          notice.innerHTML = '<div class="message-content"><em>' + escapeHtml(message.message || '') + '</em></div>';
          container.appendChild(notice);
          container.scrollTop = container.scrollHeight;
        }
        break;
      }
      default: {
        break;
      }
    }
  });
`;

content = beforePart + handlerCode + afterPart;
fs.writeFileSync(filePath, content, 'utf8');
console.log('Message handler added successfully');
