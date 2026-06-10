import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { parseArgs, printStartupInfo } from './config.js'
import { createAuthMiddleware } from './auth.js'
import { createProxyHandler } from './proxy.js'
import { startMdns, stopMdns } from './mdns.js'
import { startWebSocketServer, stopWebSocketServer } from './ws.js'
import { ensureOpencode, stopOpencode } from './opencode.js'

const config = parseArgs()
const app = express()

app.use(express.json())

// Auth on all /opencode-api routes
app.use('/opencode-api', createAuthMiddleware(config.token))

// Proxy — catch all methods on /opencode-api/* (Express 5 compatible)
app.use('/opencode-api', createProxyHandler(config))

// Custom API for future extensions
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' })
})

// Filesystem browser (auth-protected)
app.get('/api/v1/browse', (req, res) => {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${config.token}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const dir = (req.query.path as string) || os.homedir()
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

const server = app.listen(config.port, async () => {
  printStartupInfo(config)
  try {
    const opencodeUrl = await ensureOpencode(config)
    config.opencodeUrl = opencodeUrl
    startMdns(config.port)
    startWebSocketServer(config)
  } catch (err: any) {
    console.error(`  Error: ${err.message}`)
    process.exit(1)
  }
})

// Graceful shutdown
const shutdown = () => {
  console.log('\n  Shutting down...')
  stopMdns()
  stopWebSocketServer()
  stopOpencode()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
