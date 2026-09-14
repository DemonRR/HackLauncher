let activeLogLevel = 'ALL';
let visibleLogEntries = [];
let logRefreshTimer = null;

function formatLogTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp || '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function renderLogs(entries) {
  visibleLogEntries = Array.isArray(entries) ? entries : [];
  const list = document.getElementById('logs-list');
  const empty = document.getElementById('logs-empty');
  list.innerHTML = '';
  empty.classList.toggle('hidden', visibleLogEntries.length > 0);
  list.classList.toggle('hidden', visibleLogEntries.length === 0);

  visibleLogEntries.forEach(entry => {
    const row = document.createElement('div');
    row.className = `log-row level-${String(entry.level || 'INFO').toLowerCase()}`;

    const level = document.createElement('span');
    level.className = 'log-level';
    level.textContent = entry.level || 'INFO';
    const time = document.createElement('time');
    time.dateTime = entry.timestamp || '';
    time.textContent = formatLogTime(entry.timestamp);
    const message = document.createElement('span');
    message.className = 'log-message';
    message.textContent = entry.message || '';
    message.title = entry.message || '';

    row.append(level, time, message);
    list.appendChild(row);
  });
  document.getElementById('logs-status').textContent = `显示 ${visibleLogEntries.length} 条记录`;
}

async function loadLogs() {
  const refreshIcon = document.querySelector('#logs-refresh-btn i');
  refreshIcon?.classList.add('fa-spin');
  try {
    const result = await window.api.getLogs('ALL', 1000);
    const allEntries = Array.isArray(result) ? result : [];
    const infoEntries = allEntries.filter(entry => entry.level === 'INFO');
    const warnings = allEntries.filter(entry => entry.level === 'WARN');
    const errors = allEntries.filter(entry => entry.level === 'ERROR');
    const entries = (activeLogLevel === 'ALL'
      ? allEntries
      : allEntries.filter(entry => entry.level === activeLogLevel)
    ).slice(0, 300);
    document.getElementById('all-log-count').textContent = allEntries.length;
    document.getElementById('info-log-count').textContent = infoEntries.length;
    document.getElementById('warn-log-count').textContent = warnings.length;
    document.getElementById('error-log-count').textContent = errors.length;
    renderLogs(entries);
  } catch (error) {
    renderLogs([]);
    document.getElementById('logs-status').textContent = `读取失败：${error}`;
  } finally {
    refreshIcon?.classList.remove('fa-spin');
  }
}

function openLogCenter(level = 'ALL') {
  activeLogLevel = level;
  document.querySelectorAll('[data-log-level]').forEach(button => button.classList.toggle('active', button.dataset.logLevel === level));
  document.getElementById('logs-modal').classList.remove('hidden');
  loadLogs();
  clearInterval(logRefreshTimer);
  logRefreshTimer = setInterval(loadLogs, 3000);
}

function closeLogCenter() {
  document.getElementById('logs-modal').classList.add('hidden');
  clearInterval(logRefreshTimer);
  logRefreshTimer = null;
}

function openClearLogsConfirm() {
  document.getElementById('logs-clear-modal')?.classList.remove('hidden');
}

function closeClearLogsConfirm() {
  document.getElementById('logs-clear-modal')?.classList.add('hidden');
}

async function clearAllLogs() {
  const confirmButton = document.getElementById('logs-clear-confirm');
  try {
    confirmButton.disabled = true;
    const removed = await window.api.clearLogs();
    closeClearLogsConfirm();
    await loadLogs();
    showNotification('日志已清空', removed > 0 ? `已删除 ${removed} 个日志文件` : '当前没有可清理的日志', 'success');
  } catch (error) {
    showNotification('清理失败', error?.message || String(error), 'error');
  } finally {
    confirmButton.disabled = false;
  }
}

async function copyVisibleLogs() {
  if (!visibleLogEntries.length) {
    showNotification('提示', '当前没有可复制的日志', 'warning');
    return;
  }
  const content = visibleLogEntries.map(entry => `${formatLogTime(entry.timestamp)} [${entry.level}] ${entry.message}`).join('\n');
  try {
    await navigator.clipboard.writeText(content);
    showNotification('已复制', `已复制 ${visibleLogEntries.length} 条日志`, 'success');
  } catch (error) {
    showNotification('复制失败', String(error), 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logs-btn')?.addEventListener('click', () => openLogCenter('ALL'));
  document.getElementById('logs-close-btn')?.addEventListener('click', closeLogCenter);
  document.getElementById('logs-refresh-btn')?.addEventListener('click', loadLogs);
  document.getElementById('logs-copy-btn')?.addEventListener('click', copyVisibleLogs);
  document.getElementById('logs-folder-btn')?.addEventListener('click', () => window.api.openLogFile());
  document.getElementById('logs-clear-btn')?.addEventListener('click', openClearLogsConfirm);
  document.getElementById('logs-clear-cancel')?.addEventListener('click', closeClearLogsConfirm);
  document.getElementById('logs-clear-confirm')?.addEventListener('click', clearAllLogs);
  document.querySelectorAll('[data-log-level]').forEach(button => {
    button.addEventListener('click', () => {
      activeLogLevel = button.dataset.logLevel;
      document.querySelectorAll('[data-log-level]').forEach(item => item.classList.toggle('active', item === button));
      loadLogs();
    });
  });
  document.getElementById('logs-modal')?.addEventListener('click', event => {
    if (event.target.id === 'logs-modal') closeLogCenter();
  });
  document.getElementById('logs-clear-modal')?.addEventListener('click', event => {
    if (event.target.id === 'logs-clear-modal') closeClearLogsConfirm();
  });
});
