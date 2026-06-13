// ===== Dashboard Module (v0.2.0) =====
// Handles dashboard drawer visibility, widgets data updates, skill list rendering, and event stream.

(function () {
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
