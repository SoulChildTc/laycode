import path from 'path'
import os from 'os'
import fs from 'fs'

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
