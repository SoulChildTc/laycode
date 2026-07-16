# LayCode

> 躺着码，一样 Vibe — opencode 的移动端客户端

LayCode 是 [opencode](https://github.com/sst/opencode) 的移动端 companion app，让你在手机上也能继续你的编码会话。通过运行在电脑上的 Bridge 服务，手机 App 可以安全地连接到本地的 opencode 实例，随时随地继续对话、查看代码、管理任务。

## ✨ Features

- 📱 **移动端体验** — 专为手机优化的 UI，支持深色/浅色主题
- 💬 **会话同步** — 无缝接续你在电脑上的 opencode 对话
- 🖥️ **内置终端** — 基于 xterm.js 的完整终端模拟器
- 📋 **任务管理** — 查看和管理 opencode 生成的待办事项
- 🔄 **自动发现** — mDNS 自动发现局域网内的 Bridge 服务
- 🔐 **安全连接** — Token 认证，所有请求通过 Bridge 代理

## 🏗️ Architecture

```
┌─────────────┐     WiFi      ┌──────────────────┐     ┌─────────────┐
│             │               │                  │     │             │
│  LayCode    │ ◄───────────► │  LayCode Bridge  │ ◄──►│  opencode   │
│  (App)      │    HTTP/WS    │  (Express)       │     │             │
│             │               │                  │     │             │
└─────────────┘               └──────────────────┘     └─────────────┘
   iOS/Android                     macOS/Linux           本地运行
```

- **LayCode App** — Expo React Native 应用，运行在手机上
- **LayCode Bridge** — Node.js Express 服务，运行在你的电脑上，代理 opencode API 和 WebSocket
- **opencode** — 本地运行的 opencode 实例，Bridge 通过 SDK 与之交互

## 📋 Prerequisites

### Bridge 端（电脑）
- Node.js >= 18
- npm 或 yarn
- 与手机在同一局域网内
- 支持 macOS、Linux、Windows

### App 端（手机）
- iOS 15+ 或 Android 8+
- Expo Go（开发模式）或通过 EAS Build 打包的独立 App

## 🔗 版本兼容性

App 与 `laycode-cli` 各自发版。每个 App 版本对应一个建议的 `laycode-cli` 版本，升级 App 前确认 CLI 不低于对应版本即可：

| App 版本 | 建议 laycode-cli |
|---|---|
| 1.1.0 | 0.1.3 |
| 1.0.0 | 0.1.2 |

> - App 版本：设置 → 关于。CLI 版本：`npx laycode-cli --version` 或看启动日志。
> - 升级 App 后若异常，多半是 CLI 过旧，运行 `npx laycode-cli@latest` 更新即可。

## 🚀 Quick Start

### 安装

```bash
# 克隆项目
git clone https://github.com/SoulChildTc/laycode.git
cd laycode

# 安装 bridge 依赖（pnpm workspace）
pnpm install

# 安装 App 依赖
cd app && npm install && cd ..
```

### 启动 Bridge 服务（电脑端）

在项目根目录：

```bash
pnpm bridge
```

会先构建再前台运行 Bridge，`Ctrl+C` 结束。Bridge 默认运行在 `http://0.0.0.0:8079`，启动时打印配对二维码。（别名：`pnpm server`）

### 启动 App（手机端）

在项目根目录：

```bash
pnpm app
```

用手机扫描 Expo Go 二维码，确保手机和电脑在同一 WiFi 下。（别名：`pnpm mobile`）

### 配对 Token

无需手动准备 Token。Bridge 首次运行时会自动生成一个随机 Token 并持久化在 `~/.laycode/config.json`，之后保持不变。启动 Bridge 时会打印配对二维码，用 App 扫码即可完成连接。如需指定自定义 Token，可在启动时加 `--token <token>`。

## 📁 Project Structure

```
laycode/
├── app/              # Expo React Native App (iOS/Android)
│   ├── src/
│   │   ├── api/         # API 客户端
│   │   ├── assets/      # 静态资源
│   │   ├── components/  # 通用组件
│   │   ├── contexts/    # React Context
│   │   ├── hooks/       # 自定义 Hooks
│   │   ├── navigation/  # 导航配置
│   │   ├── screens/     # 页面
│   │   ├── theme/       # 主题配置
│   │   ├── types/       # TypeScript 类型
│   │   └── utils/       # 工具函数
│   ├── App.tsx       # 应用入口
│   └── package.json
├── bridge/           # Express Bridge 服务（发布为 laycode-cli）
│   ├── src/
│   │   ├── cli.ts      # CLI 入口（run/start/stop/status/logs）
│   │   ├── index.ts    # 服务入口、路由装配
│   │   ├── proxy.ts    # HTTP 代理（手写 fetch 转发）
│   │   ├── ws.ts       # 事件流 WebSocket
│   │   ├── auth.ts     # 认证中间件
│   │   ├── mdns.ts     # mDNS 服务发现
│   │   ├── opencode.ts # opencode SDK 封装与进程托管
│   │   ├── net.ts      # 局域网地址探测
│   │   ├── git.ts      # Git 相关接口
│   │   ├── todos.ts    # 待办事项接口
│   │   ├── config.ts   # 参数解析
│   │   ├── store.ts    # 配置持久化（~/.laycode）
│   │   ├── paths.ts    # 路径与版本
│   │   ├── qr.ts       # 配对二维码
│   │   ├── logger.ts   # 日志
│   │   └── types.ts    # 类型定义
│   ├── public/      # 静态文件
│   └── package.json
├── scripts/          # 发版脚本
├── docs/            # 文档
├── LICENSE
└── README.md
```

## 📜 命令一览

所有命令在项目根目录运行（`pnpm <script>`）。

### 开发

| 命令 | 说明 |
|---|---|
| `pnpm install` | 安装所有 workspace 依赖 |
| `pnpm bridge` | 构建并前台运行 Bridge（别名 `pnpm server`），`Ctrl+C` 结束 |
| `pnpm app` | 启动 App 开发服务器（别名 `pnpm mobile`），用 Expo Go 扫码 |

### 构建

| 命令 | 说明 |
|---|---|
| `pnpm build:bridge` | 只构建 Bridge（`laycode-cli`） |
| `pnpm build:dev-apk` | EAS 构建 Android development APK |
| `pnpm build:preview-apk` | EAS 构建 Android preview APK |
| `pnpm build:prod-apk` | EAS 构建 Android 生产 APK |
| `pnpm build:prod-aab` | EAS 构建 Android 生产 AAB（上架用） |

### 版本与发布

脚本要求工作区干净（先提交业务代码），`push` 由你手动执行。Bridge 与 App 各自独立，版本号互不绑定。

| 命令 | 说明 |
|---|---|
| `pnpm release:bridge <patch\|minor\|major> [--dry-run]` | **Bridge 发版**：升级 `laycode-cli` 版本 → 构建 → 发布到 npm → 提交并打 tag `v*`；失败自动回滚 |
| `pnpm release:app <patch\|minor\|major> [--dry-run]` | **App 发版**：升级 `app/package.json` 与 `app/app.json` → 提交并打 tag `app-v*`。**推送该 tag 后 GitHub Actions 自动构建并发布 Release**（默认 production-apk） |

> App 发版流程：`pnpm release:app minor` → `git push && git push --tags` → CI 自动构建发布。App build number 由 EAS 管理。

需要手动出别的产物（如 AAB、preview），可单独触发 CI（构建**远程 `main` 分支**的代码，非本地未推送的改动）：

| 命令 | 说明 |
|---|---|
| `pnpm release:apk` | 手动触发构建生产 APK（main 分支） |
| `pnpm release:aab` | 手动触发构建生产 AAB（main 分支） |
| `pnpm release:preview` | 手动触发构建 preview apk 包（main 分支） |

> 构建其它分支：`gh workflow run build-release.yml --ref <branch> -f profile=<profile>`。

## 🛠️ Tech Stack

### App
- **React Native** + **Expo** — 跨平台移动开发
- **React Navigation** — 页面导航
- **xterm.js** — 终端模拟器
- **react-native-markdown-display** — Markdown 渲染
- **AsyncStorage** — 本地存储

### Bridge
- **Express** — HTTP 服务
- **ws** — WebSocket
- **@opencode-ai/sdk** — opencode 官方 SDK
- **bonjour-service** — 局域网 mDNS 服务发现
- **qrcode-terminal** — 终端配对二维码

## 🤝 Contributing

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与项目开发。

## 📝 Changelog

详见 [CHANGELOG.md](CHANGELOG.md)。

## 📄 License

MIT License © 2026 SoulChild

详见 [LICENSE](LICENSE)。
