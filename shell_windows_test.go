//go:build windows

package main

import (
	"os"
	"strings"
	"testing"
)

func TestNewShellCommandPreservesQuotedExecutable(t *testing.T) {
	shell := os.Getenv("ComSpec")
	if shell == "" {
		shell = `C:\Windows\System32\cmd.exe`
	}
	command := `"` + shell + `" /d /c echo shell-quote-ok`
	output, err := newShellCommand(command).CombinedOutput()
	if err != nil {
		t.Fatalf("quoted executable failed: %v: %s", err, output)
	}
	if !strings.Contains(string(output), "shell-quote-ok") {
		t.Fatalf("unexpected output: %q", output)
	}
}

func TestShellWindowModes(t *testing.T) {
	background := newShellCommand("echo hidden")
	if background.SysProcAttr == nil || !background.SysProcAttr.HideWindow || background.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Fatalf("background shell must not create a console: %#v", background.SysProcAttr)
	}

	terminal := newVisibleTerminalCommand("cmd.exe", `C:\Temp\tool.cmd`)
	if terminal.SysProcAttr == nil || !terminal.SysProcAttr.HideWindow || terminal.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Fatalf("terminal launcher must stay hidden: %#v", terminal.SysProcAttr)
	}
	if len(terminal.Args) != 11 || terminal.Args[10] != `C:\Temp\tool.cmd` {
		t.Fatalf("unexpected terminal arguments: %#v", terminal.Args)
	}

	guiRuntime := newShellCommand("echo placeholder")
	guiRuntime.SysProcAttr = nil
	prepareBackgroundProcess(guiRuntime)
	if guiRuntime.SysProcAttr == nil || guiRuntime.SysProcAttr.HideWindow || guiRuntime.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Fatalf("GUI runtime must suppress only its console: %#v", guiRuntime.SysProcAttr)
	}
}
