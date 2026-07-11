import fs from 'fs'
import { LOG_PATH, LOG_DIR, ensureDirs } from './paths.js'

const MAX_SIZE = 5 * 1024 * 1024 // 单个日志文件 5MB 上限
const MAX_FILES = 3               // 保留 bridge.log + .1 + .2

let stream: fs.WriteStream | null = null

function rotateIfNeeded() {
  try {
    const size = fs.statSync(LOG_PATH).size
    if (size < MAX_SIZE) return
  } catch {
    return // 文件不存在，无需轮转
  }
  // bridge.log.(n-1) -> bridge.log.n，再 bridge.log -> bridge.log.1
  for (let i = MAX_FILES - 1; i >= 1; i--) {
    const src = i === 1 ? LOG_PATH : `${LOG_PATH}.${i - 1}`
    const dst = `${LOG_PATH}.${i}`
    try { if (fs.existsSync(src)) fs.renameSync(src, dst) } catch {}
  }
}

function ts(): string {
  return new Date().toISOString()
}

// 初始化日志：把 console.log/error 同时写入文件（守护进程模式下 stdout 可能无人读）
export function initFileLogger() {
  ensureDirs()
  rotateIfNeeded()
  stream = fs.createWriteStream(LOG_PATH, { flags: 'a' })

  const origLog = console.log.bind(console)
  const origErr = console.error.bind(console)

  console.log = (...args: any[]) => {
    const line = `[${ts()}] ${args.map(String).join(' ')}\n`
    stream?.write(line)
    origLog(...args)
  }
  console.error = (...args: any[]) => {
    const line = `[${ts()}] ERROR ${args.map(String).join(' ')}\n`
    stream?.write(line)
    origErr(...args)
  }
}

// 给 morgan 用的写入流
export const morganStream = {
  write: (msg: string) => {
    stream?.write(`[${ts()}] ${msg.trimEnd()}\n`)
  },
}

export function logDir() {
  return LOG_DIR
}
