package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

//go:embed resources/extract-icon.ps1
var iconExtractScript []byte

type App struct {
	ctx      context.Context
	store    *Store
	config   Config
	hotkey   *globalHotkey
	mu       sync.RWMutex
	quitting atomic.Bool
}

func NewApp() *App { return &App{config: defaultConfig(), hotkey: newGlobalHotkey()} }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	store, err := OpenStore()
	if err != nil {
		runtime.LogErrorf(ctx, "open store: %v", err)
		return
	}
	a.store = store
	cfg, err := store.Load()
	if err != nil {
		runtime.LogErrorf(ctx, "load config: %v", err)
		return
	}
	a.config = cfg
	a.logf("INFO", "Wails 应用启动，配置加载完成")
	if _, err := a.registerConfiguredShowHotkey(); err != nil {
		a.logf("ERROR", "窗口唤醒快捷键注册失败: %v", err)
	}
	go a.startTray()
}

func (a *App) shutdown(_ context.Context) {
	systray.Quit()
	if a.hotkey != nil {
		a.hotkey.Close()
	}
	if a.store != nil {
		_ = a.store.Close()
	}
}

func (a *App) beforeClose(ctx context.Context) bool {
	if a.quitting.Load() {
		return false
	}
	switch a.closeBehavior() {
	case "close":
		return false
	case "minimize":
		runtime.WindowHide(ctx)
		return true
	default:
		runtime.EventsEmit(ctx, "show-close-confirm")
		return true
	}
}

func (a *App) closeBehavior() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	settings, _ := a.config["settings"].(map[string]interface{})
	behavior, _ := settings["closeBehavior"].(string)
	if behavior == "" {
		return "ask"
	}
	return behavior
}

func (a *App) configuredShowHotkey() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	settings, _ := a.config["settings"].(map[string]interface{})
	hotkey, _ := settings["showWindowHotkey"].(string)
	if strings.TrimSpace(hotkey) == "" {
		return "Ctrl+Shift+H"
	}
	return hotkey
}

func (a *App) showMainWindow() {
	if a.ctx == nil {
		return
	}
	runtime.WindowShow(a.ctx)
	runtime.WindowUnminimise(a.ctx)
}

func (a *App) registerConfiguredShowHotkey() (string, error) {
	return a.UpdateShowWindowHotkey(a.configuredShowHotkey())
}

func (a *App) UpdateShowWindowHotkey(combination string) (string, error) {
	if a.hotkey == nil {
		a.hotkey = newGlobalHotkey()
	}
	canonical, err := a.hotkey.Register(combination, func() {
		a.logf("INFO", "全局快捷键触发，显示主窗口")
		a.showMainWindow()
	})
	if err != nil {
		a.logf("ERROR", "全局快捷键注册失败，快捷键=%q: %v", combination, err)
		return "", err
	}
	a.logf("INFO", "全局快捷键已注册，快捷键=%s", canonical)
	return canonical, nil
}

func (a *App) GetConfig() Config {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return cloneConfig(a.config)
}

func (a *App) SaveConfig(cfg Config) error {
	if cfg == nil {
		return errors.New("配置不能为空")
	}
	cfg = cloneConfig(cfg)
	mergeConfigDefaults(cfg)
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.store == nil {
		return errors.New("配置存储尚未初始化")
	}
	if err := a.store.Save(cfg); err != nil {
		a.logf("ERROR", "保存配置失败: %v", err)
		return err
	}
	a.config = cloneConfig(cfg)
	a.logf("INFO", "配置已保存")
	return nil
}

func cloneConfig(cfg Config) Config {
	data, err := json.Marshal(cfg)
	if err != nil {
		return defaultConfig()
	}
	result := Config{}
	if json.Unmarshal(data, &result) != nil {
		return defaultConfig()
	}
	return result
}

func (a *App) GetEnvironment() map[string]interface{} {
	a.mu.RLock()
	defer a.mu.RUnlock()
	env, _ := a.config["environment"].(map[string]interface{})
	if env == nil {
		env = defaultConfig()["environment"].(map[string]interface{})
	}
	data, _ := json.Marshal(env)
	result := map[string]interface{}{}
	_ = json.Unmarshal(data, &result)
	return result
}

func (a *App) SaveEnvironment(env map[string]interface{}) error {
	if env == nil {
		return errors.New("环境配置不能为空")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	data, _ := json.Marshal(env)
	copyEnv := map[string]interface{}{}
	if err := json.Unmarshal(data, &copyEnv); err != nil {
		return err
	}
	a.config["environment"] = copyEnv
	if a.store == nil {
		return errors.New("配置存储尚未初始化")
	}
	if err := a.store.Save(a.config); err != nil {
		a.logf("ERROR", "保存环境配置失败: %v", err)
		return err
	}
	a.logf("INFO", "环境配置已保存")
	return nil
}

// GetEnvironmentStatus verifies configured runtimes on disk for the workspace overview.
func (a *App) GetEnvironmentStatus() map[string]interface{} {
	a.mu.RLock()
	environment, _ := a.config["environment"].(map[string]interface{})
	pythonConfigured, _ := environment["python"].(string)
	javaPaths := make([]string, 0)
	if environments, ok := environment["javaEnvironments"].([]interface{}); ok {
		for _, entry := range environments {
			item, _ := entry.(map[string]interface{})
			path, _ := item["path"].(string)
			if strings.TrimSpace(path) != "" {
				javaPaths = append(javaPaths, path)
			}
		}
	}
	a.mu.RUnlock()

	pythonAvailable := pythonExecutablePath(pythonConfigured) != ""
	javaAvailable := 0
	for _, path := range javaPaths {
		if javaExecutablePath(path) != "" {
			javaAvailable++
		}
	}

	javaConfigured := len(javaPaths)
	configured := strings.TrimSpace(pythonConfigured) != "" || javaConfigured > 0
	return map[string]interface{}{
		"configured":       configured,
		"healthy":          configured && (strings.TrimSpace(pythonConfigured) == "" || pythonAvailable) && javaAvailable == javaConfigured,
		"pythonConfigured": strings.TrimSpace(pythonConfigured) != "",
		"pythonAvailable":  pythonAvailable,
		"javaConfigured":   javaConfigured,
		"javaAvailable":    javaAvailable,
	}
}

func pythonExecutablePath(configured string) string {
	configured = strings.TrimSpace(strings.Trim(configured, `"`))
	if configured == "" {
		return ""
	}
	info, err := os.Stat(configured)
	if err != nil {
		return ""
	}
	if info.IsDir() {
		configured = filepath.Join(configured, "python.exe")
		info, err = os.Stat(configured)
		if err != nil || info.IsDir() {
			return ""
		}
	}
	return configured
}

func javaExecutablePath(configured string) string {
	configured = strings.TrimSpace(strings.Trim(configured, `"`))
	if configured == "" {
		return ""
	}
	info, err := os.Stat(configured)
	if err != nil {
		return ""
	}
	if !info.IsDir() {
		return configured
	}
	for _, candidate := range []string{filepath.Join(configured, "java.exe"), filepath.Join(configured, "bin", "java.exe")} {
		if candidateInfo, candidateErr := os.Stat(candidate); candidateErr == nil && !candidateInfo.IsDir() {
			return candidate
		}
	}
	return ""
}

func (a *App) MinimizeWindow() bool       { runtime.WindowMinimise(a.ctx); return true }
func (a *App) ToggleMaximizeWindow() bool { runtime.WindowToggleMaximise(a.ctx); return true }

func (a *App) ShowCloseConfirm() {
	switch a.closeBehavior() {
	case "close":
		a.ConfirmQuit()
	case "minimize":
		a.ConfirmMinimize()
	default:
		runtime.EventsEmit(a.ctx, "show-close-confirm")
	}
}

func (a *App) ConfirmQuit()     { a.quitting.Store(true); systray.Quit(); runtime.Quit(a.ctx) }
func (a *App) ConfirmMinimize() { runtime.WindowHide(a.ctx) }

const maxCommandOutput = 1 << 20

type cappedOutput struct {
	mu        sync.Mutex
	buffer    bytes.Buffer
	limit     int
	truncated bool
}

func (w *cappedOutput) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	originalLength := len(data)
	remaining := w.limit - w.buffer.Len()
	if remaining <= 0 {
		w.truncated = true
		return originalLength, nil
	}
	if len(data) > remaining {
		data = data[:remaining]
		w.truncated = true
	}
	_, _ = w.buffer.Write(data)
	return originalLength, nil
}

func (w *cappedOutput) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	result := decodeOutput(w.buffer.Bytes())
	if w.truncated {
		result += "\n[输出超过 1 MiB，已截断]"
	}
	return result
}

func validateWorkingDirectory(cwd string) (string, error) {
	cwd = strings.TrimSpace(cwd)
	if cwd == "" {
		return "", nil
	}
	info, err := os.Stat(cwd)
	if err != nil {
		return "", fmt.Errorf("工作目录不可用: %w", err)
	}
	if !info.IsDir() {
		return "", errors.New("工作目录不是文件夹")
	}
	return cwd, nil
}

func (a *App) ExecuteCommand(command, cwd string) (string, error) {
	if strings.TrimSpace(command) == "" {
		err := errors.New("命令不能为空")
		a.logf("ERROR", "命令校验失败: %v", err)
		return "", err
	}
	validatedCwd, err := validateWorkingDirectory(cwd)
	if err != nil {
		a.logf("ERROR", "命令工作目录校验失败，工作目录=%q: %v", cwd, err)
		return "", err
	}
	startedAt := time.Now()
	cmd := exec.Command("cmd.exe", "/d", "/s", "/c", command)
	cmd.Dir = validatedCwd
	output := &cappedOutput{limit: maxCommandOutput}
	cmd.Stdout = output
	cmd.Stderr = output
	a.logf("INFO", "命令开始执行，工作目录=%q，命令=%q", validatedCwd, strings.TrimSpace(command))
	err = cmd.Run()
	text := output.String()
	if err != nil {
		a.logf("ERROR", "命令执行失败，耗时=%s，错误=%v，输出=%q", time.Since(startedAt).Round(time.Millisecond), err, strings.TrimSpace(text))
		return text, fmt.Errorf("%w: %s", err, strings.TrimSpace(text))
	}
	a.logf("INFO", "命令执行完成，耗时=%s，输出=%q", time.Since(startedAt).Round(time.Millisecond), strings.TrimSpace(text))
	return text, nil
}

func (a *App) ExecuteCommandInTerminal(command, cwd, preferredJavaPath string) (string, error) {
	if strings.TrimSpace(command) == "" {
		err := errors.New("命令不能为空")
		a.logf("ERROR", "终端命令校验失败: %v", err)
		return "", err
	}
	validatedCwd, err := validateWorkingDirectory(cwd)
	if err != nil {
		a.logf("ERROR", "终端工作目录校验失败，工作目录=%q: %v", cwd, err)
		return "", err
	}
	pythonPath := a.configuredPythonPath()
	javaPath := a.configuredJavaPath(preferredJavaPath)
	cmd, cleanup, err := newTerminalProcess(command, validatedCwd, pythonPath, javaPath)
	if err != nil {
		a.logf("ERROR", "终端启动脚本创建失败: %v", err)
		return "", err
	}
	if err := cmd.Start(); err != nil {
		cleanup()
		a.logf("ERROR", "终端启动失败: %v", err)
		return "", err
	}
	statusPath := cmd.Args[len(cmd.Args)-1] + ".exit"
	go a.monitorTerminalExecution(cmd, statusPath, cleanup, command, validatedCwd)
	a.logf("INFO", "命令已在终端启动，工作目录=%q，Python=%q，Java=%q，命令=%q", validatedCwd, pythonPath, javaPath, strings.TrimSpace(command))
	return "命令已在终端启动", nil
}

func (a *App) monitorTerminalExecution(cmd *exec.Cmd, statusPath string, cleanup func(), command, cwd string) {
	waitResult := make(chan error, 1)
	go func() { waitResult <- cmd.Wait() }()
	ticker := time.NewTicker(300 * time.Millisecond)
	timeout := time.NewTimer(24 * time.Hour)
	defer ticker.Stop()
	defer timeout.Stop()
	defer cleanup()
	startedAt := time.Now()

	readStatus := func() (int, bool) {
		data, err := os.ReadFile(statusPath)
		if err != nil {
			return 0, false
		}
		exitCode, err := strconv.Atoi(strings.TrimSpace(string(data)))
		return exitCode, err == nil
	}
	writeResult := func(exitCode int) {
		if exitCode == 0 {
			a.logf("INFO", "终端命令执行完成，退出码=0，耗时=%s，工作目录=%q，命令=%q", time.Since(startedAt).Round(time.Millisecond), cwd, strings.TrimSpace(command))
			return
		}
		a.logf("ERROR", "终端命令执行失败，退出码=%d，耗时=%s，工作目录=%q，命令=%q", exitCode, time.Since(startedAt).Round(time.Millisecond), cwd, strings.TrimSpace(command))
	}

	for {
		select {
		case <-ticker.C:
			if exitCode, ok := readStatus(); ok {
				writeResult(exitCode)
				return
			}
		case err := <-waitResult:
			if exitCode, ok := readStatus(); ok {
				writeResult(exitCode)
			} else if err != nil {
				a.logf("ERROR", "终端进程异常退出，耗时=%s，错误=%v，命令=%q", time.Since(startedAt).Round(time.Millisecond), err, strings.TrimSpace(command))
			} else {
				a.logf("WARN", "终端已关闭，未收到命令退出码，命令=%q", strings.TrimSpace(command))
			}
			return
		case <-timeout.C:
			a.logf("WARN", "终端命令运行超过 24 小时，停止跟踪状态，命令=%q", strings.TrimSpace(command))
			return
		}
	}
}

func (a *App) configuredPythonPath() string {
	a.mu.RLock()
	environment, _ := a.config["environment"].(map[string]interface{})
	configured, _ := environment["python"].(string)
	a.mu.RUnlock()
	resolved := pythonExecutablePath(configured)
	if resolved == "" && strings.TrimSpace(configured) != "" {
		a.logf("ERROR", "配置的 Python 路径不可用或未找到 python.exe: %s", configured)
	}
	return resolved
}

func (a *App) configuredJavaPath(preferred string) string {
	configured := strings.TrimSpace(strings.Trim(preferred, `"`))
	if configured == "" || strings.EqualFold(configured, "java") {
		a.mu.RLock()
		environment, _ := a.config["environment"].(map[string]interface{})
		defaultID, _ := environment["defaultJavaEnvironmentId"].(string)
		if environments, ok := environment["javaEnvironments"].([]interface{}); ok {
			for _, entry := range environments {
				item, _ := entry.(map[string]interface{})
				id, _ := item["id"].(string)
				if id == defaultID {
					configured, _ = item["path"].(string)
					break
				}
			}
		}
		if configured == "" {
			configured, _ = environment["java"].(string)
		}
		a.mu.RUnlock()
	}
	configured = strings.TrimSpace(strings.Trim(configured, `"`))
	if configured == "" {
		return ""
	}
	resolved := javaExecutablePath(configured)
	if resolved == "" {
		a.logf("ERROR", "配置的 Java 路径不可用或未找到 java.exe: %s", configured)
	}
	return resolved
}

func newTerminalProcess(command, cwd, pythonPath, javaPath string) (*exec.Cmd, func(), error) {
	shell := os.Getenv("ComSpec")
	if shell == "" {
		shell = "cmd.exe"
	}
	script, err := os.CreateTemp("", "hacklauncher-terminal-*.cmd")
	if err != nil {
		return nil, nil, err
	}
	scriptPath := script.Name()
	statusPath := scriptPath + ".exit"
	cleanup := func() {
		_ = os.Remove(scriptPath)
		_ = os.Remove(statusPath)
	}
	content := terminalScriptContent(command, pythonPath, javaPath)
	if _, err := script.WriteString(content); err != nil {
		_ = script.Close()
		cleanup()
		return nil, nil, err
	}
	if err := script.Close(); err != nil {
		cleanup()
		return nil, nil, err
	}
	cmd := exec.Command(shell, "/d", "/s", "/c", "start", "", "/wait", shell, "/d", "/k", scriptPath)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "HACKLAUNCHER_STATUS_FILE="+statusPath)
	return cmd, cleanup, nil
}

func terminalScriptContent(command, pythonPath, javaPath string) string {
	lines := []string{"@echo off", "chcp 65001 >nul"}
	if pythonPath != "" {
		safePath := strings.ReplaceAll(pythonPath, "%", "%%")
		safeDir := strings.ReplaceAll(filepath.Dir(pythonPath), "%", "%%")
		lines = append(lines,
			`set "HACKLAUNCHER_PYTHON=`+safePath+`"`,
			`set "PATH=`+safeDir+`;%PATH%"`,
			`doskey python="`+safePath+`" $*`,
			`doskey python3="`+safePath+`" $*`,
		)
	}
	if javaPath != "" {
		safePath := strings.ReplaceAll(javaPath, "%", "%%")
		safeDir := strings.ReplaceAll(filepath.Dir(javaPath), "%", "%%")
		javaHome := filepath.Dir(javaPath)
		if strings.EqualFold(filepath.Base(javaHome), "bin") {
			javaHome = filepath.Dir(javaHome)
		}
		javaHome = strings.ReplaceAll(javaHome, "%", "%%")
		lines = append(lines,
			`set "HACKLAUNCHER_JAVA=`+safePath+`"`,
			`set "JAVA_HOME=`+javaHome+`"`,
			`set "PATH=`+safeDir+`;%PATH%"`,
			`doskey java="`+safePath+`" $*`,
		)
	}
	lines = append(lines,
		command,
		`set "HACKLAUNCHER_COMMAND_EXIT=%ERRORLEVEL%"`,
		`if defined HACKLAUNCHER_STATUS_FILE > "%HACKLAUNCHER_STATUS_FILE%" echo %HACKLAUNCHER_COMMAND_EXIT%`,
		"",
	)
	return strings.Join(lines, "\r\n")
}

func (a *App) ExecuteCommandAsAdmin(command, cwd string) (string, error) {
	if strings.TrimSpace(command) == "" {
		err := errors.New("命令不能为空")
		a.logf("ERROR", "管理员命令校验失败: %v", err)
		return "", err
	}
	validatedCwd, err := validateWorkingDirectory(cwd)
	if err != nil {
		a.logf("ERROR", "管理员命令工作目录校验失败，工作目录=%q: %v", cwd, err)
		return "", err
	}
	full := command
	if validatedCwd != "" {
		full = fmt.Sprintf(`cd /d "%s" & %s`, validatedCwd, command)
	}
	escaped := strings.ReplaceAll(full, "'", "''")
	ps := fmt.Sprintf(`Start-Process -FilePath 'cmd.exe' -Verb RunAs -ArgumentList '/d','/s','/c','%s'`, escaped)
	if err := exec.Command("powershell.exe", "-NoProfile", "-Command", ps).Start(); err != nil {
		a.logf("ERROR", "管理员命令启动失败: %v", err)
		return "", err
	}
	a.logf("INFO", "已请求管理员权限运行命令，工作目录=%q，命令=%q", validatedCwd, strings.TrimSpace(command))
	return "已请求管理员权限运行", nil
}

func (a *App) StartApplication(executable, rawArguments, cwd string) (string, error) {
	executable = strings.TrimSpace(strings.Trim(executable, `"`))
	if executable == "" {
		err := errors.New("应用程序路径不能为空")
		a.logf("ERROR", "应用程序校验失败: %v", err)
		return "", err
	}
	info, err := os.Stat(executable)
	if err != nil {
		a.logf("ERROR", "应用程序路径校验失败，路径=%q: %v", executable, err)
		return "", err
	}
	if info.IsDir() {
		err := errors.New("应用程序路径指向文件夹")
		a.logf("ERROR", "应用程序路径校验失败，路径=%q: %v", executable, err)
		return "", err
	}
	arguments, err := splitCommandLine(rawArguments)
	if err != nil {
		a.logf("ERROR", "应用程序参数校验失败，路径=%q: %v", executable, err)
		return "", err
	}
	if cwd == "" {
		cwd = filepath.Dir(executable)
	}
	validatedCwd, err := validateWorkingDirectory(cwd)
	if err != nil {
		a.logf("ERROR", "应用程序工作目录校验失败，路径=%q，工作目录=%q: %v", executable, cwd, err)
		return "", err
	}
	startedAt := time.Now()
	a.logf("INFO", "应用程序准备启动，路径=%q，参数=%q，工作目录=%q", executable, strings.TrimSpace(rawArguments), validatedCwd)
	cmd := exec.Command(executable, arguments...)
	cmd.Dir = validatedCwd
	if err := cmd.Start(); err != nil {
		if isElevationRequired(err) {
			a.logf("WARN", "应用程序要求管理员权限，切换到 UAC 启动，路径=%q", executable)
			if elevatedErr := startElevatedApplication(executable, rawArguments, validatedCwd); elevatedErr != nil {
				a.logf("ERROR", "管理员应用程序启动失败: %v", elevatedErr)
				return "", elevatedErr
			}
			a.logf("INFO", "已请求管理员权限启动应用程序，路径=%q，耗时=%s", executable, time.Since(startedAt).Round(time.Millisecond))
			return "已请求管理员权限启动应用程序", nil
		}
		a.logf("ERROR", "应用程序启动失败: %v", err)
		return "", err
	}
	pid := cmd.Process.Pid
	a.logf("INFO", "应用程序已启动，PID=%d，路径=%q，启动耗时=%s", pid, executable, time.Since(startedAt).Round(time.Millisecond))
	go func() {
		err := cmd.Wait()
		if err != nil {
			a.logf("ERROR", "应用程序异常退出，PID=%d，路径=%q，运行时长=%s，错误=%v", pid, executable, time.Since(startedAt).Round(time.Millisecond), err)
		} else {
			a.logf("INFO", "应用程序正常退出，PID=%d，路径=%q，运行时长=%s", pid, executable, time.Since(startedAt).Round(time.Millisecond))
		}
	}()
	return fmt.Sprintf("应用程序已启动（PID %d）", pid), nil
}

func (a *App) StartApplicationAsAdmin(executable, rawArguments, cwd string) (string, error) {
	executable = strings.TrimSpace(strings.Trim(executable, `"`))
	if executable == "" {
		err := errors.New("应用程序路径不能为空")
		a.logf("ERROR", "管理员应用程序校验失败: %v", err)
		return "", err
	}
	info, err := os.Stat(executable)
	if err != nil {
		a.logf("ERROR", "管理员应用程序路径校验失败，路径=%q: %v", executable, err)
		return "", err
	}
	if info.IsDir() {
		err := errors.New("应用程序路径指向文件夹")
		a.logf("ERROR", "管理员应用程序路径校验失败，路径=%q: %v", executable, err)
		return "", err
	}
	if cwd == "" {
		cwd = filepath.Dir(executable)
	}
	validatedCwd, err := validateWorkingDirectory(cwd)
	if err != nil {
		a.logf("ERROR", "管理员应用程序工作目录校验失败，路径=%q，工作目录=%q: %v", executable, cwd, err)
		return "", err
	}
	a.logf("INFO", "管理员应用程序准备启动，路径=%q，参数=%q，工作目录=%q", executable, strings.TrimSpace(rawArguments), validatedCwd)
	if err := startElevatedApplication(executable, rawArguments, validatedCwd); err != nil {
		a.logf("ERROR", "管理员应用程序启动失败: %v", err)
		return "", err
	}
	a.logf("INFO", "已请求管理员权限启动应用程序，路径=%q", executable)
	return "已请求管理员权限启动应用程序", nil
}

func splitCommandLine(input string) ([]string, error) {
	var args []string
	var current strings.Builder
	var quote rune
	tokenStarted := false
	runes := []rune(strings.TrimSpace(input))
	for index := 0; index < len(runes); index++ {
		char := runes[index]
		if char == '\\' && index+1 < len(runes) && quote != 0 && runes[index+1] == quote {
			current.WriteRune(quote)
			tokenStarted = true
			index++
			continue
		}
		if char == '"' || char == '\'' {
			if quote == 0 {
				quote = char
				tokenStarted = true
				continue
			}
			if quote == char {
				quote = 0
				continue
			}
		}
		if (char == ' ' || char == '\t') && quote == 0 {
			if tokenStarted {
				args = append(args, current.String())
				current.Reset()
				tokenStarted = false
			}
			continue
		}
		current.WriteRune(char)
		tokenStarted = true
	}
	if quote != 0 {
		return nil, errors.New("启动参数中的引号未闭合")
	}
	if tokenStarted {
		args = append(args, current.String())
	}
	if len(args) > 256 {
		return nil, errors.New("启动参数数量过多")
	}
	return args, nil
}

func (a *App) ExecuteWithEnvironment(item map[string]interface{}) (string, error) {
	command, _ := item["command"].(string)
	arguments, _ := item["arguments"].(string)
	kind, _ := item["type"].(string)
	runInTerminal, _ := item["runInTerminal"].(bool)
	a.logf("INFO", "环境运行请求，类型=%q，终端=%t，目标=%q", kind, runInTerminal, command)
	final := strings.TrimSpace(command + " " + arguments)
	if kind == "application" {
		final = `"` + command + `"`
		if arguments != "" {
			final += " " + arguments
		}
	}
	if runInTerminal {
		return a.ExecuteCommandInTerminal(final, "", "")
	}
	return a.ExecuteCommand(final, "")
}

func (a *App) OpenURL(rawURL string) error {
	a.logf("INFO", "URL 准备打开，地址=%q", strings.TrimSpace(rawURL))
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		err = errors.New("仅允许 http/https URL")
		a.logf("ERROR", "URL 打开失败，地址=%q: %v", rawURL, err)
		return err
	}
	runtime.BrowserOpenURL(a.ctx, rawURL)
	a.logf("INFO", "URL 已交给系统浏览器打开，地址=%q", rawURL)
	return nil
}

func (a *App) OpenPath(path string) error {
	path = strings.TrimSpace(strings.Trim(path, `"`))
	a.logf("INFO", "文件系统目标准备打开，路径=%q", path)
	if path == "" {
		err := errors.New("路径不能为空")
		a.logf("ERROR", "文件系统目标打开失败: %v", err)
		return err
	}
	if _, err := os.Stat(path); err != nil {
		a.logf("ERROR", "文件系统目标打开失败，路径=%q: %v", path, err)
		return err
	}
	if err := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", path).Start(); err != nil {
		a.logf("ERROR", "文件系统目标打开失败，路径=%q: %v", path, err)
		return err
	}
	a.logf("INFO", "文件系统目标已打开，路径=%q", path)
	return nil
}

func (a *App) CheckPathExists(path string) bool { _, err := os.Stat(path); return err == nil }

func (a *App) BrowsePath(kind string) (string, error) {
	if kind == "file" {
		return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择文件"})
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择文件夹"})
}

func (a *App) OpenLogFile() error {
	if a.store == nil {
		return errors.New("日志目录尚未初始化")
	}
	a.store.Logf("INFO", "打开日志目录")
	return exec.Command("explorer.exe", a.store.logDir).Start()
}

func (a *App) GetLogs(level string, limit int) ([]LogEntry, error) {
	if a.store == nil {
		return nil, errors.New("日志目录尚未初始化")
	}
	return a.store.ReadLogs(level, limit)
}

func (a *App) LogFrontend(level, message string) {
	message = strings.TrimSpace(message)
	if message == "" {
		return
	}
	a.logf(level, "前端: %s", message)
}

func (a *App) LogRunEvent(itemName, itemType, status, detail string) {
	itemName = strings.TrimSpace(itemName)
	itemType = strings.ToLower(strings.TrimSpace(itemType))
	status = strings.ToUpper(strings.TrimSpace(status))
	detail = strings.TrimSpace(detail)
	if itemName == "" {
		itemName = "未命名工具"
	}
	if itemType == "" {
		itemType = "unknown"
	}
	level := "INFO"
	switch status {
	case "ERROR", "FAILED":
		level = "ERROR"
	case "WARN", "WARNING", "CANCELLED":
		level = "WARN"
	}
	if status == "" {
		status = "INFO"
	}
	if detail == "" {
		a.logf(level, "运行审计 | 工具=%q | 类型=%s | 状态=%s", itemName, itemType, status)
		return
	}
	a.logf(level, "运行审计 | 工具=%q | 类型=%s | 状态=%s | 详情=%s", itemName, itemType, status, detail)
}

func (a *App) logf(level, format string, args ...interface{}) {
	if a.store != nil {
		a.store.Logf(level, format, args...)
	}
}

func (a *App) GetExeIcon(exePath string) (string, error) {
	if !strings.EqualFold(filepath.Ext(exePath), ".exe") {
		return "", errors.New("请选择 EXE 文件")
	}
	if _, err := os.Stat(exePath); err != nil {
		return "", err
	}
	tempBase := filepath.Join(os.TempDir(), fmt.Sprintf("hacklauncher-icon-%d", time.Now().UnixNano()))
	script := tempBase + ".ps1"
	temp := tempBase + ".png"
	if err := os.WriteFile(script, iconExtractScript, 0o600); err != nil {
		return "", err
	}
	defer os.Remove(script)
	defer os.Remove(temp)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-exePath", exePath, "-outputPath", temp)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("提取图标失败: %s", decodeOutput(output))
	}
	data, err := os.ReadFile(temp)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data), nil
}

func decodeOutput(input []byte) string {
	if utf8.Valid(input) {
		return string(input)
	}
	decoded, _, err := transform.Bytes(simplifiedchinese.GBK.NewDecoder(), input)
	if err == nil {
		return string(decoded)
	}
	return string(input)
}
