# OpenCode Chat App 开发指南

本文档面向**基于 OpenCode API/SDK 开发聊天类 APP 的开发者**，说明如何通过 SDK / HTTP API 与 OpenCode 交互，完成用户发消息、AI 回复、工具调用、权限审批等场景。

---

## 目录

- [1. SDK 初始化](#1-sdk-初始化)
- [2. 数据模型](#2-数据模型)
- [3. Session 管理](#3-session-管理)
- [4. 发送消息与接收回复](#4-发送消息与接收回复)
- [5. SSE 事件流（实时更新）](#5-sse-事件流实时更新)
- [6. 消息分页](#6-消息分页)
- [7. 权限审批](#7-权限审批)
- [8. Question 问答](#8-question-问答)
- [9. Tool 调用渲染](#9-tool-调用渲染)
- [10. Slash 命令](#10-slash-命令)
- [11. Shell 命令](#11-shell-命令)
- [12. 撤回与恢复（Revert / Unrevert）](#12-撤回与恢复revert--unrevert)
- [13. Session 其他操作](#13-session-其他操作)
- [14. 错误处理](#14-错误处理)
- [15. 附录：HTTP API 端点参考](#15-附录http-api-端点参考)

---

## 1. SDK 初始化

```ts
import { createOpencodeClient } from "@opencode-ai/sdk/client"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  // headers: { "x-opencode-directory": "/path/to/project" },
})
```

返回值类型：

```ts
type OpencodeClient = {
  session: {
    list(params?: {
      directory?: string; workspace?: string
      scope?: "project"; path?: string
      roots?: boolean | "true" | "false"
      start?: number; search?: string; limit?: number
    }): Promise<Response<Session[]>>

    create(params?: {
      directory?: string; workspace?: string
      title?: string; agent?: string
      model?: { id: string; providerID: string; variant?: string }
      metadata?: Record<string, unknown>
      permission?: PermissionRuleset
      parentID?: string; workspaceID?: string
    }): Promise<Response<Session>>

    get(params: {
      sessionID: string; directory?: string; workspace?: string
    }): Promise<Response<Session>>

    delete(params: {
      sessionID: string; directory?: string; workspace?: string
    }): Promise<Response<boolean>>

    update(params: {
      sessionID: string; directory?: string; workspace?: string
      title?: string; metadata?: Record<string, unknown>
      permission?: PermissionRuleset
      time?: { archived?: number }
    }): Promise<Response<Session>>

    messages(params: {
      sessionID: string; directory?: string; workspace?: string
      limit?: number; before?: string
    }): Promise<Response<MessageItem[]>>

    message(params: {
      sessionID: string; messageID: string
      directory?: string; workspace?: string
    }): Promise<Response<MessageItem>>

    prompt(params: {
      sessionID: string; directory?: string; workspace?: string
      messageID?: string
      model?: { providerID: string; modelID: string }
      agent?: string; noReply?: boolean
      tools?: Record<string, boolean>
      format?: OutputFormat; system?: string; variant?: string
      parts?: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>
    }): Promise<Response<...>>

    promptAsync(params: {
      sessionID: string; directory?: string; workspace?: string
      messageID?: string
      model?: { providerID: string; modelID: string }
      agent?: string; noReply?: boolean
      tools?: Record<string, boolean>
      format?: OutputFormat; system?: string; variant?: string
      parts?: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>
    }): Promise<Response<void>>

    command(params: {
      sessionID: string; directory?: string; workspace?: string
      messageID?: string; agent?: string; model?: string
      arguments?: string; command?: string; variant?: string
      parts?: Array<{ id?: string; type: "file"; mime: string; filename?: string; url: string; source?: FilePartSource }>
    }): Promise<Response<MessageItem>>

    shell(params: {
      sessionID: string; directory?: string; workspace?: string
      messageID?: string; agent?: string
      model?: { providerID: string; modelID: string }
      command?: string
    }): Promise<Response<MessageItem>>

    abort(params: {
      sessionID: string; directory?: string; workspace?: string
    }): Promise<Response<boolean>>

    fork(params: {
      sessionID: string; directory?: string; workspace?: string
      messageID?: string
    }): Promise<Response<Session>>

    revert(params: {
      sessionID: string; directory?: string; workspace?: string
      messageID?: string; partID?: string
    }): Promise<Response<Session>>

    unrevert(params: {
      sessionID: string; directory?: string; workspace?: string
    }): Promise<Response<Session>>

    summarize(params: {
      sessionID: string; directory?: string; workspace?: string
      providerID?: string; modelID?: string; auto?: boolean
    }): Promise<Response<boolean>>

    share(params: {
      sessionID: string; directory?: string; workspace?: string
    }): Promise<Response<Session>>

    unshare(params: {
      sessionID: string; directory?: string; workspace?: string
    }): Promise<Response<Session>>

    diff(params: {
      sessionID: string; directory?: string; workspace?: string
      messageID?: string
    }): Promise<Response<FileDiff[]>>

    todo(params: {
      sessionID: string; directory?: string; workspace?: string
    }): Promise<Response<Todo[]>>

    children(params: {
      sessionID: string; directory?: string; workspace?: string
    }): Promise<Response<Session[]>>

    init(params: {
      sessionID: string; directory?: string; workspace?: string
      modelID?: string; providerID?: string; messageID?: string
    }): Promise<Response<boolean>>
  }

  event: {
    subscribe(params?: {
      directory?: string; workspace?: string
    }): Promise<EventStream>
  }

  permission: {
    reply(params: {
      requestID: string; directory?: string; workspace?: string
      reply?: "once" | "always" | "reject"; message?: string
    }): Promise<Response<boolean>>
    list(): Promise<Response<PermissionRequest[]>>
  }

  question: {
    list(params?: {
      directory?: string; workspace?: string
    }): Promise<Response<QuestionRequest[]>>
    reply(params: {
      requestID: string; directory?: string; workspace?: string
      answers?: Array<QuestionAnswer>
    }): Promise<Response<boolean>>
    reject(params: {
      requestID: string; directory?: string; workspace?: string
    }): Promise<Response<boolean>>
  }
}
```

### 使用 throwOnError

```ts
// 正常模式：返回 { data, error }
const result = await client.session.list()
if (result.error) handleError(result.error)
const sessions = result.data

// throwOnError：失败直接抛异常
const strict = createOpencodeClient({ baseUrl, throwOnError: true })
const sessions = await strict.session.list()  // 直接得到 data，失败抛 BadRequestError
```

---

## 2. 数据模型

### 2.1 Session（会话）

```ts
type Session = {
  id: string                    // 前缀 "ses_"
  slug: string                  // 短名称
  projectID: string
  workspaceID?: string
  directory: string
  path?: string
  parentID?: string             // 子 Agent session 指向父 session
  title: string
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  version: string
  summary?: {
    additions: number
    deletions: number
    files: number
    diffs?: FileDiff[]
  }
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
  share?: { url: string }
  metadata?: Record<string, unknown>
  time: {
    created: number              // 毫秒时间戳
    updated: number
    compacting?: number
    archived?: number
  }
  permission?: PermissionRuleset
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }                             // 撤回状态（有值表示当前处于撤回状态）
}
```

### 2.2 Message（消息）

```ts
// 消息 = MessageItem = { info: Message, parts: Part[] }
type MessageItem = {
  info: UserMessage | AssistantMessage
  parts: Part[]
}
```

#### 用户消息

```ts
type UserMessage = {
  id: string                    // 前缀 "msg_"
  sessionID: string
  role: "user"
  time: { created: number }
  agent: string
  model: { providerID: string; modelID: string; variant?: string }
  text?: string                 // 文本内容
  files?: FilePartInput[]
  agents?: string[]             // @提及的 Agent
}
```

#### AI 回复消息

```ts
type AssistantMessage = {
  id: string
  sessionID: string
  role: "assistant"
  time: { created: number; completed?: number }
  parentID: string              // 对应的 user message ID
  agent: string
  modelID: string
  providerID: string
  mode: string
  path: { cwd: string; root: string }
  finish?: string               // "stop" | "tool-calls" | "error" | "length"
  cost: number
  tokens: {
    total?: number
    input: number
    output: number
    reasoning?: number
    cache: { read: number; write: number }
  }
  error?: ProviderAuthError | UnknownError | MessageOutputLengthError
  summary?: boolean             // 是否为 compaction 摘要消息
  structured?: unknown
}
```

### 2.3 Part（消息片断）

```ts
type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | FilePart
  | SubtaskPart
  | StepStartPart
  | StepFinishPart
  | PatchPart
  | SnapshotPart
  | AgentPart
  | RetryPart
  | CompactionPart

type TextPart = {
  type: "text"
  id: string
  text: string
  synthetic?: boolean
  ignored?: boolean
}

type ReasoningPart = {
  type: "reasoning"
  id: string
  text: string                 // 推理过程文本
  providerMetadata?: Record<string, unknown>
}

type ToolPart = {
  type: "tool"
  id: string
  callID: string               // 工具调用 ID
  name: string                 // 工具名：bash | read | write | edit | grep | glob | webfetch | websearch | task | todowrite | apply_patch
  state: ToolState
  provider?: {
    executed: boolean
    metadata?: Record<string, unknown>
    resultMetadata?: Record<string, unknown>
  }
}

type FilePart = {
  type: "file"
  id: string
  mime: string                 // MIME 类型
  filename?: string
  url: string                  // data: URL 或文件路径
  source?: FilePartSource
}

type SubtaskPart = {
  type: "subtask"
  prompt: string
  description: string
  agent: string
}

type StepStartPart = {
  type: "step-start"
  id: string
  snapshot?: string
}

type StepFinishPart = {
  type: "step-finish"
  reason: string
  snapshot?: string
  cost: number
  tokens: { input: number; output: number; cache: { read: number; write: number } }
}

type PatchPart = {
  type: "patch"
  hash: string
  files: string[]
}

type CompactionPart = {
  type: "compaction"
  auto: boolean
  overflow?: boolean
}
```

### 2.4 Tool State（工具调用状态机）

```ts
type ToolState =
  | { status: "pending";   input: string }                          // LLM 发出了调用，参数还在流
  | { status: "running";   input: Record<string,unknown>; content: ToolContent[]; structured: Record<string,any> }  // 正在执行
  | { status: "completed"; input: Record<string,unknown>; output: string; result: unknown; outputPaths?: string[]; attachments?: FilePart[]; content: ToolContent[]; structured: Record<string,any> }
  | { status: "error";     input: Record<string,unknown>; error: unknown; content: ToolContent[]; structured: Record<string,any>; result: unknown }
```

各状态流转：

```
LLM 发出调用 → pending → running → completed
                                   ↘ error
```

渲染建议：

| status | UI 显示 |
|--------|---------|
| `pending` | loading 状态，显示工具名 |
| `running` | 进度动画，显示 input 参数 |
| `completed` | 显示 output/result，可折叠 |
| `error` | 红色错误信息 |

### 2.5 工具对应的 UI 渲染

| 工具名 | 展示方式 |
|--------|---------|
| `bash` | 命令 + 输出（终端风格） |
| `read` | 文件路径 + 加载状态 |
| `write` | 文件名 + 代码预览 + 诊断信息 |
| `edit` | 差异对比（unified/split diff） |
| `grep` | 搜索模式 + 匹配数量 |
| `glob` | 文件匹配模式 |
| `webfetch` | URL |
| `websearch` | 搜索词 + 结果数量 |
| `task` | 子 Agent 任务描述（可点击跳转子 session） |
| `apply_patch` | 多文件 patch diff |
| `todowrite` | TODO 列表 |

### 2.6 Session 状态

```ts
type SessionStatus =
  | { type: "idle" }
  | { type: "retry"; attempt: number; message: string; action?: {...}; next: number }
  | { type: "busy" }
```

---

## 3. Session 管理

### 3.1 获取列表

```ts
const { data: sessions } = await client.session.list()

// 带参数
const { data: sessions } = await client.session.list({
  scope: "project",       // 只查当前 project
  limit: 20,
  start: 0,
  search: "关键词",
  roots: true,            // 只返回根 session（不返回子 Agent session）
})
```

按 `time.updated` 降序排列。

### 3.2 创建 Session

```ts
const { data: session } = await client.session.create({
  title: "新对话",
  // permission?: PermissionRuleset   // 可选，设置默认权限
})
```

返回新创建的 `Session` 对象。

### 3.3 进入 Session（获取完整数据）

```ts
// 进入一个 session 时需要加载以下数据：
const [session, messages, todos, diffs] = await Promise.all([
  client.session.get({ sessionID: "ses_xxx" }),
  client.session.messages({ sessionID: "ses_xxx", query: { limit: 50 } }),
  client.session.todo({ sessionID: "ses_xxx" }),
  client.session.diff({ sessionID: "ses_xxx" }),
])
```

---

## 4. 发送消息与接收回复

### 4.1 发送消息（推荐：promptAsync + SSE）

发送消息不等待回复，回复通过 SSE 事件流推送：

```ts
// 1. 发送消息
const messageID = generateID("msg_")
await client.session.promptAsync({
  sessionID: "ses_xxx",
  messageID,                    // 客户端预生成，用于乐观更新
  agent: "builder",
  model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
  parts: [
    { type: "text", text: "帮我看看这个文件" },
    { type: "file", mime: "text/plain", url: "/src/index.ts" },
  ],
})

// 2. 客户端乐观更新：在本地先显示用户消息
addOptimisticMessage({
  id: messageID,
  sessionID: "ses_xxx",
  role: "user",
  time: { created: Date.now() },
  agent: "builder",
  model: { ... },
  parts: [{
    type: "text",
    text: "帮我看看这个文件"
  }]
})

// 3. 通过 SSE 事件流接收实时更新（见第 5 章）
```

### 4.2 发送消息（同步方式：prompt）

```ts
// 这种方式返回创建的 user message，但 AI 回复仍然通过 SSE 推送
const { data: admitted } = await client.session.prompt({
  sessionID: "ses_xxx",
  messageID,
  parts: [{ type: "text", text: "帮我看看这个文件" }],
})
// admitted 类型: { info: UserMessage, parts: Part[] }
```

### 4.3 带附件的消息

```ts
import type { TextPartInput, FilePartInput } from "@opencode-ai/sdk"

await client.session.promptAsync({
  sessionID: "ses_xxx",
  messageID: "msg_xxx",
  parts: [
    { type: "text", text: "分析这个图片" },
    { type: "file", mime: "image/png", url: "/path/to/image.png" },
    // data URL 也可以：
    { type: "file", mime: "image/png", url: "data:image/png;base64,..." },
  ],
})
```

### 4.4 @Agent 提及

```ts
// 通过 AgentPartInput 引用其他 Agent
await client.session.promptAsync({
  sessionID: "ses_xxx",
  parts: [
    { type: "text", text: "让 @builder 来帮我看看" },
    { type: "agent", name: "builder" },
  ],
})
```

### 4.5 中断 AI 回复

```ts
await client.session.abort({ sessionID: "ses_xxx" })
```

---

## 5. SSE 事件流（实时更新）

### 5.1 订阅

```ts
const events = await client.event.subscribe()
for await (const event of events.stream) {
  console.log(event.type, event.properties)
}
```

### 5.2 事件结构

```ts
type GlobalEvent = {
  directory: string     // 工作目录
  payload: {
    id: string          // 前缀 "evt_"
    type: string        // 事件类型
    properties: Record<string, unknown>
  }
}
```

### 5.3 消息相关事件（V1）

| 事件 | 时机 | 处理方式 |
|------|------|---------|
| `message.updated` | 消息创建或更新 | 插入/替换到消息列表 |
| `message.removed` | 消息删除 | 从列表移除 |
| `message.part.updated` | Part 创建或更新 | 更新对应消息的 parts |
| `message.part.delta` | Part 文本增量 | 追加到现有 part 文本 |

### 5.4 Part Delta 事件

```ts
// 当 AI 正在生成文本时，通过 delta 事件实时追加
{
  type: "message.part.delta",
  properties: {
    sessionID: "ses_xxx",
    messageID: "msg_xxx",
    partID: "part_xxx",
    field: "text",        // 哪个字段在变化
    delta: "新追加的文字"  // 只包含增量内容
  }
}
```

处理方式：找到对应的 `assistant` 消息，找到对应的 `partID` 的 Part，将 `part[field]` 追加 delta。

### 5.5 V2 流式事件（按渲染顺序）

这些事件提供更精细的渲染控制：

```ts
// 处理思路：
// 1. session.next.prompted → 在列表末尾添加 user message（乐观更新）
// 2. session.next.step.started → 添加一个空的 assistant message
// 3. session.next.text.started → 在 assistant 消息中追加一个 text part
// 4. session.next.text.delta   → 实时更新该 part 的 text
// 5. session.next.text.ended   → 标记该 part 完成
// 6. session.next.reasoning.started → 追加 reasoning part
// 7. session.next.reasoning.delta   → 实时更新 reasoning 文本
// 8. session.next.reasoning.ended   → 标记 reasoning 完成
// 9. session.next.tool.input.started → 追加 tool part（pending）
// 10. session.next.tool.called  → tool → running
// 11. session.next.tool.success → tool → completed（显示结果）
// 12. session.next.step.ended   → assistant 消息完成
```

| V2 事件 | 含义 |
|---------|------|
| `session.next.prompted` | 用户消息已创建 |
| `session.next.prompt.promoted` | 用户消息已投递到 LLM |
| `session.next.step.started` | LLM step 开始（=assistant 消息创建） |
| `session.next.text.started/delta/ended` | 文本输出 |
| `session.next.reasoning.started/delta/ended` | 推理过程 |
| `session.next.tool.input.started/delta/ended` | 工具参数流 |
| `session.next.tool.called` | 工具开始执行 |
| `session.next.tool.progress` | 工具执行进度 |
| `session.next.tool.success` | 工具执行成功 |
| `session.next.tool.failed` | 工具执行失败 |
| `session.next.step.ended` | LLM step 结束（=assistant 完成） |
| `session.next.shell.started` | Shell 命令开始 |
| `session.next.shell.ended` | Shell 命令完成 |
| `session.next.agent.switched` | Agent 切换 |
| `session.next.model.switched` | 模型切换 |
| `session.next.compaction.started/delta/ended` | 压缩过程 |
| `session.next.retried` | 重试 |
| `session.next.interrupt.requested` | 中断请求 |
| `session.next.context.updated` | 上下文更新 |
| `session.next.synthetic` | 合成消息 |

### 5.6 消息列表维护策略

```ts
// 维护一个消息列表：
// 1. session.next.prompted / message.updated → 插入或替换
// 2. message.part.delta → 找到对应 part，追加文本
// 3. message.removed → 移除
// 4. session.next.step.ended / session.next.shell.ended → 加载完整消息替换

interface MessageState {
  messages: MessageItem[]       // 有序列表
  sessionStatus: SessionStatus  // 当前状态
  streamingPart: {              // 当前正在流式更新的 part
    messageID: string
    partID: string
    field: string
    buffer: string
  } | null
}
```

---

## 6. 消息分页

SDK：

```ts
const { data: page1 } = await client.session.messages({
  sessionID: "ses_xxx",
  limit: 20,
})

// 如果还有下一页，游标在响应的 X-Next-Cursor header 中
// 但 SDK 不直接暴露 headers，需要通过 try/catch 或底层 client 获取
//
// 简便做法：先取全部消息（不传 limit），再自己分页：
const { data: all } = await client.session.messages({
  sessionID: "ses_xxx",
})
```

后端返回的数据总是已排序的（最新的在前）。

### 游标说明

`before` 不是裸 message ID，而是一个 base64url 编码的 JSON cursor：

```ts
// cursor结构: { id: messageID, time: time_created }
// 编码: base64url(JSON.stringify({ id: "msg_xxx", time: 1740000000000 }))

// 不要手动构造——直接用上一个请求的 X-Next-Cursor 响应头
```

---

## 7. 权限审批

### 7.1 监听权限请求

两种方式获取 permission request：

**方式一（推荐）：SSE 实时推送**

```ts
// 事件: "permission.asked"
{
  type: "permission.asked",
  properties: {
    id: "req_xxx",
    sessionID: "ses_xxx",
    permission: "edit",         // 权限类型
    patterns: ["src/**"],
    metadata: { path: "/src/index.ts", tool: "write" },
    always: [],
    tool: { messageID: "msg_xxx", callID: "call_xxx" }
  }
}
```

**方式二（轮询）：`GET /api/permission`**

```ts
// 定期调用获取当前待审批的权限列表
const { data: pending } = await client.permission.list()
// pending: PermissionRequest[]

type PermissionRequest = {
  id: string
  sessionID: string
  permission: string  // "edit" | "read" | "bash" | ...
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  tool?: { messageID: string; callID: string }
}
```

### 7.2 权限类型

| 类型 | 含义 | UI 显示 |
|------|------|---------|
| `edit` | 编辑文件 | 显示 file diff |
| `read` | 读取文件 | 显示文件路径 |
| `bash` | 执行命令 | 显示 Shell 命令 |
| `glob` | 文件搜索 | 显示匹配模式 |
| `grep` | 内容搜索 | 显示搜索模式 |
| `webfetch` | 抓取网页 | 显示 URL |
| `websearch` | 搜索网络 | 显示搜索词 |
| `task` | 启动子 Agent | 显示子任务描述 |
| `external_directory` | 访问外部目录 | 显示目录路径 |
| `doom_loop` | 连续失败重试 | 显示 "continue after repeated failures" |

### 7.3 回复权限请求

```ts
// 允许一次
await client.permission.reply({
  requestID: "req_xxx",
  reply: "once",
})

// 永久允许
await client.permission.reply({
  requestID: "req_xxx",
  reply: "always",
})

// 拒绝
await client.permission.reply({
  requestID: "req_xxx",
  reply: "reject",
  message: "不需要修改这个文件",  // 可选，拒绝原因会传给 LLM
})
```

### 7.4 权限管理

```ts
// 获取当前待审批的权限列表
const { data: pending } = await client.permission.list()
```

---

## 8. Question 问答

当 AI 需要用户做选择题时使用（不同于工具权限审批）。

### 8.1 监听

两种方式获取 question：

**方式一（推荐）：SSE 实时推送**

```ts
// SSE 事件: "question.asked"
{
  type: "question.asked",
  properties: {
    id: "que_xxx",
    sessionID: "ses_xxx",
    questions: [ ... ],
    tool?: { messageID: string; callID: string }
  }
}
```

**方式二（轮询）：`GET /question`**

```ts
// 定期调用 SDK 或直接 HTTP 获取待处理问题
const { data: pending } = await client.question.list()
// 或底层 HTTP:
// GET /question → Array<Question.Request>

type QuestionRequest = {
  id: string          // "que_xxx"
  sessionID: string
  questions: QuestionInfo[]
  tool?: { messageID: string; callID: string }
}
```

### 8.2 回复

```ts
// 回答
await client.question.reply({
  requestID: "que_xxx",
  answers: [
    ["读取"],                               // 单选的选项
    // ["读取", "编辑"]                     // 多选
    // ["自定义输入内容"]                    // custom=true 时的自定义输入
  ],
})

// 拒绝回答
await client.question.reject({
  requestID: "que_xxx",
})
```

---

## 9. Tool 调用渲染

当 AI 回复中包含工具调用时，需要按工具类型分别渲染。

### 9.1 解析工具调用

```ts
// 从 message.parts 中找到 type === "tool" 的 part
const toolParts = message.parts.filter((p) => p.type === "tool")

for (const part of toolParts) {
  switch (part.name) {
    case "bash":
      // 显示: 命令 + 执行输出
      renderShell(part.state.input.command, part.state.output)
      break
    case "edit":
      // 显示: 文件 diff
      renderDiff(part.state.input.filePath, part.state.output)
      break
    case "read":
      // 显示: 文件路径 + 读取状态
      renderFileRead(part.state.input.path)
      break
    case "task":
      // 显示: 子 Agent 任务 + 结果
      renderSubtask(part.state.input.prompt, part.state.output)
      break
    case "write":
      // 显示: 文件名 + 代码预览
      renderWritePreview(part.state.input.path, part.state.output)
      break
    case "grep":
    case "glob":
      // 显示: 搜索模式
      renderSearch(part.name, part.state.input.pattern)
      break
    case "webfetch":
      // 显示: URL + 获取的内容
      renderWebFetch(part.state.input.url, part.state.output)
      break
    case "apply_patch":
      // 显示: 多文件 patch diff
      renderPatchDiff(part.state.output)
      break
  }
}
```

### 9.2 状态变化

根据 `ToolState` 的 `status` 字段实时更新 UI：

```ts
function ToolPartRenderer({ part }: { part: ToolPart }) {
  const state = part.state

  switch (state.status) {
    case "pending":
      return <ToolPending name={part.name} />

    case "running":
      return <ToolRunning name={part.name} input={state.input} />

    case "completed":
      return <ToolCompleted name={part.name} output={state.output} result={state.result} />

    case "error":
      return <ToolError name={part.name} error={state.error} />
  }
}
```

---

## 10. Slash 命令

用户输入以 `/` 开头的消息时，先检查是否为已注册的命令。

```ts
// 获取已注册命令列表（通过 config API）
const { data: config } = await client.config.get()
// config.commands 中是注册的 slash 命令

// 也可以通过查询 sync store 获取
// command: Command[]
// type Command = { name: string; description: string }
```

发送 slash 命令：

```ts
// 使用 command API 发送（不走 LLM，直接展开模板）
const { data } = await client.session.command({
  sessionID: "ses_xxx",
  command: "deploy",
  arguments: "--env production",
  agent: "builder",
  model: "anthropic/claude-sonnet-4-20250514",
})
```

---

## 11. Shell 命令

```ts
await client.session.shell({
  sessionID: "ses_xxx",
  command: "npm run build",
  agent: "builder",
  model: "anthropic/claude-sonnet-4-20250514",
})
```

Shell 命令会创建一个合成 user message + 一个 assistant message（包含命令输出）。

---

## 12. 撤回与恢复（Revert / Unrevert）

### 撤回

```ts
// 撤回某条消息（连带之后的所有消息一起撤回）
const { data } = await client.session.revert({
  sessionID: "ses_xxx",
  messageID: "msg_xxx",
  // partID?: "part_xxx"           // 可选，撤回消息中的某个 part
})
```

撤回后：
- 该消息及之后的所有消息被标记为 "撤回"
- 文件变更会被反向恢复
- session.revert 字段记录了撤回状态

撤回后的 session 再次发消息时，系统会自动清理撤回残留：

```ts
// 撤回复原后发新消息——会自动 cleanup，不需要手动处理
await client.session.promptAsync({ sessionID: "ses_xxx", text: "换个方式" })
```

### 恢复

```ts
// 恢复撤回（撤销撤回操作）
await client.session.unrevert({ sessionID: "ses_xxx" })
```

### 判断 session 是否处于撤回状态

```ts
const { data: session } = await client.session.get({ sessionID: "ses_xxx" })
if (session.revert) {
  // 当前处于撤回状态，显示"已撤回"标记
  // revert.messageID 指示撤回到了哪条消息
}
```

---

## 13. Session 其他操作

### 13.1 获取子 Session

```ts
// 子 Agent 创建的 session
const { data: children } = await client.session.children({
  sessionID: "ses_xxx",
})
```

### 13.2 派生 Session

```ts
// 从某条消息派生出一个新 session
const { data: fork } = await client.session.fork({
  sessionID: "ses_xxx",
  messageID: "msg_xxx",       // 从此消息派生（包含该消息及之前的内容）
})
```

### 13.3 分享

```ts
// 创建分享链接
const { data: shared } = await client.session.share({ sessionID: "ses_xxx" })
// shared.share.url 就是分享链接

// 取消分享
await client.session.unshare({ sessionID: "ses_xxx" })
```

### 13.4 手动压缩

```ts
await client.session.summarize({
  sessionID: "ses_xxx",
  body: {
    providerID: "anthropic",
    modelID: "claude-sonnet-4-20250514",
    auto: false,
  },
})
```

### 13.5 获取文件变更

```ts
const { data: diffs } = await client.session.diff({
  sessionID: "ses_xxx",
  query: { messageID: "msg_xxx" },     // 可选，只看某条消息的变更
})
```

### 13.6 获取 TODO 列表

```ts
const { data: todos } = await client.session.todo({
  sessionID: "ses_xxx",
})

// type Todo = { id: string; text: string; done: boolean; ... }
```

---

## 14. 错误处理

### 14.1 SDK 错误类型

```ts
// 所有 SDK 方法返回 { data?: T, error?: ErrorType }
// throwOnError: true 时直接抛异常

type ErrorType =
  | BadRequestError    // 400
  | NotFoundError      // 404
  | ProviderAuthError  // 认证失败
  | UnknownError
  | MessageOutputLengthError
  | MessageAbortedError
  | APIError           // 通用 API 错误（含 statusCode）
```

### 14.2 典型错误处理

```ts
const result = await client.session.get({ sessionID: "ses_xxx" })
if (result.error) {
  if (result.error instanceof BadRequestError) {
    // 参数错误
  } else if (result.error instanceof NotFoundError) {
    // session 不存在
  } else {
    // 其他错误
  }
}
```

### 14.3 Session 状态判断

```ts
// 通过 SSE 事件 "session.status" 判断
{
  type: "session.status",
  properties: {
    id: "ses_xxx",
    type: "busy" | "idle" | "retry",
    attempt?: number,       // retry 时，当前第几次
    message?: string,       // retry 时，错误信息
    next?: number,          // retry 时，下次重试时间
  }
}
```

---

## 15. 上下文使用量显示

展示当前 session 的 token 使用量和模型上下文窗口占比。

### 15.1 获取 provider 列表

```ts
// 二选一即可
const { data: providers } = await sdk.client.config.providers()
// 或
const { data: providerList } = await sdk.client.provider.list()
```

### 15.2 计算使用量

```ts
async function getContextUsage(sessionID: string) {
  // 不带 limit = 获取全部消息
  const { data: messages } = await sdk.client.session.messages({
    sessionID,
  })

  // 2. 找到最后一条有 token 输出的 assistant 消息
  const last = messages.findLast(
    (m) => m.info.role === "assistant" && m.info.tokens?.output > 0,
  )
  if (!last) return null

  const tokens = last.info.tokens!

  // 3. 计算总 token
  const total =
    tokens.input +
    tokens.output +
    tokens.reasoning +
    tokens.cache.read +
    tokens.cache.write

  // 4. 获取模型 context limit 计算百分比
  const { data: providers } = await sdk.client.config.providers()
  const provider = providers.find((p) => p.id === last.info.providerID)
  const model = provider?.models[last.info.modelID]
  const limit = model?.limit?.context

  return {
    total,
    // tokens 明细
    input: tokens.input,
    output: tokens.output,
    reasoning: tokens.reasoning,
    cacheRead: tokens.cache.read,
    cacheWrite: tokens.cache.write,
    // 百分比（获取不到模型信息时为 null）
    percent: limit ? Math.round((total / limit) * 100) : null,
  }
}
```

### 15.3 展示

| 字段 | 示例 |
|------|------|
| 总 token | `12,345` |
| 使用率 | `45%`（无模型信息时不显示） |
| 模型上下文窗口 | `32,768`（可选） |

```ts
function ContextUsageDisplay({ usage }: { usage: ContextUsage }) {
  return (
    <div>
      <span>{usage.total.toLocaleString()} tokens</span>
      {usage.percent !== null && <span>（{usage.percent}%）</span>}
    </div>
  )
}
```

---

## 16. PTY 终端（React Native + Expo 接入指南）

### 16.1 完整生命周期

```
1. POST /pty                → 创建终端进程
2. POST /pty/{ptyID}/connect-token → 获取 WebSocket 票据
3. WebSocket /pty/{ptyID}/connect   → 连接到终端输出流
4. WebSocket send("ls\n")           → 发送输入
5. WebSocket recv("file1.txt\n...") → 接收输出
6. PUT /pty/{ptyID} { size }        → 调整终端尺寸
7. WebSocket close                  → 断开连接
8. DELETE /pty/{ptyID}              → 删除终端
```

### 16.2 数据模型

```ts
// PTY 信息
type Pty = {
  id: string            // "pty_<ascending>"
  title: string         // "Terminal pty_abc1"
  command: string       // "/bin/zsh"
  args: string[]
  cwd: string
  status: "running" | "exited"
  pid: number
}

// 创建参数
type PtyCreateInput = {
  command?: string      // 不传则使用系统默认 shell
  args?: string[]
  cwd?: string          // 不传则用项目目录
  title?: string
  env?: Record<string, string>
}

// 更新参数（调整尺寸或标题）
type PtyUpdateInput = {
  title?: string
  size?: { rows: number; cols: number }
}

// WebSocket 连接票据
type PtyConnectToken = {
  ticket: string        // UUID
  expires_in: number    // 秒
}
```

### 16.3 SDK 方法一览

```ts
sdk.pty.shells(params?: {
  directory?: string; workspace?: string
}): Promise<Response<string[]>>        // 获取系统可用 shell 列表

sdk.pty.list(params?: {
  directory?: string; workspace?: string
}): Promise<Response<Pty[]>>           // 获取所有终端列表

sdk.pty.create(params?: {
  directory?: string; workspace?: string
  command?: string; args?: string[]
  cwd?: string; title?: string
  env?: Record<string, string>
}): Promise<Response<Pty>>             // 创建终端

sdk.pty.get(params: {
  ptyID: string; directory?: string; workspace?: string
}): Promise<Response<Pty>>             // 获取单个终端信息

sdk.pty.update(params: {
  ptyID: string; directory?: string; workspace?: string
  title?: string; size?: { rows: number; cols: number }
}): Promise<Response<Pty>>             // 更新终端（调尺寸/改标题）

sdk.pty.remove(params: {
  ptyID: string; directory?: string; workspace?: string
}): Promise<Response<boolean>>         // 删除终端

sdk.pty.connectToken(params: {
  ptyID: string; directory?: string; workspace?: string
}): Promise<Response<PtyConnectToken>> // 获取 WebSocket 连接凭证

// WebSocket 连接由客户端自己管理，SDK 不直接封装
```

### 16.4 WebSocket 连接（核心）

#### 连接 URL

```
ws://<host>/pty/{ptyID}/connect?ticket=<ticket>&cursor=<cursor>&directory=<encoded_dir>
```

| 参数 | 说明 |
|------|------|
| `ticket` | 通过 `connectToken` 获取的 UUID（可选，用于免认证连接） |
| `cursor` | 历史输出游标，`-1` 只收新数据，不传则重放全部缓冲区 |
| `directory` | 工作目录（URL 编码），与 ticket 匹配 |

#### 发送方向（App → 服务器）

发送文本帧（Text Frame）：

```ts
ws.send("ls -la\n")       // 普通命令
ws.send("echo hello\r\n") // 带换行符
```

**重要**：必须发送换行符 `\n` 或 `\r\n` 来触发命令执行。

#### 接收方向（服务器 → App）

**普通输出帧**：Text Frame，内容为原始终端输出文本：

```
"file1.txt\nfile2.txt\n$ "
```

**元数据帧**：Binary Frame，首字节为 `0x00`，后续为 JSON：

```
0x00 + JSON.stringify({ cursor: 12345 })
```

`cursor` 是服务器端累计输出的总字节数，用于断线重连时传回 `?cursor=` 参数。

#### 完整连接流程

```ts
// 1. 获取连接票据
const { data: token } = await sdk.pty.connectToken({ ptyID })

// 2. 建立 WebSocket
const wsUrl = `ws://host/pty/${ptyID}/connect?ticket=${token.ticket}&cursor=-1`
const ws = new WebSocket(wsUrl)

let totalCursor = 0

ws.onopen = () => {
  // 连接已建立，可以开始发送输入
  ws.send("ls\n")
}

ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
    // Binary frame → 元数据
    const buf = new Uint8Array(event.data)
    if (buf[0] === 0x00) {
      const meta = JSON.parse(new TextDecoder().decode(buf.slice(1)))
      totalCursor = meta.cursor
      return
    }
  }
  // Text frame → 终端输出
  appendToTerminal(event.data)
}

ws.onclose = () => {
  // 记录 totalCursor，下次重连时传回去
}

ws.onerror = () => {
  // 可触发重连
}
```

### 16.5 断线重连

```ts
async function connectPty(ptyID: string, lastCursor: number = -1) {
  const { data: token } = await sdk.pty.connectToken({ ptyID })
  const url = `ws://host/pty/${ptyID}/connect?ticket=${token.ticket}&cursor=${lastCursor}`
  const ws = new WebSocket(url)

  // 重连时 cursor 告诉服务器从哪开始重放
  // -1  = 不重放历史（只收新数据）
  // 0   = 从缓冲区开头重放
  // N   = 从第 N 字节开始重放
  return ws
}
```

**建议**：每次收到元数据帧时更新 `lastCursor`，重连时传回去即可无缝恢复。

### 16.6 调整终端尺寸

```ts
// 终端默认尺寸通常为 80x24
// App 初始化时或屏幕尺寸变化时调用
await sdk.pty.update({
  ptyID: "pty_xxx",
  size: { cols: 80, rows: 40 },
})
```

**建议时机**：
- WebSocket 刚连接成功后立即设置一次
- 屏幕旋转或键盘弹出/收起时
- 分屏尺寸变化时

### 16.7 React Native + Expo 实现要点

#### 推荐的库

| 用途 | 推荐库 |
|------|--------|
| WebSocket | React Native 内置 `WebSocket` |
| 终端渲染 | 手动实现 ANSI 解析 + VirtualizedList |
| ANSI 转义处理 | `anser` 或 `anser` npm 包（纯 JS，兼容 RN） |
| 键盘输入 | React Native `TextInput`（捕捉按键事件） |

#### 终端文本渲染

```tsx
// 核心思路：用 ANSI 解析库将原始输出转为带样式的片段
import anser from "anser"

function parseOutput(text: string) {
  return anser.ansiToJson(text, { use_classes: false })
}

// 每个片段渲染为带颜色的 <Text>
function TerminalLine({ segments }: { segments: AnserJsonEntry[] }) {
  return (
    <Text style={{ fontFamily: "monospace", fontSize: 14 }}>
      {segments.map((seg, i) => (
        <Text key={i} style={{
          color: ansiColorToRN(seg.fg),
          backgroundColor: seg.bg ? ansiColorToRN(seg.bg) : undefined,
          fontWeight: seg.decorations?.includes("bold") ? "bold" : undefined,
        }}>
          {seg.content}
        </Text>
      ))}
    </Text>
  )
}
```

#### 输出缓冲区管理

```ts
// 用数组维护所有输出行，配合 VirtualizedList 实现高性能滚动
const [lines, setLines] = useState<OutputLine[]>([])

ws.onmessage = (event) => {
  if (typeof event.data !== "string") return

  const text = event.data
    .replace(/\r\n/g, "\n")   // 统一换行符
    .replace(/\r/g, "\n")

  const newLines = text.split("\n").map((content) => ({
    id: nextId(),
    segments: anser.ansiToJson(content),
  }))

  setLines((prev) => [...prev, ...newLines])
}
```

#### 输入处理

```tsx
function TerminalInput({ ws }: { ws: WebSocket }) {
  const [input, setInput] = useState("")

  return (
    <View style={{ flexDirection: "row" }}>
      <Text style={{ fontFamily: "monospace" }}>$ </Text>
      <TextInput
        style={{ flex: 1, fontFamily: "monospace" }}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={() => {
          ws.send(input + "\n")     // 必须带换行符
          setInput("")
        }}
        autoFocus
      />
    </View>
  )
}
```

#### 完整的 Hook

```tsx
function useTerminal(ptyID: string) {
  const [lines, setLines] = useState<OutputLine[]>([])
  const [status, setStatus] = useState<Pty["status"]>("running")
  const [cursor, setCursor] = useState(-1)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(async () => {
    const { data: token } = await sdk.pty.connectToken({ ptyID })
    const url = `ws://host/pty/${ptyID}/connect?ticket=${token.ticket}&cursor=${cursor}`
    const ws = new WebSocket(url)

    ws.onopen = () => {}

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        const buf = new Uint8Array(event.data)
        if (buf[0] === 0x00) {
          setCursor(JSON.parse(new TextDecoder().decode(buf.slice(1))).cursor)
          return
        }
      }
      if (typeof event.data === "string") {
        const segs = anser.ansiToJson(event.data)
        setLines((prev) => [...prev, { id: Date.now(), segments: segs }])
      }
    }

    ws.onclose = () => { wsRef.current = null }
    wsRef.current = ws
  }, [ptyID])

  const sendInput = useCallback((text: string) => {
    wsRef.current?.send(text + "\n")
  }, [])

  const resize = useCallback(async (cols: number, rows: number) => {
    await sdk.pty.update({ ptyID, size: { cols, rows } })
  }, [ptyID])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
  }, [])

  // 监听 ws.onmessage 中的 exit 事件
  useEffect(() => {
    const sub = sdk.event.subscribe()
    // 处理 event.type === "pty.exited"
    // setStatus("exited")
    return () => sub.then((s) => s.close())
  }, [])

  return { lines, status, connect, sendInput, resize, disconnect }
}
```

### 16.8 错误处理

```ts
try {
  const { data: pty } = await sdk.pty.create({
    command: "/bin/zsh",
    cwd: "/project",
  })
} catch (err) {
  if (err.statusCode === 404) {
    // session 不存在
  } else if (err.statusCode === 403) {
    // 无权限（PtyForbiddenError）
  }
}

// WebSocket 层面的错误直接在 onerror/onclose 处理
ws.onclose = (event) => {
  if (event.code !== 1000) {
    // 异常断开，触发重连
    reconnect()
  }
}
```

### 16.9 SSE 事件

PTY 的状态变更通过 SSE 推送：

| 事件 | 时机 | 用途 |
|------|------|------|
| `pty.created` | 终端创建 | 显示新终端标签页 |
| `pty.updated` | 终端更新 | 刷新终端信息 |
| `pty.exited` | 进程退出 | 显示退出码，禁用输入框 |
| `pty.deleted` | 终端删除 | 关闭终端标签页 |

```ts
event.type === "pty.exited" && {
  // 禁用输入，显示 "Process exited with code 0"
  setStatus("exited")
  setExitCode(event.properties.exitCode)
}
```

### 16.10 一个完整示例（React Native + Expo）

```tsx
import React, { useEffect, useRef, useState, useCallback } from "react"
import { View, Text, TextInput, FlatList, StyleSheet } from "react-native"
import anser from "anser"
import { createOpencodeClient } from "@opencode-ai/sdk/client"

const sdk = createOpencodeClient({ baseUrl: "http://localhost:4096" })

type Segment = { content: string; fg?: string; bg?: string; bold?: boolean }
type Line = { id: number; segments: Segment[] }

export default function TerminalScreen({ route }) {
  const { ptyID } = route.params
  const [lines, setLines] = useState<Line[]>([])
  const [exited, setExited] = useState(false)
  const wsRef = useRef<WebSocket>(null)
  const flatRef = useRef<FlatList>(null)

  // 连接
  useEffect(() => {
    ;(async () => {
      const { data: token } = await sdk.pty.connectToken({ ptyID })
      const ws = new WebSocket(
        `ws://localhost:4096/pty/${ptyID}/connect?ticket=${token.ticket}&cursor=-1`,
      )

      ws.onmessage = (event) => {
        // 元数据帧
        if (event.data instanceof ArrayBuffer) {
          const buf = new Uint8Array(event.data)
          if (buf[0] === 0x00) return
        }
        if (typeof event.data !== "string") return

        const text = event.data.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        const segs = anser.ansiToJson(text).map((s) => ({
          content: s.content,
          fg: s.fg,
          bg: s.bg,
          bold: s.decorations?.includes("bold"),
        }))
        setLines((prev) => [...prev, { id: Date.now(), segments: segs }])
      }

      ws.onopen = () => {
        // 设置初始尺寸
        sdk.pty.update({ ptyID, size: { cols: 80, rows: 40 } })
      }

      ws.onclose = () => setExited(true)
      wsRef.current = ws
    })()

    return () => wsRef.current?.close()
  }, [ptyID])

  // 自动滚动到底部
  useEffect(() => {
    if (lines.length > 0) {
      flatRef.current?.scrollToEnd({ animated: false })
    }
  }, [lines.length])

  const handleSubmit = useCallback((text: string) => {
    wsRef.current?.send(text + "\n")
  }, [])

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatRef}
        data={lines}
        renderItem={({ item }) => (
          <Text style={styles.line}>
            {item.segments.map((seg, i) => (
              <Text key={i} style={{
                color: seg.fg || "#fff",
                fontWeight: seg.bold ? "bold" : undefined,
              }}>
                {seg.content}
              </Text>
            ))}
          </Text>
        )}
        keyExtractor={(item) => String(item.id)}
      />

      {!exited && (
        <TerminalInput onSubmit={handleSubmit} />
      )}
      {exited && (
        <Text style={styles.exited}>Process exited</Text>
      )}
    </View>
  )
}

function TerminalInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("")

  return (
    <View style={styles.inputRow}>
      <Text style={styles.prompt}>$ </Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => { onSubmit(text); setText("") }}
        autoFocus
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  line: { fontFamily: "monospace", fontSize: 14, color: "#fff", paddingHorizontal: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", padding: 8 },
  prompt: { fontFamily: "monospace", color: "#0f0", fontSize: 14 },
  input: { flex: 1, fontFamily: "monospace", color: "#fff", fontSize: 14 },
  exited: { color: "#888", textAlign: "center", padding: 8 },
})
```

### 16.11 关键总结

| 操作 | 说明 |
|------|------|
| 创建终端 | `POST /pty` 指定 command/cwd/args，默认用系统 shell |
| WebSocket 连接 | `connectToken` 拿 ticket → `ws://host/pty/{id}/connect?ticket=...&cursor=...` |
| 发输入 | `ws.send("command\n")`，**必须带换行符** |
| 收输出 | Text Frame = 原始终端文本，Binary Frame(0x00) = 元数据 |
| 调尺寸 | `PUT /pty/{id} { size: { cols, rows } }` |
| 断线重连 | 保存元数据帧的 cursor，重连时传回去 |
| 进程退出 | 通过 SSE 事件 `pty.exited` 获知 |
| 终端渲染 | 用 `anser` 解析 ANSI 转义，`FlatList` 虚拟化渲染 |
| WebSocket | 使用 RN 内置 WebSocket，无需额外库 |

### Session 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/session` | 列表 |
| POST | `/session` | 创建 |
| GET | `/session/{id}` | 详情 |
| PATCH | `/session/{id}` | 更新 |
| DELETE | `/session/{id}` | 删除 |
| GET | `/session/{id}/children` | 子 session |

### 消息

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/session/{id}/message` | 消息列表（分页） |
| GET | `/session/{id}/message/{msgId}` | 单条消息 |
| POST | `/session/{id}/message` | 发送消息 |
| DELETE | `/session/{id}/message/{msgId}` | 删除消息 |

### Part

| 方法 | 路径 | 说明 |
|------|------|------|
| PATCH | `/session/{id}/message/{msgId}/part/{partID}` | 更新 Part |
| DELETE | `/session/{id}/message/{msgId}/part/{partID}` | 删除 Part |

### Session 操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/session/{id}/fork` | 派生 |
| POST | `/session/{id}/revert` | 撤回 |
| POST | `/session/{id}/unrevert` | 恢复撤回 |
| POST | `/session/{id}/abort` | 中断 |
| POST | `/session/{id}/summarize` | 压缩 |
| POST | `/session/{id}/share` | 分享 |
| DELETE | `/session/{id}/share` | 取消分享 |
| POST | `/session/{id}/init` | 初始化项目 |
| GET | `/session/{id}/diff` | 文件变更 |
| GET | `/session/{id}/todo` | TODO 列表 |
| POST | `/session/{id}/command` | Slash 命令 |
| POST | `/session/{id}/shell` | Shell 命令 |
| POST | `/session/{id}/prompt_async` | 异步发送 |

### 权限 & 问答

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/session/{id}/permissions/{permID}` | 权限列表 |
| POST | `/session/{id}/permission/{permID}/reply` | 回复权限 |
| POST | `/session/{id}/question/{id}/reply` | 回答问题 |
| POST | `/session/{id}/question/{id}/reject` | 拒绝回答 |

### 全局

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/global/event` | SSE 事件流 |
| GET | `/global/health` | 健康检查 |
| GET | `/global/config` | 配置 |
| PATCH | `/global/config` | 更新配置 |

---

## 附录：一个完整的聊天流程示例

```ts
// 1. 初始化
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  throwOnError: true,
})

// 2. 获取或创建 session
let session = (await client.session.list({ limit: 1 }))[0]
if (!session) {
  session = await client.session.create({ title: "新对话" })
}

// 3. 订阅 SSE（异步）
const stream = await client.event.subscribe()
;(async () => {
  for await (const event of stream) {
    handleEvent(event)
  }
})()

// 4. 发消息
const messageID = crypto.randomUUID()
await client.session.promptAsync({
  sessionID: session.id,
  messageID,
  parts: [
    { type: "text", text: "帮我重构这个函数" },
    { type: "file", mime: "text/plain", url: "/src/utils.ts" },
  ],
})

// 5. 乐观更新：在本地先显示用户消息
addMessage({
  info: { id: messageID, role: "user", time: { created: Date.now() }, ... },
  parts: [{ type: "text", text: "帮我重构这个函数" }],
})

// 6. 处理 SSE 事件
function handleEvent(event) {
  const { type, properties } = event.payload
  const { sessionID } = properties

  switch (type) {
    case "session.next.prompted":
      // 确认用户消息已创建
      break

    case "session.next.step.started":
      // 添加空 assistant 消息，准备接收流式内容
      startAssistantMessage(sessionID, properties.messageID)
      break

    case "session.next.text.started":
      // 追加 text part，存放最终回复
      startTextPart(sessionID, properties.messageID, properties.partID)
      break

    case "session.next.reasoning.started":
      // 追加 reasoning part，存放模型思考过程
      startReasoningPart(sessionID, properties.messageID, properties.partID)
      break

    case "session.next.reasoning.ended":
      // 标记 reasoning 完成
      finalizeReasoningPart(sessionID, properties.messageID, properties.partID)
      break

    case "message.part.delta":
      // 实时追加文本（text 和 reasoning 共用，靠 partID 区分）
      appendPartDelta(sessionID, properties.messageID, properties.partID, properties.field, properties.delta)
      break

    case "session.next.tool.called":
      // 工具开始执行 → 更新 tool 状态为 running
      updateToolState(sessionID, properties.messageID, properties.callID, "running")
      break

    case "session.next.tool.success":
      // 工具执行成功 → 显示结果
      updateToolState(sessionID, properties.messageID, properties.callID, "completed", properties.output)
      break

    case "session.next.step.ended":
      // assistant 消息完成
      finalizeAssistantMessage(sessionID, properties.messageID)
      break

    case "permission.asked":
      // 弹出权限审批对话框
      showPermissionDialog(properties)
      break

    case "question.asked":
      // 弹出问题对话框
      showQuestionDialog(properties)
      break

    case "session.status":
      // 更新 session 状态（busy/idle）
      updateSessionStatus(sessionID, properties)
      break
  }
}
```
