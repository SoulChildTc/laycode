#!/usr/bin/env node
// laycode 是 laycode-cli 的别名：解析出已安装的 laycode-cli 可执行入口，
// 透传全部参数、stdio 与退出码，行为与直接运行 laycode-cli 完全一致。
import { spawn } from 'child_process'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)

function resolveCliEntry() {
  // 从 laycode-cli 的 package.json 读出它声明的 bin，指向真实 CLI 文件
  const pkgPath = require.resolve('laycode-cli/package.json')
  const pkg = require('laycode-cli/package.json')
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['laycode-cli']
  if (!bin) {
    throw new Error('laycode-cli 未声明 bin 入口')
  }
  return path.join(path.dirname(pkgPath), bin)
}

let entry
try {
  entry = resolveCliEntry()
} catch (err) {
  console.error(`无法定位 laycode-cli：${err.message}`)
  console.error('请确认 laycode-cli 已作为依赖安装。')
  process.exit(1)
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
