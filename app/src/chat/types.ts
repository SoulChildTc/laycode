import type { PermissionRequest, QuestionRequest } from '../types'

// 顶部横幅：连接/会话状态提示（错误、重连、压缩中、重试…）。
export interface Banner {
  text: string
  bg?: string
}

// 聊天页的会话级状态（消息流由独立的 v2Reducer 管理）。
export interface ChatState {
  sending: boolean
  banner: Banner | null
  pendingPermissions: PermissionRequest[]
  pendingQuestions: QuestionRequest[]
}

export const initialChatState: ChatState = {
  sending: false,
  banner: null,
  pendingPermissions: [],
  pendingQuestions: [],
}

// Action 用领域语义命名，刻意不带 V1/V2 协议痕迹。
// 「SSE 事件 → action」的翻译在别处；reducer 只认这些语义动作。
export type ChatAction =
  // ---- 权限（步骤 1）----
  | { type: 'permission/asked'; request: PermissionRequest }
  | { type: 'permission/removed'; id: string }
  // ---- 提问（步骤 1）----
  | { type: 'question/asked'; request: QuestionRequest }
  | { type: 'question/removed'; id: string }
  // ---- 会话状态（步骤 2）----
  | { type: 'session/sending'; sending: boolean }
  | { type: 'banner/set'; banner: Banner | null }
