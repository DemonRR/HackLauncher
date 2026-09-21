package main

import (
	"os"
	"path/filepath"
	"testing"
)

func newAutoFixTestApp(t *testing.T, cfg Config) *App {
	t.Helper()
	t.Setenv("HACKLAUNCHER_DATA_DIR", t.TempDir())
	store, err := OpenStore()
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	mergeConfigDefaults(cfg)
	if err := store.Save(cfg); err != nil {
		t.Fatalf("save initial config: %v", err)
	}
	app := NewApp()
	app.store = store
	app.config = cloneConfig(cfg)
	return app
}

func TestAutoFixToolsRepairsSafeConfigurationProblems(t *testing.T) {
	root := t.TempDir()
	script := filepath.Join(root, "scanner.py")
	if err := os.WriteFile(script, []byte("print('ok')\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := defaultConfig()
	cfg["categories"] = []interface{}{
		map[string]interface{}{"id": "tools", "name": "工具"},
	}
	cfg["defaultCategoryId"] = "tools"
	cfg["items"] = []interface{}{
		map[string]interface{}{
			"id": "scanner", "name": "Scanner", "type": "application",
			"command": `"` + script + `"`, "categoryId": "removed-category",
		},
	}
	app := newAutoFixTestApp(t, cfg)

	report, err := app.AutoFixTools()
	if err != nil {
		t.Fatalf("auto fix: %v", err)
	}
	if report.FixedItems != 1 || report.Changes < 3 {
		t.Fatalf("unexpected report: %#v", report)
	}
	items := app.GetConfig()["items"].([]interface{})
	item := items[0].(map[string]interface{})
	if item["command"] != script || item["type"] != "python" || item["categoryId"] != "tools" {
		t.Fatalf("safe fixes were not persisted: %#v", item)
	}
}

func TestAutoFixToolsLeavesMissingTargetForManualRepair(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing.exe")
	cfg := defaultConfig()
	cfg["items"] = []interface{}{
		map[string]interface{}{
			"id": "missing", "name": "Missing", "type": "application", "command": missing,
		},
	}
	app := newAutoFixTestApp(t, cfg)

	report, err := app.AutoFixTools()
	if err != nil {
		t.Fatalf("auto fix: %v", err)
	}
	if report.Changes != 0 || report.RemainingErrors != 1 {
		t.Fatalf("missing target should require manual repair: %#v", report)
	}
	item := app.GetConfig()["items"].([]interface{})[0].(map[string]interface{})
	if item["command"] != missing {
		t.Fatalf("missing path was unexpectedly changed: %#v", item)
	}
}
