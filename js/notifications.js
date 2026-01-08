// js/notifications.js
// 显示通知
function showNotification(title, message, type = 'info') {
  const notification = document.getElementById('notification');
  const notificationTitle = document.getElementById('notification-title');
  const notificationMessage = document.getElementById('notification-message');
  const notificationIcon = document.getElementById('notification-icon');
  
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
  
  // 显示通知
  notification.classList.remove('translate-x-full');
  
  // 3秒后自动关闭
  setTimeout(() => {
    notification.classList.add('translate-x-full');
  }, 3000);
}