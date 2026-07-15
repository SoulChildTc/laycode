#!/usr/bin/env node
// 一键发版：升级 laycode-cli 版本 → 构建 → 发布到 npm → 提交版本号并打 tag。
// 用法：node scripts/release.mjs <patch|minor|major> [--dry-run]
// 前提：工作区须干净（业务代码先自行提交）；push 由你手动执行。
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import readline from 'readline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const bump = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('用法：pnpm release:bridge <patch|minor|major> [--dry-run]')
  process.exit(1)
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit' })
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim()
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(/^y(es)?$/i.test(answer.trim()))
    })
  })
}

function readVersion(pkgRelPath) {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, pkgRelPath), 'utf-8'))
  return pkg.version
}

const bridgeVer = readVersion('../bridge/package.json')

function nextVersion(current, kind) {
  const [maj, min, pat] = current.split('.').map((n) => parseInt(n, 10))
  if (kind === 'major') return `${maj + 1}.0.0`
  if (kind === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

const NPM_REGISTRY = 'https://registry.npmjs.org/'

// dry-run：不写版本号、不发布，但照常构建（幂等，只刷新 dist，让演练更接近真实）。
if (dryRun) {
  const preview = nextVersion(bridgeVer, bump)
  console.log(`\n[dry-run] 当前版本 ${bridgeVer} → 将 bump 到 ${preview}（未写盘）`)
  run('pnpm', ['--filter', 'laycode-cli', 'build'])
  run('pnpm', ['--filter', 'laycode-cli', 'publish', '--access', 'public', '--no-git-checks', '--registry', NPM_REGISTRY, '--dry-run'])
  console.log(`\n✅ 演练完成（${bump}，dry-run，未修改版本、未发布）`)
  process.exit(0)
}

// 前置校验：工作区必须干净。否则自动 commit 会把未提交的业务改动一起裹进 release 提交。
if (git(['status', '--porcelain'])) {
  console.error('工作区有未提交的改动，拒绝发版。')
  console.error('请先提交（或暂存）你的业务代码，再运行发版。')
  process.exit(1)
}

// 发布摘要：先展示当前 / 目标版本，让用户看清再决定，然后才真正升版号。
const targetVer = nextVersion(bridgeVer, bump)
console.log('\n──────── 发布 laycode-cli ────────')
console.log(`  当前版本：${bridgeVer}`)
console.log(`  升级类型：${bump}`)
console.log(`  目标版本：${targetVer}`)
console.log(`  发布到：  ${NPM_REGISTRY}`)
console.log('──────────────────────────────────')

const proceed = await confirm(`\n确认升级到 ${targetVer} 并发布？(y/N) `)
if (!proceed) {
  console.error('已取消，未做任何修改。')
  process.exit(0)
}

// 1. 升级版本号
run('pnpm', ['--filter', 'laycode-cli', 'exec', 'npm', 'version', bump, '--no-git-tag-version'])
const newVer = readVersion('../bridge/package.json')

// 2~3. 构建 + 发布。任一步失败（或用户取消）则把版本号回滚到 bump 前（此时尚未 commit/tag，历史仍干净）。
function rollback() {
  console.error(`\n正在回滚版本号到 ${bridgeVer}...`)
  try {
    run('pnpm', ['--filter', 'laycode-cli', 'exec', 'npm', 'version', bridgeVer, '--no-git-tag-version', '--allow-same-version'])
    console.error(`已回滚版本号到 ${bridgeVer}。`)
  } catch {
    console.error(`⚠️ 版本号回滚失败，请手动把 bridge/package.json 的 version 改回 ${bridgeVer}。`)
  }
}

try {
  run('pnpm', ['--filter', 'laycode-cli', 'build'])

  // 发布前最终确认：这是唯一不可逆的一步。
  const ok = await confirm(`\n构建完成，即将发布 laycode-cli@${newVer} 到 ${NPM_REGISTRY}\n确认发布？(y/N) `)
  if (!ok) {
    console.error('已取消发布。')
    rollback()
    process.exit(1)
  }

  // 显式指定官方 registry：很多人本地默认源是镜像（如淘宝），会导致发布失败或发错地址。
  run('pnpm', ['--filter', 'laycode-cli', 'publish', '--access', 'public', '--no-git-checks', '--registry', NPM_REGISTRY])
} catch (err) {
  console.error(`\n❌ 发布失败`)
  rollback()
  process.exit(1)
}

// 4. 发布成功后再提交版本号并打 tag（成功才落历史，push 由你手动执行）。
run('git', ['-C', repoRoot, 'add', 'bridge/package.json'])
run('git', ['-C', repoRoot, 'commit', '-m', `chore(bridge): bump version to v${newVer}`])
run('git', ['-C', repoRoot, 'tag', `v${newVer}`])

console.log(`\n✅ 发布完成（${bump} → v${newVer}）：已发布到 npm、已提交并打 tag v${newVer}。`)
console.log('\n╭──────────────── 接下来手动执行 ────────────────╮')
console.log('│                                                │')
console.log('│   git push && git push --tags                  │')
console.log('│                                                │')
console.log('╰────────────────────────────────────────────────╯\n')
