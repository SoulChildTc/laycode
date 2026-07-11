import qrcode from 'qrcode-terminal'
import os from 'os'
import { execSync } from 'child_process'
import { getLanIp } from './net.js'
import { BridgeConfig } from './types.js'

function computerName(): string {
  try {
    if (process.platform === 'darwin') {
      return execSync('scutil --get ComputerName', { encoding: 'utf-8' }).trim()
    }
  } catch {}
  return os.hostname()
}

// 配对载荷编码为 laycode:// URI，App 扫码后解析 host/port/token/name。
export function buildPairingUri(config: BridgeConfig): string {
  const host = getLanIp()
  const params = new URLSearchParams({
    host,
    port: String(config.port),
    token: config.token,
    name: computerName(),
  })
  return `laycode://connect?${params.toString()}`
}

export function printPairing(config: BridgeConfig) {
  const uri = buildPairingUri(config)
  const host = getLanIp()
  console.log('')
  console.log('  扫码连接 App：')
  console.log('')
  qrcode.generate(uri, { small: true }, (qr) => {
    // 缩进对齐输出
    console.log(qr.split('\n').map((l) => '  ' + l).join('\n'))
  })
  console.log('')
  console.log(`  或手动连接：`)
  console.log(`    地址:  ${host}`)
  console.log(`    端口:  ${config.port}`)
  console.log(`    Token: ${config.token}`)
  console.log('')
}
