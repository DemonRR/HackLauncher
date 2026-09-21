package main

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type ToolDiagnostic struct {
	ItemID      string `json:"itemId"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	Status      string `json:"status"`
	Summary     string `json:"summary"`
	Detail      string `json:"detail"`
	Path        string `json:"path"`
	Code        string `json:"code,omitempty"`
	AutoFixable bool   `json:"autoFixable"`
}

type DiagnosticReport struct {
	CheckedAt string           `json:"checkedAt"`
	Total     int              `json:"total"`
	Healthy   int              `json:"healthy"`
	Warnings  int              `json:"warnings"`
	Errors    int              `json:"errors"`
	Fixable   int              `json:"fixable"`
	Results   []ToolDiagnostic `json:"results"`
}

type StartupDiagnosticResult struct {
	Enabled bool              `json:"enabled"`
	Report  *DiagnosticReport `json:"report,omitempty"`
}

// RunStartupDiagnostics is intentionally guarded by sync.Once. A frontend
// reload or duplicate lifecycle event cannot start another automatic scan in
// the same application process. Manual DiagnoseTools calls remain available.
func (a *App) RunStartupDiagnostics() StartupDiagnosticResult {
	a.startupDiagnosticsOnce.Do(func() {
		a.mu.RLock()
		settings, _ := a.config["settings"].(map[string]interface{})
		enabled, exists := settings["autoDiagnosticsOnStartup"].(bool)
		a.mu.RUnlock()
		if !exists {
			enabled = true
		}
		a.startupDiagnosticsResult.Enabled = enabled
		if enabled {
			report := a.DiagnoseTools()
			a.startupDiagnosticsResult.Report = &report
		}
	})
	return a.startupDiagnosticsResult
}

func (a *App) DiagnoseTools() DiagnosticReport {
	return a.diagnoseToolsByIDSet(nil)
}

func (a *App) DiagnoseToolsByIDs(itemIDs []string) DiagnosticReport {
	selected := make(map[string]struct{}, len(itemIDs))
	for _, itemID := range itemIDs {
		if itemID = strings.TrimSpace(itemID); itemID != "" {
			selected[itemID] = struct{}{}
		}
	}
	return a.diagnoseToolsByIDSet(selected)
}

func (a *App) diagnoseToolsByIDSet(selected map[string]struct{}) DiagnosticReport {
	cfg := a.GetConfig()
	items, _ := cfg["items"].([]interface{})
	report := DiagnosticReport{CheckedAt: time.Now().Format(time.RFC3339), Results: make([]ToolDiagnostic, 0, len(items))}
	javaVersions := make(map[string]int)
	javaErrors := make(map[string]error)
	jarRequirements := make(map[string]int)
	jarErrors := make(map[string]error)

	for _, raw := range items {
		item, _ := raw.(map[string]interface{})
		if selected != nil {
			itemID, _ := item["id"].(string)
			if _, ok := selected[itemID]; !ok {
				continue
			}
		}
		result := a.diagnoseTool(item, javaVersions, javaErrors, jarRequirements, jarErrors)
		if result.Status == "HEALTHY" {
			if categoryID, _ := item["categoryId"].(string); categoryID != "" && !configHasCategory(cfg, categoryID) {
				result.Status, result.Code, result.Summary = "WARNING", "MISSING_CATEGORY", "所属分类不存在"
			}
		}
		result.AutoFixable = diagnosticCanAutoFix(item, result, cfg)
		report.Results = append(report.Results, result)
		if result.AutoFixable {
			report.Fixable++
		}
		switch result.Status {
		case "ERROR":
			report.Errors++
		case "WARNING":
			report.Warnings++
		default:
			report.Healthy++
		}
	}
	report.Total = len(report.Results)
	scope := "全量"
	if selected != nil {
		scope = "异常复查"
	}
	a.logf("INFO", "资产体检完成，范围=%s，总数=%d，正常=%d，警告=%d，异常=%d", scope, report.Total, report.Healthy, report.Warnings, report.Errors)
	return report
}

func (a *App) diagnoseTool(item map[string]interface{}, javaVersions map[string]int, javaErrors map[string]error, jarRequirements map[string]int, jarErrors map[string]error) ToolDiagnostic {
	id, _ := item["id"].(string)
	name, _ := item["name"].(string)
	kind, _ := item["type"].(string)
	target, _ := item["command"].(string)
	target = strings.TrimSpace(strings.Trim(target, `"`))
	result := ToolDiagnostic{ItemID: id, Name: name, Type: kind, Path: target, Status: "HEALTHY", Summary: "配置正常"}
	fail := func(code, summary string, err error) ToolDiagnostic {
		result.Status, result.Code, result.Summary = "ERROR", code, summary
		if err != nil {
			result.Detail = err.Error()
		}
		return result
	}
	warn := func(code, summary, detail string) ToolDiagnostic {
		result.Status, result.Code, result.Summary, result.Detail = "WARNING", code, summary, detail
		return result
	}
	if target == "" {
		return fail("EMPTY_TARGET", "目标为空", nil)
	}

	switch kind {
	case "url":
		candidate := target
		if !strings.Contains(candidate, "://") {
			candidate = "https://" + candidate
		}
		parsed, err := url.Parse(candidate)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return fail("INVALID_URL", "URL 格式无效", err)
		}
	case "command":
		if len(target) > 16<<10 {
			return warn("LONG_COMMAND", "命令内容过长", "建议拆分为独立脚本后再添加")
		}
	case "folder":
		info, err := os.Stat(target)
		if err != nil {
			return fail("MISSING_TARGET", "文件夹不存在", err)
		}
		if !info.IsDir() {
			return fail("TYPE_MISMATCH", "目标不是文件夹", nil)
		}
	case "file", "application", "python", "java":
		info, err := os.Stat(target)
		if err != nil {
			return fail("MISSING_TARGET", "目标文件不存在", err)
		}
		if info.IsDir() {
			return fail("TYPE_MISMATCH", "目标指向文件夹", nil)
		}
		extension := strings.ToLower(filepath.Ext(target))
		if kind == "application" && (extension == ".py" || extension == ".jar") {
			return warn("TYPE_MISMATCH", "项目类型与文件不匹配", fmt.Sprintf("%s 文件应使用对应的工具类型", extension))
		}
		if kind == "python" {
			if !strings.EqualFold(filepath.Ext(target), ".py") {
				return fail("TYPE_MISMATCH", "Python 工具必须是 .py 文件", nil)
			}
			pythonPath := a.diagnosticPythonPath()
			if pythonPath == "" {
				pythonPath, err = exec.LookPath("python.exe")
			}
			if err != nil || pythonPath == "" {
				return fail("PYTHON_UNAVAILABLE", "Python 解释器不可用", err)
			}
			result.Detail = "解释器：" + pythonPath
		}
		if kind == "java" {
			if !strings.EqualFold(filepath.Ext(target), ".jar") {
				return fail("TYPE_MISMATCH", "Java 工具必须是 .jar 文件", nil)
			}
			environmentID, _ := item["javaEnvironmentId"].(string)
			javaPath := a.diagnosticJavaPath(environmentID)
			if javaPath == "" {
				return fail("JAVA_UNAVAILABLE", "Java 环境不可用", nil)
			}
			javaMajor, known := javaVersions[javaPath]
			if !known {
				javaMajor, _, javaErrors[javaPath] = detectJavaMajor(javaPath)
				javaVersions[javaPath] = javaMajor
			}
			if javaErrors[javaPath] != nil {
				return fail("JAVA_UNAVAILABLE", "Java 环境检测失败", javaErrors[javaPath])
			}
			required, known := jarRequirements[target]
			if !known {
				required, _, jarErrors[target] = requiredJavaMajor(target)
				jarRequirements[target] = required
			}
			if jarErrors[target] != nil {
				return fail("INVALID_JAR", "JAR 兼容性检测失败", jarErrors[target])
			}
			if required > javaMajor {
				return fail("JAVA_INCOMPATIBLE", fmt.Sprintf("需要 Java %d+，当前为 Java %d", required, javaMajor), nil)
			}
			result.Detail = fmt.Sprintf("Java %d · JAR 最低要求 Java %d", javaMajor, required)
		}
	default:
		return warn("UNKNOWN_TYPE", "未知工具类型", kind)
	}

	if arguments, _ := item["launchParams"].(string); arguments != "" {
		if _, err := splitCommandLine(arguments); err != nil {
			return fail("INVALID_ARGUMENTS", "启动参数无效", err)
		}
	}
	if kind == "java" {
		if arguments, _ := item["javaProgramParams"].(string); arguments != "" {
			if _, err := splitCommandLine(arguments); err != nil {
				return fail("INVALID_ARGUMENTS", "Java 程序参数无效", err)
			}
		}
	}
	return result
}

func diagnosticCanAutoFix(item map[string]interface{}, result ToolDiagnostic, cfg Config) bool {
	target, _ := item["command"].(string)
	if strings.TrimSpace(target) != strings.TrimSpace(strings.Trim(target, `"`)) {
		return true
	}
	categoryID, _ := item["categoryId"].(string)
	if categoryID != "" {
		valid := false
		categories, _ := cfg["categories"].([]interface{})
		for _, raw := range categories {
			category, _ := raw.(map[string]interface{})
			id, _ := category["id"].(string)
			valid = valid || id == categoryID
		}
		if !valid && len(categories) > 0 {
			return true
		}
	}
	switch result.Code {
	case "TYPE_MISMATCH", "PYTHON_UNAVAILABLE", "JAVA_UNAVAILABLE", "JAVA_INCOMPATIBLE", "UNKNOWN_TYPE", "MISSING_CATEGORY":
		return true
	default:
		return false
	}
}

func configHasCategory(cfg Config, categoryID string) bool {
	categories, _ := cfg["categories"].([]interface{})
	for _, raw := range categories {
		category, _ := raw.(map[string]interface{})
		id, _ := category["id"].(string)
		if id == categoryID {
			return true
		}
	}
	return false
}

func (a *App) diagnosticPythonPath() string {
	a.mu.RLock()
	environment, _ := a.config["environment"].(map[string]interface{})
	configured, _ := environment["python"].(string)
	a.mu.RUnlock()
	return pythonExecutablePath(configured)
}

func (a *App) diagnosticJavaPath(environmentID string) string {
	a.mu.RLock()
	environment, _ := a.config["environment"].(map[string]interface{})
	selectedID := strings.TrimSpace(environmentID)
	if selectedID == "" {
		selectedID, _ = environment["defaultJavaEnvironmentId"].(string)
	}
	configured := ""
	if environments, ok := environment["javaEnvironments"].([]interface{}); ok {
		for _, entry := range environments {
			item, _ := entry.(map[string]interface{})
			id, _ := item["id"].(string)
			if id == selectedID {
				configured, _ = item["path"].(string)
				break
			}
		}
	}
	if configured == "" {
		configured, _ = environment["java"].(string)
	}
	a.mu.RUnlock()
	return javaExecutablePath(configured)
}
