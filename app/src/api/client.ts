import { createOpencodeClient } from '@opencode-ai/sdk/client'
import type { Session } from '@opencode-ai/sdk'
import { ServerConfig } from '../types'

export interface BrowseEntry {
  name: string
  path: string
}

export interface BrowseResult {
  entries: BrowseEntry[]
  current: string
  parent: string
}

export class LayCodeClient {
  client: ReturnType<typeof createOpencodeClient>
  baseUrl: string
  token: string

  constructor(config: ServerConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`
    this.token = config.token
    this.client = createOpencodeClient({
      baseUrl: `${this.baseUrl}/opencode-api`,
      headers: { Authorization: `Bearer ${config.token}` },
    })
  }

  async browse(filePath?: string): Promise<BrowseResult> {
    const params = filePath ? `?path=${encodeURIComponent(filePath)}` : ''
    const res = await fetch(`${this.baseUrl}/api/v1/browse${params}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) throw new Error('Browse failed')
    return res.json()
  }

  async listSessionsByDirectory(directory: string): Promise<Session[]> {
    const res = await this.client.session.list({ query: { directory } })
    return (res.data as any) || []
  }

  async createSessionInDirectory(directory: string): Promise<Session> {
    const res = await this.client.session.create({ query: { directory } })
    return (res.data as any) || {}
  }

  async getMessages(sessionId: string) {
    const res = await this.client.session.messages({ path: { id: sessionId } })
    return (res.data as any) || []
  }

  async sendMessage(sessionId: string, text: string) {
    const res = await this.client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: 'text' as any, text }] },
    })
    return (res.data as any) || {}
  }

  async listFiles(path: string = '/') {
    const res = await this.client.file.list({ query: { path } })
    return (res.data as any) || []
  }

  async readFile(path: string) {
    const res = await this.client.file.read({ query: { path } })
    return (res.data as any) || {}
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/health`)
      return res.ok
    } catch {
      return false
    }
  }
}