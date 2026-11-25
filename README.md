# Antigravity Open In (`antigravity-open-in`)

适用于 **Google Antigravity 2.0** 的插件，采用 **Sidecar + Skill** 架构（零 MCP、零 Hook 依赖），打开右侧辅助面板即可**免发消息自动识别**当前窗口的项目与 Git Worktree 路径，并支持通过第三方软件一键打开。

## 核心特性

- **开箱即识，无需发消息**：基于 Antigravity 2.0 Sidecar SDK（`window.sidecar.getWorkspaceUris()` & `onWorkspaceChange()`），打开面板即可自动获取当前窗口挂载的工作区，并在切换对话或 worktree 时实时刷新。
- **Git Worktree 拓扑识别**：自动区分**当前激活的 Linked Worktree**、**主仓库根目录**与其它关联分支 Worktree，点击即可切换目标路径并支持一键「切回当前会话」。
- **类 T3 Code 交互体验**：
  - 紧凑的分体组合按钮（主按钮点击即打开，右侧 `⌄` 下拉切换）；
  - 切换编辑器时仅变更默认选择，不误触自动打开；
  - 自动记住上一次使用的编辑器与「在新窗口打开」偏好；
  - 支持星标收藏常用编辑器，并在主按钮下方生成快捷切换胶囊；
  - 支持路径单行展示与一键复制。
- **双模调用**：除右侧交互面板外，还内置 `/open-in` Skill 与本地 CLI 脚本，支持在对话中通过自然语言直接打开。
- **安全稳健的启动器**：显式传递有效工作目录 `cwd` 并隔离宿主环境变量，优先调用 CLI，失败时自动兜底 macOS `open -a` / `open -na`。

## 支持的第三方软件

| 应用 ID | 显示名称 | 启动方式（macOS） |
| :--- | :--- | :--- |
| `vscode` | VS Code | `code` CLI → 回退 `Visual Studio Code.app` |
| `trae-cn` | Trae CN | `trae-cn` CLI → 回退 `Trae CN.app` |
| `goland` | GoLand | `goland`（含 JetBrains Toolbox scripts）→ 回退 `GoLand.app` |
| `pycharm` | PyCharm | `pycharm`（含 JetBrains Toolbox scripts）→ 回退 `PyCharm.app` |
| `winc` | Winc | `winc` CLI → 回退 `winc.app` |

---

## 安装过程

### 环境要求

- macOS（支持上面 5 款编辑器 CLI 或 `.app` 启动）
- [Google Antigravity 2.0](https://antigravity.google) 与 `agy` CLI
- Node.js >= 20（零第三方 npm 依赖）

### 方式一：直接从 GitHub 安装（推荐）

```bash
agy plugin install https://github.com/stormZhu/antigravity-open-in
```

### 方式二：克隆到本地后安装

```bash
git clone https://github.com/stormZhu/antigravity-open-in.git
cd antigravity-open-in
agy plugin validate --strict .
agy plugin install .
```

### 方式三：本地开发软链接（修改代码免重装）

如果你需要频繁修改插件源码并调试，建议用软链接挂载到 Antigravity 插件目录，避免反复 `install` 删除重建目录导致运行中的 Sidecar 句柄失效：

```bash
rm -rf ~/.gemini/config/plugins/open-in-app
ln -s /abs/path/to/antigravity-open-in ~/.gemini/config/plugins/open-in-app
```

---

## 使用方法

### 1. 右侧辅助面板（Sidecar）

1. 在 Antigravity 2.0 中按 `Cmd + Option + O`（或点击右上角 **Toggle Overview Panel**）打开右侧辅助面板；
2. 在 **Plugins** 区域打开 **Open In App**；
3. 面板会自动识别当前窗口的项目/Worktree：
   - 点击主按钮 **「在 `<编辑器>` 中打开」** 直接启动对应软件；
   - 点击右侧 `⌄` 下拉切换默认编辑器、勾选「在新窗口打开」，或点击 `☆` 收藏到快捷胶囊栏；
   - 若当前仓库存在多个 Worktree，可在下方列表点击切换目标目录。

### 2. 对话唤起（Skill）

在对话中可直接输入 `/open-in` 或自然语言，例如：
- `用 VS Code 打开当前 worktree`
- `用 Trae CN 打开主仓库`
- `用 PyCharm 在新窗口打开当前项目`

---

## 常用运维与重启命令

> **什么时候需要重启？**
> - 平时使用（切换项目、切换 Worktree、切换编辑器）：**完全不需要重启**；
> - 仅修改前端界面 `sidecars/open-in-app/index.html`：**关闭并重开右侧 Open In App 标签页**即可生效；
> - 通过 `agy plugin install` 升级插件或修改了后端 JS（`main.mjs`、`apps.mjs`、`worktree.mjs`）：需要重启一次 Sidecar 进程。

```bash
# 查看已安装插件列表与状态
agy plugin list

# 单独重启插件 Sidecar（无需退出 Antigravity 2.0）
agy plugin disable open-in-app && agy plugin enable open-in-app

# 覆盖更新插件（升级后建议顺手执行上面的 disable && enable）
agy plugin install https://github.com/stormZhu/antigravity-open-in

# 禁用 / 启用插件
agy plugin disable open-in-app
agy plugin enable open-in-app

# 严格校验插件清单与目录结构
agy plugin validate --strict .

# 卸载插件
agy plugin uninstall open-in-app
```

> 如果遇到极少数情况下客户端缓存未释放（如旧界面仍驻留），完全退出 Antigravity 2.0（`Cmd + Q`）后重新打开即可。

---

## 项目结构

```text
antigravity-open-in/
├── plugin.json                    # Antigravity 插件清单
├── package.json                   # Node.js 模块配置与测试脚本
├── assets/
│   └── logo.svg                   # 插件图标
├── sidecars/
│   └── open-in-app/
│       ├── sidecar.json           # Sidecar 声明（挂载到 AUX_PANE）
│       ├── main.mjs               # Sidecar HTTP 服务 (/api/inspect, /api/open)
│       └── index.html             # 前端交互界面（Split 下拉 + 记忆 + 收藏）
├── skills/
│   └── open-in/
│       └── SKILL.md               # 对话 Skill 定义
├── scripts/
│   └── open-in.mjs                # Skill 调用的命令行入口
├── src/
│   ├── apps.mjs                   # 第三方软件探测与安全启动器
│   └── worktree.mjs               # Git Worktree 拓扑识别
└── test/                          # Node 内置测试套件 (node --test)
```

## 本地测试

```bash
npm test
agy plugin validate --strict .
```

## License

[MIT](./LICENSE)
