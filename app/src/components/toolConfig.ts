export interface ToolDisplayConfig {
  icon: string
  getTitle: (input: any) => string
  getSubtitle?: (input: any) => string | null
  detail: 'input-output' | 'results' | 'diff' | 'full-content' | 'none'
  maxLines?: number
  defaultCollapsed?: boolean
}

function pick(input: any, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = input?.[k]
    if (v != null) return String(v)
  }
}

const extLangMap: Record<string, string> = {
  ts: 'javascript', tsx: 'javascript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', html: 'html',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', swift: 'swift', kt: 'kotlin',
  yml: 'yaml', yaml: 'yaml', toml: 'toml', xml: 'xml',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  sql: 'sql', graphql: 'graphql', prisma: 'prisma',
  dockerfile: 'dockerfile', dart: 'dart', scala: 'scala',
  php: 'php', pl: 'perl', lua: 'lua', r: 'r', mjs: 'javascript', cjs: 'javascript',
  mts: 'typescript', cts: 'typescript', vue: 'html', svelte: 'html',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
  java: 'java', groovy: 'groovy', kts: 'kotlin',
}

export function getLanguageFromPath(filePath?: string): string {
  if (!filePath) return 'text'
  const name = filePath.split('/').pop() || ''
  const base = name.split('.').slice(0, -1).join('.')
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === '00' || !ext) return 'text'
  if (base === '' && extLangMap[ext]) return extLangMap[ext]
  if (extLangMap[ext]) return extLangMap[ext]
  if (name === 'Dockerfile' || name.endsWith('.dockerfile')) return 'dockerfile'
  if (/^\.?\w*rc$/.test(name) || name === '.prettierrc' || name === '.babelrc') return 'json'
  if (name === '.env' || name.startsWith('.env.')) return 'bash'
  return 'text'
}

export function getToolConfig(name: string): ToolDisplayConfig {
  const cfg = registry[name]
  return cfg || defaultConfig
}

const defaultConfig: ToolDisplayConfig = {
  icon: '🔧',
  getTitle: () => '工具调用',
  detail: 'input-output',
  maxLines: 15,
}

const registry: Record<string, ToolDisplayConfig> = {
  read: {
    icon: '📄',
    getTitle: (input) => pick(input, 'filePath', 'path') || '',
    detail: 'none',
  },
  write: {
    icon: '📝',
    getTitle: (input) => pick(input, 'filePath', 'path') || '',
    detail: 'full-content',
    maxLines: 20,
  },
  edit: {
    icon: '✏️',
    getTitle: (input) => pick(input, 'filePath', 'path') || '',
    detail: 'diff',
    maxLines: 20,
    defaultCollapsed: true,
  },
  apply_patch: {
    icon: '✏️',
    getTitle: () => '应用补丁',
    detail: 'diff',
    maxLines: 15,
    defaultCollapsed: true,
  },
  bash: {
    icon: '$',
    getTitle: (input) => input?.command || '',
    getSubtitle: (input) => input?.description || null,
    detail: 'input-output',
    maxLines: 15,
  },
  shell: {
    icon: '$',
    getTitle: (input) => input?.command || '',
    getSubtitle: (input) => input?.description || null,
    detail: 'input-output',
    maxLines: 15,
  },
  glob: {
    icon: '🔍',
    getTitle: (input) => pick(input, 'pattern') || '',
    getSubtitle: (input) => {
      const p = pick(input, 'path')
      return p ? `in ${p}` : null
    },
    detail: 'results',
    maxLines: 15,
  },
  grep: {
    icon: '🔍',
    getTitle: (input) => pick(input, 'pattern') || '',
    getSubtitle: (input) => {
      const p = pick(input, 'path')
      return p ? `in ${p}` : null
    },
    detail: 'results',
    maxLines: 15,
  },
  webfetch: {
    icon: '🌐',
    getTitle: (input) => pick(input, 'url') || '',
    detail: 'none',
  },
  websearch: {
    icon: '🔎',
    getTitle: (input) => pick(input, 'query') || '',
    detail: 'none',
  },
  list: {
    icon: '📂',
    getTitle: (input) => pick(input, 'path') || '',
    detail: 'results',
    maxLines: 15,
  },
  todowrite: {
    icon: '📋',
    getTitle: (input) => {
      const count = input?.todos?.length
      return count != null ? `更新了 ${count} 项待办` : '更新待办'
    },
    detail: 'none',
  },
  question: {
    icon: '❓',
    getTitle: (input) => {
      const qs = input?.questions
      if (qs?.length) return qs[0]?.question || qs[0]?.header || '提问'
      return '提问'
    },
    detail: 'none',
  },
  skill: {
    icon: '🧠',
    getTitle: (input) => pick(input, 'name') || '',
    detail: 'none',
  },
  external_directory: {
    icon: '📁',
    getTitle: (input) => pick(input, 'path') || '',
    detail: 'none',
  },
  lsp: {
    icon: '🔧',
    getTitle: (input) => `${pick(input, 'operation') || ''} ${pick(input, 'filePath', 'path') || ''}`,
    detail: 'none',
  },
  plan_exit: {
    icon: '🚪',
    getTitle: () => '退出计划模式',
    detail: 'none',
  },
}