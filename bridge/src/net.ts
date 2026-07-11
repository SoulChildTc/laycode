import os from 'os'

// 明显的虚拟/容器网卡名，多网卡时应跳过（否则二维码可能给出手机访问不到的地址）
const VIRTUAL_IFACE = /^(docker|br-|veth|vmnet|vboxnet|utun|tun|tap|zt|wg|lo)/i

// 探测本机在局域网中的 IPv4 地址（供二维码/连接使用）。
// 优先级：环境变量 LAYCODE_HOST > 常见私有网段(192.168/10.x) > 其他非虚拟网卡 > 回环。
export function getLanIp(): string {
  const override = process.env.LAYCODE_HOST?.trim()
  if (override) return override

  const ifaces = os.networkInterfaces()
  const candidates: string[] = []
  for (const name of Object.keys(ifaces)) {
    if (VIRTUAL_IFACE.test(name)) continue
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        candidates.push(info.address)
      }
    }
  }
  // 优先常见的家庭/办公私有网段，再退到其他候选
  const preferred = candidates.find((a) => a.startsWith('192.168.') || a.startsWith('10.'))
  return preferred || candidates[0] || '127.0.0.1'
}
