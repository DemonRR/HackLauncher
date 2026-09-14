package main

import (
	"archive/zip"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRequiredJavaMajor(t *testing.T) {
	jarPath := filepath.Join(t.TempDir(), "tool.jar")
	file, err := os.Create(jarPath)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	class, err := archive.Create("com/example/Main.class")
	if err != nil {
		t.Fatal(err)
	}
	header := make([]byte, 8)
	binary.BigEndian.PutUint32(header[:4], 0xCAFEBABE)
	binary.BigEndian.PutUint16(header[6:8], 61)
	if _, err := class.Write(header); err != nil {
		t.Fatal(err)
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	required, classMajor, err := requiredJavaMajor(jarPath)
	if err != nil {
		t.Fatalf("requiredJavaMajor() error = %v", err)
	}
	if required != 17 || classMajor != 61 {
		t.Fatalf("requiredJavaMajor() = Java %d / class %d, want Java 17 / class 61", required, classMajor)
	}
}

func TestBuildBatchCommandQuotesEveryArgument(t *testing.T) {
	command := buildBatchCommand(`F:\Runtime Path\java.exe`, []string{"-jar", `F:\Tool Path\tool.jar`, "--name", "demo tool"})
	for _, expected := range []string{`"F:\Runtime Path\java.exe"`, `"F:\Tool Path\tool.jar"`, `"demo tool"`} {
		if !strings.Contains(command, expected) {
			t.Fatalf("command %q is missing %q", command, expected)
		}
	}
}

func TestJavaVersionPattern(t *testing.T) {
	for output, want := range map[string]string{
		`java version "1.8.0_291"`:              "8",
		`openjdk version "17.0.12"`:             "17",
		`java version "21.0.10" 2026-01-20 LTS`: "21",
	} {
		match := javaVersionPattern.FindStringSubmatch(output)
		if len(match) != 2 || match[1] != want {
			t.Fatalf("version output %q parsed as %#v, want %s", output, match, want)
		}
	}
}
