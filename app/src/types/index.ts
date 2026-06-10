export interface ServerConfig {
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