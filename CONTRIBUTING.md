# Contributing to LayCode

首先，感谢你花时间为 LayCode 做贡献！🎉

本文档是参与 LayCode 项目开发的指南。请在提交 Issue 或 Pull Request 之前先阅读一下。

## 📋 Code of Conduct

本项目遵循 [Contributor Covenant](CODE_OF_CONDUCT.md) 行为准则。参与项目即表示你同意遵守其条款。

## 🤔 如何贡献

### 报告 Bug

如果你发现了 bug，请通过 GitHub Issue 提交报告。提交前请：

1. 搜索一下是否已经有相同的 Issue
2. 使用 Bug 报告模板，尽可能详细地填写信息
3. 包含复现步骤、预期行为、实际行为
4. 附上设备信息（iOS/Android、系统版本、手机型号等）

### 提出新功能

有新想法？欢迎通过 Feature Request Issue 分享！请说明：

1. 这个功能解决了什么问题
2. 你期望的实现方式
3. 有没有替代方案

### 提交代码

我们欢迎 Pull Request！如果你是第一次贡献，可以从带有 `good first issue` 标签的 Issue 开始。

## 🔧 开发环境搭建

### 前置要求

- Node.js >= 18
- npm 或 yarn
- [opencode](https://github.com/anomalyco/opencode) 已安装
- iOS 开发需要 Xcode（可选，Expo Go 可跳过）
- Android 开发需要 Android Studio（可选，Expo Go 可跳过）

### 安装步骤

```bash
# 1. Fork 并克隆项目
git clone https://github.com/<your-username>/laycode.git
cd laycode

# 2. 安装 App 依赖
cd app
npm install

# 3. 安装 Bridge 依赖
cd ../bridge
npm install

# 4. 回到根目录
cd ..
```

### 启动开发环境

```bash
# 方式一：一键启动（推荐）
./start.sh --token <your-opencode-token>

# 方式二：分别启动
# 终端 1：启动 Bridge
cd bridge
npm run dev -- --token <your-opencode-token>

# 终端 2：启动 App
cd app
npm start
```

## 📝 代码规范

### Git 提交信息

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 类型：**
- `feat` — 新功能
- `fix` — Bug 修复
- `docs` — 文档更新
- `style` — 代码格式调整（不影响代码逻辑）
- `refactor` — 重构
- `perf` — 性能优化
- `test` — 测试相关
- `chore` — 构建/工具/依赖等杂项

**示例：**
```
feat(app): 添加深色模式切换

- 在设置页面新增主题切换按钮
- 主题偏好持久化到 AsyncStorage

Closes #123
```

### 代码风格

- TypeScript — 严格模式，尽量避免 `any`
- 组件使用函数式组件 + Hooks
- 文件命名：组件用 PascalCase，工具函数用 camelCase
- 保持代码简洁，添加必要的注释

## 📦 Pull Request 流程

1. **Fork** 本仓库
2. 从 `main` 分支创建你的 feature 分支：`git checkout -b feature/amazing-feature`
3. 提交你的改动：`git commit -m 'feat: add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 在 GitHub 上创建 Pull Request

### PR 要求

- 一个 PR 只做一件事，保持改动聚焦
- PR 标题遵循 Conventional Commits 规范
- 描述清楚改动了什么、为什么改
- 如果有相关 Issue，请关联（如 `Closes #123`）
- 确保代码能正常运行
- 更新相关文档（如果需要）

### PR 审查

- 所有 PR 都需要至少一位维护者审查通过才能合并
- 审查过程中可能会有修改建议，请积极讨论
- 如果 PR 长时间没有活动，可能会被标记为 stale

## 🐛 调试技巧

### Bridge 调试

Bridge 服务启动后，可以访问 `http://localhost:8787/health` 检查服务状态。

日志级别可以通过环境变量调整：
```bash
DEBUG=laycode:* npm run dev
```

### App 调试

- 在 Expo 开发菜单中开启 Debug Remote JS
- 使用 React Native Debugger 进行调试
- 可以通过 shake 手势打开开发菜单

## ❓ 有问题？

如果有任何问题，可以：
- 开一个 Issue
- 在 Discussion 区提问
- 查看现有文档

再次感谢你的贡献！💖
