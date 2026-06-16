import { execSync } from 'child_process'

export interface GitStatusItem {
  path: string
  status: string
}

export interface GitStatus {
  staged: GitStatusItem[]
  unstaged: GitStatusItem[]
  notRepo?: boolean
}

function execGit(directory: string, args: string[]): { stdout: string; stderr: string } {
  try {
    const stdout = execSync('git ' + args.join(' '), {
      cwd: directory,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout, stderr: '' }
  } catch (err: any) {
    if (err.stderr?.includes('not a git repository')) {
      return { stdout: '', stderr: 'not a git repository' }
    }
    throw err
  }
}

function checkGitExists(): boolean {
  try {
    execSync('git --version', { encoding: 'utf-8', stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function getStatus(directory: string): GitStatus {
  if (!checkGitExists()) {
    throw new Error('git not found')
  }

  const { stdout, stderr } = execGit(directory, ['status', '--porcelain'])

  if (stderr === 'not a git repository') {
    return { staged: [], unstaged: [], notRepo: true }
  }

  const staged: GitStatusItem[] = []
  const unstaged: GitStatusItem[] = []

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const xy = line.slice(0, 2)
    const path = line.slice(2).trimStart()
    const stagedStatus = xy[0]
    const unstagedStatus = xy[1]

    if (stagedStatus !== ' ' && stagedStatus !== '?') {
      let status = stagedStatus
      if (stagedStatus === 'R' || stagedStatus === 'C') {
        const parts = path.split(' -> ')
        staged.push({ path: parts[parts.length - 1], status })
      } else {
        staged.push({ path, status })
      }
    }

    if (unstagedStatus !== ' ' && unstagedStatus !== '?') {
      unstaged.push({ path, status: unstagedStatus })
    }

    if (stagedStatus === '?' && unstagedStatus === '?') {
      unstaged.push({ path, status: '??' })
    }
  }

  return { staged, unstaged, notRepo: false }
}

export function initRepo(directory: string): void {
  if (!checkGitExists()) {
    throw new Error('git not found')
  }
  execSync('git init', { cwd: directory, encoding: 'utf-8', stdio: 'pipe', timeout: 10000 })
}

export function getDiff(directory: string, file: string, cached?: boolean): string {
  if (!checkGitExists()) {
    throw new Error('git not found')
  }

  const args = ['diff']
  if (cached) args.push('--cached')
  args.push('--', file)

  const { stdout } = execGit(directory, args)
  return stdout
}

export function stageFile(directory: string, file?: string): void {
  if (!checkGitExists()) {
    throw new Error('git not found')
  }

  const files = file || '.'
  execSync(`git add ${files}`, { cwd: directory, encoding: 'utf-8', stdio: 'pipe', timeout: 10000 })
}

export function unstageFile(directory: string, file?: string): void {
  if (!checkGitExists()) {
    throw new Error('git not found')
  }

  const files = file || '.'
  execSync(`git reset HEAD -- ${files}`, { cwd: directory, encoding: 'utf-8', stdio: 'pipe', timeout: 10000 })
}

export function discardFile(directory: string, file?: string): void {
  if (!checkGitExists()) {
    throw new Error('git not found')
  }

  const files = file || '.'
  execSync(`git restore ${files}`, { cwd: directory, encoding: 'utf-8', stdio: 'pipe', timeout: 10000 })
}

export function commit(directory: string, message: string): void {
  if (!checkGitExists()) {
    throw new Error('git not found')
  }

  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
    cwd: directory,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 10000,
  })
}
