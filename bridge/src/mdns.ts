import os from 'os'
import { execSync } from 'child_process'
import { Bonjour } from 'bonjour-service'

// 跨平台 mDNS 广播：用 bonjour-service（纯 JS）替代 macOS 专有的 dns-sd，
// 服务类型保持 _laycode._tcp，与 App 端 zeroconf.scan('laycode','tcp','local') 匹配。
let instance: InstanceType<typeof Bonjour> | null = null

function computerName(): string {
  try {
    if (process.platform === 'darwin') {
      return execSync('scutil --get ComputerName', { encoding: 'utf-8' }).trim()
    }
  } catch {}
  return os.hostname()
}

export function startMdns(port: number) {
  try {
    instance = new Bonjour()
    const name = `LayCode Bridge on ${computerName()}`
    instance.publish({
      name,
      type: 'laycode',
      protocol: 'tcp',
      port,
      txt: { info: 'LayCode Bridge' },
    })
    console.log(`  mDNS:        _laycode._tcp advertising on port ${port}`)
  } catch (err: any) {
    console.error(`  mDNS warning: ${err?.message || err}`)
  }
}

export function stopMdns() {
  if (instance) {
    try { instance.unpublishAll(() => instance?.destroy()) } catch {}
    instance = null
  }
}
