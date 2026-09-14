//go:build windows

package main

import "testing"

func TestParseHotkey(t *testing.T) {
	modifiers, key, canonical, err := parseHotkey("shift + ctrl + h")
	if err != nil {
		t.Fatalf("parseHotkey() error = %v", err)
	}
	if modifiers != modifierControl|modifierShift || key != 'H' || canonical != "Ctrl+Shift+H" {
		t.Fatalf("parseHotkey() = %#x, %#x, %q", modifiers, key, canonical)
	}
}

func TestParseHotkeyFunctionKey(t *testing.T) {
	_, key, canonical, err := parseHotkey("Alt+F12")
	if err != nil {
		t.Fatalf("parseHotkey() error = %v", err)
	}
	if key != 0x7B || canonical != "Alt+F12" {
		t.Fatalf("unexpected function hotkey: %#x %q", key, canonical)
	}
}

func TestParseHotkeyRejectsUnsafeSingleKey(t *testing.T) {
	if _, _, _, err := parseHotkey("H"); err == nil {
		t.Fatal("single-key global hotkey should be rejected")
	}
}
