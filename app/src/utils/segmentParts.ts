export interface Segment {
  type: 'text' | 'reasoning' | 'code' | 'tool_call'
  content: string
  language?: string
}

const THINKING_REGEX = /(?:^|\n)\s*<think>([\s\S]*?)<\/think>/g
const CODE_BLOCK_REGEX = /```(\w+)?\n([\s\S]*?)```/g
const TOOL_CALL_REGEX = /\{"tool":[^}]+"status":[^}]+}/g

function splitByThinking(text: string): { before: string; thinking: string | null; after: string } {
  THINKING_REGEX.lastIndex = 0
  const match = THINKING_REGEX.exec(text)
  if (match) {
    const before = text.slice(0, match.index)
    const after = text.slice(match.index + match[0].length)
    return { before, thinking: match[1].trim(), after }
  }

  const openIdx = text.indexOf('<think>')
  if (openIdx >= 0) {
    const before = text.slice(0, openIdx)
    const thinking = text.slice(openIdx + 7)
    return { before, thinking: thinking.trim(), after: '' }
  }

  return { before: text, thinking: null, after: '' }
}

function splitFirstCodeBlock(text: string): { before: string; code: string | null; language: string; after: string } {
  CODE_BLOCK_REGEX.lastIndex = 0
  const match = CODE_BLOCK_REGEX.exec(text)
  if (!match) return { before: text, code: null, language: '', after: '' }
  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  return { before, code: match[2], language: match[1] || '', after }
}

export function segmentText(text: string): Segment[] {
  const result: Segment[] = []

  let remaining = text

  while (remaining.length > 0) {
    const { before, thinking, after } = splitByThinking(remaining)
    if (thinking) {
      if (before.trim()) {
        result.push(...segmentText(before))
      }
      result.push({ type: 'reasoning', content: thinking })
      remaining = after
      continue
    }

    const codeResult = splitFirstCodeBlock(remaining)
    if (codeResult.code) {
      if (codeResult.before.trim()) {
        result.push({ type: 'text', content: codeResult.before.trim() })
      }
      result.push({ type: 'code', content: codeResult.code, language: codeResult.language || 'text' })
      remaining = codeResult.after
      continue
    }

    if (remaining.trim()) {
      result.push({ type: 'text', content: remaining.trim() })
    }
    break
  }

  return result
}

export function extractThinking(text: string): string | null {
  THINKING_REGEX.lastIndex = 0
  const match = THINKING_REGEX.exec(text)
  return match ? match[1].trim() : null
}

export function stripThinking(text: string): string {
  return text.replace(THINKING_REGEX, '').trim()
}
