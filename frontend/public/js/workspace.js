// 企业工作区概览、排序、视图与快捷键。
let activeItemSortMode = localStorage.getItem('hacklauncher.itemSortMode') || 'custom';
let activeItemViewMode = localStorage.getItem('hacklauncher.itemViewMode') || 'grid';

function getUsageStat(itemId) {
  return AppConfig?.usageStats?.[itemId] || { count: 0, lastUsed: 0 };
}

function applyWorkspaceSort(items) {
  const sorted = [...items];
  if (activeItemSortMode === 'name-asc') {
    return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'));
  }
  if (activeItemSortMode === 'usage-desc') {
    return sorted.sort((a, b) => getUsageStat(b.id).count - getUsageStat(a.id).count);
  }
  if (activeItemSortMode === 'recent-desc') {
    return sorted.sort((a, b) => getUsageStat(b.id).lastUsed - getUsageStat(a.id).lastUsed);
  }
  return sorted;
}

function getCurrentViewMeta() {
  if (showFavoritesOnly) return ['重点收藏', '聚焦高频和关键工具资产。'];
  if (currentCategoryId === 'recent') return ['最近使用', '快速返回近期启动过的工具。'];
  if (currentCategoryId) {
    const category = AppConfig.categories.find(item => item.id === currentCategoryId);
    if (category) return [category.name, `查看 ${category.name} 分类下的工具资产。`];
  }
  return ['工具资产总览', '集中管理、快速检索并安全启动您的本地工具。'];
}

function updateWorkspaceOverview(visibleCount) {
  if (!window.AppConfig && typeof AppConfig === 'undefined') return;
  const items = AppConfig.items || [];
  const recentCount = Object.values(AppConfig.usageStats || {}).filter(stat => stat && stat.lastUsed).length;
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  setText('metric-total', items.length);
  setText('metric-categories', (AppConfig.categories || []).length);
  setText('metric-favorites', items.filter(item => item.isFavorite).length);
  setText('metric-recent', recentCount);
  setText('visible-items-count', Number.isFinite(visibleCount) ? visibleCount : document.querySelectorAll('.item-card').length);

  const [title, description] = getCurrentViewMeta();
  setText('workspace-view-title', title);
  setText('workspace-view-description', description);

  const environment = AppConfig.environment || {};
  const pythonReady = Boolean((environment.python || '').trim());
  const javaCount = (environment.javaEnvironments || []).filter(item => item && item.path).length;
  const health = document.getElementById('environment-health');
  if (health) {
    health.classList.toggle('warning', !pythonReady && javaCount === 0);
    setText('environment-health-text', pythonReady || javaCount ? `${pythonReady ? 'Python' : ''}${pythonReady && javaCount ? ' · ' : ''}${javaCount ? `${javaCount} 个 Java` : ''}` : '待配置');
  }
}

async function refreshEnvironmentHealth() {
  if (!window.api?.getEnvironmentStatus) return;
  const health = document.getElementById('environment-health');
  try {
    const status = await window.api.getEnvironmentStatus();
    if (!health) return;
    health.classList.toggle('warning', !status.healthy);
    health.classList.toggle('error', status.configured && !status.healthy);
    const parts = [];
    if (status.pythonConfigured) parts.push(status.pythonAvailable ? 'Python 就绪' : 'Python 异常');
    if (status.javaConfigured) parts.push(`Java ${status.javaAvailable}/${status.javaConfigured}`);
    document.getElementById('environment-health-text').textContent = parts.length ? parts.join(' · ') : '待配置';
    health.title = status.healthy ? '运行环境可用，点击查看设置' : '运行环境需要检查，点击打开设置';
  } catch (error) {
    if (health) health.classList.add('warning');
    console.warn('环境状态检查失败:', error);
  }
}

function applyItemViewMode() {
  const grid = document.getElementById('items-grid');
  if (!grid) return;
  grid.classList.toggle('compact-view', activeItemViewMode === 'compact');
  document.getElementById('compact-list-header')?.classList.toggle('active', activeItemViewMode === 'compact');
  document.getElementById('grid-view-btn')?.classList.toggle('active', activeItemViewMode === 'grid');
  document.getElementById('compact-view-btn')?.classList.toggle('active', activeItemViewMode === 'compact');
}

function formatWorkspaceTimestamp(timestamp) {
  if (!timestamp) return '从未使用';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '从未使用';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function openSettingsSection(sectionName = 'appearance') {
  document.querySelectorAll('[data-settings-target]').forEach(button => {
    button.classList.toggle('active', button.dataset.settingsTarget === sectionName);
  });
  document.querySelectorAll('[data-settings-section]').forEach(section => {
    section.classList.toggle('active', section.dataset.settingsSection === sectionName);
  });
}

function setupSettingsNavigation() {
  document.querySelectorAll('[data-settings-target]').forEach(button => {
    button.addEventListener('click', () => openSettingsSection(button.dataset.settingsTarget));
  });
}

function setupWorkspaceExperience() {
  const sortSelect = document.getElementById('item-sort-select');
  if (sortSelect) {
    sortSelect.value = activeItemSortMode;
    sortSelect.addEventListener('change', event => {
      activeItemSortMode = event.target.value;
      localStorage.setItem('hacklauncher.itemSortMode', activeItemSortMode);
      renderItems(currentSearchTerm);
    });
  }

  document.getElementById('grid-view-btn')?.addEventListener('click', () => {
    activeItemViewMode = 'grid';
    localStorage.setItem('hacklauncher.itemViewMode', activeItemViewMode);
    applyItemViewMode();
  });
  document.getElementById('compact-view-btn')?.addEventListener('click', () => {
    activeItemViewMode = 'compact';
    localStorage.setItem('hacklauncher.itemViewMode', activeItemViewMode);
    applyItemViewMode();
  });
  document.getElementById('environment-health')?.addEventListener('click', () => {
    document.getElementById('settings-btn')?.click();
    openSettingsSection('environment');
  });

  document.addEventListener('keydown', event => {
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      document.getElementById('search-input')?.focus();
      document.getElementById('search-input')?.select();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !inField) {
      event.preventDefault();
      document.getElementById('add-item-btn')?.click();
    }
  });

  applyItemViewMode();
  updateWorkspaceOverview();
  refreshEnvironmentHealth();
  setupSettingsNavigation();
}

document.addEventListener('DOMContentLoaded', setupWorkspaceExperience);
