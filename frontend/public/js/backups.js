let pendingBackupRestore = '';
let pendingBackupTimer = null;

function formatBackupSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function loadConfigBackups() {
  const list = document.getElementById('backup-list');
  const empty = document.getElementById('backup-empty');
  if (!list || !empty) return;
  try {
    const backups = await window.api.getConfigBackups();
    list.innerHTML = '';
    const entries = Array.isArray(backups) ? backups : [];
    list.classList.toggle('hidden', entries.length === 0);
    empty.classList.toggle('hidden', entries.length > 0);
    entries.forEach(backup => {
      const row = document.createElement('div');
      row.className = 'backup-row';
      const icon = document.createElement('span');
      icon.innerHTML = '<i class="fas fa-archive"></i>';
      const details = document.createElement('div');
      const title = document.createElement('strong');
      const created = new Date(backup.createdAt);
      title.textContent = Number.isNaN(created.getTime()) ? backup.name : created.toLocaleString('zh-CN', { hour12: false });
      const meta = document.createElement('small');
      meta.textContent = `${backup.itemCount || 0} 个工具 · ${formatBackupSize(backup.size || 0)}`;
      details.append(title, meta);
      const restore = document.createElement('button');
      restore.textContent = pendingBackupRestore === backup.name ? '确认恢复' : '恢复';
      restore.classList.toggle('confirming', pendingBackupRestore === backup.name);
      restore.addEventListener('click', () => requestBackupRestore(backup.name));
      row.append(icon, details, restore);
      list.appendChild(row);
    });
  } catch (error) {
    list.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'backup-load-error';
    message.textContent = `读取备份失败：${String(error)}`;
    list.appendChild(message);
    empty.classList.add('hidden');
  }
}

async function createConfigBackup() {
  const button = document.getElementById('create-config-backup');
  try {
    button.disabled = true;
    await window.api.createConfigBackup();
    await loadConfigBackups();
    showNotification('备份完成', '当前工具配置已安全备份', 'success');
  } catch (error) {
    showNotification('备份失败', error?.message || String(error), 'error');
  } finally {
    button.disabled = false;
  }
}

async function requestBackupRestore(name) {
  if (pendingBackupRestore !== name) {
    pendingBackupRestore = name;
    clearTimeout(pendingBackupTimer);
    pendingBackupTimer = setTimeout(() => {
      pendingBackupRestore = '';
      loadConfigBackups();
    }, 5000);
    loadConfigBackups();
    return;
  }
  clearTimeout(pendingBackupTimer);
  pendingBackupRestore = '';
  try {
    const restored = await window.api.restoreConfigBackup(name);
    AppConfig = restored;
    applyTheme(AppConfig.settings?.theme || 'light');
    if (AppConfig.settings?.themeColor) applyThemeColor(AppConfig.settings.themeColor);
    renderCategories();
    renderItems(currentSearchTerm);
    await loadConfigBackups();
    if (typeof refreshEnvironmentHealth === 'function') refreshEnvironmentHealth();
    showNotification('恢复完成', `已恢复包含 ${(AppConfig.items || []).length} 个工具的配置`, 'success');
  } catch (error) {
    showNotification('恢复失败', error?.message || String(error), 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('create-config-backup')?.addEventListener('click', createConfigBackup);
  document.querySelector('[data-settings-target="backup"]')?.addEventListener('click', loadConfigBackups);
});
