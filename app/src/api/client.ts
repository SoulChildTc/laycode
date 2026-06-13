import { createOpencodeClient as createV1Client } from '@opencode-ai/sdk/client'
import { createOpencodeClient as createV2Client } from '@opencode-ai/sdk/v2/client'
import type { Session } from '@opencode-ai/sdk'
import type { ServerConfig, Provider, ModelInfo, Agent, PermissionRequest, QuestionRequest, Todo } from '../types'

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
  client: ReturnType<typeof createV1Client>
  v2: ReturnType<typeof createV2Client>
  baseUrl: string
  token: string
  wsUrl: string

  constructor(config: ServerConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`
    this.token = config.token
    this.wsUrl = `ws://${config.host}:${config.port + 1}/event`
    this.client = createV1Client({
      baseUrl: `${this.baseUrl}/opencode-api`,
      headers: { Authorization: `Bearer ${config.token}` },
    })
    this.v2 = createV2Client({
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

  async createFolder(folderPath: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/browse/folder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: folderPath }),
    })
    if (!res.ok) throw new Error('Create folder failed')
  }

  async listSessionsByDirectory(directory: string): Promise<Session[]> {
    const res = await this.client.session.list({ query: { directory } })
    return (res.data as any) || []
  }

  async createSessionInDirectory(directory: string, agent?: string): Promise<Session> {
    const res = await this.v2.session.create({
      directory,
      ...(agent ? { agent } : {}),
    })
    return (res.data as any) || {}
  }

  async getSession(sessionId: string): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/opencode-api/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      })
      if (!res.ok) return null
      return res.json()
    } catch { return null }
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await fetch(`${this.baseUrl}/opencode-api/session/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ title }),
    })
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.session.delete({ path: { id: sessionId } })
  }

  async getMessages(sessionId: string) {
    const res = await this.client.session.messages({ path: { id: sessionId } })
    return (res.data as any) || []
  }

  async getAgents(directory?: string): Promise<Agent[]> {
    try {
      const res = await this.v2.app.agents({ directory })
      return (res.data as any) || []
    } catch {
      return []
    }
  }

  async sendMessageWithAgent(sessionId: string, text: string, agent?: string) {
    const body: any = { parts: [{ type: 'text' as any, text }] }
    if (agent) body.agent = agent
    const res = await this.client.session.promptAsync({
      path: { id: sessionId },
      body,
    })
    return (res.data as any) || {}
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

  async getProviders(): Promise<{ providers: Provider[]; default: Record<string, string> }> {
    const res = await fetch(`${this.baseUrl}/opencode-api/config/providers`, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) return { providers: [], default: {} }
    const data = await res.json()
    const providers: Provider[] = (data.providers || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      source: p.source || '',
      models: Object.fromEntries(
        Object.entries(p.models || {}).map(([id, m]: [string, any]) => [
          id,
          {
            id: m.id || id,
            providerID: p.id,
            name: m.name || id,
            capabilities: {
              reasoning: !!m.capabilities?.reasoning,
              toolcall: !!m.capabilities?.toolcall,
            },
            status: m.status || 'active',
            limit: m.limit,
          } as ModelInfo,
        ])
      ),
    }))
    return { providers, default: data.default || {} }
  }

  async listPendingPermissions(directory?: string): Promise<PermissionRequest[]> {
    try {
      const params = directory ? `?directory=${encodeURIComponent(directory)}` : ''
      const res = await fetch(`${this.baseUrl}/opencode-api/permission${params}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  async replyPermission(requestID: string, reply: 'once' | 'always' | 'reject', message?: string, directory?: string): Promise<boolean> {
    try {
      const params = new URLSearchParams()
      if (directory) params.set('directory', directory)
      const url = `${this.baseUrl}/opencode-api/permission/${encodeURIComponent(requestID)}/reply${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ reply, ...(message ? { message } : {}) }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async listPendingQuestions(directory?: string): Promise<QuestionRequest[]> {
    try {
      const params = directory ? `?directory=${encodeURIComponent(directory)}` : ''
      const res = await fetch(`${this.baseUrl}/opencode-api/question${params}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  async replyQuestion(requestID: string, answers: string[][], directory?: string): Promise<boolean> {
    try {
      const params = new URLSearchParams()
      if (directory) params.set('directory', directory)
      const url = `${this.baseUrl}/opencode-api/question/${encodeURIComponent(requestID)}/reply${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ answers }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async rejectQuestion(requestID: string, directory?: string): Promise<boolean> {
    try {
      const params = new URLSearchParams()
      if (directory) params.set('directory', directory)
      const url = `${this.baseUrl}/opencode-api/question/${encodeURIComponent(requestID)}/reject${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({}),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async restartOpencode(): Promise<{ status: string; url?: string; error?: string; message?: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/opencode/restart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
    })
    return res.json()
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/health`)
      return res.ok
    } catch {
      return false
    }
  }

  async getTodos(directory: string): Promise<Todo[]> {
    const params = `?directory=${encodeURIComponent(directory)}`
    const res = await fetch(`${this.baseUrl}/api/v1/todos${params}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.items || []
  }

  async createTodo(directory: string, text: string): Promise<Todo | null> {
    const params = `?directory=${encodeURIComponent(directory)}`
    const res = await fetch(`${this.baseUrl}/api/v1/todos${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return null
    return res.json()
  }

  async updateTodo(directory: string, id: string, update: { text?: string; done?: boolean }): Promise<Todo | null> {
    const params = `?directory=${encodeURIComponent(directory)}`
    const res = await fetch(`${this.baseUrl}/api/v1/todos/${encodeURIComponent(id)}${params}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(update),
    })
    if (!res.ok) return null
    return res.json()
  }

  async revertMessage(sessionId: string, messageId?: string, directory?: string): Promise<any> {
    try {
      const res = await this.v2.session.revert({ sessionID: sessionId, messageID: messageId, directory })
      return res.data || null
    } catch {
      return null
    }
  }

  async unrevertMessage(sessionId: string, directory?: string): Promise<boolean> {
    try {
      await this.v2.session.unrevert({ sessionID: sessionId, directory })
      return true
    } catch {
      return false
    }
  }

  async abortSession(sessionId: string, directory?: string): Promise<boolean> {
    try {
      await this.v2.session.abort({ sessionID: sessionId, directory })
      return true
    } catch {
      return false
    }
  }

  async summarizeSession(sessionId: string, modelID?: string, providerID?: string): Promise<boolean> {
    try {
      const body: any = {}
      if (modelID) body.modelID = modelID
      if (providerID) body.providerID = providerID
      await this.v2.session.summarize({ sessionID: sessionId, ...body })
      return true
    } catch {
      return false
    }
  }

  async deleteTodo(directory: string, id: string): Promise<boolean> {
    const params = `?directory=${encodeURIComponent(directory)}`
    const res = await fetch(`${this.baseUrl}/api/v1/todos/${encodeURIComponent(id)}${params}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` },
    })
    return res.ok
  }
}