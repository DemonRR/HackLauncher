package main

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	webviewDataPath := ""
	if cacheDir, err := os.UserCacheDir(); err == nil {
		webviewDataPath = filepath.Join(cacheDir, "HackLauncher", "WebView2")
	}
	err := wails.Run(&options.App{
		Title:                    "渗透武器库",
		Width:                    1190,
		Height:                   680,
		MinWidth:                 900,
		MinHeight:                560,
		Frameless:                true,
		BackgroundColour:         options.NewRGB(248, 250, 252),
		EnableDefaultContextMenu: false,
		AssetServer:              &assetserver.Options{Assets: assets},
		OnStartup:                app.startup,
		OnShutdown:               app.shutdown,
		OnBeforeClose:            app.beforeClose,
		Bind:                     []interface{}{app},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "com.demonrr.hacklauncher",
			OnSecondInstanceLaunch: func(_ options.SecondInstanceData) {
				app.showMainWindow()
			},
		},
		Windows: &windows.Options{
			WebviewIsTransparent:              false,
			WindowIsTranslucent:               false,
			DisableFramelessWindowDecorations: false,
			WebviewUserDataPath:               webviewDataPath,
		},
	})
	if err != nil {
		fmt.Println("HackLauncher startup failed:", err)
	}
}
