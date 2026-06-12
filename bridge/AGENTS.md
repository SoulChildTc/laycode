# Bridge — Desktop Proxy Server

## Purpose

Transparent HTTP/WebSocket proxy between the mobile app and the opencode server running on the desktop.

```
App –HTTP–> Bridge –HTTP–> Opencode (localhost:4097)
App –WS–> Bridge –SSE–> Opencode
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Express server entry. Sets up routes, auth, proxy, WS, mDNS, opencode process. |
| `src/proxy.ts` | Transparent proxy: forwards all `/opencode-api/*` requests to opencode. |
| `src/ws.ts` | WebSocket server on `port+1`. Connects to opencode SSE `/global/event` and forwards to WS clients. |
| `src/auth.ts` | Bearer token middleware for `/opencode-api`. |
| `src/opencode.ts` | Manages opencode lifecycle via `@opencode-ai/sdk` on port 4097. Supports ensure/restart/stop. |
| `src/mdns.ts` | Advertises `_laycode._tcp` via macOS `dns-sd`. |
| `src/config.ts` | CLI args: `--token`, `--port`, `--opencode-url`. |

## Route Behavior

| Route | Handler | Notes |
|-------|---------|-------|
| `GET /opencode-api/event` | SSE passthrough | Streams from opencode `GET /event` |
| `GET /opencode-api/global/event` | SSE passthrough | Streams from opencode `GET /global/event` |
| `GET /opencode-api/api/event` | SSE passthrough | Streams from opencode `GET /api/event` |
| `ANY /opencode-api/*` | Transparent proxy | All other API calls proxied to opencode |
| `GET /api/v1/health` | Direct response | `{ status: "ok", version: "0.1.0" }` |
| `POST /api/v1/opencode/restart` | Restart opencode | Auth-protected. Stops and re-spawns opencode, reconnects WS. |
| `GET /api/v1/browse` | Filesystem browser | Auth-protected directory listing |

## Adding a Custom Bridge Endpoint

1. Add route in `src/index.ts` before the catch-all proxy.
2. If auth-protected, check `req.headers.authorization` against `config.token`.
3. Keep custom endpoints under `/api/v1/`.

## Important

- **Do NOT modify proxy logic** unless you understand the SSE streaming + Express 5 compatibility.
- Bridge auto-starts opencode if `--opencode-url` is not provided.
- Restart opencode via `POST /api/v1/opencode/restart` (e.g. after adding an agent to pick up config changes).
- Default port: 8079. Default token: `laycode`.
