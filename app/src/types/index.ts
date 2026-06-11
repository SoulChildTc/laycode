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
}

export interface ToolCall {
  id: string
  name: string
  status: 'running' | 'completed' | 'error'
  input?: any
  output?: any
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

export function isAssistant(msg: Message): msg is AssistantMsg {
  return msg.role === 'assistant'
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