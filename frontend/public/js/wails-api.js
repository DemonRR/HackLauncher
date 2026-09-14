(function () {
  const backend = () => {
    if (!window.go?.main?.App) throw new Error('Wails 后端尚未就绪');
    return window.go.main.App;
  };

  window.api = {
    getConfig: () => backend().GetConfig(),
    saveConfig: (config) => backend().SaveConfig(config),
    executeCommand: (command, cwd = '') => backend().ExecuteCommand(command, cwd),
    executeCommandInTerminal: (command, cwd = '', javaPath = '') => backend().ExecuteCommandInTerminal(command, cwd, javaPath),
    executeCommandAsAdmin: (command, cwd = '') => backend().ExecuteCommandAsAdmin(command, cwd),
    executeWithEnvironment: (item) => backend().ExecuteWithEnvironment(item),
    executePythonTool: (request) => backend().ExecutePythonTool(request),
    executeJavaTool: (request) => backend().ExecuteJavaTool(request),
    startApplication: (executable, rawArguments = '', cwd = '') => backend().StartApplication(executable, rawArguments, cwd),
    startApplicationAsAdmin: (executable, rawArguments = '', cwd = '') => backend().StartApplicationAsAdmin(executable, rawArguments, cwd),
    openUrl: (url) => backend().OpenURL(url),
    openPath: (path) => backend().OpenPath(path),
    openLogFile: () => backend().OpenLogFile(),
    getLogs: (level = 'ALL', limit = 300) => backend().GetLogs(level, limit),
    clearLogs: () => backend().ClearLogs(),
    logFrontend: (level, message) => backend().LogFrontend(level, message),
    logRunEvent: (itemName, itemType, status, detail = '') => backend().LogRunEvent(itemName, itemType, status, detail),
    saveEnvironment: (env) => backend().SaveEnvironment(env),
    getEnvironment: () => backend().GetEnvironment(),
    getEnvironmentStatus: () => backend().GetEnvironmentStatus(),
    browsePath: (type) => backend().BrowsePath(type),
    checkPathExists: (path) => backend().CheckPathExists(path),
    getExeIcon: (path) => backend().GetExeIcon(path),
    minimizeWindow: () => backend().MinimizeWindow(),
    toggleMaximizeWindow: () => backend().ToggleMaximizeWindow(),
    getCurrentWindowSize: () => backend().GetCurrentWindowSize(),
    saveCurrentWindowSize: () => backend().SaveCurrentWindowSize(),
    updateShowWindowHotkey: (combination) => backend().UpdateShowWindowHotkey(combination),
    showCloseConfirm: () => backend().ShowCloseConfirm(),
    confirmQuit: () => backend().ConfirmQuit(),
    confirmMinimize: () => backend().ConfirmMinimize(),
    onCloseConfirm: (callback) => window.runtime.EventsOn('show-close-confirm', callback),
    receive: (channel, callback) => window.runtime.EventsOn(channel, callback)
  };
})();
