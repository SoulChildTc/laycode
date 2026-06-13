export interface ServerConfig {
  host: string
  port: number
  token: string
}

export interface ServerEntry {
  id: string
  name: string
  host: string
  port: number
  token: string
}

export interface Project {
  id: string
  name: string
  directory: string
  worktree?: string
}

export interface Session {
  id: string
  projectId: string
  title?: string
  createdAt: string
  directory?: string
  parentID?: string
  time?: { created: number }
}

export interface ToolCall {
  id: string
  name: string
  status: 'running' | 'completed' | 'error'
  input?: any
  output?: any
  metadata?: Record<string, any>
}

export interface AssistantMsg {
  id: string
  role: 'assistant'
  reasoning: { text: string; isActive: boolean }
  content: string
  toolCalls: ToolCall[]
}

export interface UserMsg {
  id: string
  role: 'user'
  text: string
}

export type Message = UserMsg | AssistantMsg

export interface RevertBannerMsg {
  id: string
  role: 'revert-banner'
  revertedCount: number
  diffFiles: { filename: string; additions: number; deletions: number }[]
}

export type ListItem = Message | RevertBannerMsg

export function isRevertBanner(item: ListItem): item is RevertBannerMsg {
  return item.role === 'revert-banner'
}

export function isAssistant(msg: Message | ListItem): msg is AssistantMsg {
  return msg.role === 'assistant'
}

export function isUser(msg: Message | ListItem): msg is UserMsg {
  return msg.role === 'user'
}

export function isMessage(item: ListItem): item is Message {
  return item.role === 'user' || item.role === 'assistant'
}

export interface ModelInfo {
  id: string
  providerID: string
  name: string
  capabilities: {
    reasoning?: boolean
    toolcall?: boolean
  }
  status: string
  limit?: {
    context: number
    output: number
  }
}

export interface Provider {
  id: string
  name: string
  source: string
  models: Record<string, ModelInfo>
}

export interface ModelKey {
  providerID: string
  modelID: string
}

export function mapToolStatus(status: string): 'running' | 'completed' | 'error' {
  if (status === 'running' || status === 'pending') return 'running'
  if (status === 'completed' || status === 'success') return 'completed'
  return 'error'
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

export interface PermissionRequest {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, any>
  always: string[]
  tool?: {
    messageID: string
    callID: string
  }
}

export type PermissionReply = 'once' | 'always' | 'reject'

export interface QuestionOption {
  label: string
  description: string
}

export interface QuestionInfo {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: {
    messageID: string
    callID: string
  }
}

export interface Agent {
  name: string
  description?: string
  mode: 'subagent' | 'primary' | 'all'
  native?: boolean
  hidden?: boolean
  color?: string
  permission: any
  model?: ModelKey
  variant?: string
  prompt?: string
  steps?: number
}

export interface Todo {
  id: string
  text: string
  done: boolean
  createdAt: number
  updatedAt: number
}