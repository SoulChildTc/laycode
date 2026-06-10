# LayCode — 躺着做 Vibe Coding

**Date:** 2026-06-10
**Status:** Draft

## 问题

长时间坐在电脑前做 Vibe Coding，脖子疼。需要一个可以在床上躺着用的 coding 体验。

## 方案

**LayCode** — 手机 APP（Expo React Native）+ 电脑端 bridge server，让用户躺在床上通过手机操控桌面上的 opencode。

## 架构

```
┌────────────────────────────────────────────┐
│  LayCode App (Expo React Native)           │
│                                            │
│  · 连接页 — mDNS 自动发现 + 手动输入        │
│  · 主页 — 项目列表 → 会话列表 → 新建会话     │
│  · 会话页 — 消息流 + 代码块 + diff 高亮     │
│  · 文件浏览器 — 树形查看 + 文件内容只读      │
│  · 设置页 — token / 主题 / 断开             │
│                                            │
│  Network: HTTP/WebSocket + token auth      │
└──────────────────┬─────────────────────────┘
                   │ WiFi LAN
┌──────────────────┴─────────────────────────┐
│  Bridge Server (Node.js + TypeScript)       │
│  Port: 8079                                 │
│                                             │
│  · 透明代理 → opencode (:4096)              │
│  · Token 认证（--token xxx 启动参数）        │
│  · mDNS 广播（avahi/Bonjour 自动发现）       │
│  · WebSocket 封装 SSE（移动端更可靠）        │
│  · 未来扩展：截图投屏、通知推送、语音唤醒     │
│                                             │
│  Start: laycode-bridge --token mytoken      │
└──────────────────┬─────────────────────────┘
                   │ localhost
┌──────────────────┴─────────────────────────┐
│  opencode web --hostname 0.0.0.0            │
│  Port: 4096 (default)                       │
└────────────────────────────────────────────┘
```

## Bridge Server

### 职责

1. **透明代理** — APP 请求 `/opencode-api/*`，bridge 去掉前缀 `/opencode-api` 后透传给 opencode。opencode 加任何新接口都自动兼容，不需要更新 bridge。
2. **Token 验证** — 每个请求检查 `Authorization: Bearer <token>` header，非法请求返回 401
3. **mDNS 广播** — 启动时广播 `_laycode._tcp` 服务，APP 自动发现
4. **SSE → WebSocket** — 将 opencode 的 SSE `/event` 流封装为 WebSocket，RN 端更稳定
5. **自定义 API** — 前缀 `/api/v1/*` 留给未来扩展

### 实现

- Node.js + TypeScript
- Express / 原生 http
- `multicast-dns` 或 `bonjour` 包做 mDNS
- `ws` 包做 WebSocket

### 启动方式

```
laycode-bridge --token my-secret-token [--port 8079] [--opencode-url http://localhost:4096]
```

## LayCode APP

### 技术栈

- **Expo** (managed workflow)
- React Navigation (底部 tab + stack)
- @opencode-ai/sdk（API 调用）
- expo-speech-recognition（语音）— 备选
- react-native-safe-area-context（刘海适配）

### 页面结构

#### 连接页
- mDNS 自动扫描：显示同局域网所有运行 bridge 的电脑（名称、IP、状态）
- 手动输入：IP + 端口 + token
- 记住上次连接的配置
- 连接成功后进入主页

#### 主页
- 顶部：当前连接的电脑名称 + 断开按钮
- 项目列表（从 opencode 接口获取）
- 点击项目进入会话列表
- 底部「新建会话」按钮
- Tab 导航：主页 / 文件 / 设置

#### 会话页
- 顶部：返回 + 会话名称
- 消息流：用户消息 + AI 回复
  - 代码块：语法高亮，可展开/折叠
  - diff：行级高亮
  - 文件引用：可点击跳转到文件浏览器
- 底部输入框（多行，自动增高）
- 发送按钮

#### 文件浏览器
- 目录树：可展开/折叠
- 点击文件查看内容（语法高亮、只读）
- 搜索文件

#### 设置页
- 已连接的服务器信息
- Token 修改
- 深色/浅色主题切换
- 断开连接
- 版本信息

### 数据流

```
用户讲话 → 手机输入法 STT → 输入框文本
    ↓
发送文本 → HTTP POST bridge/opencode-api/project/:id/session/:id/message
    ↓
bridge 去掉前缀 → opencode API
    ↓
opencode 处理 → SSE 流式响应
    ↓
bridge WebSocket → APP 显示
```

### 安全

- Bridge 启动时指定 token，所有请求携带
- 局域网传输，不暴露到公网
- 无数据持久化存储（全部实时拉取）

## 里程碑

### MVP
- Bridge 透明代理 + token 认证
- APP 连接页（手动输入）
- APP 会话页（发消息 + 看回复 + 代码展示）
- 深色/浅色主题

### V2
- mDNS 自动发现
- 文件浏览器
- 项目/会话列表管理
- SSE → WebSocket

### V3
- 自定义 API 扩展
- 横竖屏优化
- 页面过渡动画
- 性能优化
