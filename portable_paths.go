package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

const (
	toolkitRootToken = "${TOOLKIT_ROOT}"
	toolsRootToken   = "${TOOLS_ROOT}"
)

var legacyToolsRootPattern = regexp.MustCompile(`(?i)(?:[a-z]:|\\\\[^\\/\s]+[\\/][^\\/\s]+)[\\/](?:[^\\/\r\n"']+[\\/])*PenetrationToolkits[\\/]Tools`)
var redundantPortablePrefixPattern = regexp.MustCompile(`(?i)(?:\$\{TOOLKIT_ROOT\}[\\/]HackLauncher[\\/])+(\$\{TOOLS_ROOT\})`)
var redundantPercentPrefixPattern = regexp.MustCompile(`(?i)(?:%TOOLKIT_ROOT%[\\/]HackLauncher[\\/])+(%TOOLS_ROOT%)`)

type portablePathRoots struct {
	Toolkit string
	Tools   string
}

var portableRootConfig struct {
	sync.RWMutex
	tools string
}

func setConfiguredToolsRoot(value string) {
	portableRootConfig.Lock()
	portableRootConfig.tools = strings.TrimSpace(strings.Trim(value, `"`))
	portableRootConfig.Unlock()
}

func configuredToolsRoot() string {
	portableRootConfig.RLock()
	defer portableRootConfig.RUnlock()
	return portableRootConfig.tools
}

func currentPortablePathRoots() portablePathRoots {
	roots := automaticallyDetectedPortablePathRoots()
	configured := configuredToolsRoot()
	if configured == "" {
		return roots
	}
	configured = replaceFold(configured, toolkitRootToken, roots.Toolkit)
	configured = replaceFold(configured, "%TOOLKIT_ROOT%", roots.Toolkit)
	configured = strings.TrimSpace(strings.Trim(configured, `"`))
	if legacyToolsRootPattern.MatchString(configured) && !directoryExists(configured) && directoryExists(roots.Tools) {
		return roots
	}
	if absolute, err := filepath.Abs(configured); err == nil {
		roots.Tools = filepath.Clean(absolute)
	}
	return roots
}

func automaticallyDetectedPortablePathRoots() portablePathRoots {
	if override := strings.TrimSpace(os.Getenv("HACKLAUNCHER_TOOLKIT_ROOT")); override != "" {
		if absolute, err := filepath.Abs(strings.Trim(override, `"`)); err == nil {
			return portablePathRoots{Toolkit: filepath.Clean(absolute), Tools: filepath.Join(absolute, "Tools")}
		}
	}

	executable, err := os.Executable()
	if err != nil {
		return portablePathRoots{}
	}
	executableDir, err := filepath.Abs(filepath.Dir(executable))
	if err != nil {
		return portablePathRoots{}
	}

	// Release layout: <toolkit root>\HackLauncher\HackLauncher.exe and
	// <toolkit root>\Tools\...
	toolkitRoot := filepath.Dir(executableDir)
	if !strings.EqualFold(filepath.Base(executableDir), "HackLauncher") {
		for candidate := executableDir; ; candidate = filepath.Dir(candidate) {
			if directoryExists(filepath.Join(candidate, "Tools")) {
				toolkitRoot = candidate
				break
			}
			parent := filepath.Dir(candidate)
			if parent == candidate {
				break
			}
		}
	}
	return portablePathRoots{Toolkit: filepath.Clean(toolkitRoot), Tools: filepath.Join(toolkitRoot, "Tools")}
}

func applyConfiguredToolsRoot(cfg Config) {
	environment, _ := cfg["environment"].(map[string]interface{})
	configured, _ := environment["toolsRoot"].(string)
	setConfiguredToolsRoot(configured)
}

func directoryExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func replaceFold(input, old, replacement string) string {
	if old == "" {
		return input
	}
	for {
		index := strings.Index(strings.ToLower(input), strings.ToLower(old))
		if index < 0 {
			return input
		}
		input = input[:index] + replacement + input[index+len(old):]
	}
}

// normalizePortableText repairs paths produced by older non-idempotent
// migrations, for example:
// ${TOOLKIT_ROOT}\HackLauncher\${TOOLKIT_ROOT}\HackLauncher\${TOOLS_ROOT}\...
func normalizePortableText(value string) string {
	value = redundantPortablePrefixPattern.ReplaceAllString(value, `$1`)
	return redundantPercentPrefixPattern.ReplaceAllString(value, `$1`)
}

func containsPortableRoot(value string) bool {
	lower := strings.ToLower(value)
	return strings.Contains(lower, strings.ToLower(toolkitRootToken)) ||
		strings.Contains(lower, strings.ToLower(toolsRootToken)) ||
		strings.Contains(lower, "%toolkit_root%") ||
		strings.Contains(lower, "%tools_root%")
}

// resolvePortableText expands portable root tokens anywhere in a command,
// argument string, or path. It also relocates legacy absolute toolkit paths.
func resolvePortableText(value string) string {
	value = normalizePortableText(value)
	roots := currentPortablePathRoots()
	if roots.Toolkit == "" {
		return value
	}
	value = replaceFold(value, toolkitRootToken, roots.Toolkit)
	value = replaceFold(value, toolsRootToken, roots.Tools)
	value = replaceFold(value, "%TOOLKIT_ROOT%", roots.Toolkit)
	value = replaceFold(value, "%TOOLS_ROOT%", roots.Tools)
	return legacyToolsRootPattern.ReplaceAllStringFunc(value, func(string) string { return roots.Tools })
}

func resolvePortablePath(value string) string {
	resolved := strings.TrimSpace(strings.Trim(resolvePortableText(value), `"`))
	if resolved == "" {
		return ""
	}
	return filepath.Clean(resolved)
}

func pathWithin(path, root string) (string, bool) {
	if path == "" || root == "" {
		return "", false
	}
	absolutePath, pathErr := filepath.Abs(path)
	absoluteRoot, rootErr := filepath.Abs(root)
	if pathErr != nil || rootErr != nil {
		return "", false
	}
	relative, err := filepath.Rel(absoluteRoot, absolutePath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, `..\`) || filepath.IsAbs(relative) {
		return "", false
	}
	return relative, true
}

func makePortableText(value string) string {
	value = normalizePortableText(value)
	roots := currentPortablePathRoots()
	if roots.Toolkit == "" {
		return value
	}
	value = legacyToolsRootPattern.ReplaceAllStringFunc(value, func(string) string { return toolsRootToken })
	value = replaceFold(value, roots.Tools, toolsRootToken)
	value = replaceFold(value, roots.Toolkit, toolkitRootToken)
	return value
}

func makePortablePath(value string) string {
	trimmed := strings.TrimSpace(strings.Trim(value, `"`))
	if trimmed == "" {
		return ""
	}
	portable := makePortableText(trimmed)
	if portable != trimmed {
		return portable
	}
	// A tokenised path is already portable. filepath.Abs would otherwise treat
	// it as relative and prefix the process working directory on every save.
	if containsPortableRoot(trimmed) || !filepath.IsAbs(trimmed) {
		return trimmed
	}
	roots := currentPortablePathRoots()
	if relative, ok := pathWithin(trimmed, roots.Tools); ok {
		if relative == "." {
			return toolsRootToken
		}
		return filepath.Join(toolsRootToken, relative)
	}
	if relative, ok := pathWithin(trimmed, roots.Toolkit); ok {
		if relative == "." {
			return toolkitRootToken
		}
		return filepath.Join(toolkitRootToken, relative)
	}
	return trimmed
}

// makeConfigPortable converts path-bearing configuration fields without
// touching URLs or data-URI icons. It returns true when a migration occurred.
func makeConfigPortable(cfg Config) bool {
	changed := false
	setPortable := func(container map[string]interface{}, key string, pathOnly bool) {
		value, _ := container[key].(string)
		if strings.TrimSpace(value) == "" {
			return
		}
		portable := makePortableText(value)
		if pathOnly {
			portable = makePortablePath(value)
		}
		if portable != value {
			container[key] = portable
			changed = true
		}
	}

	environment, _ := cfg["environment"].(map[string]interface{})
	if environment != nil {
		setPortable(environment, "python", true)
		setPortable(environment, "java", true)
		if entries, ok := environment["javaEnvironments"].([]interface{}); ok {
			for _, raw := range entries {
				entry, _ := raw.(map[string]interface{})
				if entry != nil {
					setPortable(entry, "path", true)
				}
			}
		}
	}

	if items, ok := cfg["items"].([]interface{}); ok {
		for _, raw := range items {
			item, _ := raw.(map[string]interface{})
			if item == nil {
				continue
			}
			kind, _ := item["type"].(string)
			setPortable(item, "command", kind != "command" && kind != "url")
			setPortable(item, "launchParams", false)
			setPortable(item, "javaProgramParams", false)
		}
	}
	return changed
}
