// js/theme.js

// 主题切换逻辑
const themeToggleBtn = document.getElementById('theme-toggle-btn');

themeToggleBtn.addEventListener('click', async () => {
  const body = document.body;
  const header = document.querySelector('header') || document.querySelector('#custom-titlebar');
  const aside = document.querySelector('aside');
  const itemCards = document.querySelectorAll('.bg-white');
  const textDarkElements = document.querySelectorAll('.text-dark');
  const contextMenu = document.getElementById('item-context-menu');
  const refreshBtn = document.getElementById('refresh-btn');

  if (body.classList.contains('light')) {
    body.classList.remove('light');
    body.classList.add('dark');
    if (header) {
      header.classList.remove('light');
      header.classList.add('dark');
    }
    if (aside) {
      aside.classList.remove('light');
      aside.classList.add('dark');
    }
    itemCards.forEach(card => {
      card.classList.remove('light');
      card.classList.add('dark');
    });
    textDarkElements.forEach(element => {
      element.classList.remove('light');
      element.classList.add('dark');
    });
    if (contextMenu) {
      contextMenu.classList.remove('light');
      contextMenu.classList.add('dark');
      contextMenu.style.backgroundColor = '#1e293b';
      contextMenu.style.borderColor = '#334155';
    }
    if (refreshBtn) {
      refreshBtn.classList.remove('light');
      refreshBtn.classList.add('dark');
    }
    AppConfig.settings.theme = 'dark';
    // 添加active类，切换到暗色主题
    themeToggleBtn.classList.add('active');
    // 暗色主题下，开关颜色使用深色背景
    themeToggleBtn.style.backgroundColor = '#4E5969';
    // 切换到月亮图标（暗色主题显示月亮）
    const knob = themeToggleBtn.querySelector('.theme-toggle-knob');
    knob.innerHTML = '<i class="fas fa-moon text-yellow-400 text-xs"></i>';
  } else {
    body.classList.remove('dark');
    body.classList.add('light');
    if (header) {
      header.classList.remove('dark');
      header.classList.add('light');
    }
    if (aside) {
      aside.classList.remove('dark');
      aside.classList.add('light');
    }
    itemCards.forEach(card => {
      card.classList.remove('dark');
      card.classList.add('light');
    });
    textDarkElements.forEach(element => {
      element.classList.remove('dark');
      element.classList.add('light');
    });
    if (contextMenu) {
      contextMenu.classList.remove('dark');
      contextMenu.classList.add('light');
      contextMenu.style.backgroundColor = '#ffffff';
      contextMenu.style.borderColor = '#e2e8f0';
    }
    if (refreshBtn) {
      refreshBtn.classList.remove('dark');
      refreshBtn.classList.add('light');
    }
    AppConfig.settings.theme = 'light';
    // 移除active类，切换到亮色主题
    themeToggleBtn.classList.remove('active');
    // 亮色主题下，开关颜色使用浅色背景
    themeToggleBtn.style.backgroundColor = '#E5E6EB';
    // 切换到太阳图标（亮色主题显示太阳）
    const knob = themeToggleBtn.querySelector('.theme-toggle-knob');
    knob.innerHTML = '<i class="fas fa-sun text-yellow-500 text-xs"></i>';
  }

  await saveConfig();
});

// Initialize theme button based on saved theme
document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const body = document.body;
  const knob = themeToggleBtn.querySelector('.theme-toggle-knob');
  
  if (body.classList.contains('dark')) {
    // 暗色主题 - 添加active类
    themeToggleBtn.classList.add('active');
    // 暗色主题下，开关颜色使用深色背景
    themeToggleBtn.style.backgroundColor = '#4E5969';
    // 显示月亮图标（暗色主题显示月亮）
    knob.innerHTML = '<i class="fas fa-moon text-yellow-400 text-xs"></i>';
  } else {
    // 亮色主题 - 移除active类
    themeToggleBtn.classList.remove('active');
    // 亮色主题下，开关颜色使用浅色背景
    themeToggleBtn.style.backgroundColor = '#E5E6EB';
    // 显示太阳图标（亮色主题显示太阳）
    knob.innerHTML = '<i class="fas fa-sun text-yellow-500 text-xs"></i>';
  }
});