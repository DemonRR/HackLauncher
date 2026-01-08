// js/categories.js
// 当前操作的分类ID（用于编辑和删除）
let currentCategoryIdForEdit = null;

// 检查分类名称是否已存在（不区分大小写）
function isCategoryNameExists(name, excludeId = null) {
  const normalizedName = name.trim().toLowerCase();
  return AppConfig.categories.some(category => 
    category.name.trim().toLowerCase() === normalizedName && 
    category.id !== excludeId
  );
}

// 渲染分类列表
function renderCategories() {
  const categoriesList = document.getElementById('categories-list');
  categoriesList.innerHTML = '';

  // 添加"全部项目"分类项
  const allCategoryItem = document.createElement('div');
  allCategoryItem.className = `flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-light-1 transition-custom category-list-item ${!currentCategoryId && !showFavoritesOnly ? 'bg-primary/10 text-primary' : ''}`;
  allCategoryItem.dataset.id = 'all';
  
  allCategoryItem.addEventListener('click', () => {
    currentCategoryId = null;
    showFavoritesOnly = false;
    renderCategories();
    renderItems();
  });

  // 创建分类内容
  const allCategoryContent = document.createElement('div');
  allCategoryContent.className = 'flex items-center space-x-2';
  
  const allCategoryIcon = document.createElement('i');
  allCategoryIcon.className = 'fa fa-list';
  
  const allCategoryName = document.createElement('span');
  allCategoryName.textContent = '全部项目';

  // 添加全部项目的数量统计，添加 item-count 类名
  const allItemCount = document.createElement('span');
  allItemCount.className = 'item-count bg-light-1 text-xs text-dark-2 rounded-full w-6 h-6 flex items-center justify-center shadow-sm';
  allItemCount.textContent = AppConfig.items.length;
  
  allCategoryContent.appendChild(allCategoryIcon);
  allCategoryContent.appendChild(allCategoryName);
  allCategoryContent.appendChild(allItemCount);
  
  allCategoryItem.appendChild(allCategoryContent);
  categoriesList.appendChild(allCategoryItem);

  // 添加"我的收藏"分类项
  const favoriteCategoryItem = document.createElement('div');
  favoriteCategoryItem.className = `flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-light-1 transition-custom category-list-item ${showFavoritesOnly ? 'bg-primary/10 text-primary' : ''}`;
  favoriteCategoryItem.dataset.id = 'favorites';
  
  const favoriteCount = AppConfig.items.filter(item => item.isFavorite).length;
  
  favoriteCategoryItem.addEventListener('click', () => {
    showFavoritesOnly = !showFavoritesOnly;
    if (showFavoritesOnly) {
      currentCategoryId = null;
    }
    renderCategories();
    renderItems();
  });

  const favoriteCategoryContent = document.createElement('div');
  favoriteCategoryContent.className = 'flex items-center space-x-2';
  
  const favoriteCategoryIcon = document.createElement('i');
  favoriteCategoryIcon.className = showFavoritesOnly ? 'fas fa-star text-yellow-500' : 'far fa-star';
  
  const favoriteCategoryName = document.createElement('span');
  favoriteCategoryName.textContent = '我的收藏';

  const favoriteItemCount = document.createElement('span');
  favoriteItemCount.className = 'item-count bg-light-1 text-xs text-dark-2 rounded-full w-6 h-6 flex items-center justify-center shadow-sm';
  favoriteItemCount.textContent = favoriteCount;
  
  favoriteCategoryContent.appendChild(favoriteCategoryIcon);
  favoriteCategoryContent.appendChild(favoriteCategoryName);
  favoriteCategoryContent.appendChild(favoriteItemCount);
  
  favoriteCategoryItem.appendChild(favoriteCategoryContent);
  categoriesList.appendChild(favoriteCategoryItem);

  // 添加用户自定义分类
  AppConfig.categories.forEach(category => {
    const categoryItem = document.createElement('div');
    categoryItem.className = `flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-light-1 transition-custom category-list-item ${currentCategoryId === category.id && !showFavoritesOnly ? 'bg-primary/10 text-primary' : ''}`;
    categoryItem.dataset.id = category.id;
    
    categoryItem.addEventListener('click', () => {
      currentCategoryId = category.id;
      showFavoritesOnly = false;
      renderCategories();
      renderItems();
    });

    // 分类内容
    const categoryContent = document.createElement('div');
    categoryContent.className = 'flex items-center space-x-2';
    
    const categoryIcon = document.createElement('i');
    categoryIcon.className = `fa ${category.icon}`;
    
    const categoryName = document.createElement('span');
    categoryName.textContent = category.name;

    // 添加项目数量统计，添加 item-count 类名
    const itemCount = document.createElement('span');
    itemCount.className = 'item-count bg-light-1 text-xs text-dark-2 rounded-full w-6 h-6 flex items-center justify-center shadow-sm';
    itemCount.textContent = AppConfig.items.filter(item => item.categoryId === category.id).length;
    
    categoryContent.appendChild(categoryIcon);
    categoryContent.appendChild(categoryName);
    categoryContent.appendChild(itemCount);
    
    // 操作按钮容器
    const actionButtons = document.createElement('div');
    actionButtons.className = 'flex items-center space-x-1 opacity-0 hover:opacity-100 transition-custom';
    
    const editButton = document.createElement('button');
    editButton.className = 'p-1 text-dark-2 hover:text-primary transition-custom';
    // 更新为 Font Awesome v5 类名
    editButton.innerHTML = '<i class="fas fa-pencil-alt"></i>'; 
    editButton.addEventListener('click', (e) => {
      e.stopPropagation();
      currentCategoryIdForEdit = category.id;
      openCategoryModal(category.id);
    });
    
    const deleteButton = document.createElement('button');
    deleteButton.className = 'p-1 text-dark-2 hover:text-danger transition-custom';
    // 更新为 Font Awesome v5 类名
    deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>'; 
    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      currentCategoryIdForEdit = category.id;
      document.getElementById('confirm-title').textContent = '确认删除';
      document.getElementById('confirm-message').textContent = `你确定要删除分类 "${category.name}" 吗？`;
      document.getElementById('confirm-ok-btn').textContent = '确认删除';
      document.getElementById('confirm-modal').classList.remove('hidden');
    });
    
    actionButtons.appendChild(editButton);
    actionButtons.appendChild(deleteButton);
    
    categoryItem.appendChild(categoryContent);
    categoryItem.appendChild(actionButtons);
    
    categoriesList.appendChild(categoryItem);
  });
}

// 打开分类模态框
function openCategoryModal(categoryId = null) {
  const modal = document.getElementById('category-modal');
  const form = document.getElementById('category-form');
  const title = document.getElementById('category-modal-title');
  
  // 重置表单
  form.reset();
  document.getElementById('category-id').value = '';
  document.getElementById('category-name-error').classList.add('hidden');
  document.getElementById('category-name-duplicate-error').classList.add('hidden'); // 新增：重置重复错误提示
  
  if (categoryId) {
    title.textContent = '编辑分类';
    
    // 查找要编辑的分类
    const category = AppConfig.categories.find(c => c.id === categoryId);
    if (category) {
      document.getElementById('category-id').value = category.id;
      document.getElementById('category-name').value = category.name;
      document.getElementById('category-icon').value = category.icon;
      document.getElementById('category-icon-preview').className = `fa ${category.icon}`;
    }
  } else {
    title.textContent = '添加分类';
    document.getElementById('category-icon-preview').className = 'fa fa-folder';
  }
  
  // 显示模态框
  modal.classList.remove('hidden');
  
  // 确保输入框可聚焦
  setTimeout(() => {
    document.getElementById('category-name').focus();
  }, 100);
}

// 设置分类相关事件
function setupCategoryEvents() {
  // 添加分类按钮
  document.getElementById('add-category-btn').addEventListener('click', () => {
    openCategoryModal();
  });
  
  // 分类表单提交
  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const categoryId = document.getElementById('category-id').value;
    const categoryName = document.getElementById('category-name').value.trim();
    const categoryIcon = document.getElementById('category-icon').value.trim();
    
    // 验证
    let isValid = true;
    
    // 重置错误提示
    document.getElementById('category-name-error').classList.add('hidden');
    document.getElementById('category-name-duplicate-error').classList.add('hidden');
    
    if (!categoryName) {
      document.getElementById('category-name-error').classList.remove('hidden');
      isValid = false;
    }
    
    // 新增：检查名称是否已存在
    if (categoryName && isCategoryNameExists(categoryName, categoryId)) {
      document.getElementById('category-name-duplicate-error').classList.remove('hidden');
      isValid = false;
    }
    
    if (!isValid) return;
    
    try {
      if (categoryId) {
        // 更新现有分类
        const index = AppConfig.categories.findIndex(c => c.id === categoryId);
        if (index !== -1) {
          AppConfig.categories[index].name = categoryName;
          AppConfig.categories[index].icon = categoryIcon;
          // 更新关联的项目
          AppConfig.items.forEach(item => {
            if (item.categoryId === categoryId) {
              item.categoryName = categoryName;
            }
          });
          showNotification('成功', '分类已更新', 'success');
        }
      } else {
        // 创建新分类
        const newCategory = {
          id: Date.now().toString(),
          name: categoryName,
          icon: categoryIcon || 'fa-folder'
        };
        AppConfig.categories.push(newCategory);
        showNotification('成功', '分类已添加', 'success');
      }
      
      // 保存配置
      await saveConfig();
      
      // 重新渲染分类和项目
      renderCategories();
      renderItems();
      
      // 关闭模态框
      document.getElementById('category-modal').classList.add('hidden');
    } catch (error) {
      console.error('保存分类失败:', error);
      showNotification('错误', '保存分类失败: ' + error.message, 'error');
    }
  });
  
  // 图标实时预览
  document.getElementById('category-icon').addEventListener('input', (e) => {
    const iconPreview = document.getElementById('category-icon-preview');
    iconPreview.className = `fa ${e.target.value || 'fa-folder'}`;
  });
}

// 删除分类
async function deleteCategory(categoryId) {
  // 从本地配置中删除分类及其项目
  AppConfig.categories = AppConfig.categories.filter(c => c.id !== categoryId);
  AppConfig.items = AppConfig.items.filter(i => i.categoryId !== categoryId);
  
  // 保存配置
  await saveConfig();
  
  // 更新UI
  renderCategories();
  renderItems();
}

// 保存分类
async function saveCategory() {
  try {
    const categoryId = document.getElementById('category-id').value;
    const categoryName = document.getElementById('category-name').value.trim();
    const categoryIcon = document.getElementById('category-icon').value.trim();
    
    // 验证
    let isValid = true;
    
    // 重置错误提示
    document.getElementById('category-name-error').classList.add('hidden');
    document.getElementById('category-name-duplicate-error').classList.add('hidden');
    
    if (!categoryName) {
      document.getElementById('category-name-error').classList.remove('hidden');
      isValid = false;
    }
    
    // 检查名称是否已存在
    if (categoryName && isCategoryNameExists(categoryName, categoryId)) {
      document.getElementById('category-name-duplicate-error').classList.remove('hidden');
      isValid = false;
    }
    
    if (!isValid) return;
    
    if (categoryId) {
      // 更新现有分类
      const index = AppConfig.categories.findIndex(c => c.id === categoryId);
      if (index !== -1) {
        AppConfig.categories[index].name = categoryName;
        AppConfig.categories[index].icon = categoryIcon;
        // 更新关联的项目
        AppConfig.items.forEach(item => {
          if (item.categoryId === categoryId) {
            item.categoryName = categoryName;
          }
        });
        showNotification('成功', '分类已更新', 'success');
      }
    } else {
      // 创建新分类
      const newCategory = {
        id: Date.now().toString(),
        name: categoryName,
        icon: categoryIcon || 'fa-folder'
      };
      AppConfig.categories.push(newCategory);
      showNotification('成功', '分类已添加', 'success');
    }
    
    // 保存配置
    await saveConfig();
    
    // 重新渲染分类和项目
    renderCategories();
    renderItems();
    
    // 关闭模态框
    document.getElementById('category-modal').classList.add('hidden');
  } catch (error) {
    console.error('保存分类失败:', error);
    showNotification('错误', '保存分类失败: ' + error.message, 'error');
  }
}