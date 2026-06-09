// ===== Artifacts Module =====
// Handles artifact rendering, drawer toggling, and interaction with the artifact service.

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

  // Also listen via the global VS Code API postMessage
  // (some events come via window.addEventListener from the postMessage chain)
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
