#!/usr/bin/env node
// 一键发版：校验版本一致 → 统一升级所有 workspace 包的版本 → 构建 → 按依赖顺序发布到 npm。
// 用法：node scripts/release.mjs <patch|minor|major> [--dry-run]
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bump = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('用法：pnpm release <patch|minor|major> [--dry-run]')
  process.exit(1)
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit' })
}

function readVersion(pkgRelPath) {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, pkgRelPath), 'utf-8'))
  return pkg.version
}

// 护栏：两个发布包版本必须一致，否则发布出来 laycode 会依赖错位的 laycode-cli。
const bridgeVer = readVersion('../bridge/package.json')
const aliasVer = readVersion('../laycode-alias/package.json')
if (bridgeVer !== aliasVer) {
  console.error(`版本不一致，拒绝发版：`)
  console.error(`  bridge (laycode-cli): ${bridgeVer}`)
  console.error(`  laycode-alias (laycode): ${aliasVer}`)
  console.error(`请先把两个 package.json 的 version 改成同一个值再发版。`)
  process.exit(1)
}

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
  console.log(`\n[dry-run] 当前版本 ${bridgeVer}（两包一致）→ 将 bump 到 ${preview}（未写盘）`)
  run('pnpm', ['--filter', 'laycode-cli', 'build'])
  run('pnpm', ['publish', '-r', '--access', 'public', '--no-git-checks', '--registry', NPM_REGISTRY, '--dry-run'])
  console.log(`\n✅ 演练完成（${bump}，dry-run，未修改版本、未发布）`)
  process.exit(0)
}

// 1. 统一升级所有包版本（别名包依赖用 workspace:*，发布时自动填真实版本，无需手动同步）
run('pnpm', ['-r', 'exec', 'npm', 'version', bump, '--no-git-tag-version'])

// 2~3. 构建 + 发布。任一步失败则把版本号回滚到 bump 前，避免留下已改版本却未发布的脏状态。
try {
  run('pnpm', ['--filter', 'laycode-cli', 'build'])
  // 显式指定官方 registry：很多人本地默认源是镜像（如淘宝），会导致发布失败或发错地址。
  run('pnpm', ['publish', '-r', '--access', 'public', '--no-git-checks', '--registry', NPM_REGISTRY])
} catch (err) {
  console.error(`\n❌ 发布失败，正在回滚版本号到 ${bridgeVer}...`)
  try {
    run('pnpm', ['-r', 'exec', 'npm', 'version', bridgeVer, '--no-git-tag-version', '--allow-same-version'])
    console.error(`已回滚版本号到 ${bridgeVer}。`)
  } catch {
    console.error(`⚠️ 版本号回滚失败，请手动把各 package.json 的 version 改回 ${bridgeVer}。`)
  }
  process.exit(1)
}

console.log(`\n✅ 发布完成（${bump}）`)
