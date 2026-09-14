// js/notifications.js
let notificationTimer = null;
let notificationSequence = 0;

const notificationDurations = {
  success: 3500,
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
  const notification = document.getElementById('notification');
  if (!notification) return;

  const safeType = Object.prototype.hasOwnProperty.call(notificationDurations, type) ? type : 'info';
  const sequence = ++notificationSequence;
  const duration = notificationDurations[safeType];
  clearTimeout(notificationTimer);

  notification.classList.remove('success', 'error', 'warning', 'info', 'is-visible');
  notification.classList.add(safeType);
  document.getElementById('notification-title').textContent = String(title || '提示');
  document.getElementById('notification-message').textContent = String(message || '');
  document.getElementById('notification-icon').innerHTML = `<i class="fas ${notificationIcons[safeType]}"></i>`;

  const logButton = document.getElementById('notification-log-btn');
  logButton?.classList.toggle('hidden', safeType !== 'error' && safeType !== 'warning');
  notification.style.setProperty('--notification-duration', `${duration}ms`);

  if (options.log !== false && (safeType === 'error' || safeType === 'warning') && window.api?.logFrontend) {
    window.api.logFrontend(safeType === 'error' ? 'ERROR' : 'WARN', `${title}: ${message}`).catch(() => {});
  }

  void notification.offsetWidth;
  requestAnimationFrame(() => notification.classList.add('is-visible'));
  notificationTimer = setTimeout(() => {
    if (sequence === notificationSequence) hideNotification();
  }, duration);
}

function hideNotification() {
  clearTimeout(notificationTimer);
  notificationTimer = null;
  notificationSequence++;
  document.getElementById('notification')?.classList.remove('is-visible');
}

function openNotificationLogs() {
  if (typeof openLogCenter === 'function') {
    openLogCenter('ERROR');
    hideNotification();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('notification-log-btn')?.addEventListener('click', openNotificationLogs);
});
