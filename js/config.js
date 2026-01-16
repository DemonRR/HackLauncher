// js/config.js
// 应用配置
let AppConfig = {
  categories: [],
  items: [],
  defaultCategoryId: null,
  settings: {
    theme: 'light',
    themeColor: '#165DFF',
    layout: 'grid',
    animations: true,
    closeBehavior: 'ask',
    autoMinimizeAfterRun: false
  },
  environment: {
    python: '',
    java: '',
    customPaths: []
  }
};

// 加载配置
async function loadConfig() {
  try {
    // 从主进程获取配置
    const config = await window.api.getConfig();
    if (config) {
      AppConfig = config;
      showNotification('成功', '配置加载成功', 'success');
      // 应用主题设置
      applyTheme(config.theme);
    } else {
      showNotification('提示', '使用默认配置', 'info');
    }
  } catch (error) {
    console.error('加载配置失败:', error);
    showNotification('错误', '加载配置失败: ' + error.message, 'error');
  }
}

// 保存配置
async function saveConfig() {
  try {
    // 确保数据完整性
    AppConfig.categories = AppConfig.categories || [];
    AppConfig.items = AppConfig.items || [];
    
    // 保存到主进程
    await window.api.saveConfig(AppConfig);
    
    showNotification('成功', '配置已保存', 'success');
  } catch (error) {
    console.error('保存配置失败:', error);
    showNotification('错误', '保存配置失败: ' + error.message, 'error');
    throw error;
  }
}

// 应用主题设置
function applyTheme(theme) {
  const body = document.body;
  const header = document.querySelector('header') || document.querySelector('#custom-titlebar');
  const aside = document.querySelector('aside');
  const itemCards = document.querySelectorAll('.bg-white');
  const textDarkElements = document.querySelectorAll('.text-dark');

  if (theme === 'dark') {
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
  }
  
  // 应用主题颜色
  const themeColor = AppConfig.settings?.themeColor || '#165DFF';
  applyThemeColor(themeColor);
  
  // 更新主题切换按钮状态
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    const knob = themeToggleBtn.querySelector('.theme-toggle-knob');
    if (knob) {
      if (theme === 'dark') {
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
    }
  }
}

// 应用主题颜色
function applyThemeColor(color) {
  if (!color) return;
  
  document.documentElement.style.setProperty('--theme-color', color);
  document.documentElement.style.setProperty('--theme-color-light', color + '20');
  document.documentElement.style.setProperty('--theme-color-hover', adjustColorBrightness(color, -10));
  
  // 转换颜色为 RGB 格式
  const rgb = hexToRgb(color);
  if (rgb) {
    document.documentElement.style.setProperty('--theme-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }
  
  // 更新颜色选择按钮的选中状态
  document.querySelectorAll('.color-option').forEach(btn => {
    const btnOnclick = btn.getAttribute('onclick') || '';
    const matchColor = btnOnclick.match(/setThemeColor\(['"](#[0-9A-Fa-f]+)['"]\)/);
    if (matchColor && matchColor[1].toLowerCase() === color.toLowerCase()) {
      btn.classList.add('ring-primary');
      btn.style.setProperty('--tw-ring-color', color);
      btn.querySelector('i').classList.remove('opacity-0');
    } else {
      btn.classList.remove('ring-primary');
      btn.style.setProperty('--tw-ring-color', 'transparent');
      btn.querySelector('i').classList.add('opacity-0');
    }
  });
  
  // 更新卡片图标的颜色 - 直接设置内联样式
  document.querySelectorAll('.item-icon-container i').forEach(icon => {
    icon.style.color = color;
  });
  
  // 更新侧边栏图标的颜色
  document.querySelectorAll('aside i[class*="text-primary"]').forEach(icon => {
    icon.style.color = color;
  });
  
  // 更新头部图标的颜色
  document.querySelectorAll('header i[class*="text-primary"]').forEach(icon => {
    icon.style.color = color;
  });
  
  // 更新菜单图标颜色
  document.querySelectorAll('.context-menu i[class*="text-primary"]').forEach(icon => {
    icon.style.color = color;
  });
  
  // 更新所有使用 text-primary 类的图标
  document.querySelectorAll('.text-primary i').forEach(icon => {
    icon.style.color = color;
  });
}

// 设置主题颜色
function setThemeColor(color) {
  if (!color) return;
  
  AppConfig.settings = AppConfig.settings || {};
  AppConfig.settings.themeColor = color;
  
  applyThemeColor(color);
  
  // 更新所有使用主题颜色的元素
  document.querySelectorAll('.text-primary, .bg-primary, .ring-primary, .hover\\:bg-primary, i[class*="text-primary"]').forEach(el => {
    if (el.classList.contains('text-primary') || el.tagName === 'I') {
      el.style.color = color;
    }
    if (el.classList.contains('bg-primary')) {
      el.style.backgroundColor = color;
    }
    if (el.classList.contains('ring-primary')) {
      el.style.borderColor = color;
    }
    if (el.classList.contains('hover:bg-primary')) {
      el.style.setProperty('--tw-bg-opacity', '1');
      el.style.backgroundColor = color;
    }
  });
  
  // 特别处理Font Awesome图标的颜色
  document.querySelectorAll('i.fas, i.fab, i.far').forEach(icon => {
    if (icon.classList.contains('text-primary')) {
      icon.style.color = color;
    }
  });
  
  showNotification('成功', '主题颜色已更新', 'success');
}

// 调整颜色亮度
function adjustColorBrightness(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}

// RGB转十六进制
function rgbToHex(rgb) {
  if (!rgb) return '';
  if (rgb.startsWith('#')) return rgb.toLowerCase();
  
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return '';
  
  return '#' + result.slice(0, 3).map(x => {
    const hex = parseInt(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// 十六进制转RGB
function hexToRgb(hex) {
  if (!hex) return null;
  
  // 移除#号
  const cleanedHex = hex.replace(/^#/, '');
  
  let r, g, b;
  if (cleanedHex.length === 3) {
    // 短格式 #abc
    r = parseInt(cleanedHex[0] + cleanedHex[0], 16);
    g = parseInt(cleanedHex[1] + cleanedHex[1], 16);
    b = parseInt(cleanedHex[2] + cleanedHex[2], 16);
  } else if (cleanedHex.length === 6) {
    // 标准格式 #aabbcc
    r = parseInt(cleanedHex.substring(0, 2), 16);
    g = parseInt(cleanedHex.substring(2, 4), 16);
    b = parseInt(cleanedHex.substring(4, 6), 16);
  } else {
    return null;
  }
  
  return { r, g, b };
}