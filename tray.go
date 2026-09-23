package main

import (
	_ "embed"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

func (a *App) registerTray() {
	systray.Register(func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("HackLauncher")
		systray.SetTooltip("渗透武器库")
		show := systray.AddMenuItem("显示主窗口", "显示 HackLauncher")
		systray.AddSeparator()
		diagnostics := systray.AddMenuItem("工具资产体检", "检查工具路径和运行环境")
		logs := systray.AddMenuItem("打开日志中心", "查看运行与错误日志")
		systray.AddSeparator()
		quit := systray.AddMenuItem("退出", "退出 HackLauncher")
		go func() {
			for {
				select {
				case <-show.ClickedCh:
					a.logf("INFO", "系统托盘菜单触发：显示主窗口")
					a.showMainWindow()
				case <-diagnostics.ClickedCh:
					a.logf("INFO", "系统托盘菜单触发：工具资产体检")
					a.showMainWindow()
					if a.ctx != nil {
						runtime.EventsEmit(a.ctx, "open-diagnostics")
					}
				case <-logs.ClickedCh:
					a.logf("INFO", "系统托盘菜单触发：打开日志中心")
					a.showMainWindow()
					if a.ctx != nil {
						runtime.EventsEmit(a.ctx, "open-log-center")
					}
				case <-quit.ClickedCh:
					a.logf("INFO", "系统托盘菜单触发：退出程序")
					a.ConfirmQuit()
					return
				}
			}
		}()
	}, func() {
		a.logf("INFO", "系统托盘消息窗口已退出")
	})
}
