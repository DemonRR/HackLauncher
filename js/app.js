// js/app.js
document.addEventListener('DOMContentLoaded', async () => {
  console.log('应用初始化...');

  // 显示加载提示
  const loadingElement = document.createElement('div');
  loadingElement.id = 'loading';
  loadingElement.textContent = '正在加载配置...';
  loadingElement.style.position = 'fixed';
  loadingElement.style.top = '50%';
  loadingElement.style.left = '50%';
  loadingElement.style.transform = 'translate(-50%, -50%)';
  loadingElement.style.fontSize = '18px';
  document.body.appendChild(loadingElement);

  try {
    // 初始化配置
    await loadConfig();

    // 移除加载提示
    document.body.removeChild(loadingElement);

    // 渲染UI
    renderCategories();
    renderItems();

    // 设置事件监听
    setupCategoryEvents();
    setupItemEvents();

    // 设置确认模态框事件
    document.getElementById('confirm-ok-btn').addEventListener('click', async () => {
      try {
        if (currentItemId) {
          // 删除项目
          await deleteItem(currentItemId);
          showNotification('成功', '项目已删除', 'success');
        } else if (currentCategoryIdForEdit) {
          // 删除分类
          await deleteCategory(currentCategoryIdForEdit);
          showNotification('成功', '分类已删除', 'success');
        }
      } catch (error) {
        console.error('删除失败:', error);
        showNotification('错误', '删除失败: ' + error.message, 'error');
      }

      document.getElementById('confirm-modal').classList.add('hidden');
      currentItemId = null;
      currentCategoryIdForEdit = null;
    });

    document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
      document.getElementById('confirm-modal').classList.add('hidden');
      currentItemId = null;
      currentCategoryIdForEdit = null;
    });

    // 导出功能
    document.getElementById('export-btn').addEventListener('click', async () => {
      try {
        const configJson = JSON.stringify(AppConfig, null, 2);
        const blob = new Blob([configJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'launcher_config.json';
        a.click();
        URL.revokeObjectURL(url);

        showNotification('成功', '配置已导出', 'success');
      } catch (error) {
        console.error('导出失败:', error);
        showNotification('错误', '导出失败: ' + error.message, 'error');
      }
    });

    // 导入功能
    document.getElementById('import-btn').addEventListener('click', async () => {
      // 创建并触发文件输入
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.style.display = 'none';

      document.body.appendChild(input);

      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          const reader = new FileReader();
          reader.onload = async (event) => {
            try {
              const newConfig = JSON.parse(event.target.result);

              // 验证导入的配置
              if (!newConfig || !newConfig.items || !newConfig.categories) {
                throw new Error('无效的配置文件');
              }

              // 确认覆盖现有配置
              document.getElementById('confirm-title').textContent = '确认导入';
              document.getElementById('confirm-message').textContent = '导入将覆盖现有配置，是否继续？';
              document.getElementById('confirm-ok-btn').textContent = '确认导入';
              document.getElementById('confirm-ok-btn').onclick = async () => {
                try {
                  AppConfig = newConfig;
                  await saveConfig();
                  renderCategories();
                  renderItems(currentSearchTerm);
                  document.getElementById('confirm-modal').classList.add('hidden');
                  showNotification('成功', '配置已导入', 'success');
                } catch (error) {
                  console.error('保存导入的配置失败:', error);
                  showNotification('错误', '保存配置失败: ' + error.message, 'error');
                }
              };
              document.getElementById('confirm-modal').classList.remove('hidden');
            } catch (parseError) {
              console.error('解析配置文件失败:', parseError);
              showNotification('错误', '解析配置文件失败: ' + parseError.message, 'error');
            }
          };
          reader.readAsText(file);
        } catch (error) {
          console.error('导入失败:', error);
          showNotification('错误', '导入失败: ' + error.message, 'error');
        }
      };

      input.click();
      document.body.removeChild(input);
    });

    // 打开设置模态框
    document.getElementById('settings-btn').addEventListener('click', async () => {
      openSettingsModal();
    });


  } catch (error) {
    console.error('应用初始化失败:', error);
    showNotification('错误', '应用初始化失败: ' + error.message, 'error');
    if (loadingElement.parentNode) {
      document.body.removeChild(loadingElement);
    }
  }
});

// 打开设置模态框
async function openSettingsModal() {
  try {
    // 从主进程获取最新的环境配置
    const envConfig = await window.api.getEnvironment();
    
    // 更新界面
    document.getElementById('python-path').value = envConfig.python || '';
    document.getElementById('java-path').value = envConfig.java || '';
    
    // 同时更新AppConfig，确保数据一致性
    AppConfig.environment = envConfig;
    
    document.getElementById('settings-modal').classList.remove('hidden');
  } catch (error) {
    console.error('获取环境配置失败:', error);
    showNotification('错误', '获取环境配置失败: ' + error.message, 'error');
  }
}

// 关闭设置模态框
function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

// 保存设置
async function saveSettings() {
  try {
    const envConfig = {
      python: document.getElementById('python-path').value.trim(),
      java: document.getElementById('java-path').value.trim(),
      customPaths: []
    };

    // 更新主进程中的环境配置
    await window.api.saveEnvironment(envConfig);
    
    // 同步更新AppConfig中的环境配置
    AppConfig.environment = envConfig;
    
    // 确保设置对象存在
    AppConfig.settings = AppConfig.settings || {};
    AppConfig.settings.themeColor = AppConfig.settings.themeColor || '#165DFF';
    
    // 保存完整配置
    await saveConfig();
    
    showNotification('成功', '设置已保存', 'success');
    closeSettingsModal();
  } catch (error) {
    console.error('保存设置失败:', error);
    showNotification('错误', '保存设置失败: ' + error.message, 'error');
  }
}

// 浏览文件路径
async function browsePath(type) {
  try {
    const path = await window.api.browsePath(type);
    if (path) {
      const pythonPathInput = document.getElementById('python-path');
      const javaPathInput = document.getElementById('java-path');
      
      if (pythonPathInput && pythonPathInput === document.activeElement?.parentElement?.querySelector('input')) {
        pythonPathInput.value = path;
      } else if (javaPathInput && javaPathInput === document.activeElement?.parentElement?.querySelector('input')) {
        javaPathInput.value = path;
      } else if (pythonPathInput) {
        pythonPathInput.value = path;
      } else if (javaPathInput) {
        javaPathInput.value = path;
      }
    }
  } catch (error) {
    console.error('浏览路径失败:', error);
    showNotification('错误', '浏览路径失败: ' + error.message, 'error');
  }
}

// 浏览项目命令/路径
async function browseItemPath() {
  try {
    const itemTypeSelect = document.getElementById('item-type');
    const isFolder = itemTypeSelect && itemTypeSelect.value === 'folder';
    
    const path = await window.api.browsePath(isFolder ? 'folder' : 'file');
    if (path) {
      if (itemTypeSelect && itemTypeSelect.value === 'command') {
        const textarea = document.getElementById('item-command-textarea');
        if (textarea) textarea.value = path;
      } else {
        const input = document.getElementById('item-command-input');
        if (input) input.value = path;
      }
    }
  } catch (error) {
    console.error('浏览路径失败:', error);
    showNotification('错误', '浏览路径失败: ' + error.message, 'error');
  }
}

// 切换图标类型
function switchIconType(type) {
  const faSection = document.getElementById('fa-icon-section');
  const imageSection = document.getElementById('image-icon-section');
  const faBtn = document.getElementById('icon-type-fa');
  const imageBtn = document.getElementById('icon-type-image');
  const faHelp = document.getElementById('fa-icon-help');
  const imageHelp = document.getElementById('image-icon-help');
  
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#165DFF';
  
  if (type === 'fa') {
    faSection.classList.remove('hidden');
    imageSection.classList.add('hidden');
    
    faBtn.className = 'flex-1 px-3 py-1.5 text-sm rounded-lg transition-custom';
    faBtn.style.backgroundColor = themeColor;
    faBtn.style.borderColor = themeColor;
    faBtn.style.color = '#ffffff';
    
    imageBtn.className = 'flex-1 px-3 py-1.5 text-sm rounded-lg border transition-custom custom-hover';
    imageBtn.style.backgroundColor = '';
    imageBtn.style.borderColor = '';
    imageBtn.style.color = '';
    
    faHelp.classList.remove('hidden');
    imageHelp.classList.add('hidden');
  } else {
    faSection.classList.add('hidden');
    imageSection.classList.remove('hidden');
    
    imageBtn.className = 'flex-1 px-3 py-1.5 text-sm rounded-lg transition-custom';
    imageBtn.style.backgroundColor = themeColor;
    imageBtn.style.borderColor = themeColor;
    imageBtn.style.color = '#ffffff';
    
    faBtn.className = 'flex-1 px-3 py-1.5 text-sm rounded-lg border transition-custom custom-hover';
    faBtn.style.backgroundColor = '';
    faBtn.style.borderColor = '';
    faBtn.style.color = '';
    
    faHelp.classList.add('hidden');
    imageHelp.classList.remove('hidden');
  }
}

// 处理图标图片上传
function handleIconImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 验证文件类型
  const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif', 'image/x-icon'];
  if (!validTypes.includes(file.type)) {
    showNotification('错误', '仅支持 PNG、JPG、SVG、GIF、ICO 格式', 'error');
    return;
  }
  
  // 验证文件大小 (最大 1MB)
  if (file.size > 1024 * 1024) {
    showNotification('错误', '图片大小不能超过 1MB', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const result = e.target.result;
    
    // 显示预览
    document.getElementById('icon-image-preview').src = result;
    document.getElementById('icon-image-preview-container').classList.remove('hidden');
    document.getElementById('icon-image-placeholder').classList.add('hidden');
    
    // 存储图片数据（Base64）
    document.getElementById('item-image-path').value = result;
  };
  reader.readAsDataURL(file);
}

// 移除图标图片
function removeIconImage() {
  document.getElementById('icon-image-preview').src = '';
  document.getElementById('icon-image-preview-container').classList.add('hidden');
  document.getElementById('icon-image-placeholder').classList.remove('hidden');
  document.getElementById('item-image-path').value = '';
  document.getElementById('icon-image-input').value = '';
}

// 初始化图片上传拖拽功能
function initImageDropzone() {
  const dropzone = document.getElementById('icon-image-dropzone');
  if (!dropzone) return;
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });
  
  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const input = document.getElementById('icon-image-input');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(files[0]);
      input.files = dataTransfer.files;
      
      // 触发 change 事件
      const event = new Event('change', { bubbles: true });
      input.dispatchEvent(event);
    }
  });
}

// 页面加载完成后初始化拖拽功能和关闭确认事件
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initImageDropzone, 100);
  
  // 设置关闭确认弹窗事件监听
  window.api.onCloseConfirm(() => {
    document.getElementById('close-confirm-modal').classList.remove('hidden');
  });
  
  // 取消按钮点击事件
  document.getElementById('close-confirm-cancel').addEventListener('click', () => {
    document.getElementById('close-confirm-modal').classList.add('hidden');
  });
  
  // 最小化到系统托盘按钮点击事件
  document.getElementById('close-confirm-minimize').addEventListener('click', () => {
    document.getElementById('close-confirm-modal').classList.add('hidden');
    window.api.confirmMinimize();
  });
  
  // 退出程序按钮点击事件
  document.getElementById('close-confirm-quit').addEventListener('click', () => {
    document.getElementById('close-confirm-modal').classList.add('hidden');
    window.api.confirmQuit();
  });
  
  // 自定义标题栏按钮事件处理
  setupTitleBarEvents();
});

// 设置自定义标题栏事件
function setupTitleBarEvents() {
  // 最小化按钮
  const minimizeBtn = document.getElementById('minimize-btn');
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      window.api.minimizeWindow();
    });
  }
  
  // 最大化/恢复按钮
  const maximizeBtn = document.getElementById('maximize-btn');
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
      window.api.toggleMaximizeWindow();
    });
  }
  
  // 关闭按钮
  const closeBtn = document.getElementById('close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      // 发送消息给渲染进程，显示自定义关闭确认弹窗
      window.api.showCloseConfirm();
    });
  }
  

}