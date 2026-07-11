#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { PID_PATH, LOG_PATH, ensureDirs } from './paths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

function readPid(): number | null {
  try {
    const pid = parseInt(fs.readFileSync(PID_PATH, 'utf-8').trim(), 10)
    return Number.isFinite(pid) ? pid : null
  } catch { return null }
}

// 前台运行：直接引入 index.js（import 即启动服务），并开启文件日志
async function cmdRun() {
  const { initFileLogger } = await import('./logger.js')
  initFileLogger()
  await import('./index.js')
}

// 后台运行：spawn 一个 detached 的 `run` 子进程，写 PID 文件
function cmdStart(extraArgs: string[]) {
  ensureDirs()
  const existing = readPid()
  if (existing && isRunning(existing)) {
    console.log(`LayCode bridge 已在运行 (pid ${existing})`)
    return
  }
  const out = fs.openSync(LOG_PATH, 'a')
  const err = fs.openSync(LOG_PATH, 'a')
  const child = spawn(process.execPath, [path.join(__dirname, 'cli.js'), 'run', ...extraArgs], {
    detached: true,
    stdio: ['ignore', out, err],
  })
  child.unref()
  if (child.pid) fs.writeFileSync(PID_PATH, String(child.pid))
  console.log(`LayCode bridge 已在后台启动 (pid ${child.pid})`)
  console.log(`日志: ${LOG_PATH}`)
}

function cmdStop() {
  const pid = readPid()
  if (!pid || !isRunning(pid)) {
    console.log('LayCode bridge 未在运行')
    try { fs.unlinkSync(PID_PATH) } catch {}
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
    console.log(`已停止 LayCode bridge (pid ${pid})`)
  } catch (err: any) {
    console.error(`停止失败: ${err.message}`)
  }
  try { fs.unlinkSync(PID_PATH) } catch {}
}

function cmdStatus() {
  const pid = readPid()
  if (pid && isRunning(pid)) {
    console.log(`运行中 (pid ${pid})`)
  } else {
    console.log('未运行')
  }
}

function cmdLogs(follow: boolean) {
  if (!fs.existsSync(LOG_PATH)) {
    console.log('暂无日志')
    return
  }
  if (follow) {
    const tail = spawn('tail', ['-f', LOG_PATH], { stdio: 'inherit' })
    process.on('SIGINT', () => { tail.kill(); process.exit(0) })
  } else {
    process.stdout.write(fs.readFileSync(LOG_PATH, 'utf-8'))
  }
}

function usage() {
  console.log(`laycode-cli — LayCode 桥接服务

用法:
  laycode-cli run            前台运行（Ctrl+C 停止）
  laycode-cli start          后台运行（守护进程）
  laycode-cli stop           停止后台服务
  laycode-cli status         查看运行状态
  laycode-cli logs [-f]      查看日志（-f 持续跟踪）

选项（可跟在 run/start 后）:
  --port <n>       指定端口（默认持久化配置或 8079）
  --token <t>      指定 token（默认使用持久化的强 token）
  --opencode-url   连接外部 opencode 实例`)
}

const [cmd, ...rest] = process.argv.slice(2)

switch (cmd) {
  case 'run':
    cmdRun()
    break
  case 'start':
    cmdStart(rest)
    break
  case 'stop':
    cmdStop()
    break
  case 'status':
    cmdStatus()
    break
  case 'logs':
    cmdLogs(rest.includes('-f') || rest.includes('--follow'))
    break
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    usage()
    break
  default:
    console.error(`未知命令: ${cmd}\n`)
    usage()
    process.exit(1)
}
