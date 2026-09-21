package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	maxLogFileBytes = 5 << 20
	maxLogMessage   = 8192
	maxLogRead      = 1000
)

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	Category  string `json:"category,omitempty"`
	Tool      string `json:"tool,omitempty"`
	ToolType  string `json:"toolType,omitempty"`
	Status    string `json:"status,omitempty"`
	Detail    string `json:"detail,omitempty"`
}

func (s *Store) Logf(level, format string, args ...interface{}) {
	level = normalizeLogLevel(level)
	message := strings.TrimSpace(fmt.Sprintf(format, args...))
	message = strings.NewReplacer("\r\n", " ⏎ ", "\n", " ⏎ ", "\r", " ⏎ ").Replace(message)
	if len(message) > maxLogMessage {
		message = message[:maxLogMessage] + "…[已截断]"
	}
	entry := LogEntry{Timestamp: time.Now().Format(time.RFC3339Nano), Level: level, Message: message}
	s.writeLogEntry(entry)
}

func (s *Store) LogRunEvent(level, tool, toolType, status, detail string) {
	message := fmt.Sprintf("运行审计 | 工具=%q | 类型=%s | 状态=%s", tool, toolType, status)
	if detail != "" {
		message += " | 详情=" + detail
	}
	entry := LogEntry{
		Timestamp: time.Now().Format(time.RFC3339Nano), Level: normalizeLogLevel(level), Message: message,
		Category: "RUN", Tool: tool, ToolType: toolType, Status: status, Detail: detail,
	}
	s.writeLogEntry(entry)
}

func (s *Store) writeLogEntry(entry LogEntry) {
	entry.Message = strings.TrimSpace(entry.Message)
	entry.Message = strings.NewReplacer("\r\n", " ⏎ ", "\n", " ⏎ ", "\r", " ⏎ ").Replace(entry.Message)
	entry.Detail = strings.NewReplacer("\r\n", " ⏎ ", "\n", " ⏎ ", "\r", " ⏎ ").Replace(strings.TrimSpace(entry.Detail))
	if len(entry.Message) > maxLogMessage {
		entry.Message = entry.Message[:maxLogMessage] + "…[已截断]"
	}
	if len(entry.Detail) > maxLogMessage {
		entry.Detail = entry.Detail[:maxLogMessage] + "…[已截断]"
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return
	}
	data = append(data, '\n')

	s.logMu.Lock()
	defer s.logMu.Unlock()
	s.appendLog("runtime", data)
	if entry.Level == "ERROR" {
		s.appendLog("error", data)
	}
}

func normalizeLogLevel(level string) string {
	switch strings.ToUpper(strings.TrimSpace(level)) {
	case "ERROR":
		return "ERROR"
	case "WARN", "WARNING":
		return "WARN"
	default:
		return "INFO"
	}
}

func (s *Store) appendLog(prefix string, data []byte) {
	path := s.nextLogPath(prefix, int64(len(data)))
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	_, _ = file.Write(data)
	_ = file.Close()
}

func (s *Store) nextLogPath(prefix string, incoming int64) string {
	base := prefix + "-" + time.Now().Format("2006-01-02")
	for segment := 1; ; segment++ {
		suffix := ""
		if segment > 1 {
			suffix = "-" + strconv.Itoa(segment)
		}
		path := filepath.Join(s.logDir, base+suffix+".jsonl")
		info, err := os.Stat(path)
		if os.IsNotExist(err) || (err == nil && info.Size()+incoming <= maxLogFileBytes) {
			return path
		}
	}
}

func (s *Store) ReadLogs(level string, limit int) ([]LogEntry, error) {
	if limit <= 0 || limit > maxLogRead {
		limit = 300
	}
	level = strings.ToUpper(strings.TrimSpace(level))
	prefix := "runtime-"
	if level == "ERROR" {
		prefix = "error-"
	}

	s.logMu.Lock()
	defer s.logMu.Unlock()
	files, err := os.ReadDir(s.logDir)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(files))
	for _, file := range files {
		if !file.IsDir() && strings.HasPrefix(file.Name(), prefix) && strings.HasSuffix(file.Name(), ".jsonl") {
			names = append(names, file.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))

	result := make([]LogEntry, 0, limit)
	for _, name := range names {
		data, readErr := os.ReadFile(filepath.Join(s.logDir, name))
		if readErr != nil {
			continue
		}
		lines := bytes.Split(bytes.TrimSpace(data), []byte{'\n'})
		for index := len(lines) - 1; index >= 0 && len(result) < limit; index-- {
			var entry LogEntry
			if json.Unmarshal(lines[index], &entry) != nil {
				continue
			}
			if level == "ERROR" || level == "" || level == "ALL" || entry.Level == level {
				result = append(result, entry)
			}
		}
		if len(result) >= limit {
			break
		}
	}
	return result, nil
}

func (s *Store) ClearLogs() (int, error) {
	s.logMu.Lock()
	defer s.logMu.Unlock()

	entries, err := os.ReadDir(s.logDir)
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, entry := range entries {
		name := entry.Name()
		isLog := !entry.IsDir() && strings.HasSuffix(name, ".jsonl") &&
			(strings.HasPrefix(name, "runtime-") || strings.HasPrefix(name, "error-"))
		if !isLog {
			continue
		}
		if err := os.Remove(filepath.Join(s.logDir, name)); err != nil {
			return removed, fmt.Errorf("删除日志 %s 失败: %w", name, err)
		}
		removed++
	}
	return removed, nil
}
