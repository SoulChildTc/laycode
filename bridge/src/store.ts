import fs from 'fs'
import crypto from 'crypto'
import { CONFIG_PATH, ensureDirs } from './paths.js'

// 持久化到 ~/.laycode/config.json 的配置。token 首次生成后固定不变，
// 这样 App 重连时不用每次重新配对。
export interface PersistedConfig {
  token: string
  port: number
}

const DEFAULT_PORT = 8079

function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

export function loadPersistedConfig(): PersistedConfig {
  ensureDirs()
  let stored: Partial<PersistedConfig> = {}
  try {
    stored = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {}

  const config: PersistedConfig = {
    token: stored.token || generateToken(),
    port: stored.port || DEFAULT_PORT,
  }

  // 若首次生成了 token 或缺字段，写回持久化
  if (!stored.token || !stored.port) {
    savePersistedConfig(config)
  }
  return config
}

export function savePersistedConfig(config: PersistedConfig) {
  ensureDirs()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
