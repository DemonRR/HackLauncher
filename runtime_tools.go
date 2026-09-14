package main

import (
	"archive/zip"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type RuntimeToolRequest struct {
	Name              string `json:"name"`
	TargetPath        string `json:"targetPath"`
	RuntimeArgs       string `json:"runtimeArgs"`
	ProgramArgs       string `json:"programArgs"`
	WorkingDirectory  string `json:"workingDirectory"`
	JavaEnvironmentID string `json:"javaEnvironmentId"`
	RunInTerminal     bool   `json:"runInTerminal"`
}

type RuntimeToolResult struct {
	Message         string `json:"message"`
	PID             int    `json:"pid"`
	RuntimePath     string `json:"runtimePath"`
	RuntimeVersion  int    `json:"runtimeVersion,omitempty"`
	RequiredVersion int    `json:"requiredVersion,omitempty"`
}

func (a *App) ExecutePythonTool(request RuntimeToolRequest) (RuntimeToolResult, error) {
	pythonPath := a.configuredPythonPath()
	if pythonPath == "" {
		if discovered, err := exec.LookPath("python.exe"); err == nil {
			pythonPath = discovered
		} else {
			return RuntimeToolResult{}, errors.New("未配置可用的 Python 解释器")
		}
	}
	target, cwd, err := validateRuntimeTarget(request.TargetPath, request.WorkingDirectory, ".py")
	if err != nil {
		return RuntimeToolResult{}, err
	}
	programArgs, err := splitCommandLine(request.ProgramArgs)
	if err != nil {
		return RuntimeToolResult{}, fmt.Errorf("Python 参数无效: %w", err)
	}
	args := append([]string{target}, programArgs...)
	return a.executeRuntimeTool("python", request.Name, pythonPath, args, cwd, request.RunInTerminal, 0, 0)
}

func (a *App) ExecuteJavaTool(request RuntimeToolRequest) (RuntimeToolResult, error) {
	javaPath := a.javaPathForEnvironment(request.JavaEnvironmentID)
	if javaPath == "" {
		return RuntimeToolResult{}, errors.New("所选 Java 环境不可用，请在设置中检查路径")
	}
	target, cwd, err := validateRuntimeTarget(request.TargetPath, request.WorkingDirectory, ".jar")
	if err != nil {
		return RuntimeToolResult{}, err
	}
	javaMajor, versionText, err := detectJavaMajor(javaPath)
	if err != nil {
		return RuntimeToolResult{}, fmt.Errorf("无法检测 Java 版本: %w", err)
	}
	requiredJava, classMajor, err := requiredJavaMajor(target)
	if err != nil {
		return RuntimeToolResult{}, fmt.Errorf("无法检查 JAR 兼容性: %w", err)
	}
	if requiredJava > javaMajor {
		return RuntimeToolResult{}, fmt.Errorf("%s 需要 Java %d+（class file version %d），当前环境为 Java %d（%s）", filepath.Base(target), requiredJava, classMajor, javaMajor, versionText)
	}
	jvmArgs, err := splitCommandLine(request.RuntimeArgs)
	if err != nil {
		return RuntimeToolResult{}, fmt.Errorf("JVM 参数无效: %w", err)
	}
	programArgs, err := splitCommandLine(request.ProgramArgs)
	if err != nil {
		return RuntimeToolResult{}, fmt.Errorf("Java 程序参数无效: %w", err)
	}
	args := []string{"-Dfile.encoding=utf-8"}
	args = append(args, jvmArgs...)
	args = append(args, "-jar", target)
	args = append(args, programArgs...)
	return a.executeRuntimeTool("java", request.Name, javaPath, args, cwd, request.RunInTerminal, javaMajor, requiredJava)
}

func (a *App) javaPathForEnvironment(environmentID string) string {
	if strings.TrimSpace(environmentID) == "" {
		return a.configuredJavaPath("")
	}
	a.mu.RLock()
	environment, _ := a.config["environment"].(map[string]interface{})
	environments, _ := environment["javaEnvironments"].([]interface{})
	var configured string
	for _, entry := range environments {
		item, _ := entry.(map[string]interface{})
		id, _ := item["id"].(string)
		if id == environmentID {
			configured, _ = item["path"].(string)
			break
		}
	}
	a.mu.RUnlock()
	if configured == "" {
		return ""
	}
	return a.configuredJavaPath(configured)
}

func (a *App) executeRuntimeTool(kind, name, executable string, args []string, cwd string, terminal bool, runtimeVersion, requiredVersion int) (RuntimeToolResult, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = filepath.Base(args[0])
	}
	result := RuntimeToolResult{RuntimePath: executable, RuntimeVersion: runtimeVersion, RequiredVersion: requiredVersion}
	if terminal {
		command := buildBatchCommand(executable, args)
		preferredJava := ""
		if kind == "java" {
			preferredJava = executable
		}
		message, err := a.ExecuteCommandInTerminal(command, cwd, preferredJava)
		if err != nil {
			return RuntimeToolResult{}, err
		}
		result.Message = message
		a.LogRunEvent(name, kind, "LAUNCHED", fmt.Sprintf("终端启动，运行时=%s", executable))
		return result, nil
	}

	cmd := exec.Command(executable, args...)
	cmd.Dir = cwd
	prepareBackgroundProcess(cmd)
	output := &cappedOutput{limit: maxCommandOutput}
	cmd.Stdout = output
	cmd.Stderr = output
	startedAt := time.Now()
	if err := cmd.Start(); err != nil {
		a.LogRunEvent(name, kind, "ERROR", fmt.Sprintf("启动失败: %v", err))
		return RuntimeToolResult{}, err
	}
	result.PID = cmd.Process.Pid
	result.Message = fmt.Sprintf("已启动（PID %d）", result.PID)
	a.LogRunEvent(name, kind, "LAUNCHED", fmt.Sprintf("PID=%d，运行时=%s", result.PID, executable))
	go func() {
		err := cmd.Wait()
		detail := strings.TrimSpace(output.String())
		status := "SUCCESS"
		if err != nil {
			status = "ERROR"
			detail = strings.TrimSpace(fmt.Sprintf("%v: %s", err, detail))
		}
		a.LogRunEvent(name, kind, status, fmt.Sprintf("PID=%d，耗时=%s，输出=%s", result.PID, time.Since(startedAt).Round(time.Millisecond), detail))
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "runtime-tool-finished", map[string]interface{}{
				"name": name, "type": kind, "status": status, "pid": result.PID, "detail": detail,
			})
		}
	}()
	return result, nil
}

func validateRuntimeTarget(target, cwd, extension string) (string, string, error) {
	target = strings.TrimSpace(strings.Trim(target, `"`))
	info, err := os.Stat(target)
	if err != nil {
		return "", "", fmt.Errorf("目标文件不可用: %w", err)
	}
	if info.IsDir() || !strings.EqualFold(filepath.Ext(target), extension) {
		return "", "", fmt.Errorf("目标必须是 %s 文件", extension)
	}
	if strings.TrimSpace(cwd) == "" {
		cwd = filepath.Dir(target)
	}
	cwd, err = validateWorkingDirectory(cwd)
	return target, cwd, err
}

func buildBatchCommand(executable string, args []string) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, quoteBatchArgument(executable))
	for _, arg := range args {
		parts = append(parts, quoteBatchArgument(arg))
	}
	return strings.Join(parts, " ")
}

func quoteBatchArgument(value string) string {
	value = strings.ReplaceAll(value, "%", "%%")
	value = strings.ReplaceAll(value, `"`, `""`)
	return `"` + value + `"`
}

var javaVersionPattern = regexp.MustCompile(`(?i)version\s+"(?:1\.)?(\d+)`)

func detectJavaMajor(javaPath string) (int, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, javaPath, "-version")
	prepareBackgroundProcess(cmd)
	output, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return 0, "", errors.New("检测超时")
	}
	if err != nil {
		return 0, "", fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
	}
	match := javaVersionPattern.FindStringSubmatch(string(output))
	if len(match) != 2 {
		return 0, "", fmt.Errorf("无法解析版本输出: %s", strings.TrimSpace(string(output)))
	}
	var major int
	if _, err := fmt.Sscanf(match[1], "%d", &major); err != nil {
		return 0, "", err
	}
	versionText := strings.TrimSpace(strings.Split(strings.ReplaceAll(string(output), "\r\n", "\n"), "\n")[0])
	return major, versionText, nil
}

func requiredJavaMajor(jarPath string) (int, int, error) {
	archive, err := zip.OpenReader(jarPath)
	if err != nil {
		return 0, 0, err
	}
	defer archive.Close()
	maxClassMajor := 0
	for _, file := range archive.File {
		name := strings.ReplaceAll(file.Name, `\`, "/")
		if !strings.HasSuffix(strings.ToLower(name), ".class") || strings.HasPrefix(strings.ToUpper(name), "META-INF/VERSIONS/") {
			continue
		}
		reader, err := file.Open()
		if err != nil {
			continue
		}
		header := make([]byte, 8)
		_, readErr := io.ReadFull(reader, header)
		_ = reader.Close()
		if readErr != nil || binary.BigEndian.Uint32(header[:4]) != 0xCAFEBABE {
			continue
		}
		major := int(binary.BigEndian.Uint16(header[6:8]))
		if major > maxClassMajor {
			maxClassMajor = major
		}
	}
	if maxClassMajor == 0 {
		return 0, 0, errors.New("JAR 中未找到有效的 class 文件")
	}
	if maxClassMajor < 45 {
		return 0, maxClassMajor, fmt.Errorf("无效的 class file version %d", maxClassMajor)
	}
	return maxClassMajor - 44, maxClassMajor, nil
}
