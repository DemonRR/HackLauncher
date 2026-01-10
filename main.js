const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { exec, execSync, spawn } = require('child_process');
const iconv = require('iconv-lite');

try {
  require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
} catch (e) {}

// 关键：添加 Windows 应用模型 ID，解决任务栏图标问题
if (process.platform === 'win32') {
  app.setAppUserModelId('com.demonrr.HackLauncher');
}

// 获取用户主目录
const USER_HOME = app.getPath('home');
// 设置配置文件路径到 ~/.config 目录
const CONFIG_DIR = path.join(USER_HOME, '.config', 'HackLauncher');
// 设置配置文件路径
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
// 设置日志文件路径
const LOG_PATH = path.join(CONFIG_DIR, 'hacklauncher.log');

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
    // 确保配置目录存在
    await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
    
    const data = await fsPromises.readFile(CONFIG_PATH, 'utf8');
    config = JSON.parse(data);
    if (!config.environment) {
      config.environment = { python: '', java: '', customPaths: [] };
    }
    logger.info('配置文件加载成功');
  } catch (error) {
    logger.error(`加载配置文件失败: ${error}`);
    config = { categories: [], items: [], theme: 'light', environment: { python: '', java: '', customPaths: [] } };
    await saveConfig();
  }
}

async function saveConfig() {
  try {
    await fsPromises.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    logger.info('配置文件保存成功');
  } catch (error) {
    logger.error(`保存配置文件失败: ${error}`);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 680,
    // 关键修改：将 png 改为 ico 格式（和 package.json 中一致）
    icon: path.join(__dirname, 'build', 'icon.ico'),
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

  logger.info('主窗口已创建');
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
    // 使用spawn代替exec，直接处理流数据
    const { spawn } = require('child_process');
    const options = cwd && cwd.trim() ? { cwd: cwd } : {};
    
    // 打印执行的命令
    logger.info(`执行命令: ${command}`);
    
    // 分割命令和参数
    const parts = command.match(/([^"']+)|"([^"]*)"|'([^']*)'/g);
    if (!parts) {
      reject('无效的命令格式');
      return;
    }
    
    // 处理引号
    const cmd = parts[0].replace(/^["']|["]$/g, '');
    const args = parts.slice(1).map(arg => arg.replace(/^["']|["]$/g, ''));
    
    // 创建子进程，不指定encoding，让输出保持Buffer形式
    const child = spawn(cmd, args, {
      ...options,
      shell: true // 使用shell来执行命令，处理管道等复杂情况
    });
    
    let stdoutBuffer = Buffer.alloc(0);
    let stderrBuffer = Buffer.alloc(0);
    
    // 收集stdout数据
    child.stdout.on('data', (data) => {
      stdoutBuffer = Buffer.concat([stdoutBuffer, data]);
    });
    
    // 收集stderr数据
    child.stderr.on('data', (data) => {
      stderrBuffer = Buffer.concat([stderrBuffer, data]);
    });
    
    // 处理子进程退出
    child.on('close', (code) => {
      // 处理输出数据
      const processedStdout = detectAndConvertEncoding(stdoutBuffer);
      const processedStderr = detectAndConvertEncoding(stderrBuffer);
      
      if (code !== 0) {
        // 如果命令执行失败，将所有输出作为错误信息返回
        const errorMessage = processedStdout + processedStderr || `命令执行失败，退出码: ${code}`;
        // 记录错误信息到日志
        logger.error(`命令执行失败: ${errorMessage}`);
        reject(errorMessage);
      } else {
        // 如果命令执行成功，返回所有输出
        resolve(processedStdout + processedStderr);
      }
    });
    
    // 处理子进程错误
    child.on('error', (error) => {
      const errorMessage = `创建子进程失败: ${error.message}`;
      logger.error(errorMessage);
      reject(errorMessage);
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
      cmdCommand = `start "Runner" cmd /k "chcp 65001 >nul & cd /d \"${escapedCwd}\" & ${command}"`;
    } else {
      cmdCommand = `start "Runner" cmd /k "chcp 65001 >nul & ${command}"`;
    }
    
    logger.info(`执行终端命令: ${cmdCommand}`);
    
    exec(cmdCommand, {
      detached: true,
      windowsHide: false,
      encoding: 'utf8'
    });
    
    return '命令已在新的cmd窗口中启动';
  } catch (error) {
    const errorMessage = `执行命令失败: ${error.message}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
});

function escapeShell(cmd) {
  return cmd.replace(/([()%!^"<>&|])/g, '^$1');
}

// 日志记录函数
function log(level, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
  
  // 输出到控制台
  console[level === 'error' ? 'error' : 'log'](logMessage);
  
  // 只将命令相关的日志写入日志文件
  const isCommandRelated = message.includes('执行命令:') || 
                         message.includes('执行终端命令:') || 
                         message.includes('命令执行失败:') ||
                         message.includes('创建子进程失败:');
  
  if (isCommandRelated) {
    try {
      // 确保配置目录存在
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      
      // 写入日志文件，使用UTF-8编码
      fs.appendFileSync(LOG_PATH, logMessage, { encoding: 'utf8' });
      
      // 检查日志文件大小，如果超过10MB，进行简单的日志轮转
      const stats = fs.statSync(LOG_PATH);
      if (stats.size > 10 * 1024 * 1024) {
        // 重命名旧日志文件
        const oldLogPath = path.join(CONFIG_DIR, `hacklauncher.log.${Date.now()}`);
        fs.renameSync(LOG_PATH, oldLogPath);
      }
    } catch (error) {
      console.error('写入日志失败:', error);
    }
  }
}

// 便捷日志函数
const logger = {
  info: (message) => log('info', message),
  error: (message) => log('error', message),
  warn: (message) => log('warn', message),
  debug: (message) => log('debug', message)
};

// 检测并转换字符串编码
function detectAndConvertEncoding(input) {
  if (!input) return input;
  
  // 1. 处理字符串类型
  if (typeof input === 'string') {
    // 字符串不包含乱码，直接返回
    if (!input.includes('�')) {
      return input;
    }
    
    // 包含乱码，转换为Buffer并尝试GBK解码
    const buffer = Buffer.from(input, 'latin1');
    return iconv.decode(buffer, 'gbk');
  }
  
  // 2. 处理Buffer类型
  if (Buffer.isBuffer(input)) {
    // 对于Buffer，我们直接尝试GBK解码，因为Java程序通常使用GBK编码
    const gbkResult = iconv.decode(input, 'gbk');
    
    // 检查GBK解码结果是否合理（不包含乱码）
    if (!gbkResult.includes('�')) {
      return gbkResult;
    }
    
    // 如果GBK解码也不行，尝试UTF-8
    return input.toString('utf8');
  }
  
  // 3. 其他类型，直接返回
  return input;
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

ipcMain.handle('open-log-file', async () => {
  try {
    // 确保日志文件存在
    if (!fs.existsSync(LOG_PATH)) {
      // 如果日志文件不存在，创建一个空文件
      fs.writeFileSync(LOG_PATH, '', { encoding: 'utf8' });
    }
    
    // 使用默认应用打开日志文件
    await shell.openPath(LOG_PATH);
    return true;
  } catch (error) {
    logger.error(`打开日志文件失败: ${error}`);
    return false;
  }
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

    // 打印执行的命令
    logger.info(`执行命令: ${finalCommand}`);

    if (item.runInTerminal) {
      const cmd = 'cmd.exe';
      const cmdArgs = ['/c', 'start', 'cmd', '/k', 'chcp 65001 >nul & ' + escapeShell(finalCommand)];
      const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
      resolve('命令已启动');
    } else {
      // 使用spawn代替exec，直接处理流数据
      const { spawn } = require('child_process');
      
      // 分割命令和参数
      const parts = finalCommand.match(/([^"']+)|"([^"]*)"|'([^']*)'/g);
      if (!parts) {
        const errorMessage = '无效的命令格式';
        logger.error(errorMessage);
        reject(errorMessage);
        return;
      }
      
      // 处理引号
      const cmd = parts[0].replace(/^["']|["]$/g, '');
      const spawnArgs = parts.slice(1).map(arg => arg.replace(/^["']|["]$/g, ''));
      
      // 创建子进程，不指定encoding，让输出保持Buffer形式
      const child = spawn(cmd, spawnArgs, {
        shell: true // 使用shell来执行命令，处理管道等复杂情况
      });
      
      let stdoutBuffer = Buffer.alloc(0);
      let stderrBuffer = Buffer.alloc(0);
      
      // 收集stdout数据
      child.stdout.on('data', (data) => {
        stdoutBuffer = Buffer.concat([stdoutBuffer, data]);
      });
      
      // 收集stderr数据
      child.stderr.on('data', (data) => {
        stderrBuffer = Buffer.concat([stderrBuffer, data]);
      });
      
      // 处理子进程退出
      child.on('close', (code) => {
        // 处理输出数据
        const processedStdout = detectAndConvertEncoding(stdoutBuffer);
        const processedStderr = detectAndConvertEncoding(stderrBuffer);
        
        if (code !== 0) {
          // 如果命令执行失败，将所有输出作为错误信息返回
          const errorMessage = processedStdout + processedStderr || `命令执行失败，退出码: ${code}`;
          logger.error(`命令执行失败: ${errorMessage}`);
          reject(errorMessage);
        } else {
          // 如果命令执行成功，返回所有输出
          resolve(processedStdout + processedStderr);
        }
      });
      
      // 处理子进程错误
      child.on('error', (error) => {
        const errorMessage = `创建子进程失败: ${error.message}`;
        logger.error(errorMessage);
        reject(errorMessage);
      });
    }
  });
});