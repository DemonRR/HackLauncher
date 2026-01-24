const { app, BrowserWindow, Menu, Tray, MenuItem, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { exec, execSync, spawn } = require('child_process');
const iconv = require('iconv-lite');

function getTrayIconPath() {
  const candidates = [];

  // ① 开发模式（你现在这个）
  candidates.push(path.join(__dirname, 'build', 'icon.ico'));

  // ② 打包后（extraResources）
  candidates.push(path.join(process.resourcesPath, 'icon.ico'));

  // ③ 极端情况（unpacked 调试）
  candidates.push(path.join(process.resourcesPath, 'build', 'icon.ico'));

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        logger.info('使用托盘图标: ' + p);
      } catch (e) {
        console.log('使用托盘图标: ' + p);
      }
      return p;
    }
  }

  try {
    logger.error('未找到任何可用托盘图标，尝试路径: ' + candidates.join(' | '));
  } catch (e) {
    console.error('未找到任何可用托盘图标，尝试路径: ' + candidates.join(' | '));
  }
  return null;
}


try {
  require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
} catch (e) {}

// 关键：添加 Windows 应用模型 ID，解决任务栏图标问题
if (process.platform === 'win32') {
  app.setAppUserModelId('com.demonrr.HackLauncher');
}

// 获取用户主目录
const USER_HOME = app.getPath('home');

// 获取安装目录（根据运行模式）
let INSTALL_DIR;
if (app.isPackaged) {
  // 打包后模式
  INSTALL_DIR = path.dirname(app.getPath('exe'));
} else {
  // 开发模式
  INSTALL_DIR = __dirname;
}

// 设置配置文件路径到安装目录的 config 目录
const CONFIG_DIR = path.join(INSTALL_DIR, 'config');
// 设置配置文件路径
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.db');
// 设置日志文件路径
const LOG_PATH = path.join(CONFIG_DIR, 'hacklauncher.log');

let config = {
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

// SQLite 数据库连接
let db = null;
const sqlite3 = require('sqlite3').verbose();

// 初始化数据库
async function initDatabase() {
  try {
    // 确保配置目录存在
    await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
    
    // 检查并恢复配置文件
    await checkAndRestoreConfig();
    
    // 创建数据库连接
    db = new sqlite3.Database(CONFIG_PATH);
    
    // 创建表
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // 创建配置表
        db.run(`
          CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT
          )
        `);
        
        // 创建分类表
        db.run(`
          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT,
            icon TEXT DEFAULT 'fa-folder'
          )
        `);
        
        // 创建项目表
        db.run(`
          CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            name TEXT,
            type TEXT,
            command TEXT,
            categoryId TEXT,
            categoryName TEXT,
            icon TEXT,
            iconType TEXT DEFAULT 'fa',
            imagePath TEXT DEFAULT '',
            launchParams TEXT DEFAULT '',
            description TEXT DEFAULT '',
            runInTerminal INTEGER DEFAULT 0,
            isFavorite INTEGER DEFAULT 0,
            javaEnvironmentId TEXT DEFAULT '',
            FOREIGN KEY (categoryId) REFERENCES categories (id)
          )
        `);
        
        resolve();
      });
    });
    
    logger.info('数据库初始化完成');
  } catch (error) {
    logger.error(`数据库初始化失败: ${error}`);
    throw error;
  }
}

// 检查并恢复配置文件
async function checkAndRestoreConfig() {
  try {
    // 检查是否存在旧的配置文件
    const oldConfigPath = path.join(INSTALL_DIR, 'config', 'config.json');
    const oldDbPath = path.join(INSTALL_DIR, 'config', 'config.db');
    
    // 如果存在旧的配置文件但没有当前配置文件，尝试恢复
    if ((fs.existsSync(oldConfigPath) || fs.existsSync(oldDbPath)) && !fs.existsSync(CONFIG_PATH)) {
      logger.info('检测到旧的配置文件，尝试恢复...');
      
      // 确保配置目录存在
      await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
      
      // 复制旧的配置文件
      if (fs.existsSync(oldDbPath)) {
        await fsPromises.copyFile(oldDbPath, CONFIG_PATH);
        logger.info('已从旧的 config.db 恢复配置');
      } else if (fs.existsSync(oldConfigPath)) {
        // 如果只有 JSON 文件，将在 importFromJson 中处理
        logger.info('检测到旧的 config.json 文件，将在导入过程中处理');
      }
    }
    
  } catch (error) {
    logger.error(`检查和恢复配置文件失败: ${error}`);
  }
}

// 从旧的 JSON 文件导入数据
async function importFromJson() {
  const oldJsonPath = path.join(CONFIG_DIR, 'config.json');
  if (!fs.existsSync(oldJsonPath)) {
    return false;
  }
  
  try {
    logger.info('检测到旧的 JSON 配置文件，开始导入...');
    
    // 读取旧的 JSON 文件
    const data = await fsPromises.readFile(oldJsonPath, 'utf8');
    const oldConfig = JSON.parse(data);
    
    // 导入分类
    if (oldConfig.categories && oldConfig.categories.length > 0) {
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          const stmt = db.prepare('INSERT OR REPLACE INTO categories (id, name, icon) VALUES (?, ?, ?)');
          oldConfig.categories.forEach(category => {
            stmt.run(category.id, category.name, category.icon || 'fa-folder');
          });
          stmt.finalize(err => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    }
    
    // 导入项目
    if (oldConfig.items && oldConfig.items.length > 0) {
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO items (
              id, name, type, command, categoryId, categoryName, icon, iconType, 
              imagePath, launchParams, description, runInTerminal, isFavorite, javaEnvironmentId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          oldConfig.items.forEach(item => {
            stmt.run(
              item.id,
              item.name,
              item.type,
              item.command,
              item.categoryId,
              item.categoryName,
              item.icon,
              item.iconType || 'fa',
              item.imagePath || '',
              item.launchParams || '',
              item.description || '',
              item.runInTerminal ? 1 : 0,
              item.isFavorite ? 1 : 0,
              item.javaEnvironmentId || ''
            );
          });
          stmt.finalize(err => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    }
    
    // 导入设置
    if (oldConfig.settings) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
          'settings',
          JSON.stringify(oldConfig.settings),
          err => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    // 导入环境配置
    if (oldConfig.environment) {
      // 处理旧版本的Java环境配置（单版本）
      let processedEnv = { ...oldConfig.environment };
      
      // 如果存在旧的java字段但不存在javaEnvironments字段，转换为新格式
      if (processedEnv.java && (!processedEnv.javaEnvironments || processedEnv.javaEnvironments.length === 0)) {
        // 创建一个Java环境对象
        const javaEnv = {
          id: Date.now().toString(),
          name: 'Java (旧版本)',
          path: processedEnv.java
        };
        
        // 设置javaEnvironments数组
        processedEnv.javaEnvironments = [javaEnv];
        
        // 设置默认Java环境ID
        processedEnv.defaultJavaEnvironmentId = javaEnv.id;
        
        // 保留旧的java字段以保持向后兼容
      }
      
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
          'environment',
          JSON.stringify(processedEnv),
          err => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    // 导入默认分类 ID
    if (oldConfig.defaultCategoryId) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
          'defaultCategoryId',
          oldConfig.defaultCategoryId,
          err => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    logger.info('从 JSON 文件导入数据成功');
    return true;
  } catch (error) {
    logger.error(`从 JSON 文件导入数据失败: ${error}`);
    return false;
  }
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

async function loadConfig() {
  try {
    // 初始化数据库
    await initDatabase();
    
    // 尝试从旧的 JSON 文件导入数据
    await importFromJson();
    
    // 加载分类
    config.categories = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM categories', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 加载项目
    config.items = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM items', (err, rows) => {
        if (err) reject(err);
        else {
          // 转换数值类型字段
          const items = rows.map(row => ({
            ...row,
            runInTerminal: row.runInTerminal === 1,
            isFavorite: row.isFavorite === 1,
            javaEnvironmentId: row.javaEnvironmentId || ''
          }));
          resolve(items);
        }
      });
    });
    
    // 加载设置
    const settingsRow = await new Promise((resolve, reject) => {
      db.get('SELECT value FROM config WHERE key = ?', 'settings', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (settingsRow) {
      config.settings = JSON.parse(settingsRow.value);
    }
    
    // 加载环境配置
    const environmentRow = await new Promise((resolve, reject) => {
      db.get('SELECT value FROM config WHERE key = ?', 'environment', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (environmentRow) {
      config.environment = JSON.parse(environmentRow.value);
    }
    
    // 加载默认分类 ID
    const defaultCategoryIdRow = await new Promise((resolve, reject) => {
      db.get('SELECT value FROM config WHERE key = ?', 'defaultCategoryId', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (defaultCategoryIdRow) {
      config.defaultCategoryId = defaultCategoryIdRow.value;
    }
    
    // 加载排序顺序
    const sortOrdersRow = await new Promise((resolve, reject) => {
      db.get('SELECT value FROM config WHERE key = ?', 'sortOrders', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (sortOrdersRow) {
      config.sortOrders = JSON.parse(sortOrdersRow.value);
    }
    
    // 加载分类顺序
    const categoryOrderRow = await new Promise((resolve, reject) => {
      db.get('SELECT value FROM config WHERE key = ?', 'categoryOrder', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (categoryOrderRow) {
      config.categoryOrder = JSON.parse(categoryOrderRow.value);
    }
    
    // 确保配置结构完整
    if (!config.settings) {
      config.settings = {
        theme: 'light',
        themeColor: '#165DFF',
        layout: 'grid',
        animations: true,
        closeBehavior: 'ask',
        autoMinimizeAfterRun: false
      };
    }
    
    // 确保环境配置存在
    if (!config.environment) {
      config.environment = { python: '', java: '', customPaths: [] };
    }
    
    // 确保排序顺序存在
    if (!config.sortOrders) {
      config.sortOrders = {
        all: [],
        favorites: []
      };
    }
    
    // 确保分类顺序存在
    if (!config.categoryOrder) {
      config.categoryOrder = [];
    }
    
    // 添加默认值，如果不存在
    config.settings.closeBehavior = config.settings.closeBehavior || 'ask';
    config.settings.autoMinimizeAfterRun = config.settings.autoMinimizeAfterRun || false;
    
    logger.info('配置加载成功');
  } catch (error) {
    logger.error(`加载配置失败: ${error}`);
    config = {
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
      environment: { python: '', java: '', customPaths: [] }
    };
    await saveConfig();
  }
}

async function saveConfig() {
  try {
    // 保存设置
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
        'settings',
        JSON.stringify(config.settings),
        err => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // 保存环境配置
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
        'environment',
        JSON.stringify(config.environment),
        err => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // 保存默认分类 ID
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
        'defaultCategoryId',
        config.defaultCategoryId,
        err => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // 保存排序顺序
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
        'sortOrders',
        JSON.stringify(config.sortOrders),
        err => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // 保存分类顺序
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
        'categoryOrder',
        JSON.stringify(config.categoryOrder),
        err => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // 保存分类
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // 先删除所有分类
        db.run('DELETE FROM categories', err => {
          if (err) {
            reject(err);
            return;
          }
          
          // 再插入所有分类
          const stmt = db.prepare('INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)');
          config.categories.forEach(category => {
            stmt.run(category.id, category.name, category.icon || 'fa-folder');
          });
          stmt.finalize(err => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });
    
    // 保存项目
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // 先删除所有项目
        db.run('DELETE FROM items', err => {
          if (err) {
            reject(err);
            return;
          }
          
          // 再插入所有项目
          const stmt = db.prepare(`
            INSERT INTO items (
              id, name, type, command, categoryId, categoryName, icon, iconType, 
              imagePath, launchParams, description, runInTerminal, isFavorite, javaEnvironmentId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          config.items.forEach(item => {
            stmt.run(
              item.id,
              item.name,
              item.type,
              item.command,
              item.categoryId,
              item.categoryName,
              item.icon,
              item.iconType || 'fa',
              item.imagePath || '',
              item.launchParams || '',
              item.description || '',
              item.runInTerminal ? 1 : 0,
              item.isFavorite ? 1 : 0,
              item.javaEnvironmentId || ''
            );
          });
          stmt.finalize(err => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });
    
    logger.info('配置保存成功');
  } catch (error) {
    logger.error(`保存配置失败: ${error}`);
  }
}

function createTray() {
  const trayIconPath = getTrayIconPath();

  if (!trayIconPath) {
    // ⚠ 不 return，继续跑，避免托盘事件系统半死
    return;
  }

  tray = new Tray(trayIconPath);

  tray.setToolTip('渗透武器库');

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));

  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  logger.info('系统托盘创建完成');
}



function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1190,
    height: 680,
    // 关键修改：将 png 改为 ico 格式（和 package.json 中一致）
    icon: path.join(__dirname, 'build', 'icon.ico'),
    frame: false, // 无边框窗口，使用自定义标题栏
    titleBarStyle: 'hidden', // 隐藏默认标题栏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true
    }
  });

  mainWindow.loadFile('index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // 监听窗口关闭事件
  mainWindow.on('close', (event) => {
    // 如果是应用程序主动退出，不显示提示
    if (isQuitting) {
      return;
    }
    
    // 获取关闭行为设置
    const closeBehavior = config.settings.closeBehavior || 'ask';
    
    switch (closeBehavior) {
      case 'close':
        // 直接关闭，不阻止默认行为
        isQuitting = true;
        break;
      case 'minimize':
        // 最小化到托盘，阻止默认行为
        event.preventDefault();
        mainWindow.hide();
        break;
      case 'ask':
      default:
        // 显示确认对话框，阻止默认行为
        event.preventDefault();
        mainWindow.webContents.send('show-close-confirm');
        break;
    }
  });

  // 监听渲染进程的退出确认
  ipcMain.on('confirm-quit', () => {
    isQuitting = true;
    app.quit();
  });

  // 监听渲染进程的最小化到托盘确认
ipcMain.on('confirm-minimize', () => {
  mainWindow.hide();
});

// 监听渲染进程的关闭确认请求
ipcMain.on('show-close-confirm', () => {
  // 获取关闭行为设置
  const closeBehavior = config.settings.closeBehavior || 'ask';
  
  switch (closeBehavior) {
    case 'close':
      // 直接关闭
      isQuitting = true;
      app.quit();
      break;
    case 'minimize':
      // 最小化到托盘
      mainWindow.hide();
      break;
    case 'ask':
    default:
      // 显示确认对话框
      mainWindow.webContents.send('show-close-confirm');
      break;
  }
});

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('主窗口已创建');
}

// 单实例运行逻辑
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 当第二个实例启动时，聚焦到已有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  await loadConfig();
  createWindow();
  createTray();

  app.on('activate', function () {
    if (mainWindow === null) createWindow();
  });
});

app.on('window-all-closed', function () {
  // 保持应用运行，不退出
  // 在Windows和Linux上，窗口全部关闭时应用会退出
  // 我们需要阻止默认行为，让应用继续运行在系统托盘中
  // 注意：在macOS上，即使所有窗口关闭，应用也会继续运行
  // 但在Windows和Linux上，我们需要明确阻止退出
  // 实际上，我们已经在close事件中阻止了窗口关闭，所以这个事件可能不会触发
});

// 当应用准备退出时，清理托盘资源
app.on('before-quit', () => {
  isQuitting = true;
  if (tray) {
    tray.destroy();
  }
});

Menu.setApplicationMenu(null);

// 窗口控制相关IPC处理
ipcMain.handle('minimize-window', () => {
  try {
    if (mainWindow) {
      mainWindow.minimize();
    }
    return true;
  } catch (error) {
    logger.error(`最小化窗口失败: ${error.message}`);
    return false;
  }
});

ipcMain.handle('toggle-maximize-window', () => {
  try {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
    return true;
  } catch (error) {
    logger.error(`切换窗口最大化状态失败: ${error.message}`);
    return false;
  }
});

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
  try {
    const newCategory = { id: Date.now().toString(), name };
    config.categories.push(newCategory);
    await saveConfig();
    logger.info(`添加分类成功: ${name}`);
    return newCategory;
  } catch (error) {
    logger.error(`添加分类失败: ${error.message}`);
    return null;
  }
});

ipcMain.handle('edit-category', async (event, id, name) => {
  try {
    const category = config.categories.find(c => c.id === id);
    if (category) {
      category.name = name;
      config.items.forEach(item => {
        if (item.categoryId === id) item.categoryName = name;
      });
      await saveConfig();
      logger.info(`编辑分类成功: ${id} -> ${name}`);
      return true;
    }
    logger.warn(`编辑分类失败: 分类不存在 (ID: ${id})`);
    return false;
  } catch (error) {
    logger.error(`编辑分类失败: ${error.message}`);
    return false;
  }
});

ipcMain.handle('delete-category', async (event, id) => {
  try {
    config.items = config.items.filter(item => item.categoryId !== id);
    config.categories = config.categories.filter(c => c.id !== id);
    await saveConfig();
    logger.info(`删除分类成功: ${id}`);
    return true;
  } catch (error) {
    logger.error(`删除分类失败: ${error.message}`);
    return false;
  }
});

ipcMain.handle('add-item', async (event, item) => {
  try {
    const newItem = { id: Date.now().toString(), ...item };
    config.items.push(newItem);
    await saveConfig();
    logger.info(`添加项目成功: ${item.name}`);
    return newItem;
  } catch (error) {
    logger.error(`添加项目失败: ${error.message}`);
    return null;
  }
});

ipcMain.handle('edit-item', async (event, id, updatedItem) => {
  try {
    const index = config.items.findIndex(item => item.id === id);
    if (index !== -1) {
      config.items[index] = { ...config.items[index], ...updatedItem };
      await saveConfig();
      logger.info(`编辑项目成功: ${id}`);
      return true;
    }
    logger.warn(`编辑项目失败: 项目不存在 (ID: ${id})`);
    return false;
  } catch (error) {
    logger.error(`编辑项目失败: ${error.message}`);
    return false;
  }
});

ipcMain.handle('delete-item', async (event, id) => {
  try {
    config.items = config.items.filter(item => item.id !== id);
    await saveConfig();
    logger.info(`删除项目成功: ${id}`);
    return true;
  } catch (error) {
    logger.error(`删除项目失败: ${error.message}`);
    return false;
  }
});

ipcMain.handle('execute-command', (event, command, cwd) => {
  return new Promise((resolve, reject) => {
    // 使用spawn代替exec，直接处理流数据
    const { spawn } = require('child_process');
    const options = cwd && cwd.trim() ? { cwd: cwd } : {};
    
    // 打印执行的命令
    logger.info(`执行命令: ${command}`);
    
    // 直接使用命令作为整体，让shell处理空格和引号
    // 创建子进程，不指定encoding，让输出保持Buffer形式
    const child = spawn(command, [], {
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
    let envSetup = 'chcp 65001 >nul';
    
    // 检查命令是否包含 Python 执行，如果是且设置了 Python 路径，修改 PATH 环境变量
    if (command.includes('.py') && config.environment.python) {
      // 获取 Python 路径的目录部分
      const pythonDir = path.dirname(config.environment.python);
      // 设置 PATH 环境变量，将 Python 目录添加到最前面
      envSetup += ` & set "PATH=${pythonDir};%PATH%"`;
    } 
    // 检查命令是否包含 Java 执行
    else if (command.includes('java.exe') || command.includes('.jar')) {
      // 尝试从命令中提取 Java 路径
      const javaPathMatch = command.match(/"([^"]*java\.exe)"/i);
      if (javaPathMatch) {
        // 从命令中提取的 Java 路径
        const javaPath = javaPathMatch[1];
        const javaDir = path.dirname(javaPath);
        // 设置 PATH 环境变量，将 Java 目录添加到最前面
        envSetup += ` & set "PATH=${javaDir};%PATH%"`;
      } else if (config.environment.java) {
        // 回退：使用配置的 Java 路径
        let javaDir;
        if (config.environment.java.endsWith('java.exe')) {
          javaDir = path.dirname(config.environment.java);
        } else {
          javaDir = config.environment.java;
        }
        envSetup += ` & set "PATH=${javaDir};%PATH%"`;
      } else if (config.environment.javaEnvironments) {
        // 回退：尝试从 Java 环境列表中找到默认环境
        const defaultEnv = config.environment.javaEnvironments.find(e => e.id === config.environment.defaultJavaEnvironmentId);
        if (defaultEnv && defaultEnv.path) {
          let javaDir;
          if (defaultEnv.path.endsWith('java.exe')) {
            javaDir = path.dirname(defaultEnv.path);
          } else {
            javaDir = defaultEnv.path;
          }
          envSetup += ` & set "PATH=${javaDir};%PATH%"`;
        }
      }
    }
    
    if (cwd && cwd.trim()) {
      // 如果有工作目录，使用 cd 命令切换后再执行
      // 使用双引号包裹路径，避免路径中的空格问题
      const escapedCwd = cwd.replace(/"/g, '\\"');
      cmdCommand = `start "Runner" cmd /k "${envSetup} & cd /d \"${escapedCwd}\" & ${command}"`;
    } else {
      cmdCommand = `start "Runner" cmd /k "${envSetup} & ${command}"`;
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
  // 使用更友好的日期格式，显示本地时间
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  
  const logMessage = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
  
  // 输出到控制台（所有级别都输出到控制台，方便开发和调试）
  console[level === 'error' ? 'error' : 'log'](logMessage);
  
  // 定义要排除的无用日志内容
  const excludedMessages = [
    '配置保存成功',
    '配置加载成功',
    '数据库初始化完成',
    '主窗口已创建',
    '系统托盘创建完成',
    '使用托盘图标:'
  ];
  
  // 检查是否为无用日志
  const isExcluded = excludedMessages.some(excluded => message.includes(excluded));
  
  // 只将错误、警告以及非无用的信息写入日志文件
  if ((level === 'error' || level === 'warn' || level === 'info') && !isExcluded) {
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
    const errorMessage = `无法打开URL: ${error.message}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
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
      logger.info(`配置导出成功: ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`配置导出失败: ${error.message}`);
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
      logger.info(`配置导入成功: ${filePaths[0]}`);
      return true;
    } catch (error) {
      logger.error(`配置导入失败: ${error.message}`);
      return false;
    }
  }
  return false;
});

ipcMain.handle('save-environment', async (event, envConfig) => {
  try {
    config.environment = envConfig;
    await saveConfig();
    return true;
  } catch (error) {
    logger.error(`保存环境配置失败: ${error.message}`);
    return false;
  }
});

ipcMain.handle('get-environment', () => {
  return config.environment || { python: '', java: '', customPaths: [] };
});

ipcMain.handle('browse-path', async (event, type) => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: type === 'file' ? ['openFile'] : ['openDirectory']
    });

    if (!canceled && filePaths.length > 0) {
      return filePaths[0];
    }
    return null;
  } catch (error) {
    logger.error(`浏览路径失败: ${error.message}`);
    return null;
  }
});

ipcMain.handle('get-exe-icon', async (event, exePath) => {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(exePath)) {
      throw new Error('文件不存在');
    }

    // 检查文件是否为可执行文件
    if (!exePath.toLowerCase().endsWith('.exe')) {
      throw new Error('不是可执行文件');
    }

    // 创建临时文件路径
    const tempDir = require('os').tmpdir();
    const tempFile = require('path').join(tempDir, `icon_${Date.now()}.png`);

    // 执行 PowerShell 脚本
    let result = '';
    try {
      // 确定脚本路径（开发环境和打包环境）
      let scriptPath;
      if (app.isPackaged) {
        // 打包环境：脚本在 resources 目录
        scriptPath = path.join(process.resourcesPath, 'extract-icon.ps1');
      } else {
        // 开发环境：脚本在项目根目录
        scriptPath = path.join(__dirname, 'extract-icon.ps1');
      }
      
      result = require('child_process').execSync(`powershell -File "${scriptPath}" -exePath "${exePath}" -outputPath "${tempFile}"`, { 
        encoding: 'utf8',
        timeout: 5000
      }).trim();
    } catch (execError) {
      logger.warn(`PowerShell 脚本执行失败: ${execError.message}`);
      return null;
    }

    // 检查结果
    if (result !== 'Success' || !fs.existsSync(tempFile)) {
      logger.warn('无法获取图标文件');
      
      // 回退方案：使用默认应用图标
      const defaultIcon = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik01NiAxMGgtNDhWMTRoNDh2MzZoLTQ4djQtNDh6Ii8+PHBhdGggZD0iTTQ4IDEwaC0yMHY0aDIwdjEyaC0yMFYxMHptLTQyIDB2NDhoMjB2LTQ4aC0yMHptMjAgMjBoLTIwdjRoMjB2LTQ4aC0yMHoiIGZpbGw9IiMwMDAiLz48L2c+PC9zdmc+";
      return defaultIcon;
    }

    // 读取图标文件并转换为 Base64
    let iconBase64 = null;
    try {
      const iconBuffer = fs.readFileSync(tempFile);
      iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;
      
      // 清理临时文件
      fs.unlinkSync(tempFile);
    } catch (readError) {
      logger.warn(`读取图标文件失败: ${readError.message}`);
      return null;
    }

    return iconBase64;
  } catch (error) {
    logger.error(`获取 EXE 图标失败: ${error}`);
    return null;
  }
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
    } else if (item.type === 'java') {
      let javaPath = 'java';
      
      // 根据项目选择的 Java 环境获取路径
      if (item.javaEnvironmentId && config.environment.javaEnvironments) {
        const selectedEnv = config.environment.javaEnvironments.find(e => e.id === item.javaEnvironmentId);
        if (selectedEnv && selectedEnv.path) {
          javaPath = selectedEnv.path;
          // 如果路径是文件夹，添加 java.exe
          if (!javaPath.toLowerCase().endsWith('.exe')) {
            javaPath = path.join(javaPath, 'java.exe');
          }
        }
      } else if (config.environment.java) {
        // 向后兼容：使用旧的 Java 路径
        javaPath = config.environment.java;
        // 如果路径是文件夹，添加 java.exe
        if (!javaPath.toLowerCase().endsWith('.exe')) {
          javaPath = path.join(javaPath, 'java.exe');
        }
      }
      
      // 添加编码参数，确保Java程序使用UTF-8编码输出
      finalCommand = `"${javaPath}" -Dfile.encoding=utf-8 -jar "${command}" ${args}`.trim();
    } else if (item.type === 'application') {
      const argString = args ? ` ${args}` : '';
      finalCommand = `"${command}"${argString}`.trim();
    } else {
      finalCommand = `${command} ${args}`.trim();
    }

    // 打印执行的命令
    logger.info(`执行命令: ${finalCommand}`);

    if (item.runInTerminal) {
      let envSetup = 'chcp 65001 >nul';
      
      // 如果是Python类型的项目且设置了Python路径，修改PATH环境变量
      if (item.type === 'python' && config.environment.python) {
        // 获取Python路径的目录部分
        const pythonDir = path.dirname(config.environment.python);
        // 设置PATH环境变量，将Python目录添加到最前面
        envSetup += ` & set "PATH=${pythonDir};%PATH%"`;
      } 
      // 如果是Java类型的项目，修改PATH环境变量
      else if (item.type === 'java') {
        let javaDir = '';
        // 根据项目选择的Java环境获取路径
        if (item.javaEnvironmentId && config.environment.javaEnvironments) {
          const selectedEnv = config.environment.javaEnvironments.find(e => e.id === item.javaEnvironmentId);
          if (selectedEnv && selectedEnv.path) {
            if (selectedEnv.path.endsWith('java.exe')) {
              javaDir = path.dirname(selectedEnv.path);
            } else {
              javaDir = selectedEnv.path;
            }
          }
        } else if (config.environment.java) {
          // 向后兼容：使用旧的Java路径
          if (config.environment.java.endsWith('java.exe')) {
            javaDir = path.dirname(config.environment.java);
          } else {
            javaDir = config.environment.java;
          }
        }
        // 设置PATH环境变量，将Java目录添加到最前面
        if (javaDir) {
          envSetup += ` & set "PATH=${javaDir};%PATH%"`;
        }
      }
      
      const cmd = 'cmd.exe';
      const cmdArgs = ['/c', 'start', 'cmd', '/k', `${envSetup} & ` + escapeShell(finalCommand)];
      const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
      resolve('命令已启动');
    } else {
      // 使用spawn代替exec，直接处理流数据
      const { spawn } = require('child_process');
      
      // 直接使用命令作为整体，让shell处理空格和引号
      // 创建子进程，不指定encoding，让输出保持Buffer形式
      const child = spawn(finalCommand, [], {
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