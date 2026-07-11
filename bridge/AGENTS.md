# Bridge — Desktop Proxy Server

发布为 npm 包 `laycode-cli`（真身，所有逻辑在此）。别名包 `laycode` 仅转发到它。

## Purpose

手机 App 与桌面端 opencode 之间的透明 HTTP/WebSocket 代理，并负责 opencode 生命周期管理、局域网发现（mDNS）、配对二维码。

```
App –HTTP–> Bridge –HTTP–> Opencode (127.0.0.1:4097, 由 Bridge 通过 SDK 托管)
App –WS(/event)–> Bridge –SSE(/global/event)–> Opencode
App –WS(/opencode-api/pty/…)–> Bridge –(裸 TCP 透传)–> Opencode PTY
```

单端口架构：HTTP、事件流 WS、PTY WS 全部复用主端口（默认 8079）。

## Key Files

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI 入口（`laycode-cli`）。子命令 run/start/stop/status/logs、`--version`；无参数默认后台 start。 |
| `src/index.ts` | Express server 入口。装配路由、auth、proxy、todo/git API、SSE、WS upgrade 路由、mDNS、opencode 进程。 |
| `src/config.ts` | 解析 CLI 参数 `--token`/`--port`/`--opencode-url`，合并持久化配置。 |
| `src/store.ts` | 持久化到 `~/.laycode/config.json`；首次运行用 crypto 生成随机强 token 并固定不变。 |
| `src/proxy.ts` | 透明代理：把所有 `/opencode-api/*` 请求转发给 opencode，按 content-type 转发 JSON 或原始 Buffer。 |
| `src/ws.ts` | 事件流 WS：`noServer` 模式挂在主 server 的 upgrade 上，连接 opencode SSE `/global/event`（兼容 CRLF）转发给客户端。 |
| `src/opencode.ts` | 通过 `@opencode-ai/sdk` 在 `127.0.0.1:4097` 托管 opencode。启动前清理端口（跨平台：lsof / netstat+taskkill）。ensure/restart/stop。 |
| `src/mdns.ts` | 用 `bonjour-service`（纯 JS，跨平台）广播 `_laycode._tcp`，与 App 端 `zeroconf.scan('laycode','tcp','local')` 匹配。 |
| `src/auth.ts` | `/opencode-api` 的 Bearer token 中间件。 |
| `src/git.ts` | git 操作（全部 `execFileSync`，跨平台 + 防注入）。 |
| `src/todos.ts` | 按目录读写 todo（存于用户 HOME 下）。 |
| `src/paths.ts` | PID/LOG 路径、`getVersion()`（读 package.json）、目录创建。 |
| `src/qr.ts` | 打印配对二维码/连接信息。 |

## CLI 命令

```bash
laycode-cli            # 无参数：默认后台启动（等同 start）
laycode-cli run        # 前台运行（Ctrl+C 停止）
laycode-cli start      # 后台守护进程；spawn 后轮询 /api/v1/health 确认真起来才报成功
laycode-cli stop       # 优雅 SIGTERM + 轮询确认退出，超时 SIGKILL 兜底（Windows 用 taskkill /T）
laycode-cli status     # 查看运行状态
laycode-cli logs [-f]  # 查看日志，-f 用 fs.watch 持续跟踪（不依赖系统 tail）
laycode-cli --version  # 显示版本
```

选项可跟在 `run`/`start` 后：`--port <n>`、`--token <t>`、`--opencode-url <url>`（连接外部 opencode，此时不托管进程）。

## Route Behavior

| Route | Handler | Notes |
|-------|---------|-------|
| `GET /opencode-api/event` | SSE passthrough | 流式转发 opencode `GET /event` |
| `GET /opencode-api/global/event` | SSE passthrough | 流式转发 opencode `GET /global/event` |
| `GET /opencode-api/api/event` | SSE passthrough | 流式转发 opencode `GET /api/event` |
| `ANY /opencode-api/*` | Transparent proxy | 其余 API 全部代理到 opencode（auth 保护） |
| `GET /api/v1/health` | Direct | `{ status: "ok", version: <动态读 package.json> }` |
| `POST /api/v1/opencode/restart` | Restart | auth 保护。停并重启 opencode，重连 WS。外部 opencode 模式下拒绝。 |
| `GET /api/v1/browse` `POST /api/v1/browse/folder` | 文件系统浏览 | auth 保护的目录列举 / 创建 |
| `GET/POST/PATCH/DELETE /api/v1/todos` | Todo API | auth 保护，按 `?directory=` 分目录 |
| `GET/POST /api/v1/git/*` | Git API | auth 保护（status/init/diff/stage/unstage/commit/discard） |

## WebSocket upgrade 路由（单端口）

`server.on('upgrade')` 按路径分流：

- `/event` — 事件流 WS。由 Bridge 自己终结（非透传），**认证责任在 Bridge**：校验握手 URL 上的 `?token=`，不匹配直接返回 401 断开。App 三处 `/event` URL 都带 token。
- `/opencode-api/pty/<id>/connect` — PTY 终端 WS。裸 TCP 透传给 opencode；认证由 opencode 自己的 ticket 机制负责（不在 Bridge 校验）。
- 其余路径直接 destroy。

## Adding a Custom Bridge Endpoint

1. 在 `src/index.ts` 的 catch-all proxy（`app.use('/opencode-api', createProxyHandler)`）之前加路由。
2. 需鉴权则校验 `req.headers.authorization` 是否等于 `Bearer ${config.token}`。
3. 自定义端点统一放在 `/api/v1/` 下。

## Important

- **不要改 proxy 逻辑**，除非你理解 SSE 流式转发 + Express 5 兼容 + 非 JSON body 兜底（`express.raw`）。
- opencode 端口清理、mDNS、git、stop 均已跨平台（macOS/Linux/Windows）。改这些时保留各平台分支。
- 默认端口 8079。token 首次运行随机生成并持久化在 `~/.laycode/config.json`，不是固定值。
- 加/改 opencode 配置（如新增 agent）后，通过 `POST /api/v1/opencode/restart` 让其重新加载。
