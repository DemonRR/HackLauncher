package main

import (
	"path/filepath"
	"testing"
)

func TestDiagnoseToolsReportsHealthyAndMissingTargets(t *testing.T) {
	root := t.TempDir()
	app := NewApp()
	app.config["items"] = []interface{}{
		map[string]interface{}{"id": "folder", "name": "工具目录", "type": "folder", "command": root},
		map[string]interface{}{"id": "missing", "name": "缺失程序", "type": "application", "command": filepath.Join(root, "missing.exe")},
	}

	report := app.DiagnoseTools()
	if report.Total != 2 || report.Healthy != 1 || report.Errors != 1 {
		t.Fatalf("unexpected diagnostic report: %#v", report)
	}
	if report.Results[1].Status != "ERROR" || report.Results[1].ItemID != "missing" {
		t.Fatalf("unexpected missing target result: %#v", report.Results[1])
	}
}

func TestRunStartupDiagnosticsHonoursSwitchAndRunsOnce(t *testing.T) {
	disabled := NewApp()
	disabledSettings := disabled.config["settings"].(map[string]interface{})
	disabledSettings["autoDiagnosticsOnStartup"] = false
	disabledResult := disabled.RunStartupDiagnostics()
	if disabledResult.Enabled || disabledResult.Report != nil {
		t.Fatalf("disabled startup diagnostics should be skipped: %#v", disabledResult)
	}

	enabled := NewApp()
	enabled.config["items"] = []interface{}{
		map[string]interface{}{"id": "folder", "name": "工具目录", "type": "folder", "command": t.TempDir()},
	}
	first := enabled.RunStartupDiagnostics()
	second := enabled.RunStartupDiagnostics()
	if !first.Enabled || first.Report == nil || first.Report.Total != 1 {
		t.Fatalf("startup diagnostics did not run: %#v", first)
	}
	if first.Report != second.Report {
		t.Fatal("startup diagnostics must return the cached report within one process")
	}
}

func TestDiagnoseToolsByIDsOnlyChecksSelectedItems(t *testing.T) {
	root := t.TempDir()
	app := NewApp()
	app.config["items"] = []interface{}{
		map[string]interface{}{"id": "healthy", "name": "正常目录", "type": "folder", "command": root},
		map[string]interface{}{"id": "missing", "name": "缺失程序", "type": "application", "command": filepath.Join(root, "missing.exe")},
	}

	report := app.DiagnoseToolsByIDs([]string{"missing", "missing", "unknown"})
	if report.Total != 1 || report.Errors != 1 || report.Results[0].ItemID != "missing" {
		t.Fatalf("unexpected selected diagnostic report: %#v", report)
	}
}
