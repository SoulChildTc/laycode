import os from 'os'

// 探测本机在局域网中的 IPv4 地址（供二维码/连接使用）。
// 跳过内部回环和非 IPv4；优先返回第一个非内部地址。
export function getLanIp(): string {
  const ifaces = os.networkInterfaces()
  const candidates: string[] = []
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        candidates.push(info.address)
      }
    }
  }
  // 优先常见的私有网段（192.168 / 10.x），其次其他
  const preferred = candidates.find((a) => a.startsWith('192.168.') || a.startsWith('10.'))
  return preferred || candidates[0] || '127.0.0.1'
}
