package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateConfig(t *testing.T) {
	if err := validateConfig(defaultConfig()); err != nil {
		t.Fatalf("default config should be valid: %v", err)
	}

	invalid := defaultConfig()
	invalid["items"] = "not-an-array"
	if err := validateConfig(invalid); err == nil {
		t.Fatal("invalid items field should be rejected")
	}
}

func TestStoreBackupAndRecovery(t *testing.T) {
	t.Setenv("HACKLAUNCHER_DATA_DIR", t.TempDir())
	store, err := OpenStore()
	if err != nil {
		t.Fatalf("OpenStore() error = %v", err)
	}
	defer store.Close()

	original, err := store.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	changed := cloneConfig(original)
	changed["settings"].(map[string]interface{})["theme"] = "dark"
	if err := store.Save(changed); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	backups, err := filepath.Glob(filepath.Join(store.backupDir, "config-*.json"))
	if err != nil || len(backups) != 1 {
		t.Fatalf("expected one backup, got %d (error %v)", len(backups), err)
	}

	if _, err := store.db.Exec(`UPDATE app_state SET value = '{broken json' WHERE key = 'config'`); err != nil {
		t.Fatalf("corrupt test config: %v", err)
	}
	recovered, err := store.Load()
	if err != nil {
		t.Fatalf("Load() recovery error = %v", err)
	}
	settings := recovered["settings"].(map[string]interface{})
	if settings["theme"] != "light" {
		t.Fatalf("recovered theme = %v, want light", settings["theme"])
	}
	corruptCopies, _ := filepath.Glob(filepath.Join(store.backupDir, "corrupt-*.json"))
	if len(corruptCopies) != 1 {
		t.Fatalf("expected one corrupt recovery copy, got %d", len(corruptCopies))
	}
}

func TestStoreLog(t *testing.T) {
	t.Setenv("HACKLAUNCHER_DATA_DIR", t.TempDir())
	store, err := OpenStore()
	if err != nil {
		t.Fatalf("OpenStore() error = %v", err)
	}
	defer store.Close()

	store.Logf("INFO", "test message")
	entries, err := os.ReadDir(store.logDir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("expected one log file, got %d (error %v)", len(entries), err)
	}
}

func TestStoreSeparatesAndReadsErrorLogs(t *testing.T) {
	t.Setenv("HACKLAUNCHER_DATA_DIR", t.TempDir())
	store, err := OpenStore()
	if err != nil {
		t.Fatalf("OpenStore() error = %v", err)
	}
	defer store.Close()

	store.Logf("INFO", "started")
	store.Logf("ERROR", "failed\nwith details")
	entries, err := store.ReadLogs("ERROR", 20)
	if err != nil {
		t.Fatalf("ReadLogs() error = %v", err)
	}
	if len(entries) != 1 || entries[0].Level != "ERROR" {
		t.Fatalf("unexpected error entries: %#v", entries)
	}
	if strings.Contains(entries[0].Message, "\n") || !strings.Contains(entries[0].Message, "failed") {
		t.Fatalf("error message was not normalized: %q", entries[0].Message)
	}
	files, err := os.ReadDir(store.logDir)
	if err != nil || len(files) != 2 {
		t.Fatalf("expected runtime and error log files, got %d (error %v)", len(files), err)
	}
}

func TestLogRunEventWritesRuntimeAndErrorAudit(t *testing.T) {
	t.Setenv("HACKLAUNCHER_DATA_DIR", t.TempDir())
	store, err := OpenStore()
	if err != nil {
		t.Fatalf("OpenStore() error = %v", err)
	}
	defer store.Close()

	app := &App{store: store}
	app.LogRunEvent("Dirsearch", "python", "START", "目标=dirsearch.py")
	app.LogRunEvent("Dirsearch", "python", "ERROR", "解释器不存在")

	runtimeEntries, err := store.ReadLogs("ALL", 20)
	if err != nil {
		t.Fatalf("ReadLogs(ALL) error = %v", err)
	}
	errorEntries, err := store.ReadLogs("ERROR", 20)
	if err != nil {
		t.Fatalf("ReadLogs(ERROR) error = %v", err)
	}
	if len(runtimeEntries) != 2 || len(errorEntries) != 1 {
		t.Fatalf("unexpected audit counts: runtime=%d error=%d", len(runtimeEntries), len(errorEntries))
	}
	if !strings.Contains(errorEntries[0].Message, "Dirsearch") || !strings.Contains(errorEntries[0].Message, "python") {
		t.Fatalf("missing audit context: %q", errorEntries[0].Message)
	}
}

func TestMigrateRoamingDataCopiesExistingFiles(t *testing.T) {
	roaming := t.TempDir()
	destination := t.TempDir()
	t.Setenv("APPDATA", roaming)
	source := filepath.Join(roaming, "HackLauncher")
	if err := os.MkdirAll(filepath.Join(source, "logs"), 0o755); err != nil {
		t.Fatalf("create legacy log directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source, "config.db"), []byte("legacy-config"), 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source, "logs", "runtime.jsonl"), []byte("legacy-log"), 0o600); err != nil {
		t.Fatalf("write legacy log: %v", err)
	}

	if err := migrateRoamingData(destination); err != nil {
		t.Fatalf("migrateRoamingData() error = %v", err)
	}
	for _, relativePath := range []string{"config.db", filepath.Join("logs", "runtime.jsonl")} {
		if _, err := os.Stat(filepath.Join(destination, relativePath)); err != nil {
			t.Fatalf("migrated file %s is missing: %v", relativePath, err)
		}
	}
}
