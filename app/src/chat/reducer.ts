import type { ChatAction, ChatState } from './types'

// 聊天页领域状态的唯一入口：纯函数，(state, action) => 新 state。
// 现阶段只承接权限/提问四个动作（步骤 1）；其余逻辑仍在 SessionScreen 中，
// 后续步骤逐块搬入，每搬一块行为不变、可独立验证。
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'permission/asked': {
      const req = action.request
      if (state.pendingPermissions.some((p) => p.id === req.id)) return state
      return { ...state, pendingPermissions: [...state.pendingPermissions, req] }
    }

    case 'permission/removed': {
      const next = state.pendingPermissions.filter((p) => p.id !== action.id)
      if (next.length === state.pendingPermissions.length) return state
      return { ...state, pendingPermissions: next }
    }

    case 'question/asked': {
      const req = action.request
      if (state.pendingQuestions.some((q) => q.id === req.id)) return state
      return { ...state, pendingQuestions: [...state.pendingQuestions, req] }
    }

    case 'question/removed': {
      const next = state.pendingQuestions.filter((q) => q.id !== action.id)
      if (next.length === state.pendingQuestions.length) return state
      return { ...state, pendingQuestions: next }
    }

    case 'session/sending': {
      if (state.sending === action.sending) return state
      return { ...state, sending: action.sending }
    }

    case 'banner/set': {
      const cur = state.banner
      const next = action.banner
      // 内容相同则返回原引用（null↔null、或 text+bg 均相同）。
      if (cur === next) return state
      if (cur && next && cur.text === next.text && cur.bg === next.bg) return state
      return { ...state, banner: next }
    }

    default:
      return state
  }
}
