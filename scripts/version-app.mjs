#!/usr/bin/env node
// 升级 App 版本号：同步 app/package.json 与 app/app.json 的 version → 提交并打 tag。
// 用法：pnpm version:app <patch|minor|major> [--dry-run]
// 只改版本号，不发布（App 产物走 EAS build，build number 交给 EAS 自动管理）。
// 前提：工作区须干净（业务代码先自行提交）；push 由你手动执行。
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const pkgPath = path.join(repoRoot, 'app/package.json')
const appJsonPath = path.join(repoRoot, 'app/app.json')

const bump = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('用法：pnpm version:app <patch|minor|major> [--dry-run]')
  process.exit(1)
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim()
}

function nextVersion(current, kind) {
  const [maj, min, pat] = current.split('.').map((n) => parseInt(n, 10))
  if (kind === 'major') return `${maj + 1}.0.0`
  if (kind === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'))
const pkgVer = pkg.version
const expoVer = appJson.expo?.version

// 两处版本号平时应一致；不一致先提示，避免升错基准。
if (expoVer !== pkgVer) {
  console.error(`⚠️ 版本号不一致：app/package.json=${pkgVer}，app/app.json=${expoVer}`)
  console.error('请先手动对齐两处版本号，再运行。')
  process.exit(1)
}

const newVer = nextVersion(pkgVer, bump)

if (dryRun) {
  console.log(`[dry-run] App 版本 ${pkgVer} → ${newVer}（未写盘、未提交）`)
  process.exit(0)
}

// 前置校验：工作区必须干净，否则自动 commit 会裹进未提交的业务改动。
if (git(['status', '--porcelain'])) {
  console.error('工作区有未提交的改动，拒绝执行。请先提交业务代码。')
  process.exit(1)
}

console.log('\n──────── 升级 App 版本号 ────────')
console.log(`  当前版本：${pkgVer}`)
console.log(`  升级类型：${bump}`)
console.log(`  目标版本：${newVer}`)
console.log('──────────────────────────────────')

// 同步写两处版本号，保留原缩进（2 空格）。
pkg.version = newVer
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
appJson.expo.version = newVer
writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n')

git(['add', 'app/package.json', 'app/app.json'])
git(['commit', '-m', `chore(app): bump version to v${newVer}`])
git(['tag', `app-v${newVer}`])

console.log(`\n✅ App 版本已升到 v${newVer}：已提交并打 tag app-v${newVer}。`)
console.log('\n╭──────────────── 接下来手动执行 ────────────────╮')
console.log('│                                                │')
console.log('│   git push && git push --tags                  │')
console.log('│                                                │')
console.log('╰────────────────────────────────────────────────╯\n')
