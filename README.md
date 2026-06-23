# LayCode

> 躺着码，一样 Vibe — opencode 的移动端客户端

LayCode 是 [opencode](https://github.com/anomalyco/opencode) 的移动端 companion app，让你在手机上也能继续你的编码会话。通过运行在电脑上的 Bridge 服务，手机 App 可以安全地连接到本地的 opencode 实例，随时随地继续对话、查看代码、管理任务。

## ✨ Features

- 📱 **移动端体验** — 专为手机优化的 UI，支持深色/浅色主题
- 💬 **会话同步** — 无缝接续你在电脑上的 opencode 对话
- 🖥️ **内置终端** — 基于 xterm.js 的完整终端模拟器
- 📂 **文件浏览** — 查看和管理项目文件
- 📋 **任务管理** — 查看和管理 opencode 生成的待办事项
- 🔄 **自动发现** — mDNS 自动发现局域网内的 Bridge 服务
- 🔐 **安全连接** — Token 认证，所有请求通过 Bridge 代理

## 🏗️ Architecture

```
┌─────────────┐     WiFi      ┌──────────────────┐     ┌─────────────┐
│             │               │                  │     │             │
│  LayCode    │ ◄───────────► │  LayCode Bridge  │ ◄──►│  opencode   │
│  (App)      │    HTTP/WS    │  (Express)       │     │  (TUI)      │
│             │               │                  │     │             │
└─────────────┘               └──────────────────┘     └─────────────┘
   iOS/Android                     macOS/Linux           本地运行
```

- **LayCode App** — Expo React Native 应用，运行在手机上
- **LayCode Bridge** — Node.js Express 服务，运行在你的电脑上，代理 opencode API 和 WebSocket
- **opencode** — 本地运行的 opencode TUI 实例，Bridge 通过 SDK 与之交互

## 📋 Prerequisites

### Bridge 端（电脑）
- Node.js >= 18
- npm 或 yarn
- [opencode](https://github.com/anomalyco/opencode) 已安装并可在命令行调用
- 与手机在同一局域网内

### App 端（手机）
- iOS 15+ 或 Android 8+
- Expo Go（开发模式）或通过 EAS Build 打包的独立 App

## 🚀 Quick Start

### 一键启动（推荐）

```bash
# 克隆项目
git clone https://github.com/SoulChildTc/laycode.git
cd laycode

# 安装依赖
cd app && npm install
cd ../bridge && npm install
cd ..

# 一键启动 Bridge + App
./start.sh --token <your-opencode-token>
```

### 手动启动

#### 1. 启动 Bridge 服务

```bash
cd bridge
npm install
npm run dev -- --token <your-opencode-token>
```

Bridge 默认运行在 `http://0.0.0.0:8787`。

#### 2. 启动 App

```bash
cd app
npm install
npm start
```

用手机扫描 Expo Go 二维码，确保手机和电脑在同一 WiFi 下。

### 获取 opencode Token

Token 可以在 opencode TUI 中通过相关命令获取，或查看 opencode 配置文件。Bridge 需要这个 Token 来与 opencode 实例通信。

## 📁 Project Structure

```
laycode/
├── app/              # Expo React Native App (iOS/Android)
│   ├── src/
│   │   ├── api/      # API 客户端
│   │   ├── components/  # 通用组件
│   │   ├── features/    # 功能模块
│   │   ├── hooks/       # 自定义 Hooks
│   │   ├── navigation/  # 导航配置
│   │   ├── screens/     # 页面
│   │   ├── theme/       # 主题配置
│   │   ├── types/       # TypeScript 类型
│   │   └── utils/       # 工具函数
│   ├── assets/       # 静态资源
│   ├── App.tsx       # 应用入口
│   └── package.json
├── bridge/           # Express Bridge 服务
│   ├── src/
│   │   ├── index.ts     # 服务入口
│   │   ├── proxy.ts     # HTTP 代理
│   │   ├── ws.ts        # WebSocket 代理
│   │   ├── auth.ts      # 认证中间件
│   │   ├── mdns.ts      # mDNS 服务发现
│   │   ├── opencode.ts  # opencode SDK 封装
│   │   ├── git.ts       # Git 相关接口
│   │   ├── todos.ts     # 待办事项接口
│   │   ├── config.ts    # 配置管理
│   │   └── types.ts     # 类型定义
│   ├── public/      # 静态文件
│   └── package.json
├── docs/            # 文档
├── start.sh         # 一键启动脚本
├── LICENSE
└── README.md
```

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
- **http-proxy-middleware** — 代理中间件
- **@opencode-ai/sdk** — opencode 官方 SDK
- **mDNS** — 局域网服务发现

## 🤝 Contributing

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与项目开发。

## 📝 Changelog

详见 [CHANGELOG.md](CHANGELOG.md)。

## 📄 License

MIT License © 2026 SoulChild

详见 [LICENSE](LICENSE)。
