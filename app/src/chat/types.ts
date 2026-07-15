import type { ListItem, PermissionRequest, QuestionRequest } from '../types'

// 顶部横幅：连接/会话状态提示（错误、重连、压缩中、重试…）。
export interface Banner {
  text: string
  bg?: string
}

// 聊天页的领域状态。这是「消息区 + 会话状态」的唯一真相源。
// 不含纯视图细节（滚动位置、Modal 开关等），那些留在组件里。
export interface ChatState {
  messages: ListItem[]
  sending: boolean
  banner: Banner | null
  pendingPermissions: PermissionRequest[]
  pendingQuestions: QuestionRequest[]
}

export const initialChatState: ChatState = {
  messages: [],
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
