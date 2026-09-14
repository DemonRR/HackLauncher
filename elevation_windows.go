//go:build windows

package main

import (
	"errors"
	"fmt"

	"golang.org/x/sys/windows"
)

func isElevationRequired(err error) bool {
	return errors.Is(err, windows.ERROR_ELEVATION_REQUIRED)
}

func startElevatedApplication(executable, arguments, cwd string) error {
	verb, err := windows.UTF16PtrFromString("runas")
	if err != nil {
		return err
	}
	file, err := windows.UTF16PtrFromString(executable)
	if err != nil {
		return err
	}
	params, err := windows.UTF16PtrFromString(arguments)
	if err != nil {
		return err
	}
	directory, err := windows.UTF16PtrFromString(cwd)
	if err != nil {
		return err
	}
	if err := windows.ShellExecute(0, verb, file, params, directory, windows.SW_SHOWNORMAL); err != nil {
		if errors.Is(err, windows.ERROR_CANCELLED) {
			return errors.New("已取消管理员权限授权")
		}
		return fmt.Errorf("请求管理员权限失败: %w", err)
	}
	return nil
}
