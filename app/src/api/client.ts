import { createOpencodeClient as createV1Client } from '@opencode-ai/sdk/client'
import { createOpencodeClient as createV2Client } from '@opencode-ai/sdk/v2/client'
import type { Session } from '@opencode-ai/sdk'
import type { ServerConfig, Provider, ModelInfo, Agent, PermissionRequest, QuestionRequest, Todo, GitStatus } from '../types'

export interface BrowseEntry {
  name: string
  path: string
}

export interface BrowseResult {
  entries: BrowseEntry[]
  current: string
  parent: string
}

// ---- 结构化错误 ----
// 所有请求失败都归一化成这三类之一，UI 层据此决定文案与行为，不再靠猜。

// token 无效 / 会话失效（HTTP 401）。全局监听它来提示用户重新连接。
export class AuthError extends Error {
  readonly status = 401
  constructor(message = '密钥已失效，请到设置里重新连接') {
    super(message)
    this.name = 'AuthError'
  }
}

// 服务器返回的非 2xx（401 除外）。message 优先取后端返回的 error 文案。
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// 连不上服务器（网络不可达、超时、DNS 失败等），拿不到任何 HTTP 响应。
// message 永远是面向用户的统一中文文案——不透传底层英文（如 RN 的 "Network request failed"），
// 避免同一种失败在不同请求路径下显示不同文案。底层原因存到 cause 供调试。
export class NetworkError extends Error {
  static readonly OFFLINE = '无法连接到服务器，请确认电脑端 laycode-cli 正在运行且在同一网络'
  static readonly TIMEOUT = '请求超时，请检查网络或稍后重试'
  constructor(message: string = NetworkError.OFFLINE, cause?: unknown) {
    super(message)
    this.name = 'NetworkError'
    if (cause !== undefined) (this as any).cause = cause
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError
}

export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError
}

// 全局错误广播：任意请求失败时通知一次，App 顶层注册它来弹提示。
// 覆盖两类「用户必须知道」的失败：
//   - AuthError（401，会话失效）
//   - NetworkError（连不上 bridge / 超时）—— 包括被 soft 读接口静默吞掉的那些，
//     否则 bridge 停掉后列表接口无声失败，界面毫无反馈。
// 其它 ApiError（业务性 4xx/5xx）不走全局，交由触发它的调用点就地提示，避免噪音。
// 去重与节流由 Toast 层负责（同文案 2s 内只弹一条），这里只管「发生了就通知」。
type GlobalError = AuthError | NetworkError
type GlobalErrorHandler = (err: GlobalError) => void
let globalErrorHandler: GlobalErrorHandler | null = null
export function setGlobalErrorHandler(handler: GlobalErrorHandler | null) {
  globalErrorHandler = handler
}
// 兼容旧名：仍接受只关心 401 的注册方式（内部转发到统一通道）。
export function setAuthErrorHandler(handler: ((err: AuthError) => void) | null) {
  globalErrorHandler = handler as GlobalErrorHandler | null
}
function emitGlobalError(err: GlobalError) {
  globalErrorHandler?.(err)
}

const DEFAULT_TIMEOUT = 30000

export class LayCodeClient {
  client: ReturnType<typeof createV1Client>
  v2: ReturnType<typeof createV2Client>
  baseUrl: string
  token: string
  wsUrl: string

  constructor(config: ServerConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`
    this.token = config.token
    this.wsUrl = `ws://${config.host}:${config.port}/event?token=${encodeURIComponent(config.token)}`
    this.client = createV1Client({
      baseUrl: `${this.baseUrl}/opencode-api`,
      headers: { Authorization: `Bearer ${config.token}` },
    })
    this.v2 = createV2Client({
      baseUrl: `${this.baseUrl}/opencode-api`,
      headers: { Authorization: `Bearer ${config.token}` },
    })
  }

  // ---- 统一请求层 ----

  // 所有 raw fetch 都走这里。统一处理：超时、网络失败、401、其它非 2xx。
  // 成功返回原始 Response，由调用方决定 .json()/.text()/读 header。
  private async request(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(init.headers || {}),
        },
      })
    } catch (err: any) {
      const netErr = new NetworkError(
        err?.name === 'AbortError' ? NetworkError.TIMEOUT : NetworkError.OFFLINE,
        err,
      )
      emitGlobalError(netErr)
      throw netErr
    } finally {
      clearTimeout(timer)
    }

    if (res.ok) return res
    throw await this.toError(res)
  }

  // 把非 2xx 响应转成结构化错误。401 特殊处理并触发全局回调。
  private async toError(res: Response): Promise<Error> {
    if (res.status === 401) {
      const err = new AuthError()
      emitGlobalError(err)
      return err
    }
    const body = await res.json().catch(() => null as any)
    const message = (body && typeof body.error === 'string' && body.error)
      || (body && typeof body.message === 'string' && body.message)
      || `请求失败（${res.status}）`
    return new ApiError(res.status, message)
  }

  // 把 SDK 的结果元组归一化。SDK 默认不抛，返回 { data, error, response }；
  // 这里检查 response.status，非 2xx 走和 raw fetch 相同的错误通道。
  // soft=true：探测型读接口（如 getPty 判断会话是否还在）——非 401 错误返回 undefined 而非抛，
  // 因为调用方本就把「查不到」当正常态；401 仍必须触发全局回调。
  private async unwrap<T>(
    promise: Promise<{ data?: T; error?: unknown; response?: Response }>,
    soft = false,
  ): Promise<T> {
    let result: { data?: T; error?: unknown; response?: Response }
    try {
      result = await promise
    } catch (err: any) {
      // SDK 内部 fetch reject = 网络失败。用统一中文文案，不透传底层英文（如 "Network request failed"）。
      // 即使 soft 也要广播，否则 bridge 停掉后列表接口会无声失败、界面毫无反馈。
      const netErr = new NetworkError(
        err?.name === 'AbortError' ? NetworkError.TIMEOUT : NetworkError.OFFLINE,
        err,
      )
      emitGlobalError(netErr)
      if (soft) return undefined as T
      throw netErr
    }
    const status = result.response?.status
    if (status && status >= 400) {
      if (status === 401) {
        const authErr = new AuthError()
        emitGlobalError(authErr)
        throw authErr
      }
      if (soft) return undefined as T
      const e: any = result.error
      const message = (e && typeof e.message === 'string' && e.message)
        || (e && typeof e.data?.message === 'string' && e.data.message)
        || (e && typeof e.name === 'string' && e.name)
        || `请求失败（${status}）`
      throw new ApiError(status, message)
    }
    return (result.data as T)
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, ...(extra || {}) }
  }

  // ---- 连接与鉴权 ----

  // 服务器是否存活（不校验 token）。仅用于 mDNS 发现后的探活。
  async health(timeoutMs = 5000): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/health`, { signal: controller.signal })
        return res.ok
      } finally {
        clearTimeout(timer)
      }
    } catch {
      return false
    }
  }

  // 校验 token 是否有效。三态：'ok' | 'unauthorized' | 'offline'。
  // 这是「连接成功」的唯一可信判据——能连上服务器不等于有权限。
  async verify(timeoutMs = 8000): Promise<'ok' | 'unauthorized' | 'offline'> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/auth/verify`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      })
      if (res.ok) return 'ok'
      if (res.status === 401) return 'unauthorized'
      // 其它状态码（如 404：旧版 bridge 没有该接口）退回旧探活，避免误判为离线。
      const alive = await this.health(timeoutMs)
      return alive ? 'ok' : 'offline'
    } catch {
      return 'offline'
    } finally {
      clearTimeout(timer)
    }
  }

  // ---- 文件浏览 ----

  async browse(filePath?: string): Promise<BrowseResult> {
    const params = filePath ? `?path=${encodeURIComponent(filePath)}` : ''
    const res = await this.request(`/api/v1/browse${params}`)
    return res.json()
  }

  async createFolder(folderPath: string): Promise<void> {
    await this.request(`/api/v1/browse/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    })
  }

  // ---- 会话 ----

  async listSessionsByDirectory(directory: string): Promise<Session[]> {
    const data = await this.unwrap(this.client.session.list({ query: { directory } }), true)
    return (data as any) || []
  }

  async createSessionInDirectory(directory: string, agent?: string): Promise<Session> {
    const data = await this.unwrap(this.v2.session.create({
      directory,
      ...(agent ? { agent } : {}),
    }))
    return (data as any) || {}
  }

  async getSession(sessionId: string): Promise<any> {
    const res = await this.request(`/opencode-api/session/${sessionId}`)
    return res.json()
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.request(`/opencode-api/session/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.unwrap(this.client.session.delete({ path: { id: sessionId } }))
  }

  async getMessages(sessionId: string) {
    const data = await this.unwrap(this.client.session.messages({ path: { id: sessionId } }))
    return (data as any) || []
  }

  async getMessagesPage(sessionId: string, limit: number, before?: string, directory?: string): Promise<{ messages: any[]; nextCursor: string | null }> {
    let url = `/opencode-api/session/${sessionId}/message?limit=${limit}`
    if (before) url += `&before=${encodeURIComponent(before)}`
    if (directory) url += `&directory=${encodeURIComponent(directory)}`
    const res = await this.request(url)
    const messages = await res.json()
    const nextCursor = res.headers.get('X-Next-Cursor') || null
    return { messages: messages || [], nextCursor }
  }

  async getAgents(directory?: string): Promise<Agent[]> {
    const data = await this.unwrap(this.v2.app.agents({ directory }), true)
    return (data as any) || []
  }

  async sendMessageWithAgent(sessionId: string, text: string, agent?: string) {
    const body: any = { parts: [{ type: 'text' as any, text }] }
    if (agent) body.agent = agent
    const data = await this.unwrap(this.client.session.promptAsync({
      path: { id: sessionId },
      body,
    }))
    return (data as any) || {}
  }

  async sendMessage(sessionId: string, text: string) {
    const data = await this.unwrap(this.client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: 'text' as any, text }] },
    }))
    return (data as any) || {}
  }

  async listFiles(path: string = '/') {
    const data = await this.unwrap(this.client.file.list({ query: { path } }))
    return (data as any) || []
  }

  async readFile(path: string) {
    const data = await this.unwrap(this.client.file.read({ query: { path } }))
    return (data as any) || {}
  }

  async getProviders(): Promise<{ providers: Provider[]; default: Record<string, string> }> {
    const res = await this.request(`/opencode-api/config/providers`)
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

  // ---- 权限 / 提问 ----

  async listPendingPermissions(directory?: string): Promise<PermissionRequest[]> {
    const params = directory ? `?directory=${encodeURIComponent(directory)}` : ''
    const res = await this.request(`/opencode-api/permission${params}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }

  async replyPermission(requestID: string, reply: 'once' | 'always' | 'reject', message?: string, directory?: string): Promise<void> {
    const params = new URLSearchParams()
    if (directory) params.set('directory', directory)
    const url = `/opencode-api/permission/${encodeURIComponent(requestID)}/reply${params.toString() ? '?' + params.toString() : ''}`
    await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply, ...(message ? { message } : {}) }),
    })
  }

  async listPendingQuestions(directory?: string): Promise<QuestionRequest[]> {
    const params = directory ? `?directory=${encodeURIComponent(directory)}` : ''
    const res = await this.request(`/opencode-api/question${params}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }

  async replyQuestion(requestID: string, answers: string[][], directory?: string): Promise<void> {
    const params = new URLSearchParams()
    if (directory) params.set('directory', directory)
    const url = `/opencode-api/question/${encodeURIComponent(requestID)}/reply${params.toString() ? '?' + params.toString() : ''}`
    await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    })
  }

  async rejectQuestion(requestID: string, directory?: string): Promise<void> {
    const params = new URLSearchParams()
    if (directory) params.set('directory', directory)
    const url = `/opencode-api/question/${encodeURIComponent(requestID)}/reject${params.toString() ? '?' + params.toString() : ''}`
    await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  }

  // ---- opencode 进程 ----

  async restartOpencode(): Promise<{ status: string; url?: string; error?: string; message?: string }> {
    const res = await this.request(`/api/v1/opencode/restart`, { method: 'POST' })
    return res.json()
  }

  // ---- Todos ----

  async getTodos(directory: string): Promise<Todo[]> {
    const res = await this.request(`/api/v1/todos?directory=${encodeURIComponent(directory)}`)
    const data = await res.json()
    return data.items || []
  }

  async createTodo(directory: string, text: string): Promise<Todo> {
    const res = await this.request(`/api/v1/todos?directory=${encodeURIComponent(directory)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    return res.json()
  }

  async updateTodo(directory: string, id: string, update: { text?: string; done?: boolean; urgent?: boolean }): Promise<Todo> {
    const res = await this.request(`/api/v1/todos/${encodeURIComponent(id)}?directory=${encodeURIComponent(directory)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    return res.json()
  }

  async deleteTodo(directory: string, id: string): Promise<void> {
    await this.request(`/api/v1/todos/${encodeURIComponent(id)}?directory=${encodeURIComponent(directory)}`, {
      method: 'DELETE',
    })
  }

  // ---- 会话操作（v2 SDK）----

  async revertMessage(sessionId: string, messageId?: string, directory?: string): Promise<any> {
    const data = await this.unwrap(this.v2.session.revert({ sessionID: sessionId, messageID: messageId, directory }))
    return data || null
  }

  async unrevertMessage(sessionId: string, directory?: string): Promise<void> {
    await this.unwrap(this.v2.session.unrevert({ sessionID: sessionId, directory }))
  }

  async abortSession(sessionId: string, directory?: string): Promise<void> {
    await this.unwrap(this.v2.session.abort({ sessionID: sessionId, directory }))
  }

  async summarizeSession(sessionId: string, modelID?: string, providerID?: string): Promise<void> {
    const body: any = {}
    if (modelID) body.modelID = modelID
    if (providerID) body.providerID = providerID
    await this.unwrap(this.v2.session.summarize({ sessionID: sessionId, ...body }))
  }

  // ---- Git ----

  async gitStatus(directory: string): Promise<GitStatus> {
    const res = await this.request(`/api/v1/git/status?directory=${encodeURIComponent(directory)}`)
    return res.json()
  }

  async gitInit(directory: string): Promise<void> {
    await this.request(`/api/v1/git/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory }),
    })
  }

  async gitDiff(directory: string, file: string, cached?: boolean): Promise<string> {
    const params = new URLSearchParams({ directory, file })
    if (cached) params.set('cached', '1')
    const res = await this.request(`/api/v1/git/diff?${params}`)
    const data = await res.json()
    return data.diff || ''
  }

  async gitStage(directory: string, file?: string): Promise<void> {
    await this.request(`/api/v1/git/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory, file }),
    })
  }

  async gitUnstage(directory: string, file?: string): Promise<void> {
    await this.request(`/api/v1/git/unstage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory, file }),
    })
  }

  async gitCommit(directory: string, message: string): Promise<void> {
    await this.request(`/api/v1/git/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory, message }),
    })
  }

  async gitDiscard(directory: string, file?: string): Promise<void> {
    await this.request(`/api/v1/git/discard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory, file }),
    })
  }

  // ---- PTY（v2 SDK）----

  async createPty(directory?: string, cwd?: string, command?: string): Promise<any> {
    return this.unwrap(this.v2.pty.create({ directory, cwd, command }))
  }

  async listPty(directory?: string): Promise<any[]> {
    const data = await this.unwrap(this.v2.pty.list({ directory }), true)
    return (data as any) || []
  }

  async getPty(ptyID: string, directory?: string): Promise<any> {
    return this.unwrap(this.v2.pty.get({ ptyID, directory }), true)
  }

  async removePty(ptyID: string, directory?: string): Promise<void> {
    await this.unwrap(this.v2.pty.remove({ ptyID, directory }))
  }

  async updatePtySize(ptyID: string, cols: number, rows: number, directory?: string): Promise<void> {
    await this.unwrap(this.v2.pty.update({ ptyID, size: { cols, rows }, directory }))
  }

  async connectPtyToken(ptyID: string, directory: string): Promise<{ ticket: string }> {
    return this.unwrap(this.v2.pty.connectToken({ ptyID, directory }, { headers: { 'x-opencode-ticket': '1' } }))
  }
}
