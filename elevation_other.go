//go:build !windows

package main

import "errors"

func isElevationRequired(error) bool { return false }

func startElevatedApplication(string, string, string) error {
	return errors.New("当前系统不支持 Windows 管理员权限启动")
}
