//go:build !windows

package main

import "errors"

type globalHotkey struct{}

func newGlobalHotkey() *globalHotkey { return &globalHotkey{} }

func (h *globalHotkey) Register(_ string, _ func()) (string, error) {
	return "", errors.New("当前系统不支持全局快捷键")
}

func (h *globalHotkey) Close() {}
