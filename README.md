# HackLauncher

HackLauncher（渗透武器库）是面向 Windows 的本地安全工具资产管理与启动平台。当前版本为 **1.1.4**，项目已全面迁移至 **Go + Wails v2**，不再包含或维护 Electron 运行版本。

## 主要功能

- 统一管理应用程序、命令、Python、Java、文件、文件夹与 URL
- 分类导航、收藏、最近使用、搜索与自定义排序
- 路径、类型、分类与标签联合搜索
- 指定 Python 解释器，并管理多个 Java 运行环境
- Python/Java 结构化启动、Java/JAR 版本兼容性预检
- 工具资产体检，支持可关闭的启动时单次检查、全量体检、异常项复查及低风险问题一键自动修复
- `${TARGET}`、`${WORDLIST}`、`${PROXY}` 等快速运行参数变量
- 普通启动、独立终端启动及 UAC 管理员权限启动
- 网格与紧凑视图、明暗主题和多种企业主题色
- SQLite 本地配置、配置导入导出、自动备份与损坏恢复
- 设置内手动备份、备份列表与安全恢复
- 运行审计、退出码跟踪、错误日志分流、日志自动分段及一键安全清理
- 结构化运行事件、日志联合搜索与最近通知记录
- 单实例、无边框窗口、系统托盘、全局窗口唤醒快捷键、初始窗口尺寸与关闭行为设置
- 自动提取 EXE 图标

## 技术栈

- Go 1.23+
- Wails v2
- Microsoft WebView2 Runtime
- SQLite（纯 Go 驱动）
- Vanilla JavaScript、Vite、Tailwind CSS

## 开发环境

需要安装 Go、Node.js、npm、Wails v2 CLI，以及 Microsoft WebView2 Runtime。

```powershell
wails doctor
npm --prefix frontend install
wails dev
```

`wails dev` 会启动前端开发服务器并运行桌面应用。前端代码位于 `frontend/`，CSS 会在启动前自动生成。

## 生产构建

```powershell
wails build -clean -platform windows/amd64 -o HackLauncher.exe
```

构建产物位于：

```text
build/bin/HackLauncher.exe
```

## 测试与检查

```powershell
go test -race ./...
go vet ./...
npm --prefix frontend run build
```

## 数据与日志

应用采用便携式数据布局，配置、备份和日志统一保存在 `HackLauncher.exe` 所在目录：

```text
HackLauncher.exe
config.db                           当前配置
backups/                            配置备份
logs/                               运行与错误日志
```

首次启动时，如果 EXE 目录尚无数据，程序会从 `%APPDATA%/HackLauncher/` 自动复制已有配置、备份和日志。后续数据只写入 EXE 所在目录。日志采用 JSONL 格式，分别保存运行日志和错误日志；单文件达到 5 MiB 后自动分段。终端工具执行完成后会回传退出码，非零退出码自动进入错误日志。

请确保 EXE 所在目录具有写入权限。开发时执行 `wails build -clean` 会清理 `build/bin/`，如已在其中运行并产生数据，请先备份 `config.db`、`backups/` 和 `logs/`。

迁移过程中发现的本地 Electron 配置和日志会保存在 `legacy-electron-data/`。该目录不会提交到 Git，仅用于数据保留及首次迁移兼容。

## 项目结构

```text
app.go              Wails 后端、启动与系统能力
main.go             应用入口和窗口配置
store.go            SQLite 配置存储、备份与旧数据迁移
logs.go             JSONL 运行日志与错误日志
tray.go             Windows 系统托盘
elevation_*.go      Windows UAC 管理员启动
frontend/           HTML、CSS、JavaScript 前端
resources/          嵌入式脚本资源
build/windows/      Windows 图标、清单与安装器资源
```

## 项目信息

- 版本：1.1.4
- 作者：Demon
- 许可证：MIT
