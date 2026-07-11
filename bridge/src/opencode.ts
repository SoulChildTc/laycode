import { createOpencodeServer } from '@opencode-ai/sdk/server'
import { BridgeConfig } from './types.js'
import { execFileSync } from 'child_process'
import net from 'net'

const MANAGED_PORT = 4097
const MANAGED_HOSTNAME = '127.0.0.1'
const STARTUP_TIMEOUT = 10000

let server: { url: string; close(): void } | null = null

// 跨平台释放端口：找到占用端口的进程并结束它。
// Windows 用 netstat + taskkill，Unix 用 lsof + kill。
function killProcessOnPort(port: number) {
  try {
    if (process.platform === 'win32') {
      // netstat 输出形如：TCP 0.0.0.0:4097 0.0.0.0:0 LISTENING 1234
      const out = execFileSync('netstat', ['-ano'], { encoding: 'utf-8', timeout: 3000 })
      const pids = new Set<string>()
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue
        if (!new RegExp(`[:.]${port}\\b`).test(line)) continue
        const pid = line.trim().split(/\s+/).pop()
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
      }
      for (const pid of pids) {
        console.log(`  Port ${port}:   Found PID ${pid}, killing...`)
        execFileSync('taskkill', ['/F', '/PID', pid], { timeout: 3000, stdio: 'pipe' })
        console.log(`  Port ${port}:   Freed`)
      }
    } else {
      const pid = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf-8', timeout: 3000 }).trim()
      if (pid) {
        console.log(`  Port ${port}:   Found PID ${pid}, killing...`)
        // 可能有多个 PID（每行一个），逐个结束
        for (const p of pid.split(/\s+/).filter(Boolean)) {
          execFileSync('kill', ['-9', p], { timeout: 3000 })
        }
        console.log(`  Port ${port}:   Freed`)
      }
    }
  } catch {}
}

async function waitForPortFree(port: number, timeout: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const s = net.createServer()
        s.on('error', reject)
        s.listen(port, MANAGED_HOSTNAME, () => {
          s.close(() => resolve())
        })
      })
      return
    } catch {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  throw new Error(`Port ${port} still in use after ${timeout}ms`)
}

export async function ensureOpencode(config: BridgeConfig): Promise<string> {
  if (process.argv.includes('--opencode-url')) {
    return config.opencodeUrl
  }

  killProcessOnPort(MANAGED_PORT)
  await waitForPortFree(MANAGED_PORT, 3000)

  console.log(`  Starting:     opencode via SDK on ${MANAGED_HOSTNAME}:${MANAGED_PORT}`)

  const result = await createOpencodeServer({
    hostname: MANAGED_HOSTNAME,
    port: MANAGED_PORT,
    timeout: STARTUP_TIMEOUT,
  })

  server = result
  console.log(`  OpenCode:     ${result.url}`)
  return result.url
}

export async function restartOpencode(): Promise<string> {
  if (server) {
    console.log('  Restart:      Stopping opencode...')
    server.close()
    server = null
  }

  console.log('  Restart:      Starting opencode...')
  const result = await createOpencodeServer({
    hostname: MANAGED_HOSTNAME,
    port: MANAGED_PORT,
    timeout: STARTUP_TIMEOUT,
  })

  server = result
  console.log(`  OpenCode:     ${result.url} (restarted)`)
  return result.url
}

export function stopOpencode() {
  if (server) {
    console.log('  Shutdown:     Stopping managed opencode...')
    server.close()
    server = null
  }
}
