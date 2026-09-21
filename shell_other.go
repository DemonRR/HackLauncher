//go:build !windows

package main

import "os/exec"

func newShellCommand(command string) *exec.Cmd {
	return exec.Command("sh", "-c", command)
}

func newVisibleTerminalCommand(shell, scriptPath string) *exec.Cmd {
	return exec.Command(shell, scriptPath)
}

func prepareBackgroundProcess(_ *exec.Cmd) {}

func prepareHiddenHelperProcess(_ *exec.Cmd) {}
