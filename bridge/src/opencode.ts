import { createOpencodeServer } from '@opencode-ai/sdk/server'
import { BridgeConfig } from './types.js'
import { execSync } from 'child_process'
import net from 'net'

const MANAGED_PORT = 4097
const MANAGED_HOSTNAME = '127.0.0.1'
const STARTUP_TIMEOUT = 10000

let server: { url: string; close(): void } | null = null

function killProcessOnPort(port: number) {
  try {
    const pid = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', timeout: 3000 }).trim()
    if (pid) {
      console.log(`  Port ${port}:   Found PID ${pid}, killing...`)
      execSync(`kill -9 ${pid}`, { timeout: 3000 })
      console.log(`  Port ${port}:   Freed`)
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
