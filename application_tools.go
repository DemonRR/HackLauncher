package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type ApplicationToolRequest struct {
	Name             string `json:"name"`
	Executable       string `json:"executable"`
	Arguments        string `json:"arguments"`
	WorkingDirectory string `json:"workingDirectory"`
	RunInTerminal    bool   `json:"runInTerminal"`
}

type ApplicationToolResult struct {
	Message  string `json:"message"`
	PID      int    `json:"pid"`
	Elevated bool   `json:"elevated"`
	Terminal bool   `json:"terminal"`
}

func (a *App) StartApplication(executable, rawArguments, cwd string) (string, error) {
	result, err := a.StartApplicationTool(ApplicationToolRequest{
		Executable: executable, Arguments: rawArguments, WorkingDirectory: cwd,
	})
	return result.Message, err
}

func (a *App) StartApplicationTool(request ApplicationToolRequest) (ApplicationToolResult, error) {
	executable := resolvePortablePath(request.Executable)
	if executable == "" {
		err := errors.New("应用程序路径不能为空")
		a.logf("ERROR", "应用程序校验失败: %v", err)
		return ApplicationToolResult{}, err
	}
	info, err := os.Stat(executable)
	if err != nil {
		a.logf("ERROR", "应用程序路径校验失败，路径=%q: %v", executable, err)
		return ApplicationToolResult{}, err
	}
	if info.IsDir() {
		err := errors.New("应用程序路径指向文件夹")
		a.logf("ERROR", "应用程序路径校验失败，路径=%q: %v", executable, err)
		return ApplicationToolResult{}, err
	}
	resolvedArguments := resolvePortableText(request.Arguments)
	arguments, err := splitCommandLine(resolvedArguments)
	if err != nil {
		a.logf("ERROR", "应用程序参数校验失败，路径=%q: %v", executable, err)
		return ApplicationToolResult{}, err
	}
	cwd := request.WorkingDirectory
	if cwd == "" {
		cwd = filepath.Dir(executable)
	}
	validatedCwd, err := validateWorkingDirectory(cwd)
	if err != nil {
		a.logf("ERROR", "应用程序工作目录校验失败，路径=%q，工作目录=%q: %v", executable, cwd, err)
		return ApplicationToolResult{}, err
	}
	if request.RunInTerminal {
		message, err := a.ExecuteCommandInTerminal(buildBatchCommand(executable, arguments), validatedCwd, "")
		if err != nil {
			return ApplicationToolResult{}, err
		}
		return ApplicationToolResult{Message: message, Terminal: true}, nil
	}
	startedAt := time.Now()
	a.logf("INFO", "应用程序准备启动，路径=%q，参数=%q，工作目录=%q", executable, strings.TrimSpace(request.Arguments), validatedCwd)
	cmd := exec.Command(executable, arguments...)
	cmd.Dir = validatedCwd
	prepareBackgroundProcess(cmd)
	if err := cmd.Start(); err != nil {
		if isElevationRequired(err) {
			a.logf("WARN", "应用程序要求管理员权限，切换到 UAC 启动，路径=%q", executable)
			if elevatedErr := startElevatedApplication(executable, resolvedArguments, validatedCwd); elevatedErr != nil {
				a.logf("ERROR", "管理员应用程序启动失败: %v", elevatedErr)
				return ApplicationToolResult{}, elevatedErr
			}
			a.logf("INFO", "已请求管理员权限启动应用程序，路径=%q，耗时=%s", executable, time.Since(startedAt).Round(time.Millisecond))
			return ApplicationToolResult{Message: "已请求管理员权限启动应用程序", Elevated: true}, nil
		}
		a.logf("ERROR", "应用程序启动失败: %v", err)
		return ApplicationToolResult{}, err
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
	return ApplicationToolResult{Message: fmt.Sprintf("应用程序已启动（PID %d）", pid), PID: pid}, nil
}
