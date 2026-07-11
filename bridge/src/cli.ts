#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { PID_PATH, LOG_PATH, ensureDirs, getVersion } from './paths.js'

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 轮询健康检查端点，确认服务真的起来了（而不是 spawn 后乐观假设）。
async function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const ctl = AbortSignal.timeout(1000)
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { signal: ctl })
      if (res.ok) return true
    } catch {}
    await sleep(300)
  }
  return false
}

// 轮询确认进程已退出。
async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isRunning(pid)) return true
    await sleep(200)
  }
  return !isRunning(pid)
}

// 前台运行：直接引入 index.js（import 即启动服务），并开启文件日志
async function cmdRun() {
  const { initFileLogger } = await import('./logger.js')
  initFileLogger()
  await import('./index.js')
}

// 后台运行：spawn 一个 detached 的 `run` 子进程，等健康检查通过后再报成功
async function cmdStart(extraArgs: string[]) {
  ensureDirs()
  const existing = readPid()
  if (existing && isRunning(existing)) {
    console.log(`LayCode bridge 已在运行 (pid ${existing})`)
    return
  }

  const { parseArgs } = await import('./config.js')
  const { printPairing } = await import('./qr.js')
  const config = parseArgs()

  const out = fs.openSync(LOG_PATH, 'a')
  const err = fs.openSync(LOG_PATH, 'a')
  const child = spawn(process.execPath, [path.join(__dirname, 'cli.js'), 'run', ...extraArgs], {
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true, // Windows 下不弹出控制台黑框
  })
  child.unref()
  if (!child.pid) {
    console.error('启动失败：无法创建后台进程')
    process.exit(1)
  }
  fs.writeFileSync(PID_PATH, String(child.pid))

  process.stdout.write('正在启动 LayCode bridge...')
  const healthy = await waitForHealth(config.port, 15000)
  process.stdout.write('\n')

  if (!healthy) {
    // 服务没起来：可能端口被占、opencode 未安装等。清理现场并给出可诊断的提示。
    try { if (isRunning(child.pid)) process.kill(child.pid, 'SIGTERM') } catch {}
    try { fs.unlinkSync(PID_PATH) } catch {}
    console.error(`启动失败：服务未在预期时间内就绪`)
    console.error(`请查看日志排查：laycode-cli logs`)
    console.error(`日志路径：${LOG_PATH}`)
    process.exit(1)
  }

  console.log(`LayCode bridge 已在后台启动 (pid ${child.pid})`)
  console.log(`日志: ${LOG_PATH}`)
  printPairing(config)
}

async function cmdStop() {
  const pid = readPid()
  if (!pid || !isRunning(pid)) {
    console.log('LayCode bridge 未在运行')
    try { fs.unlinkSync(PID_PATH) } catch {}
    return
  }

  if (process.platform === 'win32') {
    // Windows 不支持 POSIX 信号的优雅关闭，用 taskkill /T 终止整个进程树（含 opencode 子进程）
    try {
      const { execFileSync } = await import('child_process')
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'pipe' })
    } catch (err: any) {
      console.error(`停止失败: ${err.message}`)
      process.exit(1)
    }
    await waitForExit(pid, 5000)
    if (isRunning(pid)) {
      console.error(`停止失败：进程 ${pid} 仍在运行`)
      process.exit(1)
    }
    try { fs.unlinkSync(PID_PATH) } catch {}
    console.log(`已停止 LayCode bridge (pid ${pid})`)
    return
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch (err: any) {
    console.error(`停止失败: ${err.message}`)
    process.exit(1)
  }

  // 等待优雅退出（关 mDNS/WS/opencode 需要时间），超时则 SIGKILL 兜底
  const exited = await waitForExit(pid, 10000)
  if (!exited) {
    console.log('优雅退出超时，强制结束...')
    try { process.kill(pid, 'SIGKILL') } catch {}
    await waitForExit(pid, 2000)
  }

  if (isRunning(pid)) {
    console.error(`停止失败：进程 ${pid} 仍在运行`)
    process.exit(1)
  }

  try { fs.unlinkSync(PID_PATH) } catch {}
  console.log(`已停止 LayCode bridge (pid ${pid})`)
}

function cmdStatus() {
  const pid = readPid()
  if (pid && isRunning(pid)) {
    console.log(`运行中 (pid ${pid})`)
  } else {
    console.log('未运行')
  }
}

// 跟踪日志：不依赖系统 tail，用 fs.watch 监听文件增长后追加读取
function cmdLogs(follow: boolean) {
  if (!fs.existsSync(LOG_PATH)) {
    console.log('暂无日志')
    return
  }
  process.stdout.write(fs.readFileSync(LOG_PATH, 'utf-8'))
  if (!follow) return

  let pos = fs.statSync(LOG_PATH).size
  const watcher = fs.watch(LOG_PATH, () => {
    try {
      const size = fs.statSync(LOG_PATH).size
      if (size < pos) pos = 0 // 文件被轮转/截断，从头读
      if (size > pos) {
        const stream = fs.createReadStream(LOG_PATH, { start: pos, end: size })
        stream.on('data', (chunk) => process.stdout.write(chunk))
        pos = size
      }
    } catch {}
  })
  process.on('SIGINT', () => { watcher.close(); process.exit(0) })
}

function usage() {
  console.log(`laycode-cli ${getVersion()} — LayCode 桥接服务

用法:
  laycode-cli                无参数默认后台启动（等同 start）
  laycode-cli run            前台运行（Ctrl+C 停止）
  laycode-cli start          后台运行（守护进程）
  laycode-cli stop           停止后台服务
  laycode-cli status         查看运行状态
  laycode-cli logs [-f]      查看日志（-f 持续跟踪）

选项（可跟在 run/start 后）:
  --port <n>       指定端口（默认持久化配置或 8079）
  --token <t>      指定 token（默认使用持久化的强 token）
  --opencode-url   连接外部 opencode 实例

  -v, --version    显示版本号
  -h, --help       显示帮助`)
}

const argv = process.argv.slice(2)
const [cmd, ...rest] = argv

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
  case 'version':
  case '--version':
  case '-v':
    console.log(getVersion())
    break
  case 'help':
  case '--help':
  case '-h':
    usage()
    break
  default:
    if (cmd !== undefined && !cmd.startsWith('-')) {
      // 拼错的未知子命令：报错并提示用法
      console.error(`未知命令: ${cmd}\n`)
      usage()
      process.exit(1)
    }
    // 无参数，或直接跟选项（如 `laycode-cli --token xxx`）：默认后台启动
    cmdStart(argv)
    break
}
