//go:build windows

package main

import (
	"os"
	"os/exec"
	"strings"
	"syscall"
)

const (
	createNoWindow = 0x08000000
)

func newShellCommand(command string) *exec.Cmd {
	shell := strings.TrimSpace(os.Getenv("ComSpec"))
	if shell == "" {
		shell = "cmd.exe"
	}
	cmd := exec.Command(shell)
	// cmd.exe requires its /C payload to retain the leading quote around a
	// quoted executable. Passing the payload through exec.Command Args causes
	// Go to encode those quotes as \" and cmd treats them as literal filename
	// characters. Supplying the complete Windows command line avoids that
	// second escaping pass.
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CmdLine:       syscall.EscapeArg(shell) + ` /d /s /c "` + command + `"`,
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	return cmd
}

func newVisibleTerminalCommand(shell, scriptPath string) *exec.Cmd {
	cmd := exec.Command(shell, "/d", "/s", "/c", "start", "", "/wait", shell, "/d", "/k", scriptPath)
	// Only the child created by START is visible. The intermediary cmd.exe is
	// an implementation detail and must never flash a second console window.
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return cmd
}

func prepareBackgroundProcess(cmd *exec.Cmd) {
	// CREATE_NO_WINDOW suppresses a console for CLI runtimes while still
	// allowing JavaFX/Swing/Tk windows to become visible. HideWindow must not
	// be set here because GUI frameworks inherit SW_HIDE for their first window.
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow}
}

func prepareHiddenHelperProcess(cmd *exec.Cmd) {
	// Internal helpers such as PowerShell icon extraction must never surface a
	// console window. Unlike application runtimes, these helpers have no GUI
	// window that needs to remain visible, so SW_HIDE is safe here.
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}
