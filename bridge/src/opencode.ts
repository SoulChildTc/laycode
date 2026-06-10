import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import net from 'net'
import { BridgeConfig } from './types.js'

let opencodeProcess: ReturnType<typeof spawn> | null = null

function pidFile(): string {
  return path.join(os.tmpdir(), 'laycode-opencode.pid')
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.on('error', () => resolve(true))
    server.on('listening', () => {
      server.close()
      resolve(false)
    })
    server.listen(port, '127.0.0.1')
  })
}

function readPid(): number | null {
  try {
    const pid = parseInt(fs.readFileSync(pidFile(), 'utf-8').trim(), 10)
    return isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

function writePid(pid: number) {
  fs.writeFileSync(pidFile(), String(pid), 'utf-8')
}

function clearPid() {
  try { fs.unlinkSync(pidFile()) } catch {}
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function ensureOpencode(config: BridgeConfig): Promise<string> {
  if (process.argv.includes('--opencode-url')) {
    return config.opencodeUrl
  }

  const managedPort = 4097
  const url = `http://localhost:${managedPort}`

  // Check if our managed instance is already running
  const existingPid = readPid()
  if (existingPid !== null && isProcessAlive(existingPid) && (await isPortInUse(managedPort))) {
    console.log(`  OpenCode:     ${url} (reusing existing, pid ${existingPid})`)
    return url
  }

  clearPid()

  console.log(`  Starting:     opencode serve --hostname 127.0.0.1 --port ${managedPort} (managed)`)

  return new Promise((resolve, reject) => {
    const child = spawn('opencode', [
      'serve',
      '--hostname', '127.0.0.1',
      '--port', String(managedPort),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    writePid(child.pid!)

    let started = false
    let outputBuffer = ''

    const checkStarted = (data: Buffer) => {
      outputBuffer += data.toString()
      if (!started && (outputBuffer.includes('listening') || outputBuffer.includes('started') || outputBuffer.includes('Server'))) {
        started = true
        opencodeProcess = child
        console.log(`  OpenCode:     ${url} (pid ${child.pid})`)
        resolve(url)
      }
    }

    child.stdout?.on('data', checkStarted)
    child.stderr?.on('data', checkStarted)

    child.on('error', (err) => {
      clearPid()
      console.error(`  Error:        Failed to start opencode: ${err.message}`)
      console.error(`  Hint:        Make sure 'opencode' is installed and in PATH`)
      reject(err)
    })

    child.on('exit', (code) => {
      clearPid()
      if (!started) {
        reject(new Error(`opencode exited with code ${code} before starting`))
      }
      opencodeProcess = null
    })

    setTimeout(() => {
      if (!started) {
        clearPid()
        reject(new Error('opencode failed to start within 10 seconds'))
      }
    }, 10000)
  })
}

export function stopOpencode() {
  if (opencodeProcess) {
    console.log('  Shutdown:     Stopping managed opencode...')
    opencodeProcess.kill('SIGTERM')
    opencodeProcess = null
    clearPid()
  }
}
