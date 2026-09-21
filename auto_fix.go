package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type AutoFixReport struct {
	FixedItems        int      `json:"fixedItems"`
	Changes           int      `json:"changes"`
	RemainingErrors   int      `json:"remainingErrors"`
	RemainingWarnings int      `json:"remainingWarnings"`
	Messages          []string `json:"messages"`
}

type detectedJavaRuntime struct {
	id    string
	path  string
	major int
}

func (a *App) AutoFixTools() (AutoFixReport, error) {
	cfg := a.GetConfig()
	items, _ := cfg["items"].([]interface{})
	categories, _ := cfg["categories"].([]interface{})
	validCategories := make(map[string]string)
	for _, raw := range categories {
		category, _ := raw.(map[string]interface{})
		id, _ := category["id"].(string)
		name, _ := category["name"].(string)
		if id != "" {
			validCategories[id] = name
		}
	}
	fallbackCategory := validFallbackCategory(cfg, categories, validCategories)
	javaRuntimes := detectConfiguredJavaRuntimes(cfg)
	pythonReplacement := validatedSystemPython()
	report := AutoFixReport{Messages: make([]string, 0)}
	pythonUpdated := false

	for _, raw := range items {
		item, _ := raw.(map[string]interface{})
		name, _ := item["name"].(string)
		kind, _ := item["type"].(string)
		target, _ := item["command"].(string)
		target = strings.TrimSpace(target)
		reasons := make([]string, 0)
		cleanTarget := strings.TrimSpace(strings.Trim(target, `"`))
		if target != cleanTarget {
			item["command"] = cleanTarget
			target = cleanTarget
			reasons = append(reasons, "清理路径引号")
		}
		if strings.TrimSpace(name) == "" && target != "" {
			item["name"] = filepath.Base(target)
			name, _ = item["name"].(string)
			reasons = append(reasons, "补全工具名称")
		}
		categoryID, _ := item["categoryId"].(string)
		if categoryID != "" {
			if _, exists := validCategories[categoryID]; !exists && fallbackCategory != "" {
				item["categoryId"] = fallbackCategory
				item["categoryName"] = validCategories[fallbackCategory]
				reasons = append(reasons, "修复失效分类")
			}
		}

		if kind == "url" && target != "" && !strings.Contains(target, "://") {
			candidate := "https://" + target
			if parsed, err := url.Parse(candidate); err == nil && parsed.Host != "" {
				item["command"] = candidate
				target = candidate
				reasons = append(reasons, "补全 HTTPS 协议")
			}
		}

		if info, err := os.Stat(target); err == nil {
			correctedType := inferredToolType(kind, target, info.IsDir())
			if correctedType != kind {
				item["type"] = correctedType
				kind = correctedType
				cleanupTypeSpecificFields(item, kind)
				reasons = append(reasons, "修正工具类型")
			}
		}

		if kind == "python" && a.diagnosticPythonPath() == "" && pythonReplacement != "" && !pythonUpdated {
			environment, _ := cfg["environment"].(map[string]interface{})
			environment["python"] = pythonReplacement
			pythonUpdated = true
			reasons = append(reasons, "切换到可用 Python")
		}

		if kind == "java" && strings.EqualFold(filepath.Ext(target), ".jar") {
			required, _, err := requiredJavaMajor(target)
			if err == nil {
				currentID, _ := item["javaEnvironmentId"].(string)
				if currentID == "" {
					environment, _ := cfg["environment"].(map[string]interface{})
					currentID, _ = environment["defaultJavaEnvironmentId"].(string)
				}
				if !javaRuntimeCompatible(javaRuntimes, currentID, required) {
					if replacement := selectJavaRuntime(javaRuntimes, required); replacement != nil {
						item["javaEnvironmentId"] = replacement.id
						reasons = append(reasons, fmt.Sprintf("匹配 Java %d 环境", replacement.major))
					}
				}
			}
		}

		if len(reasons) > 0 {
			report.FixedItems++
			report.Changes += len(reasons)
			report.Messages = append(report.Messages, fmt.Sprintf("%s：%s", name, strings.Join(reasons, "、")))
		}
	}

	if report.Changes > 0 {
		if err := a.SaveConfig(cfg); err != nil {
			return AutoFixReport{}, err
		}
		a.logf("INFO", "资产自动修复完成，项目=%d，修改=%d", report.FixedItems, report.Changes)
	}
	remaining := a.DiagnoseTools()
	report.RemainingErrors = remaining.Errors
	report.RemainingWarnings = remaining.Warnings
	return report, nil
}

func validFallbackCategory(cfg Config, categories []interface{}, valid map[string]string) string {
	if preferred, _ := cfg["defaultCategoryId"].(string); valid[preferred] != "" {
		return preferred
	}
	if len(categories) == 0 {
		return ""
	}
	first, _ := categories[0].(map[string]interface{})
	id, _ := first["id"].(string)
	return id
}

func inferredToolType(current, target string, directory bool) string {
	if directory {
		return "folder"
	}
	switch strings.ToLower(filepath.Ext(target)) {
	case ".py":
		return "python"
	case ".jar":
		return "java"
	case ".exe":
		if current == "file" || current == "application" || current == "python" || current == "java" {
			return "application"
		}
	}
	if current == "folder" {
		return "file"
	}
	return current
}

func cleanupTypeSpecificFields(item map[string]interface{}, kind string) {
	if kind != "java" {
		delete(item, "javaEnvironmentId")
		delete(item, "javaProgramParams")
	}
	if kind != "command" && kind != "python" && kind != "java" && kind != "application" {
		delete(item, "runInTerminal")
	}
}

func detectConfiguredJavaRuntimes(cfg Config) []detectedJavaRuntime {
	environment, _ := cfg["environment"].(map[string]interface{})
	entries, _ := environment["javaEnvironments"].([]interface{})
	result := make([]detectedJavaRuntime, 0, len(entries))
	for _, raw := range entries {
		entry, _ := raw.(map[string]interface{})
		id, _ := entry["id"].(string)
		configured, _ := entry["path"].(string)
		path := javaExecutablePath(configured)
		if id == "" || path == "" {
			continue
		}
		major, _, err := detectJavaMajor(path)
		if err == nil {
			result = append(result, detectedJavaRuntime{id: id, path: path, major: major})
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].major < result[j].major })
	return result
}

func javaRuntimeCompatible(runtimes []detectedJavaRuntime, id string, required int) bool {
	for _, candidate := range runtimes {
		if candidate.id == id {
			return candidate.major >= required
		}
	}
	return false
}

func selectJavaRuntime(runtimes []detectedJavaRuntime, required int) *detectedJavaRuntime {
	for index := range runtimes {
		if runtimes[index].major >= required {
			return &runtimes[index]
		}
	}
	return nil
}

func validatedSystemPython() string {
	path, err := exec.LookPath("python.exe")
	if err != nil || pythonExecutablePath(path) == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, "--version")
	prepareBackgroundProcess(cmd)
	if err := cmd.Run(); err != nil || ctx.Err() != nil {
		return ""
	}
	return path
}
