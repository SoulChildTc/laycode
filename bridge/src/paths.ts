import path from 'path'
import os from 'os'
import fs from 'fs'
import { fileURLToPath } from 'url'

// 所有持久化数据都放在 ~/.laycode 下
export const HOME_DIR = path.join(os.homedir(), '.laycode')
export const CONFIG_PATH = path.join(HOME_DIR, 'config.json')
export const LOG_DIR = path.join(HOME_DIR, 'logs')
export const LOG_PATH = path.join(LOG_DIR, 'bridge.log')
export const PID_PATH = path.join(HOME_DIR, 'bridge.pid')

export function ensureDirs() {
  fs.mkdirSync(HOME_DIR, { recursive: true })
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

// 从包根目录的 package.json 读取版本号，供 --version 与 /health 复用，避免多处硬编码。
export function getVersion(): string {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}
