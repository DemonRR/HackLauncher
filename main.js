const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { exec, execSync, spawn } = require('child_process');

try {
  require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
} catch (e) {}

// 关键：添加 Windows 应用模型 ID，解决任务栏图标问题
if (process.platform === 'win32') {
  app.setAppUserModelId('com.demonrr.HackLauncher');
}

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

let config = {
  categories: [],
  items: [],
  theme: 'light',
  environment: {
    python: '',
    java: '',
    customPaths: []
  }
};

async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    config = JSON.parse(data);
    if (!config.environment) {
      config.environment = { python: '', java: '', customPaths: [] };
    }
    console.log('配置文件加载成功');
  } catch (error) {
    console.error('加载配置文件失败:', error);
    config = { categories: [], items: [], theme: 'light', environment: { python: '', java: '', customPaths: [] } };
    await saveConfig();
  }
}

async function saveConfig() {
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('配置文件保存成功');
  } catch (error) {
    console.error('保存配置文件失败:', error);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    // 关键修改：将 png 改为 ico 格式（和 package.json 中一致）
    icon: path.join(__dirname, 'icons', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true
    }
  });

  win.loadFile('index.html');

  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  console.log('主窗口已创建');
}

app.whenReady().then(async () => {
  await loadConfig();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  app.quit();
});

Menu.setApplicationMenu(null);

// 以下原有代码保持不变（省略，避免重复）
ipcMain.handle('get-config', () => {
  return config;
});

ipcMain.handle('save-config', async (event, newConfig) => {
  config = newConfig;
  await saveConfig();
  return true;
});

ipcMain.handle('add-category', async (event, name) => {
  const newCategory = { id: Date.now().toString(), name };
  config.categories.push(newCategory);
  await saveConfig();
  return newCategory;
});

ipcMain.handle('edit-category', async (event, id, name) => {
  const category = config.categories.find(c => c.id === id);
  if (category) {
    category.name = name;
    config.items.forEach(item => {
      if (item.categoryId === id) item.categoryName = name;
    });
    await saveConfig();
    return true;
  }
  return false;
});

ipcMain.handle('delete-category', async (event, id) => {
  config.items = config.items.filter(item => item.categoryId !== id);
  config.categories = config.categories.filter(c => c.id !== id);
  await saveConfig();
  return true;
});

ipcMain.handle('add-item', async (event, item) => {
  const newItem = { id: Date.now().toString(), ...item };
  config.items.push(newItem);
  await saveConfig();
  return newItem;
});

ipcMain.handle('edit-item', async (event, id, updatedItem) => {
  const index = config.items.findIndex(item => item.id === id);
  if (index !== -1) {
    config.items[index] = { ...config.items[index], ...updatedItem };
    await saveConfig();
    return true;
  }
  return false;
});

ipcMain.handle('delete-item', async (event, id) => {
  config.items = config.items.filter(item => item.id !== id);
  await saveConfig();
  return true;
});

ipcMain.handle('execute-command', (event, command, cwd) => {
  return new Promise((resolve, reject) => {
    const options = cwd && cwd.trim() ? { cwd: cwd } : {};
    exec(command, options, (error, stdout, stderr) => {
      if (error) reject(error.message);
      else resolve(stdout + stderr);
    });
  });
});

ipcMain.handle('execute-command-in-terminal', async (event, command, cwd) => {
  try {
    const { exec, spawn } = require('child_process');
    
    // 使用 start 命令打开新窗口，并指定窗口标题和工作目录
    let cmdCommand;
    
    if (cwd && cwd.trim()) {
      // 如果有工作目录，使用 cd 命令切换后再执行
      // 使用双引号包裹路径，避免路径中的空格问题
      const escapedCwd = cwd.replace(/"/g, '\\"');
      cmdCommand = `start "Runner" cmd /k "cd /d \"${escapedCwd}\" & ${command}"`;
    } else {
      cmdCommand = `start "Runner" cmd /k "${command}"`;
    }
    
    console.log('执行终端命令:', cmdCommand);
    
    exec(cmdCommand, {
      detached: true,
      windowsHide: false
    });
    
    return '命令已在新的cmd窗口中启动';
  } catch (error) {
    throw new Error(`执行命令失败: ${error.message}`);
  }
});

function escapeShell(cmd) {
  return cmd.replace(/([()%!^"<>&|])/g, '^$1');
}

ipcMain.handle('check-path-exists', (event, path) => {
  return require('fs').existsSync(path);
});

ipcMain.handle('open-url', async (event, url) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    throw new Error(`无法打开URL: ${error.message}`);
  }
});

ipcMain.handle('open-path', (event, path) => {
  shell.openPath(path);
});

ipcMain.handle('export-config', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!canceled) {
    try {
      await fs.writeFile(filePath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  }
  return false;
});

ipcMain.handle('import-config', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!canceled) {
    try {
      const data = await fs.readFile(filePaths[0], 'utf8');
      const newConfig = JSON.parse(data);
      config = newConfig;
      await saveConfig();
      return true;
    } catch (error) {
      return false;
    }
  }
  return false;
});

ipcMain.handle('save-environment', async (event, envConfig) => {
  config.environment = envConfig;
  await saveConfig();
  return true;
});

ipcMain.handle('get-environment', () => {
  return config.environment || { python: '', java: '', customPaths: [] };
});

ipcMain.handle('browse-path', async (event, type) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: type === 'file' ? ['openFile'] : ['openDirectory']
  });

  if (!canceled && filePaths.length > 0) {
    return filePaths[0];
  }
  return null;
});

ipcMain.handle('execute-with-environment', (event, item) => {
  return new Promise((resolve, reject) => {
    let command = item.command;
    let args = item.arguments || '';
    let finalCommand = '';

    if (item.type === 'python' && config.environment.python) {
      finalCommand = `"${config.environment.python}" ${command} ${args}`.trim();
    } else if (item.type === 'java' && config.environment.java) {
      finalCommand = `"${config.environment.java}" -jar "${command}" ${args}`.trim();
    } else if (item.type === 'application') {
      const argString = args ? ` ${args}` : '';
      finalCommand = `"${command}"${argString}`.trim();
    } else {
      finalCommand = `${command} ${args}`.trim();
    }

    if (item.runInTerminal) {
      const cmd = 'cmd.exe';
      const cmdArgs = ['/c', 'start', 'cmd', '/k', escapeShell(finalCommand)];
      const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
      resolve('命令已启动');
    } else {
      exec(finalCommand, (error, stdout, stderr) => {
        if (error) reject(error.message);
        else if (stderr) reject(stderr);
        else resolve(stdout);
      });
    }
  });
});