package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Config map[string]interface{}

const (
	currentSchemaVersion = 1
	maxConfigBytes       = 20 << 20
	maxConfigBackups     = 10
	backupInterval       = 15 * time.Minute
)

type Store struct {
	db         *sql.DB
	dir        string
	dbPath     string
	logDir     string
	backupDir  string
	mu         sync.Mutex
	logMu      sync.Mutex
	lastBackup time.Time
}

func OpenStore() (*Store, error) {
	dir, overridden, err := portableDataDir()
	if err != nil {
		return nil, err
	}
	if !overridden {
		if err := migrateRoamingData(dir); err != nil {
			return nil, fmt.Errorf("迁移旧版用户数据失败: %w", err)
		}
	}
	logDir := filepath.Join(dir, "logs")
	backupDir := filepath.Join(dir, "backups")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return nil, err
	}
	dbPath := filepath.Join(dir, "config.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	if _, err = db.Exec(`CREATE TABLE IF NOT EXISTS app_state (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db, dir: dir, dbPath: dbPath, logDir: logDir, backupDir: backupDir}, nil
}

func portableDataDir() (string, bool, error) {
	if override := strings.TrimSpace(os.Getenv("HACKLAUNCHER_DATA_DIR")); override != "" {
		dir, err := filepath.Abs(override)
		return dir, true, err
	}
	executable, err := os.Executable()
	if err != nil {
		return "", false, err
	}
	dir, err := filepath.Abs(filepath.Dir(executable))
	return dir, false, err
}

func migrateRoamingData(destination string) error {
	base, err := os.UserConfigDir()
	if err != nil {
		return nil
	}
	source := filepath.Join(base, "HackLauncher")
	if samePath(source, destination) {
		return nil
	}
	if info, err := os.Stat(source); err != nil || !info.IsDir() {
		return nil
	}
	if err := copyFileIfMissing(filepath.Join(source, "config.db"), filepath.Join(destination, "config.db")); err != nil {
		return err
	}
	for _, directory := range []string{"backups", "logs"} {
		if err := copyDirectoryIfMissing(filepath.Join(source, directory), filepath.Join(destination, directory)); err != nil {
			return err
		}
	}
	return nil
}

func samePath(left, right string) bool {
	left, leftErr := filepath.Abs(left)
	right, rightErr := filepath.Abs(right)
	return leftErr == nil && rightErr == nil && strings.EqualFold(filepath.Clean(left), filepath.Clean(right))
}

func copyDirectoryIfMissing(source, destination string) error {
	entries, err := os.ReadDir(source)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := os.MkdirAll(destination, 0o755); err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if err := copyFileIfMissing(filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

func copyFileIfMissing(source, destination string) error {
	if _, err := os.Stat(destination); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	sourceFile, err := os.Open(source)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer sourceFile.Close()
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	destinationFile, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(destinationFile, sourceFile); err != nil {
		_ = destinationFile.Close()
		return err
	}
	return destinationFile.Close()
}

func defaultConfig() Config {
	return Config{
		"schemaVersion":     currentSchemaVersion,
		"categories":        []interface{}{},
		"items":             []interface{}{},
		"defaultCategoryId": nil,
		"settings": map[string]interface{}{
			"theme": "light", "themeColor": "#165DFF", "layout": "grid",
			"animations": true, "closeBehavior": "ask", "autoMinimizeAfterRun": false,
			"showWindowHotkey": "Ctrl+Shift+H",
		},
		"environment": map[string]interface{}{
			"python": "", "java": "", "javaEnvironments": []interface{}{},
			"defaultJavaEnvironmentId": "", "customPaths": []interface{}{},
		},
		"sortOrders":    map[string]interface{}{"all": []interface{}{}, "favorites": []interface{}{}},
		"categoryOrder": []interface{}{},
		"usageStats":    map[string]interface{}{},
	}
}

func (s *Store) Load() (Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var raw string
	err := s.db.QueryRow(`SELECT value FROM app_state WHERE key = 'config'`).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		cfg := defaultConfig()
		if legacy, legacyErr := loadLegacyConfig(); legacyErr == nil && legacy != nil {
			cfg = legacy
		}
		if err := validateConfig(cfg); err != nil {
			return nil, err
		}
		return cfg, s.writeRaw(cfg)
	}
	if err != nil {
		return nil, err
	}
	var cfg Config
	decodeErr := json.Unmarshal([]byte(raw), &cfg)
	if decodeErr == nil {
		mergeConfigDefaults(cfg)
		decodeErr = validateConfig(cfg)
	}
	if decodeErr != nil {
		_ = s.writeRecoveryCopy("corrupt", []byte(raw))
		recovered, recoveryErr := s.loadLatestBackup()
		if recoveryErr == nil {
			if err := s.writeRaw(recovered); err != nil {
				return nil, err
			}
			return recovered, nil
		}
		fallback := defaultConfig()
		if err := s.writeRaw(fallback); err != nil {
			return nil, err
		}
		return fallback, nil
	}
	return cfg, nil
}

func (s *Store) Save(cfg Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	mergeConfigDefaults(cfg)
	if err := validateConfig(cfg); err != nil {
		return err
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	if len(raw) > maxConfigBytes {
		return fmt.Errorf("配置过大：%d bytes（上限 %d bytes）", len(raw), maxConfigBytes)
	}

	var previous string
	if err := s.db.QueryRow(`SELECT value FROM app_state WHERE key = 'config'`).Scan(&previous); err == nil && previous != string(raw) {
		if time.Since(s.lastBackup) >= backupInterval {
			if err := s.writeRecoveryCopy("config", []byte(previous)); err == nil {
				s.lastBackup = time.Now()
				_ = s.pruneBackups()
			}
		}
	}
	return s.writeRawBytes(raw)
}

func (s *Store) writeRaw(cfg Config) error {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	return s.writeRawBytes(raw)
}

func (s *Store) writeRawBytes(raw []byte) error {
	_, err := s.db.Exec(`INSERT INTO app_state(key, value, updated_at) VALUES('config', ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`, string(raw))
	return err
}

func (s *Store) Close() error { return s.db.Close() }

func mergeConfigDefaults(cfg Config) {
	mergeMissing(map[string]interface{}(cfg), map[string]interface{}(defaultConfig()))
	cfg["schemaVersion"] = currentSchemaVersion
}

func mergeMissing(target, defaults map[string]interface{}) {
	for key, defaultValue := range defaults {
		current, exists := target[key]
		if !exists || current == nil {
			target[key] = defaultValue
			continue
		}
		currentMap, currentOK := current.(map[string]interface{})
		defaultMap, defaultOK := defaultValue.(map[string]interface{})
		if currentOK && defaultOK {
			mergeMissing(currentMap, defaultMap)
		}
	}
}

func validateConfig(cfg Config) error {
	if cfg == nil {
		return errors.New("配置不能为空")
	}
	for _, key := range []string{"categories", "items", "categoryOrder"} {
		if _, ok := cfg[key].([]interface{}); !ok {
			return fmt.Errorf("配置字段 %s 必须是数组", key)
		}
	}
	for _, key := range []string{"settings", "environment", "sortOrders", "usageStats"} {
		if _, ok := cfg[key].(map[string]interface{}); !ok {
			return fmt.Errorf("配置字段 %s 必须是对象", key)
		}
	}
	return nil
}

func (s *Store) writeRecoveryCopy(prefix string, data []byte) error {
	name := fmt.Sprintf("%s-%s.json", prefix, time.Now().Format("20060102-150405.000000000"))
	target := filepath.Join(s.backupDir, name)
	temp := target + ".tmp"
	if err := os.WriteFile(temp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, target)
}

func (s *Store) loadLatestBackup() (Config, error) {
	entries, err := os.ReadDir(s.backupDir)
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() > entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "config-") || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(s.backupDir, entry.Name()))
		if readErr != nil {
			continue
		}
		var cfg Config
		if json.Unmarshal(data, &cfg) == nil {
			mergeConfigDefaults(cfg)
			if validateConfig(cfg) == nil {
				return cfg, nil
			}
		}
	}
	return nil, errors.New("没有可用的配置备份")
}

func (s *Store) pruneBackups() error {
	entries, err := os.ReadDir(s.backupDir)
	if err != nil {
		return err
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), "config-") && strings.HasSuffix(entry.Name(), ".json") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	for len(names) > maxConfigBackups {
		if err := os.Remove(filepath.Join(s.backupDir, names[0])); err != nil {
			return err
		}
		names = names[1:]
	}
	return nil
}

func loadLegacyConfig() (Config, error) {
	cwd, _ := os.Getwd()
	candidates := []string{
		filepath.Join(cwd, "config", "config.db"),
		filepath.Join(cwd, "legacy-electron-data", "config", "config.db"),
		filepath.Join(cwd, "..", "config", "config.db"),
	}
	exe, _ := os.Executable()
	if exe != "" {
		candidates = append(candidates,
			filepath.Join(filepath.Dir(exe), "config", "config.db"),
			filepath.Join(filepath.Dir(exe), "legacy-electron-data", "config", "config.db"),
		)
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err != nil {
			continue
		}
		cfg, err := readLegacyDatabase(candidate)
		if err == nil {
			return cfg, nil
		}
	}
	return nil, nil
}

func readLegacyDatabase(path string) (Config, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	cfg := defaultConfig()

	rows, err := db.Query(`SELECT id, name, COALESCE(icon, 'fa-folder') FROM categories`)
	if err != nil {
		return nil, err
	}
	var categories []interface{}
	for rows.Next() {
		var id, name, icon string
		if err := rows.Scan(&id, &name, &icon); err != nil {
			rows.Close()
			return nil, err
		}
		categories = append(categories, map[string]interface{}{"id": id, "name": name, "icon": icon})
	}
	rows.Close()
	cfg["categories"] = categories

	rows, err = db.Query(`SELECT id, name, type, command, COALESCE(categoryId,''), COALESCE(categoryName,''),
		COALESCE(icon,''), COALESCE(iconType,'fa'), COALESCE(imagePath,''), COALESCE(launchParams,''),
		COALESCE(description,''), COALESCE(runInTerminal,0), COALESCE(isFavorite,0), COALESCE(javaEnvironmentId,'') FROM items`)
	if err != nil {
		return nil, err
	}
	var items []interface{}
	for rows.Next() {
		var id, name, kind, command, categoryID, categoryName, icon, iconType, imagePath, launchParams, description, javaEnvID string
		var terminal, favorite int
		if err := rows.Scan(&id, &name, &kind, &command, &categoryID, &categoryName, &icon, &iconType, &imagePath, &launchParams, &description, &terminal, &favorite, &javaEnvID); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, map[string]interface{}{
			"id": id, "name": name, "type": kind, "command": command, "categoryId": categoryID,
			"categoryName": categoryName, "icon": icon, "iconType": iconType, "imagePath": imagePath,
			"launchParams": launchParams, "description": description, "runInTerminal": terminal == 1,
			"isFavorite": favorite == 1, "javaEnvironmentId": javaEnvID,
		})
	}
	rows.Close()
	cfg["items"] = items

	rows, err = db.Query(`SELECT key, value FROM config`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var key, value string
			if rows.Scan(&key, &value) != nil {
				continue
			}
			switch key {
			case "defaultCategoryId":
				cfg[key] = value
			case "settings", "environment", "sortOrders", "categoryOrder", "usageStats":
				var decoded interface{}
				if json.Unmarshal([]byte(value), &decoded) == nil {
					cfg[key] = decoded
				}
			}
		}
	}
	mergeConfigDefaults(cfg)
	return cfg, nil
}
