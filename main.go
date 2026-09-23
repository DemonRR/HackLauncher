package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

const (
	defaultWindowWidth  = 1190
	defaultWindowHeight = 680
	minimumWindowWidth  = 900
	minimumWindowHeight = 560
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	windowWidth, windowHeight := loadInitialWindowSize()
	webviewDataPath := ""
	if cacheDir, err := os.UserCacheDir(); err == nil {
		webviewDataPath = filepath.Join(cacheDir, "HackLauncher", "WebView2")
	}
	// systray.Register must run on the locked main OS thread. Wails then owns
	// the shared Windows message loop and dispatches both app and tray events.
	app.registerTray()
	err := wails.Run(&options.App{
		Title:                    "渗透武器库",
		Width:                    windowWidth,
		Height:                   windowHeight,
		MinWidth:                 minimumWindowWidth,
		MinHeight:                minimumWindowHeight,
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
				app.logf("INFO", "检测到重复启动，正在通过单实例回调唤醒主窗口")
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

func loadInitialWindowSize() (int, int) {
	store, err := OpenStore()
	if err != nil {
		return defaultWindowWidth, defaultWindowHeight
	}
	defer store.Close()
	cfg, err := store.Load()
	if err != nil {
		return defaultWindowWidth, defaultWindowHeight
	}
	return initialWindowSizeFromConfig(cfg)
}

func initialWindowSizeFromConfig(cfg Config) (int, int) {
	width, height := defaultWindowWidth, defaultWindowHeight
	settings, _ := cfg["settings"].(map[string]interface{})
	if value, ok := configInt(settings["initialWindowWidth"]); ok && value >= minimumWindowWidth {
		width = value
	}
	if value, ok := configInt(settings["initialWindowHeight"]); ok && value >= minimumWindowHeight {
		height = value
	}
	return width, height
}

func configInt(value interface{}) (int, bool) {
	switch number := value.(type) {
	case int:
		return number, true
	case float64:
		return int(number), number == float64(int(number))
	case json.Number:
		parsed, err := strconv.Atoi(number.String())
		return parsed, err == nil
	default:
		return 0, false
	}
}
