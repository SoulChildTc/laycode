import type { FileAttachment, ListItem, Message, UserMsg } from '../types'

export type MessageFile = { url: string; mime: string; filename?: string }

function sameFile(a: MessageFile, b: MessageFile): boolean {
  return a.url === b.url || (!!a.filename && a.filename === b.filename && a.mime === b.mime)
}

function appendFile(files: MessageFile[] | undefined, file: MessageFile): MessageFile[] {
  const next = files || []
  if (next.some((f) => sameFile(f, file))) return next
  return [...next, file]
}

export function mergeMessageText<T extends Message | ListItem>(messages: T[], messageID: string, text: string): T[] {
  const exists = messages.find((m) => m.id === messageID)
  if (exists) {
    return messages.map((m) => m.id === messageID && m.role === 'user' ? { ...m, text } : m) as T[]
  }

  const pendingIdx = messages.findIndex((m) => m.id.startsWith('u-') && m.role === 'user')
  if (pendingIdx >= 0) {
    const copy = [...messages]
    const pending = copy[pendingIdx] as UserMsg
    copy[pendingIdx] = { id: messageID, role: 'user', text, files: pending.files } as T
    return copy as T[]
  }

  return [{ id: messageID, role: 'user', text }, ...messages] as T[]
}

export function mergeAssistantText<T extends Message | ListItem>(messages: T[], messageID: string, text: string): T[] {
  const exists = messages.find((m) => m.id === messageID)
  if (exists) {
    return messages.map((m) => m.id === messageID && m.role === 'assistant'
      ? { ...m, content: text, reasoning: { ...m.reasoning, isActive: false } }
      : m
    ) as T[]
  }

  const filtered = messages.filter((m) => !m.id.startsWith('loading-'))
  return [{ id: messageID, role: 'assistant', reasoning: { text: '', isActive: false }, content: text, toolCalls: [] }, ...filtered] as T[]
}

export function mergeMessageFile<T extends Message | ListItem>(messages: T[], messageID: string, file: MessageFile): T[] {
  const exists = messages.findIndex((m) => m.id === messageID)
  if (exists >= 0) {
    const existing = messages[exists]
    if (existing.role !== 'user' && existing.role !== 'assistant') return messages
    const copy = [...messages]
    copy[exists] = { ...existing, files: appendFile(existing.files, file) } as T
    return copy as T[]
  }

  const pendingIdx = messages.findIndex((m) => m.id.startsWith('u-') && m.role === 'user')
  if (pendingIdx >= 0) {
    const copy = [...messages]
    const pending = copy[pendingIdx] as UserMsg
    copy[pendingIdx] = { ...pending, files: appendFile(pending.files, file) } as T
    return copy as T[]
  }

  return messages
}

export function canSendMessage(input: string, attachments: FileAttachment[]): boolean {
  return input.trim().length > 0 || attachments.length > 0
}
