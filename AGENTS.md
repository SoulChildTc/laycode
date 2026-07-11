# LayCode

opencode 的移动端客户端：手机 App 通过运行在电脑上的 Bridge 服务连接本地 opencode 实例。

## Monorepo 结构

pnpm workspace，包含两个可发布包 + 一个 App：

```
laycode/
├── app/            # Expo React Native App（iOS/Android），不发布到 npm
├── bridge/         # 桥接服务，发布为 npm 包 `laycode-cli`（真身，所有逻辑在此）
├── laycode-alias/  # 发布为 npm 包 `laycode`，是 `laycode-cli` 的别名（转发，无逻辑）
├── scripts/        # release.mjs 发版脚本
├── pnpm-workspace.yaml
└── package.json    # monorepo 根（private，不发布）
```

- **`laycode-cli`** 和 **`laycode`** 版本永远一致；用户 `npx laycode` 或 `npx laycode-cli` 等价。
- 别名包依赖用 `workspace:*`，发布时 pnpm 自动替换成真实版本号。

## 开发

```bash
pnpm install                          # 根目录，安装所有 workspace 依赖
pnpm --filter laycode-cli build       # 构建 bridge
pnpm --filter laycode-cli dev         # 前台开发运行 bridge
```

App 端在 `app/` 下用 Expo（`npm start`），详见 `app/AGENTS.md`。

## 发版（手动、低频、一个人）

平时推 main 不发版。发版时在根目录一条命令：

```bash
pnpm release patch    # 0.1.0 → 0.1.1（修复）
pnpm release minor    # 0.1.0 → 0.2.0（加功能）
pnpm release major    # 0.1.0 → 1.0.0（大改）
pnpm release patch --dry-run   # 演练，不真发
```

`scripts/release.mjs` 内部：统一升所有包版本 → 构建 → `pnpm publish -r`（按依赖顺序先发 laycode-cli 再发 laycode）。版本一致性、发布顺序、依赖同步全自动。

首次发布前需 `npm login`。

## General Rules

- **Always check opencode source first** — opencode TUI (`packages/tui/`) 已实现大量功能，动手前先在那里搜。
- **SDK types** 在 `@opencode-ai/sdk` v1 的 `dist/gen/types.gen.d.ts`。
- **Bridge proxies everything** — 任意 `/opencode-api/<path>` 自动经 bridge 代理，通常无需改 bridge。
- **Prefer raw `fetch`** 当 SDK 类型对当前任务过于复杂时。
- 每个子模块（`app/`、`bridge/`）有自己的 `AGENTS.md`，含模块专属规则。
- 约定：`CLAUDE.md` 用 `@AGENTS.md` 引用同目录的 `AGENTS.md`，AGENTS.md 是唯一真身。
