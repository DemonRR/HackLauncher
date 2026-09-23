package main

import (
	"path/filepath"
	"testing"
)

func TestPortablePathRoundTrip(t *testing.T) {
	root := filepath.Join(t.TempDir(), "PenetrationToolkits")
	t.Setenv("HACKLAUNCHER_TOOLKIT_ROOT", root)
	target := filepath.Join(root, "Tools", "Web", "scanner.exe")

	portable := makePortablePath(target)
	wantPortable := filepath.Join(toolsRootToken, "Web", "scanner.exe")
	if portable != wantPortable {
		t.Fatalf("makePortablePath() = %q, want %q", portable, wantPortable)
	}
	if resolved := resolvePortablePath(portable); resolved != target {
		t.Fatalf("resolvePortablePath() = %q, want %q", resolved, target)
	}
}

func TestResolveLegacyToolkitPathAfterMove(t *testing.T) {
	root := filepath.Join(t.TempDir(), "PenetrationToolkits")
	t.Setenv("HACKLAUNCHER_TOOLKIT_ROOT", root)
	legacy := `F:\PenetrationToolkits\Tools\system\python3\python.exe`
	want := filepath.Join(root, "Tools", "system", "python3", "python.exe")
	if got := resolvePortablePath(legacy); got != want {
		t.Fatalf("resolvePortablePath(legacy) = %q, want %q", got, want)
	}
}

func TestMakeConfigPortable(t *testing.T) {
	root := filepath.Join(t.TempDir(), "PenetrationToolkits")
	t.Setenv("HACKLAUNCHER_TOOLKIT_ROOT", root)
	cfg := defaultConfig()
	cfg["environment"].(map[string]interface{})["python"] = filepath.Join(root, "Tools", "system", "python.exe")
	cfg["items"] = []interface{}{
		map[string]interface{}{"type": "application", "command": filepath.Join(root, "Tools", "tool.exe")},
		map[string]interface{}{"type": "url", "command": "https://example.com/Tools/demo"},
	}

	if !makeConfigPortable(cfg) {
		t.Fatal("makeConfigPortable() did not report a migration")
	}
	environment := cfg["environment"].(map[string]interface{})
	if got := environment["python"]; got != filepath.Join(toolsRootToken, "system", "python.exe") {
		t.Fatalf("portable Python path = %v", got)
	}
	items := cfg["items"].([]interface{})
	if got := items[0].(map[string]interface{})["command"]; got != filepath.Join(toolsRootToken, "tool.exe") {
		t.Fatalf("portable tool path = %v", got)
	}
	if got := items[1].(map[string]interface{})["command"]; got != "https://example.com/Tools/demo" {
		t.Fatalf("URL was unexpectedly changed: %v", got)
	}
}

func TestConfiguredToolsRootOverridesAutomaticDetection(t *testing.T) {
	automaticRoot := filepath.Join(t.TempDir(), "PenetrationToolkits")
	customToolsRoot := filepath.Join(t.TempDir(), "CustomTools")
	t.Setenv("HACKLAUNCHER_TOOLKIT_ROOT", automaticRoot)
	setConfiguredToolsRoot(customToolsRoot)
	t.Cleanup(func() { setConfiguredToolsRoot("") })

	roots := currentPortablePathRoots()
	if roots.Tools != customToolsRoot {
		t.Fatalf("configured tools root = %q, want %q", roots.Tools, customToolsRoot)
	}
	want := filepath.Join(customToolsRoot, "Web", "scanner.exe")
	if got := resolvePortablePath(filepath.Join(toolsRootToken, "Web", "scanner.exe")); got != want {
		t.Fatalf("resolved configured path = %q, want %q", got, want)
	}
}

func TestConfiguredToolsRootSupportsToolkitVariable(t *testing.T) {
	root := filepath.Join(t.TempDir(), "PenetrationToolkits")
	t.Setenv("HACKLAUNCHER_TOOLKIT_ROOT", root)
	setConfiguredToolsRoot(filepath.Join(toolkitRootToken, "ExternalTools"))
	t.Cleanup(func() { setConfiguredToolsRoot("") })

	want := filepath.Join(root, "ExternalTools")
	if got := currentPortablePathRoots().Tools; got != want {
		t.Fatalf("tools root with toolkit variable = %q, want %q", got, want)
	}
}

func TestPortablePathMigrationIsIdempotent(t *testing.T) {
	root := filepath.Join(t.TempDir(), "PenetrationToolkits")
	t.Setenv("HACKLAUNCHER_TOOLKIT_ROOT", root)
	setConfiguredToolsRoot("")

	want := filepath.Join(toolsRootToken, "system", "python3", "python.exe")
	got := want
	for range 5 {
		got = makePortablePath(got)
	}
	if got != want {
		t.Fatalf("repeated portable migration = %q, want %q", got, want)
	}
}

func TestRepairRepeatedPortablePrefixes(t *testing.T) {
	root := filepath.Join(t.TempDir(), "PenetrationToolkits")
	t.Setenv("HACKLAUNCHER_TOOLKIT_ROOT", root)
	setConfiguredToolsRoot("")

	broken := `${TOOLKIT_ROOT}\HackLauncher\${TOOLKIT_ROOT}\HackLauncher\${TOOLKIT_ROOT}\HackLauncher\${TOOLS_ROOT}\system\python3\python.exe`
	want := filepath.Join(toolsRootToken, "system", "python3", "python.exe")
	if got := makePortablePath(broken); got != want {
		t.Fatalf("repaired portable path = %q, want %q", got, want)
	}
	resolvedWant := filepath.Join(root, "Tools", "system", "python3", "python.exe")
	if got := resolvePortablePath(broken); got != resolvedWant {
		t.Fatalf("resolved repaired path = %q, want %q", got, resolvedWant)
	}
}
