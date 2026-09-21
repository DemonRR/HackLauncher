package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestSplitCommandLine(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  []string
	}{
		{name: "empty", input: "", want: nil},
		{name: "flags", input: `--mode fast --name "demo tool"`, want: []string{"--mode", "fast", "--name", "demo tool"}},
		{name: "path with parentheses", input: `--home "C:\Program Files (x86)\Demo"`, want: []string{"--home", `C:\Program Files (x86)\Demo`}},
		{name: "empty quoted argument", input: `--value ""`, want: []string{"--value", ""}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := splitCommandLine(test.input)
			if err != nil {
				t.Fatalf("splitCommandLine() error = %v", err)
			}
			if len(got) != len(test.want) {
				t.Fatalf("splitCommandLine() = %#v, want %#v", got, test.want)
			}
			for index := range got {
				if got[index] != test.want[index] {
					t.Fatalf("argument %d = %q, want %q", index, got[index], test.want[index])
				}
			}
		})
	}
}

func TestSplitCommandLineRejectsUnclosedQuote(t *testing.T) {
	if _, err := splitCommandLine(`--name "unfinished`); err == nil {
		t.Fatal("splitCommandLine() should reject an unclosed quote")
	}
}

func TestAssociatedPathCommandUsesTargetDirectory(t *testing.T) {
	target := `F:\Tools\Burp Suite\CN_Burp.VBS`
	wantDirectory := `F:\Tools\Burp Suite`
	cmd := newAssociatedPathCommand(target, wantDirectory)
	if cmd.Dir != wantDirectory {
		t.Fatalf("associated file working directory = %q, want %q", cmd.Dir, wantDirectory)
	}
	if len(cmd.Args) != 3 || cmd.Args[2] != target {
		t.Fatalf("unexpected associated file command: %#v", cmd.Args)
	}
}

func TestTerminalStaysOpenIntegration(t *testing.T) {
	if os.Getenv("HACKLAUNCHER_TERMINAL_TEST") != "1" {
		t.Skip("set HACKLAUNCHER_TERMINAL_TEST=1 to run the Windows console integration test")
	}
	pythonPath := `F:\PenetrationToolkits\Tools\system\python3\python.exe`
	scriptPath := `F:\PenetrationToolkits\Tools\InformationTools\dirsearch-0.4.3\dirsearch.py`
	workingDirectory := `F:\PenetrationToolkits\Tools\InformationTools\dirsearch-0.4.3`
	for _, path := range []string{pythonPath, scriptPath} {
		if _, err := os.Stat(path); err != nil {
			t.Skipf("integration fixture is unavailable: %s", path)
		}
	}
	markerPath := filepath.Join(t.TempDir(), "python-path.txt")
	command := `"` + pythonPath + `" "` + scriptPath + `" -h & where python > "` + markerPath + `"`
	cmd, cleanup, err := newTerminalProcess(command, workingDirectory, pythonPath, "")
	if err != nil {
		t.Fatalf("create terminal process failed: %v", err)
	}
	defer cleanup()
	if err := cmd.Start(); err != nil {
		t.Fatalf("terminal start failed: %v", err)
	}

	tempScriptPath := cmd.Args[len(cmd.Args)-1]
	deadline := time.Now().Add(5 * time.Second)
	var childPIDs []int
	for time.Now().Before(deadline) {
		childPIDs = findTerminalProcesses(t, tempScriptPath)
		if len(childPIDs) > 0 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if len(childPIDs) == 0 {
		t.Fatal("the independent terminal process did not stay open")
	}
	deadline = time.Now().Add(5 * time.Second)
	pythonVerified := false
	for time.Now().Before(deadline) {
		data, readErr := os.ReadFile(markerPath)
		if readErr == nil && strings.TrimSpace(string(data)) != "" {
			firstLine := strings.Split(strings.ReplaceAll(strings.TrimSpace(string(data)), "\r\n", "\n"), "\n")[0]
			if !strings.EqualFold(firstLine, pythonPath) {
				t.Fatalf("terminal python = %q, want %q", firstLine, pythonPath)
			}
			pythonVerified = true
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !pythonVerified {
		t.Fatal("terminal did not expose the configured Python first on PATH")
	}
	for _, pid := range childPIDs {
		_ = exec.Command("taskkill.exe", "/PID", strconv.Itoa(pid), "/T", "/F").Run()
	}
	waitDone := make(chan error, 1)
	go func() { waitDone <- cmd.Wait() }()
	select {
	case <-waitDone:
	case <-time.After(5 * time.Second):
		t.Fatal("terminal launcher did not exit after its child was closed")
	}
}

func TestTerminalScriptPinsConfiguredPython(t *testing.T) {
	pythonPath := `F:\PenetrationToolkits\Tools\system\python3\python.exe`
	content := terminalScriptContent("python --version", pythonPath, "")
	for _, expected := range []string{
		`set "HACKLAUNCHER_PYTHON=` + pythonPath + `"`,
		`set "PATH=F:\PenetrationToolkits\Tools\system\python3;%PATH%"`,
		`doskey python="` + pythonPath + `" $*`,
		`doskey python3="` + pythonPath + `" $*`,
	} {
		if !strings.Contains(content, expected) {
			t.Fatalf("terminal script is missing %q:\n%s", expected, content)
		}
	}
}

func TestTerminalScriptReportsCommandExitCode(t *testing.T) {
	content := terminalScriptContent("tool.exe --check", "", "")
	for _, expected := range []string{
		`set "HACKLAUNCHER_COMMAND_EXIT=%ERRORLEVEL%"`,
		`if defined HACKLAUNCHER_STATUS_FILE > "%HACKLAUNCHER_STATUS_FILE%" echo %HACKLAUNCHER_COMMAND_EXIT%`,
	} {
		if !strings.Contains(content, expected) {
			t.Fatalf("terminal script is missing %q:\n%s", expected, content)
		}
	}
}

func TestTerminalScriptPinsConfiguredJava(t *testing.T) {
	javaPath := `F:\PenetrationToolkits\Tools\system\jdk17\bin\java.exe`
	content := terminalScriptContent("java -version", "", javaPath)
	for _, expected := range []string{
		`set "HACKLAUNCHER_JAVA=` + javaPath + `"`,
		`set "JAVA_HOME=F:\PenetrationToolkits\Tools\system\jdk17"`,
		`set "PATH=F:\PenetrationToolkits\Tools\system\jdk17\bin;%PATH%"`,
		`doskey java="` + javaPath + `" $*`,
	} {
		if !strings.Contains(content, expected) {
			t.Fatalf("terminal script is missing %q:\n%s", expected, content)
		}
	}
}

func TestConfiguredJavaUsesDefaultEnvironment(t *testing.T) {
	javaDir := filepath.Join(t.TempDir(), "jdk17", "bin")
	if err := os.MkdirAll(javaDir, 0o755); err != nil {
		t.Fatal(err)
	}
	javaPath := filepath.Join(javaDir, "java.exe")
	if err := os.WriteFile(javaPath, []byte("test"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	app.config["environment"] = map[string]interface{}{
		"defaultJavaEnvironmentId": "jdk17",
		"javaEnvironments": []interface{}{
			map[string]interface{}{"id": "jdk17", "path": javaDir},
		},
	}
	if got := app.configuredJavaPath(""); !strings.EqualFold(got, javaPath) {
		t.Fatalf("configuredJavaPath() = %q, want %q", got, javaPath)
	}
}

func findTerminalProcesses(t *testing.T, scriptPath string) []int {
	t.Helper()
	needle := strings.ReplaceAll(scriptPath, "'", "''")
	query := `$needle='` + needle + `'; Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($needle) } | Select-Object -ExpandProperty ProcessId`
	output, err := exec.Command("powershell.exe", "-NoProfile", "-Command", query).Output()
	if err != nil {
		t.Fatalf("query terminal processes failed: %v", err)
	}
	var result []int
	for _, field := range strings.Fields(string(output)) {
		if pid, err := strconv.Atoi(field); err == nil {
			result = append(result, pid)
		}
	}
	return result
}

func TestCappedOutput(t *testing.T) {
	output := &cappedOutput{limit: 4}
	written, err := output.Write([]byte("abcdef"))
	if err != nil || written != 6 {
		t.Fatalf("Write() = (%d, %v), want (6, nil)", written, err)
	}
	result := output.String()
	if !strings.HasPrefix(result, "abcd") || !strings.Contains(result, "已截断") {
		t.Fatalf("unexpected capped output: %q", result)
	}
}

func TestEnvironmentStatusChecksConfiguredExecutables(t *testing.T) {
	runtimeRoot := t.TempDir()
	pythonPath := filepath.Join(runtimeRoot, "python.exe")
	javaRoot := filepath.Join(runtimeRoot, "jdk")
	javaPath := filepath.Join(javaRoot, "bin", "java.exe")
	if err := os.MkdirAll(filepath.Dir(javaPath), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{pythonPath, javaPath} {
		if err := os.WriteFile(path, []byte("fixture"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	app := NewApp()
	app.config["environment"] = map[string]interface{}{
		"python": pythonPath,
		"javaEnvironments": []interface{}{
			map[string]interface{}{"id": "jdk", "path": javaRoot},
		},
	}
	status := app.GetEnvironmentStatus()
	if status["healthy"] != true || status["pythonAvailable"] != true {
		t.Fatalf("unexpected environment status: %#v", status)
	}
	if got := status["javaAvailable"]; got != 1 {
		t.Fatalf("javaAvailable = %#v, want 1", got)
	}
}
