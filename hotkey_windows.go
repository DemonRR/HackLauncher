//go:build windows

package main

import (
	"errors"
	"fmt"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const (
	modifierAlt      = 0x0001
	modifierControl  = 0x0002
	modifierShift    = 0x0004
	modifierWin      = 0x0008
	modifierNoRepeat = 0x4000
	messageHotkey    = 0x0312
	peekRemove       = 0x0001
	showHotkeyID     = 1
)

var (
	user32DLL            = syscall.NewLazyDLL("user32.dll")
	registerHotKeyProc   = user32DLL.NewProc("RegisterHotKey")
	unregisterHotKeyProc = user32DLL.NewProc("UnregisterHotKey")
	peekMessageProc      = user32DLL.NewProc("PeekMessageW")
)

type hotkeyMessage struct {
	Window  uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	PointX  int32
	PointY  int32
	Private uint32
}

type globalHotkey struct {
	mu          sync.Mutex
	stop        chan struct{}
	done        chan struct{}
	combination string
	callback    func()
}

func newGlobalHotkey() *globalHotkey { return &globalHotkey{} }

func (h *globalHotkey) Register(combination string, callback func()) (string, error) {
	modifiers, virtualKey, canonical, err := parseHotkey(combination)
	if err != nil {
		return "", err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.stop != nil && h.combination == canonical {
		return canonical, nil
	}
	previousCombination := h.combination
	previousCallback := h.callback
	if h.stop != nil {
		close(h.stop)
		<-h.done
	}
	if err := h.startLocked(modifiers, virtualKey, callback); err != nil {
		if previousCombination != "" {
			previousModifiers, previousKey, _, parseErr := parseHotkey(previousCombination)
			if parseErr == nil {
				if restoreErr := h.startLocked(previousModifiers, previousKey, previousCallback); restoreErr == nil {
					h.combination = previousCombination
					h.callback = previousCallback
				}
			}
		}
		return "", err
	}
	h.combination = canonical
	h.callback = callback
	return canonical, nil
}

func (h *globalHotkey) startLocked(modifiers, virtualKey uint32, callback func()) error {
	stop := make(chan struct{})
	done := make(chan struct{})
	ready := make(chan error, 1)
	h.stop = stop
	h.done = done
	go runHotkeyLoop(modifiers, virtualKey, stop, done, ready, callback)
	if err := <-ready; err != nil {
		h.stop = nil
		h.done = nil
		return err
	}
	return nil
}

func (h *globalHotkey) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.stop == nil {
		return
	}
	close(h.stop)
	<-h.done
	h.stop = nil
	h.done = nil
	h.combination = ""
	h.callback = nil
}

func runHotkeyLoop(modifiers, virtualKey uint32, stop <-chan struct{}, done chan<- struct{}, ready chan<- error, callback func()) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	defer close(done)
	registered, _, callErr := registerHotKeyProc.Call(0, showHotkeyID, uintptr(modifiers|modifierNoRepeat), uintptr(virtualKey))
	if registered == 0 {
		if callErr == nil || errors.Is(callErr, syscall.Errno(0)) {
			callErr = errors.New("快捷键已被其他程序占用")
		}
		ready <- fmt.Errorf("无法注册全局快捷键: %w", callErr)
		return
	}
	defer unregisterHotKeyProc.Call(0, showHotkeyID)
	ready <- nil

	for {
		select {
		case <-stop:
			return
		default:
		}
		var message hotkeyMessage
		for {
			found, _, _ := peekMessageProc.Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0, peekRemove)
			if found == 0 {
				break
			}
			if message.Message == messageHotkey && message.WParam == showHotkeyID && callback != nil {
				go callback()
			}
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func parseHotkey(combination string) (uint32, uint32, string, error) {
	parts := strings.Split(strings.ReplaceAll(strings.TrimSpace(combination), " ", ""), "+")
	if len(parts) < 2 {
		return 0, 0, "", errors.New("快捷键必须包含 Ctrl、Alt、Shift 或 Win 修饰键")
	}
	var modifiers uint32
	var key string
	for _, rawPart := range parts {
		part := strings.ToUpper(strings.TrimSpace(rawPart))
		switch part {
		case "CTRL", "CONTROL":
			modifiers |= modifierControl
		case "ALT":
			modifiers |= modifierAlt
		case "SHIFT":
			modifiers |= modifierShift
		case "WIN", "WINDOWS", "META":
			modifiers |= modifierWin
		case "":
			return 0, 0, "", errors.New("快捷键格式无效")
		default:
			if key != "" {
				return 0, 0, "", errors.New("快捷键只能包含一个普通按键")
			}
			key = part
		}
	}
	if modifiers == 0 || key == "" {
		return 0, 0, "", errors.New("快捷键必须包含修饰键和普通按键")
	}
	virtualKey, err := hotkeyVirtualKey(key)
	if err != nil {
		return 0, 0, "", err
	}
	canonicalParts := make([]string, 0, 5)
	if modifiers&modifierControl != 0 {
		canonicalParts = append(canonicalParts, "Ctrl")
	}
	if modifiers&modifierAlt != 0 {
		canonicalParts = append(canonicalParts, "Alt")
	}
	if modifiers&modifierShift != 0 {
		canonicalParts = append(canonicalParts, "Shift")
	}
	if modifiers&modifierWin != 0 {
		canonicalParts = append(canonicalParts, "Win")
	}
	canonicalParts = append(canonicalParts, key)
	return modifiers, virtualKey, strings.Join(canonicalParts, "+"), nil
}

func hotkeyVirtualKey(key string) (uint32, error) {
	if len(key) == 1 && ((key[0] >= 'A' && key[0] <= 'Z') || (key[0] >= '0' && key[0] <= '9')) {
		return uint32(key[0]), nil
	}
	if strings.HasPrefix(key, "F") {
		number, err := strconv.Atoi(strings.TrimPrefix(key, "F"))
		if err == nil && number >= 1 && number <= 24 {
			return uint32(0x70 + number - 1), nil
		}
	}
	return 0, fmt.Errorf("不支持按键 %q，仅支持 A-Z、0-9 和 F1-F24", key)
}
