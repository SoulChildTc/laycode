import { createOpencodeServer } from '@opencode-ai/sdk/server'
import { BridgeConfig } from './types.js'

const MANAGED_PORT = 4097
const MANAGED_HOSTNAME = '127.0.0.1'
const STARTUP_TIMEOUT = 10000

let server: { url: string; close(): void } | null = null

export async function ensureOpencode(config: BridgeConfig): Promise<string> {
  if (process.argv.includes('--opencode-url')) {
    return config.opencodeUrl
  }

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
