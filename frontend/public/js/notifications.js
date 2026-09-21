// js/notifications.js
let notificationTimer = null;
let notificationSequence = 0;
let activeNotificationKey = '';
let activeNotificationCount = 0;
let notificationDeadline = 0;
let notificationRemaining = 0;
let notificationHistory = [];
let notificationUnread = 0;

const notificationDurations = {
  success: 2600,
  info: 4500,
  warning: 6000,
  error: 8000
};

const notificationIcons = {
  success: 'fa-check',
  info: 'fa-info',
  warning: 'fa-exclamation',
  error: 'fa-times'
};

function showNotification(title, message, type = 'info', options = {}) {
  const safeType = Object.prototype.hasOwnProperty.call(notificationDurations, type) ? type : 'info';
  const safeTitle = String(title || '提示');
  const safeMessage = String(message || '');

  if (options.history !== false) addNotificationHistory(safeTitle, safeMessage, safeType);
  if (options.log !== false && (safeType === 'error' || safeType === 'warning') && window.api?.logFrontend) {
    window.api.logFrontend(safeType === 'error' ? 'ERROR' : 'WARN', `${safeTitle}: ${safeMessage}`).catch(() => {});
  }
  if (options.toast === false) return;

  const notification = document.getElementById('notification');
  if (!notification) return;
  const notificationKey = options.key || `${safeType}\u0000${safeTitle}\u0000${safeMessage}`;
  const isDuplicate = notification.classList.contains('is-visible') && notificationKey === activeNotificationKey;
  const sequence = ++notificationSequence;
  const duration = notificationDurations[safeType];
  clearTimeout(notificationTimer);

  const notificationLevel = typeof AppConfig !== 'undefined' ? AppConfig.settings?.notificationLevel : 'all';
  if (notificationLevel === 'important' && (safeType === 'success' || safeType === 'info')) return;

  if (isDuplicate) {
    activeNotificationCount++;
    updateNotificationRepeat();
    restartNotificationProgress();
    armNotificationTimer(sequence, duration);
    return;
  }

  activeNotificationKey = notificationKey;
  activeNotificationCount = 1;

  notification.classList.remove('success', 'error', 'warning', 'info', 'is-visible');
  notification.classList.add(safeType);
  document.getElementById('notification-title').textContent = safeTitle;
  document.getElementById('notification-message').textContent = safeMessage;
  document.getElementById('notification-icon').innerHTML = `<i class="fas ${notificationIcons[safeType]}"></i>`;
  updateNotificationRepeat();

  const logButton = document.getElementById('notification-log-btn');
  logButton?.classList.toggle('hidden', safeType !== 'error' && safeType !== 'warning');
  notification.style.setProperty('--notification-duration', `${duration}ms`);

  void notification.offsetWidth;
  requestAnimationFrame(() => notification.classList.add('is-visible'));
  armNotificationTimer(sequence, duration);
}

function addNotificationHistory(title, message, type) {
  const now = Date.now();
  const latest = notificationHistory[0];
  if (latest && latest.title === title && latest.message === message && latest.type === type && now - latest.timestamp < 5000) {
    latest.count += 1;
    latest.timestamp = now;
  } else {
    notificationHistory.unshift({ title, message, type, timestamp: now, count: 1 });
    notificationHistory = notificationHistory.slice(0, 50);
  }
  if (document.getElementById('notification-center')?.classList.contains('hidden')) notificationUnread++;
  renderNotificationHistory();
}

function renderNotificationHistory() {
  const list = document.getElementById('notification-history-list');
  const empty = document.getElementById('notification-history-empty');
  const unread = document.getElementById('notification-unread-count');
  if (!list || !empty || !unread) return;
  unread.textContent = notificationUnread > 99 ? '99+' : String(notificationUnread);
  unread.classList.toggle('hidden', notificationUnread === 0);
  list.innerHTML = '';
  empty.classList.toggle('hidden', notificationHistory.length > 0);
  notificationHistory.forEach(entry => {
    const row = document.createElement('div');
    row.className = `notification-history-row ${entry.type}`;
    const icon = document.createElement('span');
    icon.innerHTML = `<i class="fas ${notificationIcons[entry.type] || notificationIcons.info}"></i>`;
    const content = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = entry.title;
    const message = document.createElement('p');
    message.textContent = entry.message;
    const meta = document.createElement('small');
    meta.textContent = `${new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}${entry.count > 1 ? ` · 重复 ${entry.count} 次` : ''}`;
    content.append(heading, message, meta);
    row.append(icon, content);
    list.appendChild(row);
  });
}

function toggleNotificationCenter() {
  const panel = document.getElementById('notification-center');
  if (!panel) return;
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  if (opening) {
    notificationUnread = 0;
    renderNotificationHistory();
  }
}

function restartNotificationProgress() {
  const progress = document.getElementById('notification-progress');
  if (!progress) return;
  progress.style.animation = 'none';
  void progress.offsetWidth;
  progress.style.animation = '';
}

function updateNotificationRepeat() {
  const repeat = document.getElementById('notification-repeat');
  if (!repeat) return;
  const repeated = activeNotificationCount > 1;
  repeat.textContent = repeated ? `\u00d7${activeNotificationCount}` : '';
  repeat.classList.toggle('hidden', !repeated);
}

function armNotificationTimer(sequence, duration) {
  notificationRemaining = duration;
  notificationDeadline = Date.now() + duration;
  notificationTimer = setTimeout(() => {
    if (sequence === notificationSequence) hideNotification();
  }, duration);
}

function hideNotification() {
  clearTimeout(notificationTimer);
  notificationTimer = null;
  notificationSequence++;
  activeNotificationKey = '';
  activeNotificationCount = 0;
  document.getElementById('notification')?.classList.remove('is-visible');
}

function openNotificationLogs() {
  if (typeof openLogCenter === 'function') {
    openLogCenter('ERROR');
    hideNotification();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const notification = document.getElementById('notification');
  document.getElementById('notification-log-btn')?.addEventListener('click', openNotificationLogs);
  notification?.addEventListener('mouseenter', () => {
    notificationRemaining = Math.max(250, notificationDeadline - Date.now());
    clearTimeout(notificationTimer);
    notificationTimer = null;
    notification.classList.add('is-paused');
  });
  notification?.addEventListener('mouseleave', () => {
    notification.classList.remove('is-paused');
    if (!notification.classList.contains('is-visible')) return;
    const sequence = notificationSequence;
    notificationDeadline = Date.now() + notificationRemaining;
    notificationTimer = setTimeout(() => {
      if (sequence === notificationSequence) hideNotification();
    }, notificationRemaining);
  });
  document.getElementById('notification-center-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    toggleNotificationCenter();
  });
  document.getElementById('notification-center')?.addEventListener('click', event => event.stopPropagation());
  document.getElementById('notification-history-clear')?.addEventListener('click', () => {
    notificationHistory = [];
    notificationUnread = 0;
    renderNotificationHistory();
  });
  document.addEventListener('click', () => document.getElementById('notification-center')?.classList.add('hidden'));
});
