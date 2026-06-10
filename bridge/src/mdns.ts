import { spawn, execSync, ChildProcess } from 'child_process'
import os from 'os'

function computerName(): string {
  try {
    return execSync('scutil --get ComputerName', { encoding: 'utf-8' }).trim()
  } catch {
    return os.hostname()
  }
}

let mdnsProcess: ChildProcess | null = null

export function startMdns(port: number) {
  const name = `LayCode Bridge on ${computerName()}`
  mdnsProcess = spawn('dns-sd', [
    '-R', name,
    '_laycode._tcp',
    '.',
    String(port),
    'info=LayCode Bridge',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  mdnsProcess.stdout?.on('data', (d) => process.stdout.write(d))
  mdnsProcess.stderr?.on('data', (d) => process.stderr.write(d))

  mdnsProcess.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`  mDNS warning: dns-sd exited with code ${code}`)
    }
    mdnsProcess = null
  })

  console.log(`  mDNS:        _laycode._tcp advertising on port ${port}`)
}

export function stopMdns() {
  if (mdnsProcess) {
    mdnsProcess.kill('SIGTERM')
    mdnsProcess = null
  }
}
