# Changelog

所有重要的项目变更都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并且本项目遵循 [语义化版本（Semantic Versioning）](https://semver.org/lang/zh-CN/) 规范。

## [Unreleased]

### Added
- LayCode App — Expo React Native 移动端应用
- LayCode Bridge — Express 桥接服务（发布为 `laycode-cli`，别名包 `laycode`）
- 会话同步功能
- 内置终端（xterm.js）
- 任务管理
- mDNS 自动发现
- 深色/浅色主题切换

### Changed
- `express.raw` 中间件收窄为仅处理非 JSON 请求体，与 `express.json` 职责显式互斥

### Removed
- 暂时下线文件浏览入口（功能未正式开放，待后续版本重新开放）

### Fixed
- `stop` 时进程不再空等超时：关闭时强制终结事件流 WS 客户端与 PTY 代理 socket，并加 3 秒兜底强制退出

### Security
- `/api/v1/browse` 与 `/api/v1/browse/folder` 增加路径校验（归一化 + 绝对路径断言），消除目录穿越歧义

---

## [0.1.0] - 2026-06-XX

### Added
- 项目初始化
- App 基础框架搭建
- Bridge 服务基础实现
- 一键启动脚本

[Unreleased]: https://github.com/SoulChildTc/laycode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SoulChildTc/laycode/releases/tag/v0.1.0
