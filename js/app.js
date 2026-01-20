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
        a.download = 'config.json';
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



// 渲染 Java 环境列表
function renderJavaEnvironments(environments) {
  const listContainer = document.getElementById('java-environments-list');
  const noEnvironmentsText = document.getElementById('no-java-environments');
  const defaultJavaEnvId = AppConfig.environment.defaultJavaEnvironmentId || '';
  
  listContainer.innerHTML = '';
  
  if (environments && environments.length > 0) {
    noEnvironmentsText.classList.add('hidden');
    
    environments.forEach(env => {
      const envItem = document.createElement('div');
      envItem.className = 'java-environment-item border border-light-2 rounded-lg p-3 flex flex-col space-y-2';
      envItem.dataset.id = env.id || Date.now().toString();
      
      const topRow = document.createElement('div');
      topRow.className = 'flex justify-between items-center';
      
      const envName = document.createElement('input');
      envName.className = 'java-env-name w-40 px-2 py-1 border border-light-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-custom';
      envName.value = env.name;
      envName.placeholder = '环境名称（例如：Java 8, Java 11）';
      
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'flex items-center space-x-2';
      
      // 添加默认环境切换
      const defaultToggle = document.createElement('div');
      defaultToggle.className = 'theme-toggle relative inline-block w-11 h-6 rounded-full transition-all duration-300 cursor-pointer mx-0';
      if (env.id === defaultJavaEnvId) {
        defaultToggle.classList.add('active');
      }
      
      const defaultKnob = document.createElement('div');
      defaultKnob.className = 'theme-toggle-knob absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-300 transform translate-x-0 flex items-center justify-center shadow-md';
      if (env.id === defaultJavaEnvId) {
        defaultKnob.style.transform = 'translateX(20px)';
      }
      
      defaultToggle.appendChild(defaultKnob);
      
      defaultToggle.addEventListener('click', async function() {
        // 取消其他环境的默认状态
        document.querySelectorAll('.java-environment-item .theme-toggle').forEach(toggle => {
          if (toggle !== this) {
            toggle.classList.remove('active');
            const knob = toggle.querySelector('.theme-toggle-knob');
            if (knob) {
              knob.style.transform = 'translateX(0)';
            }
          }
        });
        
        // 激活当前环境
        this.classList.add('active');
        const knob = this.querySelector('.theme-toggle-knob');
        if (knob) {
          knob.style.transform = 'translateX(20px)';
        }
        
        // 更新默认环境配置
        const envId = envItem.dataset.id;
        AppConfig.environment.defaultJavaEnvironmentId = envId;
        
        // 保存配置
        try {
          await saveConfig();
        } catch (error) {
          console.error('保存默认环境配置失败:', error);
        }
      });
      
      const defaultLabel = document.createElement('span');
      defaultLabel.className = 'ml-2 text-xs text-light-3';
      defaultLabel.textContent = '默认';
      
      actionsContainer.appendChild(defaultToggle);
      actionsContainer.appendChild(defaultLabel);
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'ml-2 px-2 py-1 border border-light-2 rounded-lg text-danger hover:bg-danger/10 transition-custom';
      deleteBtn.innerHTML = '<i class="fas fa-trash-alt" style="color: var(--danger-color, #FF4D4F)"></i>';
      deleteBtn.onclick = function() {
        // 显示确认对话框
        document.getElementById('confirm-title').textContent = '确认删除';
        document.getElementById('confirm-message').textContent = '你确定要删除这个 Java 环境吗？';
        
        // 设置确认按钮的回调
        document.getElementById('confirm-ok-btn').onclick = function() {
          envItem.remove();
          // 检查是否还有环境
          if (document.querySelectorAll('.java-environment-item').length === 0) {
            noEnvironmentsText.classList.remove('hidden');
          }
          // 关闭对话框
          document.getElementById('confirm-modal').classList.add('hidden');
        };
        
        // 显示对话框
        document.getElementById('confirm-modal').classList.remove('hidden');
      };
      
      actionsContainer.appendChild(deleteBtn);
      topRow.appendChild(envName);
      topRow.appendChild(actionsContainer);
      
      const bottomRow = document.createElement('div');
      bottomRow.className = 'flex space-x-2';
      
      const envPath = document.createElement('input');
      envPath.className = 'java-env-path flex-grow px-3 py-2 border border-light-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-custom';
      envPath.value = env.path;
      envPath.placeholder = 'Java 可执行文件路径';
      
      const browseBtn = document.createElement('button');
      browseBtn.className = 'px-3 py-2 border border-light-2 rounded-lg hover:bg-light-1 transition-custom';
      browseBtn.innerHTML = '<i class="fas fa-folder-open"></i>';
      browseBtn.onclick = function() {
        browseJavaEnvPath(envPath);
      };
      
      bottomRow.appendChild(envPath);
      bottomRow.appendChild(browseBtn);
      
      envItem.appendChild(topRow);
      envItem.appendChild(bottomRow);
      listContainer.appendChild(envItem);
    });
  } else {
    noEnvironmentsText.classList.remove('hidden');
  }
}

// 添加 Java 环境
function addJavaEnvironment() {
  const listContainer = document.getElementById('java-environments-list');
  const noEnvironmentsText = document.getElementById('no-java-environments');
  
  const envItem = document.createElement('div');
  envItem.className = 'java-environment-item border border-light-2 rounded-lg p-3 flex flex-col space-y-2';
  envItem.dataset.id = Date.now().toString();
  
  const topRow = document.createElement('div');
  topRow.className = 'flex justify-between items-center';
  
  const envName = document.createElement('input');
  envName.className = 'java-env-name w-40 px-2 py-1 border border-light-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-custom';
  envName.placeholder = '环境名称（例如：Java 8, Java 11）';
  
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'flex items-center space-x-2';
  
  // 添加默认环境切换
      const defaultToggle = document.createElement('div');
      defaultToggle.className = 'theme-toggle relative inline-block w-11 h-6 rounded-full transition-all duration-300 cursor-pointer mx-0';
      
      // 检查是否是第一个Java环境，如果是则设为默认
      const existingEnvironments = document.querySelectorAll('.java-environment-item');
      const isFirstEnvironment = existingEnvironments.length === 0;
      
      if (isFirstEnvironment) {
        defaultToggle.classList.add('active');
      }
      
      const defaultKnob = document.createElement('div');
      defaultKnob.className = 'theme-toggle-knob absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-300 transform translate-x-0 flex items-center justify-center shadow-md';
      if (isFirstEnvironment) {
        defaultKnob.style.transform = 'translateX(20px)';
      }
      
      defaultToggle.appendChild(defaultKnob);
      
      defaultToggle.addEventListener('click', async function() {
        // 取消其他环境的默认状态
        document.querySelectorAll('.java-environment-item .theme-toggle').forEach(toggle => {
          if (toggle !== this) {
            toggle.classList.remove('active');
            const knob = toggle.querySelector('.theme-toggle-knob');
            if (knob) {
              knob.style.transform = 'translateX(0)';
            }
          }
        });
        
        // 激活当前环境
        this.classList.add('active');
        const knob = this.querySelector('.theme-toggle-knob');
        if (knob) {
          knob.style.transform = 'translateX(20px)';
        }
        
        // 更新默认环境配置
        const envId = envItem.dataset.id;
        AppConfig.environment.defaultJavaEnvironmentId = envId;
        
        // 保存配置
        try {
          await saveConfig();
        } catch (error) {
          console.error('保存默认环境配置失败:', error);
        }
      });
  
  const defaultLabel = document.createElement('span');
  defaultLabel.className = 'ml-2 text-xs text-light-3';
  defaultLabel.textContent = '默认';
  
  actionsContainer.appendChild(defaultToggle);
  actionsContainer.appendChild(defaultLabel);
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'ml-2 px-2 py-1 border border-light-2 rounded-lg text-danger hover:bg-danger/10 transition-custom';
  deleteBtn.innerHTML = '<i class="fas fa-trash-alt" style="color: var(--danger-color, #FF4D4F)"></i>';
  deleteBtn.onclick = function() {
    envItem.remove();
    // 检查是否还有环境
    if (document.querySelectorAll('.java-environment-item').length === 0) {
      noEnvironmentsText.classList.remove('hidden');
    }
  };
  
  actionsContainer.appendChild(deleteBtn);
  topRow.appendChild(envName);
  topRow.appendChild(actionsContainer);
  
  const bottomRow = document.createElement('div');
  bottomRow.className = 'flex space-x-2';
  
  const envPath = document.createElement('input');
  envPath.className = 'java-env-path flex-grow px-3 py-2 border border-light-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-custom';
  envPath.placeholder = 'Java 可执行文件路径';
  
  const browseBtn = document.createElement('button');
  browseBtn.className = 'px-3 py-2 border border-light-2 rounded-lg hover:bg-light-1 transition-custom';
  browseBtn.innerHTML = '<i class="fas fa-folder-open"></i>';
  browseBtn.onclick = function() {
    browseJavaEnvPath(envPath);
  };
  
  bottomRow.appendChild(envPath);
  bottomRow.appendChild(browseBtn);
  
  envItem.appendChild(topRow);
  envItem.appendChild(bottomRow);
  listContainer.appendChild(envItem);
  
  // 隐藏无环境提示
  noEnvironmentsText.classList.add('hidden');
  
  // 聚焦到新环境的名称输入框
  setTimeout(() => {
    envName.focus();
  }, 100);
}

// 浏览 Java 环境路径
async function browseJavaEnvPath(inputElement) {
  try {
    const path = await window.api.browsePath('folder');
    if (path) {
      inputElement.value = path;
    }
  } catch (error) {
    console.error('浏览路径失败:', error);
    showNotification('错误', '浏览路径失败: ' + error.message, 'error');
  }
}

// 打开设置模态框
async function openSettingsModal() {
  try {
    // 从主进程获取最新的环境配置
    const envConfig = await window.api.getEnvironment();
    
    // 更新界面
    document.getElementById('python-path').value = envConfig.python || '';
    
    // 渲染 Java 环境列表
    renderJavaEnvironments(envConfig.javaEnvironments || []);
    
    // 同时更新AppConfig，确保数据一致性
    AppConfig.environment = envConfig;
    
    // 加载窗口设置
    const closeBehavior = AppConfig.settings.closeBehavior || 'ask';
    const autoMinimize = AppConfig.settings.autoMinimizeAfterRun || false;
    
    // 更新关闭行为单选按钮
    document.querySelectorAll('input[name="close-behavior"]').forEach(radio => {
      radio.checked = radio.value === closeBehavior;
    });
    
    // 更新自动最小化复选框
    document.getElementById('auto-minimize').checked = autoMinimize;
    
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
    // 收集 Java 环境配置
    const javaEnvironments = [];
    let defaultJavaEnvironmentId = '';
    
    document.querySelectorAll('.java-environment-item').forEach((item, index) => {
        const name = item.querySelector('.java-env-name').value.trim();
        const path = item.querySelector('.java-env-path').value.trim();
        const defaultToggle = item.querySelector('.theme-toggle');
        const isDefault = defaultToggle.classList.contains('active');
        
        if (name && path) {
          javaEnvironments.push({
            id: item.dataset.id,
            name: name,
            path: path
          });
          
          // 检查是否为默认环境
          if (isDefault) {
            defaultJavaEnvironmentId = item.dataset.id;
          }
        }
      });

    const envConfig = {
      python: document.getElementById('python-path').value.trim(),
      javaEnvironments: javaEnvironments,
      defaultJavaEnvironmentId: defaultJavaEnvironmentId,
      customPaths: []
    };

    // 更新主进程中的环境配置
    await window.api.saveEnvironment(envConfig);
    
    // 同步更新AppConfig中的环境配置
    AppConfig.environment = envConfig;
    
    // 确保设置对象存在
    AppConfig.settings = AppConfig.settings || {};
    AppConfig.settings.themeColor = AppConfig.settings.themeColor || '#165DFF';
    
    // 保存窗口设置
    const selectedCloseBehavior = document.querySelector('input[name="close-behavior"]:checked').value;
    const autoMinimize = document.getElementById('auto-minimize').checked;
    
    AppConfig.settings.closeBehavior = selectedCloseBehavior;
    AppConfig.settings.autoMinimizeAfterRun = autoMinimize;
    
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
        
        // 如果是应用程序类型且路径是可执行文件，自动获取图标
        if (itemTypeSelect && itemTypeSelect.value === 'application' && path.toLowerCase().endsWith('.exe')) {
          await autoGetExeIcon(path);
        }
      }
    }
  } catch (error) {
    console.error('浏览路径失败:', error);
    showNotification('错误', '浏览路径失败: ' + error.message, 'error');
  }
}

// 自动获取并设置 EXE 文件图标
async function autoGetExeIcon(exePath) {
  try {
    // 获取 EXE 图标
    const iconBase64 = await window.api.getExeIcon(exePath);
    
    if (iconBase64) {
      // 切换到图片图标类型
      switchIconType('image');
      
      // 设置图片预览和路径
      document.getElementById('icon-image-preview').src = iconBase64;
      document.getElementById('icon-image-preview-container').classList.remove('hidden');
      document.getElementById('icon-image-placeholder').classList.add('hidden');
      document.getElementById('item-image-path').value = iconBase64;
      
      // 显示成功提示
      showNotification('成功', '已自动获取应用程序图标', 'success');
    }
  } catch (error) {
    console.error('获取 EXE 图标失败:', error);
    // 不显示错误提示，避免干扰用户
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