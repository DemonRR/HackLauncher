// js/notifications.js
// 显示通知
function showNotification(title, message, type = 'info') {
  const notification = document.getElementById('notification');
  const notificationTitle = document.getElementById('notification-title');
  const notificationMessage = document.getElementById('notification-message');
  const notificationIcon = document.getElementById('notification-icon');
  
  // 移除之前的类型类
  notification.classList.remove('success', 'error', 'warning', 'info');
  
  // 添加当前类型类
  notification.classList.add(type);
  
  notificationTitle.textContent = title;
  notificationMessage.textContent = message;
  
  // 设置图标和颜色
  notificationIcon.innerHTML = '';
  if (type === 'success') {
    notificationIcon.innerHTML = '<i class="fa fa-check-circle text-green-500"></i>';
  } else if (type === 'error') {
    notificationIcon.innerHTML = '<i class="fa fa-exclamation-circle text-red-500"></i>';
  } else if (type === 'warning') {
    notificationIcon.innerHTML = '<i class="fa fa-exclamation-triangle text-yellow-500"></i>';
  } else {
    notificationIcon.innerHTML = '<i class="fa fa-info-circle text-blue-500"></i>';
  }
  
  // 确保通知是可见的
  notification.classList.remove('translate-x-full');
  
  // 4秒后自动关闭
  setTimeout(() => {
    hideNotification();
  }, 4000);
}

// 隐藏通知
function hideNotification() {
  const notification = document.getElementById('notification');
  notification.classList.add('translate-x-full');
}

// 切换通知显示/隐藏
function toggleNotification() {
  const notification = document.getElementById('notification');
  notification.classList.toggle('translate-x-full');
}

// 打开日志所在文件夹
function openLogFile() {
  // 调用Electron API打开日志所在文件夹
  if (window.api && window.api.openLogFile) {
    window.api.openLogFile();
    // 打开日志文件夹后自动隐藏提示框
    hideNotification();
  } else {
    showNotification('错误', '无法打开日志所在文件夹：API不可用', 'error');
  }
}

// 初始化通知事件监听器
document.addEventListener('DOMContentLoaded', () => {
  const notification = document.getElementById('notification');
  const notificationLogBtn = document.getElementById('notification-log-btn');
  
  // 添加点击通知区域切换显示/隐藏的事件
  notification.addEventListener('click', (e) => {
    // 避免点击按钮时触发
    if (e.target === notification || e.target.closest('#notification-icon') || 
        e.target.closest('#notification-title') || e.target.closest('#notification-message')) {
      toggleNotification();
    }
  });
  
  // 添加点击日志按钮打开日志文件的事件
  if (notificationLogBtn) {
    notificationLogBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 防止触发通知的点击事件
      openLogFile();
    });
  }
});