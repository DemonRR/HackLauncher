//go:build windows

package main

import (
	"os"
	"testing"

	"golang.org/x/sys/windows"
)

func TestIsElevationRequiredRecognizesWrappedWindowsError(t *testing.T) {
	err := &os.PathError{Op: "fork/exec", Path: `C:\Tools\AdminTool.exe`, Err: windows.ERROR_ELEVATION_REQUIRED}
	if !isElevationRequired(err) {
		t.Fatalf("expected elevation-required error to be recognized: %v", err)
	}
}
