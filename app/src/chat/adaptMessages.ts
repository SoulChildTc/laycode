import type { Message as V2Message, Part as V2Part } from '@opencode-ai/sdk/v2'
import type { ListItem, ToolCall, AssistantMsg, UserMsg, CompactionMsg } from '../types'
import { mapToolStatus } from '../types'
import { stripThinking } from '../utils/segmentParts'

// V2 (Message + parts[]) → 现有渲染模型 (ListItem)。
// 让新数据模型无需改动渲染组件即可复用现有 UI。字段映射对齐旧 parseMessages 的行为。
//
// 一条消息的 part 分布：
//   user      → text part（正文）+ file part（附件）
//   assistant → reasoning part（推理）+ text part（正文，多段拼接）+ tool part（工具调用）+ file part（产物）

type MsgFile = { url: string; mime: string; filename?: string }

function fileFromPart(p: any): MsgFile {
  return { url: p.url, mime: p.mime, filename: p.filename }
}

function toolFromPart(p: any): ToolCall {
  return {
    id: p.id,
    name: p.tool || p.name || '',
    status: mapToolStatus(p.state?.status || 'completed'),
    input: p.state?.input,
    output: p.state?.output,
    metadata: { ...(p.state?.metadata || {}), ...(p.metadata || {}) },
  }
}

function formatError(error: any): string {
  const name = error?.name || ''
  const message = error?.data?.message || error?.message || ''
  const parts = [name, message].filter(Boolean)
  return parts.join(' ') || 'Unknown error'
}

// 单条 V2 消息 + 它的 parts → 一个 ListItem。
export function adaptMessage(message: V2Message, parts: V2Part[]): ListItem {
  const info = message as any
  const role = info.role || 'assistant'
  const list = parts || []

  // compaction part → 独立的分隔项（与官方一致：compaction 是 part，不是特殊消息）。
  // 渲染层只用 reason 显示「自动/手动压缩」徽章，summary/recent 未使用故留空。
  const compactionPart = list.find((p) => p.type === 'compaction') as any
  if (compactionPart) {
    const msg: CompactionMsg = {
      id: message.id,
      role: 'compaction',
      reason: compactionPart.auto ? 'auto' : 'manual',
      summary: '',
      recent: '',
    }
    return msg
  }

  if (role === 'user') {
    const textPart = list.find((p) => p.type === 'text') as any
    const fileParts = list.filter((p) => p.type === 'file')
    const msg: UserMsg = {
      id: message.id,
      role: 'user',
      text: textPart?.text || '',
      files: fileParts.map(fileFromPart),
      time: info.time,
    }
    return msg
  }

  const reasoningPart = list.find((p) => p.type === 'reasoning') as any
  const textParts = list.filter((p) => p.type === 'text') as any[]
  const toolParts = list.filter((p) => p.type === 'tool')
  const fileParts = list.filter((p) => p.type === 'file')
  const errorInfo = info.error
  const errorContent = errorInfo ? `⚠️ ${formatError(errorInfo)}` : ''

  const msg: AssistantMsg = {
    id: message.id,
    role: 'assistant',
    reasoning: {
      text: reasoningPart?.text || '',
      // reasoning 未结束（无 time.end）视为 active，用于「思考中」动画。
      isActive: !!reasoningPart && !reasoningPart.time?.end,
    },
    content: errorContent || stripThinking(textParts.map((p) => p.text || '').join('')),
    toolCalls: toolParts.map(toolFromPart),
    files: fileParts.map(fileFromPart),
    time: info.time,
  }
  return msg
}

// 整个会话：有序 messages + 按 messageID 分组的 parts → 渲染用的 ListItem[]。
// 返回顺序与 messages 一致（升序）。SessionScreen 的 FlatList 是 inverted，
// 由调用方决定是否 reverse（与现状 setMessages(m.reverse()) 保持一致）。
export function adaptMessages(
  messages: V2Message[],
  parts: Record<string, V2Part[]>,
): ListItem[] {
  return messages.map((m) => adaptMessage(m, parts[m.id] || []))
}
