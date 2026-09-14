package main

import (
	_ "embed"

	"github.com/getlantern/systray"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

func (a *App) startTray() {
	systray.Run(func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("HackLauncher")
		systray.SetTooltip("渗透武器库")
		show := systray.AddMenuItem("显示主窗口", "显示 HackLauncher")
		quit := systray.AddMenuItem("退出", "退出 HackLauncher")
		go func() {
			for {
				select {
				case <-show.ClickedCh:
					a.showMainWindow()
				case <-quit.ClickedCh:
					a.ConfirmQuit()
					return
				}
			}
		}()
	}, func() {})
}
