# laycode-cli

> LayCode Bridge — 让 [LayCode](https://github.com/SoulChildTc/laycode) 手机 App 连接到你电脑上的 opencode 实例。

`laycode-cli` 是运行在电脑上的桥接服务：它托管一个本地 opencode 实例，通过局域网把 HTTP/WebSocket 代理给 LayCode 手机 App，并用 Token 认证保证安全。

## 环境要求

- Node.js >= 18
- macOS、Linux 或 Windows
- [opencode](https://github.com/anomalyco/opencode) 已安装并可在命令行调用

## 快速开始

```bash
npx laycode-cli run
```

启动后终端会打印一个二维码，用 LayCode App 扫码即可连接（确保手机和电脑在同一局域网）。首次运行会在 `~/.laycode/config.json` 生成一个固定的强 Token，之后重连无需重新配对。

## 命令

| 命令 | 说明 |
| --- | --- |
| `laycode-cli run` | 前台运行（Ctrl+C 停止） |
| `laycode-cli start` | 后台运行（守护进程） |
| `laycode-cli stop` | 停止后台服务 |
| `laycode-cli status` | 查看运行状态 |
| `laycode-cli logs [-f]` | 查看日志（`-f` 持续跟踪） |

## 选项

可跟在 `run` / `start` 之后：

| 选项 | 说明 |
| --- | --- |
| `--port <n>` | 指定端口（默认使用持久化配置或 `8079`） |
| `--token <t>` | 指定 Token（默认使用持久化的强 Token） |
| `--opencode-url <url>` | 连接外部 opencode 实例，而非托管一个 |

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `LAYCODE_HOST` | 手动指定二维码/配对使用的局域网 IP。多网卡（如装了 Docker、VPN）导致自动探测选错地址时使用。 |

## 数据目录

所有持久化数据位于 `~/.laycode/`：

- `config.json` — Token 与端口
- `logs/bridge.log` — 运行日志（自动轮转，单文件上限 5MB，保留 3 份）
- `bridge.pid` — 后台进程 PID

## License

MIT © SoulChild
