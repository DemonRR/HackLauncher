const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  addCategory: (name) => ipcRenderer.invoke('add-category', name),
  editCategory: (id, name) => ipcRenderer.invoke('edit-category', id, name),
  deleteCategory: (id) => ipcRenderer.invoke('delete-category', id),
  addItem: (item) => ipcRenderer.invoke('add-item', item),
  editItem: (id, updatedItem) => ipcRenderer.invoke('edit-item', id, updatedItem),
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  executeCommandInTerminal: (command, cwd) => ipcRenderer.invoke('execute-command-in-terminal', command, cwd),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),
  saveEnvironment: (env) => ipcRenderer.invoke('save-environment', env),
  getEnvironment: () => ipcRenderer.invoke('get-environment'),
  browsePath: (type) => ipcRenderer.invoke('browse-path', type),
  checkPathExists: (path) => ipcRenderer.invoke('check-path-exists', path),
  executeWithEnvironment: (item) => ipcRenderer.invoke('execute-with-environment', item),
  // 窗口控制相关
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('toggle-maximize-window'),
  showCloseConfirm: () => ipcRenderer.send('show-close-confirm'),
  // 关闭确认相关
  onCloseConfirm: (callback) => {
    ipcRenderer.on('show-close-confirm', callback);
  },
  confirmQuit: () => ipcRenderer.send('confirm-quit'),
  confirmMinimize: () => ipcRenderer.send('confirm-minimize')
});
