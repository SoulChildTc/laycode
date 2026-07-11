import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import fs from 'fs'
import path from 'path'
import os from 'os'
import net from 'net'
import type { Duplex } from 'stream'
import { fileURLToPath } from 'url'
import { parseArgs } from './config.js'
import { createAuthMiddleware } from './auth.js'
import { createProxyHandler } from './proxy.js'
import { getVersion } from './paths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { startMdns, stopMdns } from './mdns.js'
import { startWebSocketServer, stopWebSocketServer, handleEventUpgrade } from './ws.js'
import { ensureOpencode, stopOpencode, restartOpencode } from './opencode.js'
import { readTodos, addTodo, updateTodo, deleteTodo } from './todos.js'
import { getStatus, initRepo, getDiff, stageFile, unstageFile, commit, discardFile } from './git.js'
import { morganStream } from './logger.js'
import { printPairing } from './qr.js'

const config = parseArgs()
const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
// 兜底捕获非 JSON 的请求体为 Buffer，供代理原样转发给 opencode（如未来的文件上传中转）。
// 显式排除 application/json：json 与 raw 职责互斥，不依赖 body-parser 的隐式已解析标记。
app.use(express.raw({
  type: (req) => !(req.headers['content-type'] || '').includes('application/json'),
  limit: '50mb',
}))
app.use(morgan('combined', { stream: morganStream }))
app.use('/static', express.static(path.join(__dirname, '../public')))

// Auth on all /opencode-api routes
app.use('/opencode-api', createAuthMiddleware(config.token))

// SSE event streams — streamed (not buffered) so SDK's event subscribers work
function createSseHandler(path: string) {
  return async (_req: express.Request, res: express.Response) => {
    try {
      const response = await fetch(`${config.opencodeUrl}${path}`)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      const reader = response.body!.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } catch {
      res.status(502).end()
    }
  }
}

app.get('/opencode-api/event', createSseHandler('/event'))
app.get('/opencode-api/global/event', createSseHandler('/global/event'))
app.get('/opencode-api/api/event', createSseHandler('/api/event'))

// Todo API (auth-protected)
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.headers.authorization !== `Bearer ${config.token}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

function getDirectory(req: express.Request): string {
  const d = req.query.directory
  return typeof d === 'string' ? d : ''
}

app.get('/api/v1/todos', requireAuth, (req, res) => {
  const directory = getDirectory(req)
  if (!directory) return res.status(400).json({ error: 'directory required' })
  const list = readTodos(directory)
  res.json({ items: list.items })
})

app.post('/api/v1/todos', requireAuth, (req, res) => {
  const directory = getDirectory(req)
  if (!directory) return res.status(400).json({ error: 'directory required' })
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'text required' })
  const todo = addTodo(directory, text.trim())
  res.status(201).json(todo)
})

app.patch('/api/v1/todos/:id', requireAuth, (req, res) => {
  const directory = getDirectory(req)
  if (!directory) return res.status(400).json({ error: 'directory required' })
  const id = String(req.params.id)
  const todo = updateTodo(directory, id, req.body)
  if (!todo) return res.status(404).json({ error: 'not found' })
  res.json(todo)
})

app.delete('/api/v1/todos/:id', requireAuth, (req, res) => {
  const directory = getDirectory(req)
  if (!directory) return res.status(400).json({ error: 'directory required' })
  const id = String(req.params.id)
  const ok = deleteTodo(directory, id)
  if (!ok) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

// Git API (auth-protected)
app.get('/api/v1/git/status', requireAuth, (req, res) => {
  const directory = getDirectory(req)
  if (!directory) return res.status(400).json({ error: 'directory required' })
  try {
    const status = getStatus(directory)
    res.json(status)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/v1/git/init', requireAuth, (req, res) => {
  const { directory } = req.body
  if (!directory) return res.status(400).json({ error: 'directory required' })
  try {
    initRepo(directory)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/v1/git/diff', requireAuth, (req, res) => {
  const { directory, file, cached } = req.query as Record<string, string>
  if (!directory || !file) return res.status(400).json({ error: 'directory and file required' })
  try {
    const diff = getDiff(directory, file, !!cached)
    res.json({ diff })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/v1/git/stage', requireAuth, (req, res) => {
  const { directory, file } = req.body
  if (!directory) return res.status(400).json({ error: 'directory required' })
  try {
    stageFile(directory, file)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/v1/git/unstage', requireAuth, (req, res) => {
  const { directory, file } = req.body
  if (!directory) return res.status(400).json({ error: 'directory required' })
  try {
    unstageFile(directory, file)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/v1/git/commit', requireAuth, (req, res) => {
  const { directory, message } = req.body
  if (!directory || !message) return res.status(400).json({ error: 'directory and message required' })
  try {
    commit(directory, message)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/v1/git/discard', requireAuth, (req, res) => {
  const { directory, file } = req.body
  if (!directory) return res.status(400).json({ error: 'directory required' })
  try {
    discardFile(directory, file)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Proxy — catch all methods on /opencode-api/* (Express 5 compatible)
app.use('/opencode-api', createProxyHandler(config))

// Custom API for future extensions
// /health 不鉴权：仅用于探活（mDNS 发现、进程存活检查）。能连上 != 有权限。
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', version: getVersion() })
})

// /auth/verify 鉴权：连接时用它确认 token 有效。200=token 正确，401=token 错误，网络失败=离线。
// 这是「已连接」的唯一可信判据，不能用 /health 代替。
app.get('/api/v1/auth/verify', requireAuth, (_req, res) => {
  res.json({ ok: true, version: getVersion() })
})

// Restart opencode (auth-protected)
app.post('/api/v1/opencode/restart', async (req, res) => {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${config.token}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (process.argv.includes('--opencode-url')) {
    return res.status(400).json({ error: 'Cannot restart external opencode' })
  }

  try {
    const url = await restartOpencode()
    config.opencodeUrl = url
    stopWebSocketServer()
    startWebSocketServer(config)
    res.json({ status: 'ok', url })
  } catch (err: any) {
    res.status(500).json({ error: 'Restart failed', message: err.message })
  }
})

// Filesystem browser (auth-protected)
app.get('/api/v1/browse', (req, res) => {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${config.token}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const raw = req.query.path
  if (raw !== undefined && typeof raw !== 'string') {
    return res.status(400).json({ error: 'Invalid path' })
  }
  // 归一化后必须是绝对路径：resolve 会折叠 `..`，杜绝相对路径与穿越歧义，
  // 行为可预测且与 /browse/folder 拒绝穿越的意图一致。
  const dir = raw ? path.resolve(raw) : os.homedir()
  if (!path.isAbsolute(dir)) {
    return res.status(400).json({ error: 'Invalid path' })
  }
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(dir, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    res.json({ entries, current: dir, parent: path.dirname(dir) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/v1/browse/folder', (req, res) => {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${config.token}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const raw = req.body?.path
  if (!raw || typeof raw !== 'string') return res.status(400).json({ error: 'Missing path' })
  const dir = path.resolve(raw)
  if (!path.isAbsolute(dir)) return res.status(400).json({ error: 'Invalid path' })
  try {
    fs.mkdirSync(dir, { recursive: true })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

const server = app.listen(config.port, async () => {
  console.log(`LayCode Bridge`)
  console.log(`  Port:        ${config.port}`)
  console.log(`  Token auth:  enabled`)
  try {
    const opencodeUrl = await ensureOpencode(config)
    config.opencodeUrl = opencodeUrl
    startMdns(config.port)
    startWebSocketServer(config)
    printPairing(config)
  } catch (err: any) {
    console.error(`  Error: ${err.message}`)
    process.exit(1)
  }
})

// 监听失败（最常见是端口被占 EADDRINUSE）：listen 不会走成功回调，而是发 error 事件。
// 必须显式处理，否则服务静默崩溃，而 start 侧健康检查可能被占用端口的旧进程“冒名”响应，误报启动成功。
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`  启动失败：端口 ${config.port} 已被占用。`)
    console.error(`  请停止占用该端口的进程，或用 --port <其它端口> 启动。`)
  } else {
    console.error(`  启动失败：${err.message}`)
  }
  process.exit(1)
})

// WebSocket upgrade routing (single port): 事件流 WS + PTY 代理 WS 共用主 server
// 跟踪 PTY 代理的活跃 socket（客户端侧 + opencode 侧），shutdown 时统一销毁，
// 否则这些裸 socket 会吊住事件循环、进程无法退出。
const activeProxySockets = new Set<Duplex>()

server.on('upgrade', (req, socket, head) => {
  if (!req.url) { socket.destroy(); return }
  const url = new URL(req.url, 'http://localhost')

  // 事件流 WS：/event（原先在 port+1，现统一到主端口）
  if (url.pathname === '/event') {
    // 事件流由 bridge 自己终结（非透传给 opencode），所以认证责任在 bridge：
    // 校验握手 URL 上的 token，不合法直接断开。
    if (url.searchParams.get('token') !== config.token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    handleEventUpgrade(req, socket, head)
    return
  }

  const match = url.pathname.match(/^\/opencode-api\/pty\/([^/]+)\/connect$/)
  if (!match) {
    socket.destroy()
    return
  }

  const targetPath = `/pty/${match[1]}/connect${url.search}`
  const target = new URL(targetPath, config.opencodeUrl)
  console.log('[ws-proxy] target:', target.href)

  const proxy = net.connect(Number(target.port) || 80, target.hostname, () => {
    console.log('[ws-proxy] connected to opencode, sending upgrade')
    proxy.write(
      `GET ${targetPath} HTTP/1.1\r\n` +
      `Host: ${target.host}\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${req.headers['sec-websocket-key'] || ''}\r\n` +
      `Sec-WebSocket-Version: ${req.headers['sec-websocket-version'] || '13'}\r\n` +
      `\r\n`,
    )
    proxy.pipe(socket)
    socket.pipe(proxy)
  })

  // 登记两端 socket，任一端关闭即从跟踪集合移除，避免泄漏引用。
  activeProxySockets.add(socket)
  activeProxySockets.add(proxy)
  const forget = () => { activeProxySockets.delete(socket); activeProxySockets.delete(proxy) }
  proxy.on('close', forget)
  socket.on('close', forget)

  proxy.on('error', (err) => { console.log('[ws-proxy] proxy error:', err.message); try { socket.destroy() } catch {} })
  socket.on('error', (err) => { console.log('[ws-proxy] socket error:', err.message); try { proxy.destroy() } catch {} })
})

// Graceful shutdown
let shuttingDown = false
const shutdown = () => {
  if (shuttingDown) return
  shuttingDown = true
  console.log('\n  Shutting down...')
  stopMdns()
  stopWebSocketServer()
  stopOpencode()
  // 强制断开所有 PTY 代理 socket，否则 server.close 的回调永远等不到。
  for (const s of activeProxySockets) {
    try { s.destroy() } catch {}
  }
  activeProxySockets.clear()
  server.close(() => process.exit(0))
  // 兜底：即便仍有 handle 吊住事件循环，也在 3 秒后强制退出，不再依赖回调。
  const timer = setTimeout(() => process.exit(0), 3000)
  timer.unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
