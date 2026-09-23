<p align="center">
  <img src="frontend/public/icons/Demon_logo.png" width="96" alt="HackLauncher Logo">
</p>

<h1 align="center">HackLauncher</h1>

<p align="center">
  面向 Windows 的本地安全工具资产管理与启动平台
</p>

<p align="center">
  <a href="https://github.com/DemonRR/HackLauncher/releases/"><img src="https://img.shields.io/github/release/DemonRR/HackLauncher?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC&style=flat-square" alt="最新版本"></a>
  <a href="https://github.com/DemonRR/HackLauncher/releases"><img src="https://img.shields.io/github/downloads/DemonRR/HackLauncher/total?label=%E4%B8%8B%E8%BD%BD%E6%AC%A1%E6%95%B0&style=flat-square" alt="下载次数"></a>
  <a href="https://github.com/DemonRR/HackLauncher/issues"><img src="https://img.shields.io/github/issues-raw/DemonRR/HackLauncher?label=%E9%97%AE%E9%A2%98%E5%8F%8D%E9%A6%88&style=flat-square" alt="问题反馈"></a>
  <a href="https://github.com/DemonRR/HackLauncher/discussions"><img src="https://img.shields.io/github/stars/DemonRR/HackLauncher?label=%E7%82%B9%E8%B5%9E%E6%98%9F%E6%98%9F&style=flat-square" alt="GitHub Stars"></a>
</p>

<p align="center">
  <a href="https://github.com/DemonRR/HackLauncher/releases">下载最新版</a> ·
  <a href="#界面展示">界面展示</a> ·
  <a href="#完整工具箱">完整工具箱</a> ·
  <a href="https://github.com/DemonRR/HackLauncher/issues">问题反馈</a>
</p>

---

HackLauncher（渗透武器库）用于集中管理、检索、检查和启动本地安全工具。当前版本为 **1.1.6**，采用 **Go + Wails v2** 构建，可管理应用程序、命令、Python、Java、文件、文件夹和 URL，并提供工具体检、运行审计、配置备份与系统托盘等能力。

## 更新日志

### v1.1.6

- 全面修复暗色主题下输入框、下拉框、按钮、菜单及各类弹窗的显示异常，统一交互状态与文字对比度。
- 优化新建/编辑项目弹窗和便携路径变量提示布局，使变量说明与完整路径示例更清晰易读。

### v1.1.5

- 新增可配置的 `${TOOLS_ROOT}` 便携工具目录，修复路径重复迁移问题，并精简新建工具时的变量提示。
- 修复暗色模式下新建/编辑项目弹窗的表单显示异常，优化便携路径变量的布局与示例说明。

## 界面展示

<p align="center">
  <img src="docs/images/hacklauncher-overview.png" alt="HackLauncher 工具资产体检界面" width="100%">
</p>

<p align="center"><sub>工具资产体检：集中检查路径、运行环境、启动参数与 Java 兼容性。</sub></p>

## 完整工具箱

完整工具箱包含 HackLauncher 及配套安全工具资源，可通过网盘下载：

- 网盘链接：[115网盘下载](https://115cdn.com/s/swsg13j3h99)
- 提取码：`bd22`

> 工具仅用于已获授权的安全测试、教学研究和应急响应。请遵守所在地法律法规及目标系统授权范围。

## 主要功能

- **统一资产管理**：管理应用程序、命令、Python、Java、文件、文件夹与 URL
- **高效导航检索**：支持分类、收藏、最近使用、标签、联合搜索与自定义排序
- **多运行环境**：指定 Python 解释器，并管理多个 Java 运行环境
- **结构化启动**：支持启动参数模板、独立终端运行和 UAC 管理员权限启动
- **便携路径**：通过 `${TOOLS_ROOT}`、`${TOOLKIT_ROOT}` 保持工具路径在换盘后仍然有效
- **工具资产体检**：检查路径、类型、运行环境、启动参数与 Java/JAR 版本兼容性
- **安全自动修复**：支持异常项复查和低风险配置问题一键修复
- **工作区体验**：提供网格/紧凑视图、明暗主题、主题色和启动默认视图设置
- **运行审计**：记录运行事件、退出码和错误日志，支持联合搜索与日志分段
- **可靠配置存储**：使用 SQLite 保存配置，支持导入导出、自动备份和损坏恢复
- **整库便携迁移**：自动使用 `${TOOLKIT_ROOT}` / `${TOOLS_ROOT}` 保存配套路径，移动目录或更换盘符后无需逐项修改
- **桌面集成**：支持单实例、无边框窗口、系统托盘和全局窗口唤醒快捷键
- **图标处理**：自动提取 EXE 图标，便于快速识别工具

## 快速开始

1. 从 [Releases](https://github.com/DemonRR/HackLauncher/releases) 下载最新版。
2. 将程序解压到具有写入权限的目录。
3. 运行 `HackLauncher.exe`。
4. 添加工具或导入已有配置，按需设置 Python、Java 环境。

运行环境要求：Windows 10/11（x64）和 Microsoft WebView2 Runtime。

## 便携目录

推荐保持以下配套目录结构：

```text
PenetrationToolkits/
├── HackLauncher/
│   ├── HackLauncher.exe
│   └── config.db
└── Tools/
    └── ...
```

HackLauncher 会根据自身位置自动识别武器库根目录，并将配套路径保存为：

- `${TOOLKIT_ROOT}`：`PenetrationToolkits` 根目录
- `${TOOLS_ROOT}`：`PenetrationToolkits/Tools` 工具目录

当整个 `PenetrationToolkits` 文件夹移动到其他目录或盘符时，工具路径、Python 环境、Java 环境、启动参数和工作目录会自动解析到新位置。旧配置中的 `...\PenetrationToolkits\Tools\...` 绝对路径也会在启动时自动迁移。

如需使用非标准目录结构，可在“设置 → 环境配置 → 工具根目录”中指定 `${TOOLS_ROOT}`；清空该设置即可恢复自动检测。也可以设置环境变量 `HACKLAUNCHER_TOOLKIT_ROOT` 指向武器库根目录。

新增或编辑工具时仅提供两个便携路径变量，无需额外定义：

- `${TOOLS_ROOT}`：适用于 Tools 内的工具，例如 `${TOOLS_ROOT}\ScanTools\nuclei.exe`
- `${TOOLKIT_ROOT}`：适用于武器库根目录下的文件，例如 `${TOOLKIT_ROOT}\Tools\ScanTools\TscanPlus\TscanPlus.exe`

通过文件选择器添加 Tools 内的程序时，HackLauncher 会自动转换路径，通常不需要手写变量。

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

> 开发时执行 `wails build -clean` 会清理 `build/bin/`。如果该目录中已有 `config.db`、`backups/` 或 `logs/`，请先备份。

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

- 版本：1.1.6
- 作者：Demon
- 许可证：MIT
