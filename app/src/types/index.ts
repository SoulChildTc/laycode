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

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts?: MessagePart[]
  createdAt: string
}

export type MessagePart = TextPart | CodePart | DiffPart

export interface TextPart {
  type: 'text'
  content: string
}

export interface CodePart {
  type: 'code'
  language: string
  content: string
}

export interface DiffPart {
  type: 'diff'
  file: string
  content: string
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}
