// js/items.js
// 当前选中的分类ID
let currentCategoryId = null;

// 当前操作的项目ID（用于编辑和删除）
let currentItemId = null;

// 当前搜索关键词
let currentSearchTerm = '';

// 是否显示收藏
let showFavoritesOnly = false;

// 拖拽相关变量
let draggedElement = null;
let dragStartIndex = -1;
let dragEndIndex = -1;
let isDragging = false;

const ITEM_TYPE_NAMES = {
  command: '命令行',
  application: '应用程序',
  python: 'Python',
  java: 'Java',
  file: '文件',
  folder: '文件夹',
  url: 'URL'
};


// 根据分类ID获取分类名称
const getCategoryName = (categoryId) => {
  const category = AppConfig?.categories?.find(c => c.id === categoryId);
  return category ? category.name : '未知分类';
};


// 渲染项目列表
function renderItems(searchTerm = '') {
  const itemsGrid = document.getElementById('items-grid');
  const emptyState = document.getElementById('empty-state');
  const searchResultsCount = document.getElementById('search-results-count');
  
  // 保存当前搜索词
  currentSearchTerm = searchTerm;
  
  // 过滤项目
  let itemsToRender = AppConfig.items;
  
  // 应用收藏筛选
  if (showFavoritesOnly) {
    itemsToRender = itemsToRender.filter(item => item.isFavorite);
  }
  
  // 应用分类筛选
  if (currentCategoryId) {
    if (currentCategoryId === 'recent') {
      // 显示最近使用的工具
      itemsToRender = getRecentUsedItems();
    } else {
      itemsToRender = itemsToRender.filter(item => item.categoryId === currentCategoryId);
    }
  }
  
  // 应用搜索筛选
  if (searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // 为每个项目计算匹配分数，只匹配名称和描述
    itemsToRender = itemsToRender
      .map(item => {
        let score = 0;
        const itemName = item.name.toLowerCase();
        const itemDescription = (item.description || '').toLowerCase();
        
        // 名称匹配权重最高
        if (itemName.includes(lowerSearchTerm)) {
          // 完全匹配分数更高
          if (itemName === lowerSearchTerm) {
            score += 100;
          } else if (itemName.startsWith(lowerSearchTerm)) {
            score += 50;
          } else {
            score += 30;
          }
        }
        
        // 描述匹配权重次之
        if (itemDescription.includes(lowerSearchTerm)) {
          score += 20;
        }
        
        return { item, score };
      })
      // 只保留有匹配的项目
      .filter(({ score }) => score > 0)
      // 按匹配分数降序排序
      .sort((a, b) => b.score - a.score)
      // 提取排序后的项目
      .map(({ item }) => item);
  }
  
  // 只有在非搜索状态下才应用自定义排序，搜索结果优先按照匹配度排序
  if (!searchTerm) {
    itemsToRender = applySortOrder(itemsToRender);
  }

  // 用户选择的企业工作区排序优先于手动顺序。
  if (typeof applyWorkspaceSort === 'function' && activeItemSortMode !== 'custom') {
    itemsToRender = applyWorkspaceSort(itemsToRender);
  }
  
  // 显示空状态或项目列表
  if (itemsToRender.length === 0) {
    itemsGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    
    // 获取添加项目按钮
    const addItemBtn = document.getElementById('empty-add-item-btn');
    
    // 如果有搜索词但没有结果，显示搜索无结果提示
    if (searchTerm) {
      document.querySelector('#empty-state h3').textContent = '未找到匹配项目';
      document.querySelector('#empty-state p').textContent = '尝试使用不同的关键词或清除搜索条件';
      // 显示添加项目按钮
      if (addItemBtn) addItemBtn.classList.remove('hidden');
    } else if (currentCategoryId === 'recent') {
      // 最近使用分类为空的情况
      document.querySelector('#empty-state h3').textContent = '暂无最近使用记录';
      document.querySelector('#empty-state p').textContent = '使用应用或命令后，它们将显示在这里';
      // 隐藏添加项目按钮
      if (addItemBtn) addItemBtn.classList.add('hidden');
    } else {
      // 其他分类为空的情况
      document.querySelector('#empty-state h3').textContent = '暂无项目';
      document.querySelector('#empty-state p').textContent = '添加您的第一个启动器项目，快速访问常用应用和命令';
      // 显示添加项目按钮
      if (addItemBtn) addItemBtn.classList.remove('hidden');
    }
    
    // 更新搜索结果数量显示（空结果情况）
    const searchResultsCount = document.getElementById('search-results-count');
    if (searchResultsCount) {
      if (searchTerm) {
        searchResultsCount.textContent = '0';
        searchResultsCount.style.display = 'block';
      } else {
        searchResultsCount.style.display = 'none';
      }
    }
    
    if (typeof updateWorkspaceOverview === 'function') updateWorkspaceOverview(0);
    return;
  } else {
    emptyState.classList.add('hidden');
  }
  
  itemsGrid.innerHTML = '';
  
  // 使用自动流式布局，响应式调整列数
  itemsGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
  itemsGrid.style.gap = '1rem';
  
  itemsToRender.forEach(item => {
    const itemCard = document.createElement('div');
    itemCard.className = 'bg-white rounded-xl shadow-sm p-3 hover-scale hover:shadow-md transition-all duration-200 cursor-pointer group relative item-card draggable';
          itemCard.dataset.itemId = item.id;
          itemCard.style.display = 'flex';
          itemCard.style.flexDirection = 'column';
          itemCard.style.gap = '0.5rem';
          itemCard.style.minHeight = '90px';
          
          // 添加拖拽相关事件监听器
          itemCard.setAttribute('draggable', typeof activeItemSortMode === 'undefined' || activeItemSortMode === 'custom' ? 'true' : 'false');
          itemCard.addEventListener('dragstart', handleDragStart);
          itemCard.addEventListener('dragend', handleDragEnd);
          itemCard.addEventListener('dragover', handleDragOver);
          itemCard.addEventListener('dragenter', handleDragEnter);
          itemCard.addEventListener('dragleave', handleDragLeave);
          itemCard.addEventListener('drop', handleDrop);
    
    const topRow = document.createElement('div');
    topRow.className = 'item-card-heading';
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.width = '100%';
    topRow.style.gap = '0.5rem';
    
    const itemName = document.createElement('h3');
    itemName.className = 'font-medium text-dark text-base truncate';
    itemName.textContent = item.name;
    topRow.appendChild(itemName);
    
    const favoriteBtn = document.createElement('button');
    favoriteBtn.className = 'favorite-btn p-1.5 rounded-lg transition-all duration-200 flex-shrink-0 flex items-center justify-center';
    favoriteBtn.style.marginLeft = 'auto';
    favoriteBtn.style.border = '1px solid transparent';
    favoriteBtn.style.backgroundColor = 'transparent';
    favoriteBtn.innerHTML = item.isFavorite 
      ? '<i class="fas fa-star text-yellow-500"></i>' 
      : '<i class="far fa-star text-gray-300"></i>';
    favoriteBtn.title = item.isFavorite ? '取消收藏' : '添加到收藏';
    
    favoriteBtn.addEventListener('mouseenter', () => {
      favoriteBtn.style.backgroundColor = 'var(--theme-color-light, rgba(22, 93, 255, 0.12))';
      favoriteBtn.style.borderColor = 'var(--theme-color, #165DFF)';
    });
    
    favoriteBtn.addEventListener('mouseleave', () => {
      favoriteBtn.style.backgroundColor = 'transparent';
      favoriteBtn.style.borderColor = 'transparent';
    });
    
    favoriteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      item.isFavorite = !item.isFavorite;
      await saveConfig();
      favoriteBtn.innerHTML = item.isFavorite 
        ? '<i class="fas fa-star text-yellow-500"></i>' 
        : '<i class="far fa-star text-gray-300"></i>';
      favoriteBtn.title = item.isFavorite ? '取消收藏' : '添加到收藏';
      renderCategories();
      if (showFavoritesOnly) {
        renderItems(currentSearchTerm);
      }
    });
    topRow.appendChild(favoriteBtn);
    
    itemCard.appendChild(topRow);
    
    const bottomRow = document.createElement('div');
    bottomRow.className = 'item-card-main';
    bottomRow.style.display = 'flex';
    bottomRow.style.flexDirection = 'row';
    bottomRow.style.alignItems = 'flex-start';
    bottomRow.style.gap = '0.5rem';
    bottomRow.style.flexGrow = '1';
    bottomRow.style.minWidth = '0';
    
    const itemIcon = document.createElement('div');
    itemIcon.className = 'item-icon-container w-10 h-10 rounded-lg bg-primary/10 shadow-sm overflow-hidden flex-shrink-0';
    
    if (item.iconType === 'image' && item.imagePath) {
      itemIcon.innerHTML = `<img class="w-full h-full object-contain" src="${item.imagePath}" alt="${item.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-image\\' style=\\'color: var(--theme-color, #165DFF)\\'></i>'">`;
    } else {
      itemIcon.innerHTML = `<i class="fas ${item.icon || 'fa-terminal'}" style="color: var(--theme-color, #165DFF)"></i>`;
    }
    
    const rightContent = document.createElement('div');
    rightContent.className = 'item-card-details';
    rightContent.style.display = 'flex';
    rightContent.style.flexDirection = 'column';
    rightContent.style.justifyContent = 'space-between';
    rightContent.style.minWidth = '0';
    rightContent.style.flexGrow = '1';
    rightContent.style.height = '40px';
    
    if (item.description) {
      const itemDescription = document.createElement('p');
      itemDescription.className = 'text-xs text-gray-500 truncate dark:text-gray-400';
      itemDescription.style.margin = '0';
      itemDescription.textContent = item.description;
      rightContent.appendChild(itemDescription);
    } else {
      const spacer = document.createElement('div');
      spacer.style.flexGrow = '1';
      rightContent.appendChild(spacer);
    }
    
    const categoryName = getCategoryName(item.categoryId);
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'item-category-badge px-2 py-0.5 bg-gray-100 dark:bg-dark-2 rounded-full inline-block w-fit text-xs flex-shrink-0';
    categoryBadge.textContent = categoryName;

    const typeBadge = document.createElement('span');
    typeBadge.className = 'item-type-badge';
    typeBadge.textContent = ITEM_TYPE_NAMES[item.type] || item.type || '其他';

    const badges = document.createElement('div');
    badges.className = 'item-badges';
    badges.appendChild(typeBadge);
    badges.appendChild(categoryBadge);
    rightContent.appendChild(badges);
    
    bottomRow.appendChild(itemIcon);
    bottomRow.appendChild(rightContent);
    itemCard.appendChild(bottomRow);

    const usage = typeof getUsageStat === 'function' ? getUsageStat(item.id) : { count: 0, lastUsed: 0 };
    const usageSummary = document.createElement('div');
    usageSummary.className = 'item-usage-summary';
    usageSummary.innerHTML = `<strong>${usage.count || 0}</strong>`;
    itemCard.appendChild(usageSummary);

    const lastUsedSummary = document.createElement('div');
    lastUsedSummary.className = 'item-last-used-summary';
    lastUsedSummary.textContent = typeof formatWorkspaceTimestamp === 'function'
      ? formatWorkspaceTimestamp(usage.lastUsed)
      : (usage.lastUsed ? new Date(usage.lastUsed).toLocaleDateString('zh-CN') : '从未使用');
    itemCard.appendChild(lastUsedSummary);
    
    const tooltip = document.createElement('div');
      tooltip.className = 'item-tooltip absolute left-0 right-0 top-full mt-2 text-sm p-3 rounded-lg shadow-lg opacity-0 invisible transition-all duration-200 transform -translate-y-2 z-10 pointer-events-none';
      tooltip.style.whiteSpace = 'normal';
      tooltip.style.wordBreak = 'break-all';
    
    const typeLabel = ITEM_TYPE_NAMES[item.type] || item.type || '-';
    
    let tooltipContent = `<div class="font-medium mb-1">${item.name}</div>`;
    tooltipContent += `<div class="text-xs opacity-80 mb-1">${item.description || '-'}</div>`;
    tooltipContent += `<div class="text-xs opacity-70 mb-1">类型: ${typeLabel}</div>`;
    tooltipContent += `<div class="text-xs opacity-70">分类: ${categoryName}</div>`;
    tooltipContent += `<div class="text-xs opacity-70 truncate">路径: ${item.command || '-'}</div>`;
    tooltip.innerHTML = tooltipContent;
    
    itemCard.appendChild(tooltip);
    
    // 禁用拖拽时的卡片详情弹出
    itemCard.addEventListener('mouseenter', () => {
      if (!isDragging) {
        // 只有在非拖拽状态下才显示详情
        const hoverTimer = setTimeout(() => {
          tooltip.classList.remove('opacity-0', 'invisible', '-translate-y-2');
          tooltip.classList.add('opacity-100', 'visible', 'translate-y-0');
        }, 1000);
        
        // 存储定时器到卡片元素
        itemCard._hoverTimer = hoverTimer;
      }
    });
    
    itemCard.addEventListener('mouseleave', () => {
      // 清除定时器
      if (itemCard._hoverTimer) {
        clearTimeout(itemCard._hoverTimer);
        itemCard._hoverTimer = null;
      }
      // 立即隐藏tooltip，无延迟
      tooltip.classList.add('opacity-0', 'invisible', '-translate-y-2');
      tooltip.classList.remove('opacity-100', 'visible', 'translate-y-0');
    });
    

    // 确保点击时清除定时器
    itemCard.addEventListener('click', () => {
      if (itemCard._hoverTimer) {
        clearTimeout(itemCard._hoverTimer);
        itemCard._hoverTimer = null;
      }
      document.querySelectorAll('.item-tooltip').forEach(t => {
        t.classList.add('opacity-0', 'invisible', '-translate-y-2');
        t.classList.remove('opacity-100', 'visible', 'translate-y-0');
      });
    });

    
    // 在卡片右下方添加运行按钮
    const runButton = document.createElement('button');
    runButton.className = 'run-btn absolute bottom-3 right-3 p-2 rounded-full transition-all duration-300 flex items-center justify-center bg-primary text-white shadow-md hover:bg-primary/95 hover:shadow-lg hover:scale-110 active:scale-95';
    runButton.innerHTML = '<i class="fas fa-play text-sm"></i>';
    runButton.title = '运行项目';
    runButton.style.border = 'none';
    runButton.style.filter = 'brightness(0.9)';
    runButton.style.boxShadow = '0 2px 8px rgba(22, 93, 255, 0.25)';
    runButton.addEventListener('mouseenter', () => {
      runButton.style.transform = 'scale(1.1)';
      runButton.style.filter = 'brightness(0.98)';
      runButton.style.boxShadow = '0 4px 12px rgba(22, 93, 255, 0.35)';
    });
    runButton.addEventListener('mouseleave', () => {
      runButton.style.transform = 'scale(1)';
      runButton.style.filter = 'brightness(0.9)';
      runButton.style.boxShadow = '0 2px 8px rgba(22, 93, 255, 0.25)';
    });
    runButton.addEventListener('click', () => {
      if (itemCard._hoverTimer) {
        clearTimeout(itemCard._hoverTimer);
        itemCard._hoverTimer = null;
      }
      document.querySelectorAll('.item-tooltip').forEach(t => {
        t.classList.add('opacity-0', 'invisible', '-translate-y-2');
        t.classList.remove('opacity-100', 'visible', 'translate-y-0');
      });
      runItem(item);
    });
    itemCard.appendChild(runButton);
    
    itemCard.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // 确保右键菜单存在
      let contextMenu = document.getElementById('item-context-menu');
      if (!contextMenu) {
        initContextMenu();
        contextMenu = document.getElementById('item-context-menu');
      }
      
      contextMenu.dataset.itemId = item.id;
      contextMenu.querySelector('.menu-item-name').textContent = item.name;
      
      // 计算菜单位置，确保不超出屏幕边界
      const menuWidth = 180; // 菜单宽度估计值
      const menuHeight = 200; // 菜单高度估计值
      
      let left = e.pageX;
      let top = e.pageY;
      
      // 如果右侧空间不够，向左移动
      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10;
      }
      
      // 确保不超出左边界
      if (left < 10) {
        left = 10;
      }
      
      // 如果底部空间不够，向上移动
      if (top + menuHeight > window.innerHeight) {
        top = e.pageY - menuHeight;
      }
      
      // 确保不超出上边界
      if (top < 10) {
        top = 10;
      }
      
      // 显示或隐藏"以管理员身份运行"选项
      const adminRunMenuItem = contextMenu.querySelector('.admin-run-menu-item');
      if (adminRunMenuItem) {
        if (item.type === 'application') {
          adminRunMenuItem.classList.remove('hidden');
        } else {
          adminRunMenuItem.classList.add('hidden');
        }
      }
      
      contextMenu.style.top = `${top}px`;
      contextMenu.style.left = `${left}px`;
      contextMenu.classList.remove('hidden');
      
      const folderMenuItem = contextMenu.querySelector('.folder-menu-item');
      if (item.type === 'url') {
        folderMenuItem.classList.add('opacity-50', 'cursor-not-allowed');
        folderMenuItem.style.pointerEvents = 'none';
      } else {
        folderMenuItem.classList.remove('opacity-50', 'cursor-not-allowed');
        folderMenuItem.style.pointerEvents = 'auto';
      }
      
      setTimeout(() => {
        const closeMenu = (event) => {
          if (!contextMenu.contains(event.target)) {
            contextMenu.classList.add('hidden');
            document.removeEventListener('click', closeMenu);
          }
        };
        document.addEventListener('click', closeMenu);
      }, 0);
    });
    
    itemsGrid.appendChild(itemCard);
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.item-card') && !e.target.closest('.item-tooltip')) {
      document.querySelectorAll('.item-tooltip').forEach(t => {
        t.classList.add('opacity-0', 'invisible', '-translate-y-2');
        t.classList.remove('opacity-100', 'visible', 'translate-y-0');
      });
    }
  });
  
  // 更新搜索结果数量显示
  if (searchResultsCount) {
    if (searchTerm) {
      searchResultsCount.textContent = `${itemsToRender.length}`;
      searchResultsCount.style.display = 'block';
    } else {
      searchResultsCount.style.display = 'none';
    }
  }

  if (typeof applyItemViewMode === 'function') applyItemViewMode();
  if (typeof updateWorkspaceOverview === 'function') updateWorkspaceOverview(itemsToRender.length);
  

}

// 辅助函数：获取命令输入框（根据类型）
function getCommandInput() {
  const itemTypeSelect = document.getElementById('item-type');
  if (itemTypeSelect && itemTypeSelect.value === 'command') {
    return document.getElementById('item-command-textarea');
  }
  return document.getElementById('item-command-input');
}

// 辅助函数：设置命令值
function setCommandValue(value) {
  const textarea = document.getElementById('item-command-textarea');
  const input = document.getElementById('item-command-input');
  if (textarea) textarea.value = value;
  if (input) input.value = value;
}

// 辅助函数：获取命令值
function getCommandValue() {
  const textarea = document.getElementById('item-command-textarea');
  const input = document.getElementById('item-command-input');
  if (textarea && !textarea.classList.contains('hidden')) {
    return textarea.value.trim();
  }
  return input ? input.value.trim() : '';
}

// 打开项目模态框
async function openItemModal(itemId = null) {
  const modal = document.getElementById('item-modal');
  const form = document.getElementById('item-form');
  const title = document.getElementById('item-modal-title');
  const submitBtn = document.getElementById('item-submit-btn');
  const itemTypeSelect = document.getElementById('item-type');
  let item = null;
  
  // 重置表单
  form.reset();
  document.getElementById('item-id').value = '';
  document.getElementById('item-name-error').classList.add('hidden');
  document.getElementById('item-command-error').classList.add('hidden');
  
  // 填充分类选项
  const categorySelect = document.getElementById('item-category');
  categorySelect.innerHTML = ''; // 清空现有选项
  
  // 添加用户自定义分类
  AppConfig.categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
  
  // 初始化终端选项（默认隐藏）
  const terminalOption = document.getElementById('run-in-terminal-option');
  terminalOption.classList.add('hidden');
  document.getElementById('run-in-terminal').checked = false;
  document.getElementById('launch-params-container').classList.add('hidden');
  document.getElementById('java-program-params-container').classList.add('hidden');
  document.getElementById('java-environment-option').classList.add('hidden');
  document.getElementById('item-launch-params').value = '';
  document.getElementById('item-java-program-params').value = '';
  
  if (itemId) {
        title.textContent = '编辑项目';
        submitBtn.textContent = '保存修改';
        
        // 查找要编辑的项目
        item = AppConfig.items.find(i => i.id === itemId);
        if (item) {
          document.getElementById('item-id').value = item.id;
          document.getElementById('item-name').value = item.name;
          document.getElementById('item-type').value = item.type;
          setCommandValue(item.command);
          document.getElementById('item-category').value = item.categoryId || '';
          document.getElementById('item-icon').value = item.icon;
          document.getElementById('item-icon-preview').className = `fa ${item.icon || 'fa-terminal'}`;
          
          // 处理图片图标
          if (item.iconType === 'image' && item.imagePath) {
            document.getElementById('icon-image-preview').src = item.imagePath;
            document.getElementById('icon-image-preview-container').classList.remove('hidden');
            document.getElementById('icon-image-placeholder').classList.add('hidden');
            document.getElementById('item-image-path').value = item.imagePath;
            switchIconType('image');
          } else {
            switchIconType('fa');
            document.getElementById('icon-image-preview').src = '';
            document.getElementById('icon-image-preview-container').classList.add('hidden');
            document.getElementById('icon-image-placeholder').classList.remove('hidden');
            document.getElementById('item-image-path').value = '';
          }
          
          // 加载启动参数和描述
          const launchParamsInput = document.getElementById('item-launch-params');
          const descriptionInput = document.getElementById('item-description');
          if (launchParamsInput) launchParamsInput.value = item.launchParams || '';
          if (descriptionInput) descriptionInput.value = item.description || '';
          
          document.getElementById('run-in-terminal').checked = Boolean(item.runInTerminal);
          document.getElementById('item-java-program-params').value = item.javaProgramParams || '';
        }
      } else {
    title.textContent = '新建项目';
    submitBtn.textContent = '添加项目';
    document.getElementById('item-icon-preview').className = 'fa fa-terminal';
    
    // 如果有当前选中的分类，自动设置分类
    if (currentCategoryId) {
      document.getElementById('item-category').value = currentCategoryId;
    }
    
    // 重置图标类型为Font Awesome
    switchIconType('fa');
    
    // 清除之前的图片数据
    document.getElementById('icon-image-preview').src = '';
    document.getElementById('icon-image-preview-container').classList.add('hidden');
    document.getElementById('icon-image-placeholder').classList.remove('hidden');
    document.getElementById('item-image-path').value = '';
    document.getElementById('icon-image-input').value = '';
    
    // 重置图标输入框
    document.getElementById('item-icon').value = 'fa-terminal';
  }
  
  // 显示模态框
  modal.classList.remove('hidden');
  
  // 初始化浏览按钮显示状态
  if ((itemTypeSelect.value === 'command' || itemTypeSelect.value === 'url')) {
    const commandContainer = document.getElementById('item-command-container');
    const browseBtn = commandContainer?.querySelector('button');
    if (browseBtn) {
      browseBtn.classList.add('hidden');
    }
  }
  
  // 确保输入框可聚焦
  setTimeout(() => {
    document.getElementById('item-name').focus();
  }, 100);
  
  // 添加命令输入框事件监听，用于自动获取EXE图标
  const commandInput = document.getElementById('item-command-input');
  if (commandInput) {
    // 移除之前可能存在的事件监听器
    commandInput.removeEventListener('blur', handleCommandInputBlur);
    // 添加新的事件监听器
    commandInput.addEventListener('blur', handleCommandInputBlur);
  }
  

  // 移除之前可能存在的事件监听器
  itemTypeSelect.removeEventListener('change', handleItemTypeChange);
  
  // 添加事件监听器
  itemTypeSelect.addEventListener('change', handleItemTypeChange);
  
  // 每次打开都完整同步字段状态，避免上一个项目类型的控件残留。
  await handleItemTypeChange({ target: itemTypeSelect }, item?.javaEnvironmentId || '', Boolean(item));
}

// 处理命令输入框失去焦点事件，用于自动获取EXE图标
function handleCommandInputBlur() {
  const itemTypeSelect = document.getElementById('item-type');
  const commandInput = document.getElementById('item-command-input');
  
  // 检查是否是应用程序类型且路径是可执行文件
  if (itemTypeSelect && itemTypeSelect.value === 'application' && commandInput) {
    const path = commandInput.value.trim();
    if (path && path.toLowerCase().endsWith('.exe')) {
      // 调用全局的 autoGetExeIcon 函数
      if (typeof autoGetExeIcon === 'function') {
        autoGetExeIcon(path);
      }
    }
  }
}

// 设置项目相关事件
function setupItemEvents() {
  // 添加项目按钮
  document.getElementById('add-item-btn').addEventListener('click', () => {
    // 检查是否有自定义分类
    const hasCustomCategories = AppConfig.categories.length > 0;
    if (!hasCustomCategories) {
      showNotification('提示', '请先添加至少一个分类后再创建项目', 'warning');
      return;
    }
    openItemModal();
  });
  
  // 空状态添加项目按钮
  document.getElementById('empty-add-item-btn').addEventListener('click', () => {
    // 检查是否有自定义分类
    const hasCustomCategories = AppConfig.categories.length > 0;
    if (!hasCustomCategories) {
      showNotification('提示', '请先添加至少一个分类后再创建项目', 'warning');
      return;
    }
    openItemModal();
  });

  // 添加刷新按钮
  const refreshButton = document.createElement('button');
  refreshButton.id = 'refresh-btn';
  refreshButton.className = 'p-2 rounded-lg hover:bg-light-1 transition-custom';
  refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>'; // 替换为 v5 图标
  refreshButton.title = '刷新';
  
  // 将刷新按钮插入到新建项目按钮右边
  const addItemBtn = document.getElementById('add-item-btn');
  addItemBtn.after(refreshButton);
  
  // 刷新按钮事件
  refreshButton.addEventListener('click', async () => {
    try {
      // 添加旋转动画
      refreshButton.querySelector('i').classList.add('fa-spin');
      
      // 重新加载配置
      await loadConfig();
      
      // 重新渲染分类和项目列表
      renderCategories();
      renderItems(currentSearchTerm);
      
      showNotification('成功', '界面已刷新', 'success');
    } catch (error) {
      console.error('刷新失败:', error);
      showNotification('错误', '刷新失败: ' + error.message, 'error');
    } finally {
      // 移除旋转动画
      refreshButton.querySelector('i').classList.remove('fa-spin');
    }
  });
  
  // 项目表单提交
  document.getElementById('item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const itemId = document.getElementById('item-id').value;
    const itemName = document.getElementById('item-name').value.trim();
    const itemType = document.getElementById('item-type').value;
    const itemCommand = getCommandValue();
    const itemCategory = document.getElementById('item-category').value;
    const itemIcon = document.getElementById('item-icon').value.trim();
    const itemImagePath = document.getElementById('item-image-path').value.trim();
    const launchParams = document.getElementById('item-launch-params')?.value.trim() || '';
    const description = document.getElementById('item-description')?.value.trim() || '';
    
    // 获取Java程序参数
    const javaProgramParams = document.getElementById('item-java-program-params')?.value.trim() || '';
    
    // 获取图标类型（fa 或 image）
    const iconType = !document.getElementById('image-icon-section').classList.contains('hidden') ? 'image' : 'fa';
    
    // 获取"在终端中打开"的状态
    const runInTerminal = ['command', 'python', 'java'].includes(itemType) 
      ? document.getElementById('run-in-terminal').checked 
      : false;
    
    // 获取 Java 环境选择
    const javaEnvironmentId = itemType === 'java' 
      ? document.getElementById('item-java-environment').value 
      : '';
    
    // 验证
    let isValid = true;
    
    if (!itemName) {
      document.getElementById('item-name-error').classList.remove('hidden');
      isValid = false;
    } else {
      document.getElementById('item-name-error').classList.add('hidden');
    }
    
    if (!itemCommand) {
      document.getElementById('item-command-error').classList.remove('hidden');
      isValid = false;
    } else {
      // 检查路径或命令中是否包含CMD特殊符号
      const specialChars = /[&|<>()^]/;
      if (itemType !== 'url' && specialChars.test(itemCommand)) {
        document.getElementById('item-command-error').textContent = '路径或命令中包含特殊符号(&|<>()^)，请修改后重试';
        document.getElementById('item-command-error').classList.remove('hidden');
        isValid = false;
      } else {
        document.getElementById('item-command-error').classList.add('hidden');
      }
    }

    // 检查重名
    if (!itemId) { // 新建项目时检查
      const isDuplicate = AppConfig.items.some(item => item.name === itemName);
      if (isDuplicate) {
        document.getElementById('item-name-error').textContent = '项目名称已存在，请选择其他名称';
        document.getElementById('item-name-error').classList.remove('hidden');
        isValid = false;
      }
    }
    
    if (!isValid) return;
    
    try {
      if (itemId) {
        // 更新现有项目
        const index = AppConfig.items.findIndex(i => i.id === itemId);
        if (index !== -1) {
          AppConfig.items[index].name = itemName;
          AppConfig.items[index].type = itemType;
          AppConfig.items[index].command = itemCommand;
          AppConfig.items[index].categoryId = itemCategory || null;
          AppConfig.items[index].categoryName = getCategoryName(itemCategory);
          AppConfig.items[index].icon = itemIcon;
          AppConfig.items[index].iconType = iconType;
          AppConfig.items[index].imagePath = iconType === 'image' ? itemImagePath : '';
          AppConfig.items[index].launchParams = launchParams;
          AppConfig.items[index].description = description;
          
          // 对命令/Python/Java类型保存runInTerminal属性
          if (['command', 'python', 'java'].includes(itemType)) {
            AppConfig.items[index].runInTerminal = runInTerminal;
          } else {
            // 如果不是这些类型，移除该属性
            delete AppConfig.items[index].runInTerminal;
          }
          
          // 对 Java 类型保存相关属性
          if (itemType === 'java') {
            AppConfig.items[index].javaEnvironmentId = javaEnvironmentId;
            AppConfig.items[index].javaProgramParams = javaProgramParams;
          } else {
            // 如果不是 Java 类型，移除相关属性
            delete AppConfig.items[index].javaEnvironmentId;
            delete AppConfig.items[index].javaProgramParams;
          }
          
          showNotification('成功', '项目已更新', 'success');
        }
      } else {
        // 创建新项目
        const newItem = {
          id: Date.now().toString(),
          name: itemName,
          type: itemType,
          command: itemCommand,
          categoryId: itemCategory || null,
          categoryName: getCategoryName(itemCategory),
          icon: itemIcon || 'fa-terminal',
          iconType: iconType,
          imagePath: iconType === 'image' ? itemImagePath : '',
          launchParams: launchParams,
          description: description
        };
        
        // 对命令/Python/Java类型添加runInTerminal属性
        if (['command', 'python', 'java'].includes(itemType)) {
          newItem.runInTerminal = runInTerminal;
        }
        
        // 对 Java 类型添加相关属性
        if (itemType === 'java') {
          newItem.javaEnvironmentId = javaEnvironmentId;
          newItem.javaProgramParams = javaProgramParams;
        }
        
        AppConfig.items.push(newItem);
        showNotification('成功', '项目已添加', 'success');
      }
      
      // 保存配置
      await saveConfig();
      
      // 重新渲染分类和项目列表，更新统计数字
      renderCategories();
      renderItems(currentSearchTerm);
      
      // 关闭模态框
      document.getElementById('item-modal').classList.add('hidden');
    } catch (error) {
      console.error('保存项目失败:', error);
      showNotification('错误', '保存项目失败: ' + error.message, 'error');
    }
  });
  
  // 图标实时预览
  document.getElementById('item-icon').addEventListener('input', (e) => {
    const iconPreview = document.getElementById('item-icon-preview');
    // 修改为 v5 类名
    iconPreview.className = `fas ${e.target.value || 'fa-terminal'}`;
  });
  
  // 确保模态框关闭时重置状态
  document.getElementById('item-modal-close').addEventListener('click', () => {
    document.getElementById('item-modal').classList.add('hidden');
  });
  
  // 设置搜索功能
  const searchInput = document.getElementById('search-input');
  
  // 防抖函数
  let debounceTimer;
  const debounceSearch = (term) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderItems(term);
    }, 300); // 300ms防抖延迟
  };
  
  searchInput.addEventListener('input', (e) => {
    debounceSearch(e.target.value.trim());
  });
  
  // 添加键盘事件支持 - 按ESC清除搜索
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      renderItems('');
    }
  });
}

// 类型切换事件处理函数
async function handleItemTypeChange(e, selectedJavaEnvironmentId = '', preserveIcon = false) {
  const iconPreview = document.getElementById('item-icon-preview');
  const itemIconInput = document.getElementById('item-icon');
  if (!preserveIcon) switch (e.target.value) {
    case 'url':
      iconPreview.className = 'fa fa-globe';
      itemIconInput.value = 'fa-globe';
      break;
    case 'file':
      iconPreview.className = 'fa fa-file';
      itemIconInput.value = 'fa-file';
      break;
    case 'folder':
      iconPreview.className = 'fa fa-folder';
      itemIconInput.value = 'fa-folder';
      break;
    case 'command':
      iconPreview.className = 'fa fa-terminal';
      itemIconInput.value = 'fa-terminal';
      break;
    case 'python':
      iconPreview.className = 'fab fa-python';
      itemIconInput.value = 'fa-python';
      break;
    case 'java':
      iconPreview.className = 'fab fa-java';
      itemIconInput.value = 'fa-java';
      break;
    case 'application':
      iconPreview.className = 'fas fa-desktop';
      itemIconInput.value = 'fa-desktop';
      break;
  }
  
  // 根据类型显示/隐藏启动参数输入框
  const launchParamsContainer = document.getElementById('launch-params-container');
  const javaProgramParamsContainer = document.getElementById('java-program-params-container');
  if (['python', 'java', 'application'].includes(e.target.value)) {
    launchParamsContainer.classList.remove('hidden');
    
    // 根据项目类型更新启动参数的标签和提示
    const launchParamsLabel = launchParamsContainer.querySelector('label');
    const launchParamsInput = document.getElementById('item-launch-params');
    
    if (e.target.value === 'java') {
      launchParamsLabel.textContent = 'JVM 参数';
      launchParamsInput.placeholder = '例如：-Xmx2g -Dfile.encoding=UTF-8';
      javaProgramParamsContainer.classList.remove('hidden');
    } else if (e.target.value === 'python') {
      launchParamsLabel.textContent = '启动参数';
      launchParamsInput.placeholder = '输入启动参数（可选）';
      javaProgramParamsContainer.classList.add('hidden');
    } else if (e.target.value === 'application') {
      launchParamsLabel.textContent = '启动参数';
      launchParamsInput.placeholder = '输入启动参数（可选）';
      javaProgramParamsContainer.classList.add('hidden');
    }
  } else {
    launchParamsContainer.classList.add('hidden');
    javaProgramParamsContainer.classList.add('hidden');
  }
  
  // 根据类型显示/隐藏终端选项
  const terminalOption = document.getElementById('run-in-terminal-option');
  if (['command', 'python', 'java'].includes(e.target.value)) {
    terminalOption.classList.remove('hidden');
  } else {
    terminalOption.classList.add('hidden');
  }
  
  // 根据类型显示/隐藏 Java 环境选项
  const javaEnvOption = document.getElementById('java-environment-option');
  if (e.target.value === 'java') {
    javaEnvOption.classList.remove('hidden');
    await renderJavaEnvironmentOptions(selectedJavaEnvironmentId);
  } else {
    javaEnvOption.classList.add('hidden');
  }
  
  // 切换命令输入框（命令行用textarea，其他用input）
  const commandInput = document.getElementById('item-command-input');
  const commandTextarea = document.getElementById('item-command-textarea');
  const commandHelpText = document.getElementById('command-help-text');
  
  if (e.target.value === 'command') {
    if (commandInput) commandInput.classList.add('hidden');
    if (commandTextarea) commandTextarea.classList.remove('hidden');
    if (commandHelpText) commandHelpText.classList.remove('hidden');
  } else {
    if (commandInput) commandInput.classList.remove('hidden');
    if (commandTextarea) commandTextarea.classList.add('hidden');
    if (commandHelpText) commandHelpText.classList.add('hidden');
  }
  
  const commandContainer = document.getElementById('item-command-container');
  const browseBtn = commandContainer?.querySelector('button');
  if (e.target.value === 'command' || e.target.value === 'url') {
    if (browseBtn) browseBtn.classList.add('hidden');
  } else {
    if (browseBtn) browseBtn.classList.remove('hidden');
  }
}

// 渲染 Java 环境选项
async function renderJavaEnvironmentOptions(selectedEnvId = '') {
  const javaEnvSelect = document.getElementById('item-java-environment');
  const javaEnvOption = document.getElementById('java-environment-option');
  if (!javaEnvSelect) return;
  
  // 清空现有选项
  javaEnvSelect.innerHTML = '';
  
  try {
    // 从主进程获取最新的环境配置
    const envConfig = await window.api.getEnvironment();
    
    // 更新本地 AppConfig 以保持数据一致性
    AppConfig.environment = envConfig;
    
    // 检查是否有配置的 Java 环境
    if (envConfig.javaEnvironments && envConfig.javaEnvironments.length > 0) {
      // 添加 Java 环境选项
      envConfig.javaEnvironments.forEach(env => {
        const option = document.createElement('option');
        option.value = env.id;
        option.textContent = env.name;
        javaEnvSelect.appendChild(option);
      });
      
      // 恢复之前选中的值，如果没有则选择默认环境
      if (selectedEnvId) {
        javaEnvSelect.value = selectedEnvId;
      } else if (envConfig.defaultJavaEnvironmentId) {
        javaEnvSelect.value = envConfig.defaultJavaEnvironmentId;
      }
    } else {
      // 没有配置 Java 环境，显示提示选项
      const noEnvOption = document.createElement('option');
      noEnvOption.value = '';
      noEnvOption.textContent = '未配置 Java 环境';
      noEnvOption.disabled = true;
      javaEnvSelect.appendChild(noEnvOption);
    }
  } catch (error) {
    console.error('获取环境配置失败:', error);
    // 出错时使用本地配置
    if (AppConfig.environment.javaEnvironments && AppConfig.environment.javaEnvironments.length > 0) {
      // 添加 Java 环境选项
      AppConfig.environment.javaEnvironments.forEach(env => {
        const option = document.createElement('option');
        option.value = env.id;
        option.textContent = env.name;
        javaEnvSelect.appendChild(option);
      });
      
      // 恢复之前选中的值，如果没有则选择默认环境
      if (selectedEnvId) {
        javaEnvSelect.value = selectedEnvId;
      } else if (AppConfig.environment.defaultJavaEnvironmentId) {
        javaEnvSelect.value = AppConfig.environment.defaultJavaEnvironmentId;
      }
    } else {
      // 没有配置 Java 环境，显示提示选项
      const noEnvOption = document.createElement('option');
      noEnvOption.value = '';
      noEnvOption.textContent = '未配置 Java 环境';
      noEnvOption.disabled = true;
      javaEnvSelect.appendChild(noEnvOption);
    }
  }
}

// 从文件路径提取工作目录
function getWorkingDirectory(filePath) {
  if (!filePath) return '';

  const cleanedPath = String(filePath).trim().replace(/^["']|["']$/g, '');
  const separatorIndex = Math.max(cleanedPath.lastIndexOf('\\'), cleanedPath.lastIndexOf('/'));
  return separatorIndex > 1 ? cleanedPath.slice(0, separatorIndex) : '';
}

async function logItemRun(item, status, detail = '') {
  try {
    await window.api.logRunEvent(
      item?.name || '未命名工具',
      item?.type || 'unknown',
      status,
      String(detail || '')
    );
  } catch (logError) {
    console.error('写入运行审计日志失败:', logError);
  }
}

// 运行项目（最终完整版，稳定可交付）
async function runItem(item) {
  try {
    await logItemRun(item, 'START', `目标=${item?.command || ''}`);
    // 记录工具使用统计
    if (!AppConfig.usageStats) {
      AppConfig.usageStats = {};
    }
    
    if (!AppConfig.usageStats[item.id]) {
      AppConfig.usageStats[item.id] = {
        count: 0,
        lastUsed: 0
      };
    }
    
    AppConfig.usageStats[item.id].count += 1;
    AppConfig.usageStats[item.id].lastUsed = Date.now();
    
    // 保存使用统计
    await saveConfig();
    
    // 重新渲染分类列表，更新最近使用的数量
    renderCategories();
    
    switch (item.type) {

      /* ================= URL ================= */
      case 'url': {
        let url = item.command;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        await window.api.openUrl(url);
        await logItemRun(item, 'SUCCESS', `URL 已打开：${url}`);
        showNotification('成功', `URL已打开: ${item.name}`, 'success');
        
        // 检查是否需要自动最小化
        if (AppConfig.settings.autoMinimizeAfterRun) {
          window.api.minimizeWindow();
        }
        return;
      }

      /* ================= COMMAND ================= */
      case 'command': {
        const commands = item.command.split('\n').filter(l => l.trim());
        const combinedCommand = commands.join(' & ');

        if (item.runInTerminal) {
          await window.api.executeCommandInTerminal(combinedCommand, '', '');
          await logItemRun(item, 'LAUNCHED', '命令已在终端启动');
          showNotification('成功', `命令已在终端启动: ${item.name}`, 'success');
          
          // 检查是否需要自动最小化
          if (AppConfig.settings.autoMinimizeAfterRun) {
            window.api.minimizeWindow();
          }
          return;
        }

        window.api.executeCommand(combinedCommand, '')
          .then(() => {
            logItemRun(item, 'SUCCESS', '命令执行完成');
            showNotification('成功', `命令执行完成: ${item.name}`, 'success');
            if (AppConfig.settings.autoMinimizeAfterRun) {
              window.api.minimizeWindow();
            }
          })
          .catch(err => {
            logItemRun(item, 'ERROR', `命令执行失败：${String(err)}`);
            showNotification('错误', `命令执行失败: ${err}`, 'error');
          });
        return;
      }

      /* ================= PYTHON ================= */
      case 'python': {
        const scriptPath = item.command.trim();
        const workingDir = getWorkingDirectory(scriptPath);
        const result = await window.api.executePythonTool({
          name: item.name,
          targetPath: scriptPath,
          programArgs: item.launchParams || '',
          workingDirectory: workingDir,
          runInTerminal: Boolean(item.runInTerminal)
        });
        await logItemRun(item, 'LAUNCHED', result.message);
        showNotification('已启动', item.runInTerminal
          ? `Python 已在终端启动: ${item.name}`
          : `Python 已启动: ${item.name}（PID ${result.pid}）`, 'success');
        if (AppConfig.settings.autoMinimizeAfterRun) {
          window.api.minimizeWindow();
        }
        return;
      }

      /* ================= JAVA ================= */
      case 'java': {
        const jarPath = item.command.trim();
        const workingDir = getWorkingDirectory(jarPath);
        const result = await window.api.executeJavaTool({
          name: item.name,
          targetPath: jarPath,
          runtimeArgs: item.launchParams || '',
          programArgs: item.javaProgramParams || '',
          workingDirectory: workingDir,
          javaEnvironmentId: item.javaEnvironmentId || '',
          runInTerminal: Boolean(item.runInTerminal)
        });
        await logItemRun(item, 'LAUNCHED', `${result.message}，Java ${result.runtimeVersion}`);
        showNotification('已启动', item.runInTerminal
          ? `Java ${result.runtimeVersion} 已在终端启动: ${item.name}`
          : `Java ${result.runtimeVersion} 已启动: ${item.name}（PID ${result.pid}）`, 'success');
        if (AppConfig.settings.autoMinimizeAfterRun) {
          window.api.minimizeWindow();
        }
        return;
      }
      /* ================= APPLICATION ================= */
      case 'application': {
        const workingDir = getWorkingDirectory(item.command);
        const result = await window.api.startApplication(item.command, item.launchParams || '', workingDir);
        await logItemRun(item, 'LAUNCHED', String(result));

        showNotification(
          '成功',
          String(result).includes('管理员权限')
            ? `请在 UAC 窗口确认启动: ${item.name}`
            : `应用程序已启动: ${item.name}`,
          'success'
        );
        
        // 检查是否需要自动最小化
        if (AppConfig.settings.autoMinimizeAfterRun) {
          window.api.minimizeWindow();
        }
        return;
      }

      /* ================= FILE / FOLDER ================= */
      case 'file':
      case 'folder': {
        await window.api.openPath(item.command);
        await logItemRun(item, 'SUCCESS', `${item.type === 'file' ? '文件' : '文件夹'}已打开`);
        showNotification(
          '成功',
          `${item.type === 'file' ? '文件' : '文件夹'}已打开: ${item.name}`,
          'success'
        );
        
        // 检查是否需要自动最小化
        if (AppConfig.settings.autoMinimizeAfterRun) {
          window.api.minimizeWindow();
        }
        return;
      }

      default:
        await logItemRun(item, 'WARN', `未知项目类型：${item.type}`);
        showNotification('提示', `未知项目类型: ${item.type}`, 'warning');
        return;
    }
  } catch (err) {
    console.error(err);
    const message = err?.message || String(err);
    await logItemRun(item, 'ERROR', `执行失败：${message}`);
    showNotification('错误', '执行失败: ' + message, 'error');
  }
}


// 打开程序文件夹
async function openFolder(command, itemType) {
  try {
    let folderPath = '';
    
    // 特殊处理文件和文件夹类型
    if (itemType === 'folder') {
      // 文件夹类型直接使用command作为文件夹路径
      folderPath = command;
    } else if (itemType === 'file') {
      // 文件类型提取所在目录
      if (command) {
        folderPath = command.replace(/[\\/][^\\/]+$/, '');
      }
    } else {
      // 其他类型的处理逻辑保持不变
      // 获取Python脚本所在目录
      if (command.includes('.py')) {
        const match = command.match(/(.+?[\\/][^\\/]+\.py)/);
        if (match) {
          folderPath = match[1].replace(/[\\/][^\\/]+$/, '');
        }
      }
      // 获取Java/JAR文件所在目录
      else if (command.includes('.jar') || command.match(/\.class\b/)) {
        const match = command.match(/(.+?[\\/][^\\/]+\.(jar|class))/)
                   || command.match(/(.+?[\\/][^\\/]+)$/);
        if (match) {
          folderPath = match[1].replace(/[\\/][^\\/]+$/, '');
        }
      }
      // 获取应用程序所在目录
      else if (command.includes('.exe') || command.includes('.lnk')) {
        const match = command.match(/(.+?[\\/][^\\/]+\.(exe|lnk))/)
                   || command.match(/(.+?[\\/][^\\/]+)$/);
        if (match) {
          folderPath = match[1].replace(/[\\/][^\\/]+$/, '');
        }
      }
      // 尝试从完整路径提取目录
      else {
        const match = command.match(/(.+?[\\/][^\\/]+)/);
        if (match) {
          const potentialPath = match[1];
          // 检查是否是有效路径
          if (potentialPath.includes(':') || potentialPath.startsWith('\\\\')) {
            folderPath = potentialPath.replace(/[\\/][^\\/]+$/, '');
          }
        }
      }
    }
    
    if (folderPath) {
      await window.api.openPath(folderPath);
      showNotification('成功', `已打开文件夹: ${folderPath}`, 'success');
    } else {
      showNotification('提示', '无法确定程序文件夹', 'warning');
    }
  } catch (error) {
    showNotification('错误', `无法打开文件夹: ${error}`, 'error');
  }
}

// 删除项目
async function deleteItem(itemId) {
  // 删除项目
  AppConfig.items = AppConfig.items.filter(item => item.id !== itemId);
  await saveConfig();
  
  // 重新渲染分类和项目列表
  renderCategories();
  renderItems(currentSearchTerm);
}

// 初始化右键菜单
function initContextMenu() {
  // 创建右键菜单元素
  const contextMenu = document.createElement('div');
  contextMenu.id = 'item-context-menu';
  contextMenu.className = 'hidden context-menu';
  
  // 菜单标题
  const menuTitle = document.createElement('div');
  menuTitle.className = 'px-3 py-1.5 text-xs border-b menu-item-name font-medium truncate menu-title-truncate'; // 添加自定义类名
  menuTitle.textContent = '项目操作';
  contextMenu.appendChild(menuTitle);
  
  // 运行菜单项
  const runMenuItem = document.createElement('div'); // 避免函数名冲突，修改变量名
  runMenuItem.className = 'px-3 py-1.5 cursor-pointer flex items-center context-menu-item';
  runMenuItem.innerHTML = '<i class="fas fa-play mr-2 text-primary"></i> 运行'; // 修改为 v5 类名
  runMenuItem.addEventListener('click', () => {
    const itemId = contextMenu.dataset.itemId;
    const item = AppConfig.items.find(i => i.id === itemId);
    if (item) {
      runItem(item);
    }
    contextMenu.classList.add('hidden');
  });
  contextMenu.appendChild(runMenuItem);
  
  // 以管理员身份运行菜单项
  const runAsAdminMenuItem = document.createElement('div');
  runAsAdminMenuItem.className = 'px-3 py-1.5 cursor-pointer flex items-center context-menu-item admin-run-menu-item';
  runAsAdminMenuItem.innerHTML = '<i class="fas fa-user-shield mr-2 text-primary"></i> 以管理员身份运行';
  runAsAdminMenuItem.addEventListener('click', async () => {
    const itemId = contextMenu.dataset.itemId;
    const item = AppConfig.items.find(i => i.id === itemId);
    if (item && item.type === 'application') {
      await logItemRun(item, 'START', `请求管理员权限启动：${item.command || ''}`);
      // 记录工具使用统计
      if (!AppConfig.usageStats) {
        AppConfig.usageStats = {};
      }
      
      if (!AppConfig.usageStats[item.id]) {
        AppConfig.usageStats[item.id] = {
          count: 0,
          lastUsed: 0
        };
      }
      
      AppConfig.usageStats[item.id].count += 1;
      AppConfig.usageStats[item.id].lastUsed = Date.now();
      
      // 保存使用统计
      await saveConfig();
      
      // 重新渲染分类列表，更新最近使用的数量
      renderCategories();
      
      // 直接通过 Windows runas 启动目标程序，避免创建常驻的管理员 CMD 窗口
      try {
        await window.api.startApplicationAsAdmin(
          item.command,
          item.launchParams || '',
          item.workingDir || ''
        );
        await logItemRun(item, 'LAUNCHED', '已提交管理员权限启动请求');
        showNotification('成功', `请在 UAC 窗口确认启动: ${item.name}`, 'success');
      } catch (err) {
        console.error('以管理员身份运行失败:', err);
        await logItemRun(item, 'ERROR', `管理员启动失败：${String(err)}`);
        showNotification('错误', '以管理员身份运行失败: ' + err, 'error');
        contextMenu.classList.add('hidden');
        return;
      }
      
      // 检查是否需要自动最小化
      if (AppConfig.settings.autoMinimizeAfterRun) {
        window.api.minimizeWindow();
      }
    }
    contextMenu.classList.add('hidden');
  });
  contextMenu.appendChild(runAsAdminMenuItem);
  
  // 打开程序文件夹菜单项
  const openFolderItem = document.createElement('div');
  openFolderItem.className = 'px-3 py-1.5 cursor-pointer flex items-center context-menu-item folder-menu-item';
  openFolderItem.innerHTML = '<i class="fas fa-folder-open mr-2 text-primary"></i> 打开程序文件夹';
  openFolderItem.addEventListener('click', () => {
    const itemId = contextMenu.dataset.itemId;
    const item = AppConfig.items.find(i => i.id === itemId);
    if (item && item.type !== 'url') {
      openFolder(item.command, item.type);
    }
    contextMenu.classList.add('hidden');
  });
  contextMenu.appendChild(openFolderItem);
  
  // 编辑菜单项
  const editItem = document.createElement('div');
  editItem.className = 'px-3 py-1.5 cursor-pointer flex items-center context-menu-item';
  editItem.innerHTML = '<i class="fas fa-pencil-alt mr-2 text-primary"></i> 编辑'; // 修改为 v5 图标
  editItem.addEventListener('click', () => {
    const itemId = contextMenu.dataset.itemId;
    openItemModal(itemId);
    contextMenu.classList.add('hidden');
  });
  contextMenu.appendChild(editItem);
  
  // 删除菜单项
  const deleteItem = document.createElement('div');
  deleteItem.className = 'px-3 py-1.5 cursor-pointer flex items-center text-danger context-menu-item';
  deleteItem.innerHTML = '<i class="fas fa-trash-alt mr-2"></i> 删除'; // 修改为 v5 图标
  deleteItem.addEventListener('click', () => {
    const itemId = contextMenu.dataset.itemId;
    const item = AppConfig.items.find(i => i.id === itemId);
    if (item) {
      currentItemId = itemId;
      document.getElementById('confirm-title').textContent = '确认删除';
      document.getElementById('confirm-message').textContent = `你确定要删除 "${item.name}" 吗？`;
      document.getElementById('confirm-ok-btn').textContent = '确认删除';
      document.getElementById('confirm-modal').classList.remove('hidden');
    }
    contextMenu.classList.add('hidden');
  });
  contextMenu.appendChild(deleteItem);
  
  // 添加到页面
  document.body.appendChild(contextMenu);
}

// 根据当前视图应用排序
function applySortOrder(items) {
  // 确保sortOrders对象存在
  if (!AppConfig.sortOrders) {
    AppConfig.sortOrders = {
      all: [],
      favorites: []
    };
  }
  
  // 对于最近使用分类，不应用自定义排序，保持按使用次数排序
  if (currentCategoryId === 'recent') {
    return items;
  }
  
  // 确定当前视图的排序键
  let sortKey;
  if (showFavoritesOnly) {
    sortKey = 'favorites';
  } else if (currentCategoryId) {
    sortKey = `category_${currentCategoryId}`;
  } else {
    sortKey = 'all';
  }
  
  // 确保排序数组存在
  if (!AppConfig.sortOrders[sortKey]) {
    AppConfig.sortOrders[sortKey] = [];
  }
  
  const sortOrder = AppConfig.sortOrders[sortKey];
  
  // 如果没有排序数据，返回原始顺序
  if (!sortOrder || sortOrder.length === 0) {
    return items;
  }
  
  // 根据排序数据对项目进行排序
  return items.sort((a, b) => {
    const indexA = sortOrder.indexOf(a.id);
    const indexB = sortOrder.indexOf(b.id);
    
    // 如果项目不在排序数组中，将其放在末尾
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    
    return indexA - indexB;
  });
}

// 保存排序顺序
async function saveSortOrder(items) {
  // 对于最近使用分类，不保存自定义排序
  if (currentCategoryId === 'recent') {
    return;
  }
  
  // 确保sortOrders对象存在
  if (!AppConfig.sortOrders) {
    AppConfig.sortOrders = {
      all: [],
      favorites: []
    };
  }
  
  // 确定当前视图的排序键
  let sortKey;
  if (showFavoritesOnly) {
    sortKey = 'favorites';
  } else if (currentCategoryId) {
    sortKey = `category_${currentCategoryId}`;
  } else {
    sortKey = 'all';
  }
  
  // 提取项目ID并保存排序
  const itemIds = items.map(item => item.id);
  AppConfig.sortOrders[sortKey] = itemIds;
  
  // 保存配置到文件
  try {
    await saveConfig();
  } catch (error) {
    console.error('保存排序失败:', error);
  }
}

// 拖拽处理函数

// 处理拖拽开始
function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  isDragging = true;
  
  // 立即清除所有卡片的tooltip，就像鼠标离开卡片时那样
  document.querySelectorAll('.item-tooltip').forEach(t => {
    // 临时移除过渡效果，确保立即隐藏
    const originalTransition = t.style.transition;
    t.style.transition = 'none';
    
    t.classList.add('opacity-0', 'invisible', '-translate-y-2');
    t.classList.remove('opacity-100', 'visible', 'translate-y-0');
    
    // 强制重绘
    t.offsetHeight;
    
    // 恢复原始过渡效果
    setTimeout(() => {
      t.style.transition = originalTransition;
    }, 0);
  });
  
  // 清除所有卡片的hover定时器
  document.querySelectorAll('.item-card').forEach(card => {
    if (card._hoverTimer) {
      clearTimeout(card._hoverTimer);
      card._hoverTimer = null;
    }
  });
  
  // 获取当前拖拽元素的索引
  const cards = Array.from(document.querySelectorAll('.item-card'));
  dragStartIndex = cards.indexOf(this);
  
  // 设置拖拽数据
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

// 处理拖拽结束
function handleDragEnd(e) {
  this.classList.remove('dragging');
  draggedElement = null;
  isDragging = false;
  
  // 移除所有卡片的drag-over类和视觉反馈
  document.querySelectorAll('.item-card').forEach(card => {
    card.classList.remove('drag-over');
    card.style.border = '';
    card.style.backgroundColor = '';
  });
  
  // 重置拖拽索引
  dragStartIndex = -1;
  dragEndIndex = -1;
}

// 处理拖拽经过
function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  // 在dragover事件中也添加视觉反馈，确保可靠性
  if (this !== draggedElement) {
    this.classList.add('drag-over');
    this.style.border = '2px dashed var(--theme-color, #165DFF)';
    this.style.backgroundColor = 'rgba(22, 93, 255, 0.05)';
  }
  
  return false;
}

// 处理拖拽进入
function handleDragEnter(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  if (this !== draggedElement) {
    // 移除其他卡片的视觉反馈
    document.querySelectorAll('.item-card').forEach(card => {
      if (card !== this && card !== draggedElement) {
        card.classList.remove('drag-over');
        card.style.border = '';
        card.style.backgroundColor = '';
      }
    });
    
    // 添加当前卡片的视觉反馈
    this.classList.add('drag-over');
    this.style.border = '2px dashed var(--theme-color, #165DFF)';
    this.style.backgroundColor = 'rgba(22, 93, 255, 0.05)';
  }
}

// 处理拖拽离开
function handleDragLeave(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  // 只有当鼠标完全离开卡片时才移除视觉反馈
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('drag-over');
    this.style.border = '';
    this.style.backgroundColor = '';
  }
}

// 处理拖拽放置
async function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  if (draggedElement !== this) {
    // 获取所有卡片
    const cards = Array.from(document.querySelectorAll('.item-card'));
    dragEndIndex = cards.indexOf(this);
    
    // 重新排序项目
    await reorderItems(dragStartIndex, dragEndIndex);
  }
  
  // 移除视觉反馈
  this.classList.remove('drag-over');
  this.style.border = '';
  this.style.backgroundColor = '';
  
  return false;
}

// 重新排序项目
async function reorderItems(startIndex, endIndex) {
  if (startIndex === -1 || endIndex === -1) return;
  
  // 获取当前显示的项目
  let itemsToRender = AppConfig.items;
  
  // 应用收藏筛选
  if (showFavoritesOnly) {
    itemsToRender = itemsToRender.filter(item => item.isFavorite);
  }
  
  // 应用分类筛选
  if (currentCategoryId) {
    itemsToRender = itemsToRender.filter(item => item.categoryId === currentCategoryId);
  }
  
  // 应用搜索筛选
  if (currentSearchTerm) {
    const lowerSearchTerm = currentSearchTerm.toLowerCase();
    itemsToRender = itemsToRender.filter(item => 
      item.name.toLowerCase().includes(lowerSearchTerm) || 
      item.command.toLowerCase().includes(lowerSearchTerm)
    );
  }
  
  // 应用当前排序
  itemsToRender = applySortOrder(itemsToRender);
  
  // 确保索引有效
  if (startIndex < 0 || startIndex >= itemsToRender.length || 
      endIndex < 0 || endIndex >= itemsToRender.length) {
    return;
  }
  
  // 执行排序操作
  const reorderedItems = [...itemsToRender];
  const [movedItem] = reorderedItems.splice(startIndex, 1);
  reorderedItems.splice(endIndex, 0, movedItem);
  
  // 保存新的排序顺序
  try {
    await saveSortOrder(reorderedItems);
    // 重新渲染项目列表
    renderItems(currentSearchTerm);
  } catch (error) {
    console.error('排序失败:', error);
    showNotification('错误', '保存排序失败: ' + error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.api.receive('runtime-tool-finished', result => {
    if (result?.status !== 'ERROR') return;
    const detail = result.detail ? `：${result.detail}` : '';
    showNotification('运行异常', `${result.name || '工具'} 已退出${detail}`, 'error', { log: false });
  });
});
