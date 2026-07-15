import type { Message, Part } from '@opencode-ai/sdk/v2'
import type { V2Action, V2State } from './v2Types'

// 与官方一致：这些 part 不进 UI 消息流（步骤边界 / patch 内部件）。
const SKIP_PARTS = new Set(['patch', 'step-start', 'step-finish'])

// 二分查找有序数组中 id 的位置。返回 { found, index }：
// found=true 时 index 为命中下标；found=false 时 index 为应插入的位置（保持有序）。
function bisect<T>(list: T[], id: string, getId: (item: T) => string): { found: boolean; index: number } {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const midId = getId(list[mid])
    if (midId === id) return { found: true, index: mid }
    if (midId < id) lo = mid + 1
    else hi = mid
  }
  return { found: false, index: lo }
}

// 有序插入或替换（不可变）。
function upsertById<T>(list: T[], item: T, getId: (item: T) => string): T[] {
  const { found, index } = bisect(list, getId(item), getId)
  const next = list.slice()
  if (found) next[index] = item
  else next.splice(index, 0, item)
  return next
}

// V2 消息状态 reducer。纯函数，逻辑 1:1 对照官方 opencode event-reducer，
// 用不可变更新替代 SolidJS 的 produce/reconcile。
export function v2Reducer(state: V2State, action: V2Action): V2State {
  switch (action.type) {
    case 'message.upsert': {
      const msg = action.message
      return { ...state, messages: upsertById(state.messages, msg, (m) => m.id) }
    }

    case 'message.remove': {
      const { messageID } = action
      const { found, index } = bisect(state.messages, messageID, (m) => m.id)
      const messages = found
        ? [...state.messages.slice(0, index), ...state.messages.slice(index + 1)]
        : state.messages
      // 连带删除该消息的 part 与其 delta 累积。
      const removedParts = state.parts[messageID]
      const parts = { ...state.parts }
      delete parts[messageID]
      let partDelta = state.partDelta
      if (removedParts && removedParts.length > 0) {
        partDelta = { ...state.partDelta }
        for (const p of removedParts) delete partDelta[p.id]
      }
      if (messages === state.messages && !removedParts) return state
      return { ...state, messages, parts, partDelta }
    }

    case 'part.upsert': {
      const part = action.part
      if (SKIP_PARTS.has(part.type)) return state
      const list = state.parts[part.messageID] ?? []
      const nextList = upsertById(list, part, (p) => p.id)
      // 收到完整 part 时清掉它的 delta 累积（完整值已覆盖增量）。
      let partDelta = state.partDelta
      if (partDelta[part.id] != null) {
        partDelta = { ...state.partDelta }
        delete partDelta[part.id]
      }
      return { ...state, parts: { ...state.parts, [part.messageID]: nextList }, partDelta }
    }

    case 'part.remove': {
      const { messageID, partID } = action
      const list = state.parts[messageID]
      if (!list) return state
      const { found, index } = bisect(list, partID, (p) => p.id)
      if (!found) return state
      const nextList = [...list.slice(0, index), ...list.slice(index + 1)]
      const parts = { ...state.parts }
      if (nextList.length === 0) delete parts[messageID]
      else parts[messageID] = nextList
      let partDelta = state.partDelta
      if (partDelta[partID] != null) {
        partDelta = { ...state.partDelta }
        delete partDelta[partID]
      }
      return { ...state, parts, partDelta }
    }

    case 'part.delta': {
      const { messageID, partID, field, delta } = action
      const list = state.parts[messageID]
      if (!list) return state
      const { found, index } = bisect(list, partID, (p) => p.id)
      if (!found) return state
      const part = list[index]
      const current = (part as Record<string, unknown>)[field]
      const base = state.partDelta[partID] ?? (typeof current === 'string' ? current : '')
      const accumulated = base + delta
      // 同步更新累积表与 part 上对应字段（两者保持一致，渲染读 part 即可）。
      const nextPart = { ...part, [field]: ((typeof current === 'string' ? current : '') + delta) } as Part
      const nextList = list.slice()
      nextList[index] = nextPart
      return {
        ...state,
        parts: { ...state.parts, [messageID]: nextList },
        partDelta: { ...state.partDelta, [partID]: accumulated },
      }
    }

    case 'hydrate': {
      return { messages: action.messages, parts: action.parts, partDelta: {} }
    }

    case 'reset': {
      return initialV2StateRef
    }

    default:
      return state
  }
}

// reset 复用同一个空对象引用，避免每次生成新对象。
const initialV2StateRef: V2State = { messages: [], parts: {}, partDelta: {} }
