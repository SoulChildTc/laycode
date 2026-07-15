# 聊天页面架构（CHAT-ARCHITECTURE）

> 本文档沉淀聊天页面（`app/src/screens/SessionScreen.tsx`）的架构、勘探与考古结论。所有关键结论均以一手来源（SDK 生成类型、opencode server 源码、官方桌面版 `event-reducer`）为依据。
>
> 状态：**已完成**。已迁移到 opencode V2 事件协议。消息流由纯 reducer（`app/src/chat/v2Reducer.ts`）驱动，渲染经适配层（`app/src/chat/adaptMessages.ts`）派生。`messageRoles` / `reasoningPartIds` / `loading-` 前缀等 V1 hack 已全部移除。会话级状态（sending / banner / 权限 / 提问）由 `app/src/chat/reducer.ts` 管理。三个纯模块均有单测。

---

## 0. 术语与架构背景（陌生人必读）

**三个组件的关系：**
```
手机 App（Expo React Native）
   │  HTTP + SSE/WS
   ▼
Bridge（运行在电脑上的 Node 服务，npm 包 laycode-cli）
   │  HTTP（大部分请求纯代理转发）
   ▼
opencode（本地 AI 编码引擎，真正干活的后端）
```
- **App**：本项目 `laycode/app`。用户在手机上操作的界面。
- **Bridge**：本项目 `laycode/bridge`。桥接手机与电脑本地 opencode。`/opencode-api/<path>` 的请求几乎全部原样代理给 opencode；仅事件流做了 SSE→WS 的可选转换（纯字节搬运，不改内容）。
- **opencode**：外部开源项目（本仓库通过软链接 `work/opencode` 对照其源码）。App 的一切聊天能力最终由它提供。

**V1 / V2 是什么：**
opencode 的 SDK 有两套并存的接口/事件协议：
- **V1**：老协议，位于 opencode 的 `packages/core/src/v1/` 兼容层。事件是"当前完整值"的快照式更新（如 `message.part.updated`）。
- **V2**：新协议，opencode 的发展主线。事件是语义化、按渲染顺序的流式事件（如 `session.next.text.delta`），自带完整归属信息。
- App 的 SDK 客户端同时 import 了两套（`@opencode-ai/sdk/client` 和 `@opencode-ai/sdk/v2/client`），当前**混用**（见 §2.3）。

**事件流的外层结构：**
App 从 `/opencode-api/global/event`（SSE）收到的每条事件，JSON 结构为：
```ts
{ payload: { id: string, type: string, properties: Record<string, unknown> } }
// 解析：const payload = raw?.payload || raw; const evType = payload?.type; const props = payload?.properties || {}
```

---

## 1. 背景与问题

聊天页面是本 App 的核心，但目前是一个 1461 行的巨型组件，30+ state、20+ handler，至少揉了 7 类独立职责，彼此通过共享可变状态耦合。表现出的问题：

- 逻辑难以维护、边界情况脆弱（滚动跟随、断线重连反复出问题）。
- 消息流处理（SSE）约 300 行，充斥客户端侧的猜测式补丁。
- 未来加功能的成本高、回归风险大。

目标不是"整理代码"，而是按抽象层级重新分层，并对齐 opencode 官方主线，让后续开发少关注底层兼容性。

---

## 2. 现状测绘

### 2.1 职责分布（现全部在 SessionScreen 一个文件）

| 职责 | 现状代码 |
|---|---|
| 消息解析 | `parseMessages`、`tokenSum`（纯函数，已半独立） |
| 消息流 + SSE 实时接收 | ~300 行 useEffect（`XMLHttpRequest` 连 `/opencode-api/global/event`）、重连退避、AppState 处理 |
| 滚动跟随 | `isAtBottom`/`userScrolling`/`lastOffset` + `maintainVisibleContentPosition` |
| 发送 + 附件 | `handleSend`、图片/文件选择、base64 编码 |
| 权限 / 提问交互 | `pendingPermissions`/`pendingQuestions` + reply×3 |
| 模型 / Agent 选择 | `currentModel`/`providers`/`saveSessionModel` |
| revert / 子会话 / 分页 | `revert`、`childSessions`、`handleLoadMore` |

### 2.2 传输层现状（两条并存、不一致）

| 通路 | 实现 | 使用方 |
|---|---|---|
| SSE 直连 | `bridge` 的 `createSseHandler('/global/event')`，纯透传 | **SessionScreen**（`XMLHttpRequest`） |
| SSE→WebSocket | `bridge/src/ws.ts`，把 SSE 转成 WS | Terminal 相关（`/event` WS） |

**bridge 对事件是纯字节搬运**：`ws.ts` 仅提取 `data:` 后的原始 JSON 原样转发，不解析类型、不改写 payload、不关心 V1/V2。因此 bridge 对事件 schema 变化天然透明——事件适配负担在 App 端，不在 bridge。

### 2.3 客户端 API 混用现状（`app/src/api/client.ts`）

- 用 **V2**（`this.v2`）：session.create、app.agents、revert/unrevert/abort/summarize、全部 pty —— 均为一次性请求/响应操作。
- 用 **V1**（`this.client`）：session.list/delete/messages、prompt/promptAsync、file.list/read —— **消息发送与历史拉取刻意留在 V1**。
- SSE 事件流：连 `/opencode-api/global/event`，手动解析 V1 风格事件（`message.part.updated` / `message.part.delta`）。

---

## 2bis. 功能清单（复刻的完整性基准）

> 这是"聊天页面到底有哪些功能"的权威清单。重构后必须逐条复刻，不得遗漏。每条标注对应的现状代码位置，便于查证行为细节。

### A. 会话加载与生命周期
- A1. 进入会话时加载：session 元信息、首屏消息（分页 `PAGE_SIZE=10`）、providers 列表，并行拉取（`reloadSession`）。
- A2. 从消息推断当前状态：有运行中的工具或未完成消息 → `sending=true`；末条消息的 agent → 设为当前 agent；末条 assistant 的 provider/model → 当前模型。
- A3. 计算并显示上下文 token 用量：取最后一条"已完成且有 tokens"的 assistant 消息，`tokenSum = input+output+reasoning+cache.read+cache.write`。
- A4. 加载已保存的模型偏好（按 sessionId 存 AsyncStorage）覆盖推断值。
- A5. 加载待处理的权限/提问（进入时拉一次 `listPendingPermissions/Questions`，需 directory）。
- A6. 切后台再回前台：中止旧连接 → `reloadSession()` + 重连 SSE，显示"已重连"横幅 1.5s。

### B. 消息渲染
- B1. 用户消息：文本 + 文件附件（图片/文件）。
- B2. assistant 消息：推理（reasoning，可折叠、有 active 态）+ 正文文本 + 工具调用列表 + 文件产物。
- B3. 工具调用渲染：按工具名（bash/read/write/edit/grep/glob/webfetch/websearch/task/apply_patch/todowrite）区分展示；状态机 pending/running/completed/error。
- B4. 倒置列表（`inverted`），最新消息在视觉底部。
- B5. 消息分页：上滑到顶触发 `handleLoadMore`，游标翻页，按 id 去重。
- B6. 空会话：显示问候语 + 建议 chip。

### C. 实时流式（打字机）
- C1. 文本增量实时追加（delta）。
- C2. 推理增量实时追加。
- C3. 工具调用状态实时更新（新增/状态变化/output）。
- C4. step-finish：更新 token 用量；reason=stop 时 `sending=false`。
- C5. 乐观更新：发送时立即插入 user 消息 + loading 占位；真实消息到达后替换/清除 loading。

### D. 会话状态与横幅（`sessionBanner`，顶部条）
- D1. idle：清 sending、清横幅、移除 loading 占位。
- D2. busy：`sending=true`。
- D3. retry：`sending=true` + 显示"⚠️ {message}"横幅。
- D4. 压缩开始：显示"正在压缩对话..."横幅。
- D5. 压缩结束：清横幅 + 插入压缩分隔消息（自动/手动压缩 badge）。
- D6. session.error：清 sending；非 MessageAbortedError 才显示错误横幅 + 插入错误消息气泡；中止不显示错误。
- D7. 横幅可手动关闭（x）；"已重连"横幅绿色、其它红色。

### E. 发送与附件
- E1. 发送文本消息（`promptAsync`，带当前 model + agent）。
- E2. 附件：拍照（相机权限）、相册选图（base64）、选文件（DocumentPicker），转 base64 内联。
- E3. 附件预览 + 单个移除。
- E4. 发送失败：清 sending + 错误横幅 + 移除 loading 占位。
- E5. 有待处理权限/提问时，输入框禁用。
- E6. 中止（Stop 按钮）：`abortSession`。

### F. 权限与提问
- F1. 权限请求：顶部黄色 banner 显示待处理数量 + 底部 PermissionPrompt（回复 once/always/reject，reject 可带 message）。
- F2. reject 带 message 时插入 loading 占位（等待 AI 继续）。
- F3. 提问请求：QuestionPrompt（回复 answers / 拒绝）。
- F4. 实时事件 `permission.asked/replied`、`question.asked/replied/rejected` 增删待处理列表（去重）。

### G. 模型 / Agent 选择
- G1. 模型选择器 Modal（ModelSelectorModal）；选中后按 session 持久化。
- G2. Agent 选择器 Modal（AgentSelectorModal）；agent 来源：父级传入 > 回退拉取（过滤 subagent/hidden）。
- G3. 默认模型：providers 的 default 末项；无当前模型时用默认。

### H. Revert / Unrevert（撤回/恢复）
- H1. 撤回某条消息（`revertMessage`）：显示 RevertBanner（撤回条数 + diff 文件列表），把被撤回的用户输入文本回填输入框。
- H2. 进入会话时若 session 处于撤回态，恢复展示 RevertBanner。
- H3. 恢复（Unrevert）：清撤回态 + 重新加载消息。

### I. 子会话（Subagent）
- I1. task 工具点击 → 跳转子会话（从 metadata.sessionId 或 output 的 `<task id>` 或列表查找）。
- I2. 子会话底部 SubagentFooter：显示 agent 名 + 当前/总数 + 上一个/下一个切换。
- I3. 子 Agent 列表 Modal（showChildSessions）。

### J. 其它交互
- J1. 标题重命名（点标题 → Modal → `renameSession`）。
- J2. 悬浮工具按钮（FAB，可拖拽、位置持久化）：菜单跳 Git / Terminal。
- J3. header 显示：标题（sending 时"AI 思考中..."）、副标题（agent · model · cwd）、状态点（sending 黄 / 空闲绿）。
- J4. 滚动：贴底跟随打字机；上滑停止跟随；"回到底部"按钮；`maintainVisibleContentPosition` 防内容增长顶动。

### K. 连接鲁棒性
- K1. SSE 断线：指数退避重连（1s→2s→…→30s 上限），第 2 次起显示倒计时横幅。
- K2. 重连成功（onprogress 首次）：清倒计时 + "已重连"横幅 1.5s。
- K3. 组件卸载：中止 xhr + 清定时器。

---

## 3. 考古结论：为什么当年混用 V1/V2

> 核心认知：现有代码的别扭，多数是"妥协的产物"，不是能力问题。重构必须显式保留这些妥协所应对的真实约束，否则会重踩当年的坑。

### 3.1 当年退回 V1 的根因（一手证据）

V2 的流式增量事件（`session.next.text.delta` 等）在 schema 中标注为 **live-only、不可回放**：

```
// Stream fragments are live-only; Text.Ended is the replayable full-value boundary.
```
（见 `opencode/packages/core/src/session/event.ts` 旧版 / `packages/schema/src/session-event.ts` 新版，注释原样保留）

含义：单靠 delta，必须从 started 连续接住到 ended 才能拼出完整文本。一旦断线重连、或中途进入会话，中间 delta 全丢。而移动端网络频繁抖动、切后台，V2 这套"依赖流连续性"的模型很脆弱。

因此当年的权衡是正确的工程决策：

| | V2（`session.next.*`） | V1（`message.part.*`） |
|---|---|---|
| delta 语义 | live-only，不可回放 | 快照式，当前完整值 |
| 断线重连 | 丢失中间 delta，需靠 ended/重拉补全 | 重连拉一次即完整恢复 |
| 归属信息 | 完整（自带 messageID/partID/类型） | 需客户端用 Set/Map 猜 |
| 移动端适配 | 脆弱（依赖流连续性） | 鲁棒 |

一次性 session 操作用 V2（幂等、无所谓），消息流退回 V1（快照语义对断线鲁棒）。

### 3.2 由此产生的客户端 hack（都是 V1 信息不足逼出来的）

- `messageRoles: Map` —— V1 part 事件不明确带角色，客户端自己记。
- `reasoningPartIds: Set` —— delta 不说是不是推理，客户端自己标记。
- `loading-` / `u-` 前缀临时消息 + 大量 `filter(startsWith)` —— 乐观更新与真实消息对账靠字符串前缀猜。
- 角色推断分支（user→assistant 的兜底转换）。

这些在 V2（事件自带完整归属）下大部分不再需要。

### 3.3 关键区分：扔掉 hack，保留行为

> 重构时最容易犯的错，是把这些 hack 当成"必须保留的资产"照抄过去。它们不是资产，是 V1 缺陷留下的疤。

- **hack（实现手段）要扔掉**：`reasoningPartIds` Set、`messageRoles` Map、`loading-`/`u-` 前缀 + `filter(startsWith)` 对账、user→assistant 角色推断分支——这些存在的唯一原因是 V1 事件信息不足、客户端只能靠猜。V2 事件自带完整归属信息（`assistantMessageID`/`textID`/`reasoningID`/`callID`），这些猜测手段全部失去存在意义。
- **行为（用户可见效果）必须保留**：这些 hack 当年想达成的效果是产品功能，跟协议无关，必须逐条复刻。

| Hack（扔掉） | 存在原因（V1 缺陷） | 保留的行为 | V2 如何替代 |
|---|---|---|---|
| `reasoningPartIds: Set` | delta 不带 part 类型 | 推理/正文分区显示（B2/C2） | 事件自带 `reasoningID`/`textID` |
| `messageRoles: Map` | part 事件不明确带角色 | 消息归到正确的 user/assistant（B2） | 事件自带 `assistantMessageID` |
| `loading-`/`u-` 前缀对账 | 无法对账乐观消息与真实消息 | 发送即显示、回复到达替换占位（C5） | `step.started` 带真实 messageID，直接对账 |
| user→assistant 推断分支 | 无法确定空消息最终角色 | 消息以正确角色呈现 | 事件明确标注消息角色 |

一句话原则：**保留"做到什么"，扔掉"当年被迫怎么做到的"。**

---

## 4. 关键变化：新版 opencode 补齐了断线恢复能力

> 用户实际跑的 opencode 由 bridge 绑定，可随 bridge 升级。bridge 对事件纯透传，因此升级 opencode 版本即可吃到新架构，无需改 bridge 转发逻辑。

新版 opencode 是一次架构级升级，引入事件溯源 + 投影：

- **SessionProjector**（`core/src/session/projector.ts`）：把事件流投影/持久化到数据库（Drizzle，MessageTable/PartTable）。
- **durable 事件**：边界事件（如 `Text.Ended`）标注 `durable: { aggregate: "sessionID", version }`，可回放。
- **`memory(state)` reducer adapter**（`core/src/session/message-updater.ts`）：把"事件 → 消息状态"抽成纯函数式适配器，服务端投影用它，客户端理论上可复用逻辑。

**delta 仍是 live-only（物理特性未变）**，但恢复不再依赖 delta：

- 实时：接 `session.next.*` 事件（带完整归属）驱动打字机。
- 恢复（断线/进会话/切后台回来）：拉 `session.messages` 获取投影后的完整消息，一步重建。

这正是当年缺失、导致退回 V1 的那块能力。**"跟随 V2"现在不仅趋势正确，技术上也终于可行。**

---

## 5. 战略决策：跟随 opencode V2 主线

理由：
1. V1 位于 `packages/core/src/v1/` 兼容层，会被逐步淘汰；押注它 = 押注会消失的东西。
2. 官方重心明显在 Projector/durable 事件；这是发展方向。
3. 现在做 V1 以后还得改 V2，一步到位跟主线只改一次。
4. 新版 Projector 恰好解决了当年退回 V1 的根因，时机成立。

---

## 6. 两个落地前提（已用一手源码验证 ✅）

### 6.1 V2 事件完整性 ✅
`core/src/session/runner/publish-llm-event.ts`（`createLLMEventPublisher`）完整发出：
- `Text.Started/Delta/Ended`、`Reasoning.Started/Delta/Ended`、`Tool.Input.Started/Delta/Ended`、`Tool.Called/Success/Failed`、`Step.Started/Failed`。
- 每个 delta 都带 `assistantMessageID` + `textID/reasoningID/callID`（归属完整，客户端不用猜）。
- 内部维护 fragments，在 delta 之外还 publish `.Ended` 携带拼好的完整值（可回放边界）。

结论：V2 事件流完整、自洽、带完整归属和完整值边界。当年"信息不足要猜"的问题在这套发射器中不存在。

### 6.2 投影拉取恢复 ✅
`server/src/handlers/message.ts` 的 `session.messages` → 调 `SessionV2.Service.messages(...)`，从持久化（Projector 投影落库）读取，带 base64url 游标分页（`{id, order, direction}`）。返回已投影的完整消息，非事件流。

结论：断线/进会话时拉此接口即可完整重建，不依赖 delta 连续性。

---

## 7. 目标分层架构

> 按抽象层级分（数据→领域→视图→交互），不按 useState 主题分。核心原则：**数据单向流动**——SSE 是源头，其它层消费其产出或向其发指令，不互相直接改对方 state。

```
┌─────────────────────────────────────────────────────────┐
│ 传输层  Transport                                          │
│   与 bridge/opencode 的连接、SSE 原始事件流、重连退避、       │
│   AppState（前后台）处理。纯管道，不懂业务。                  │
│   决策项：SSE 直连 vs 统一到 WS（见 §9）。                   │
└───────────────┬─────────────────────────────────────────┘
                │ 原始事件（{ payload: { id, type, properties } }）
┌───────────────▼─────────────────────────────────────────┐
│ 领域层  Domain（重构核心价值所在）                           │
│   事件 → 领域状态机（Message / Part / ToolState /          │
│   SessionStatus）。消费 V2 `session.next.*` 事件；          │
│   断线时以 `session.messages` 投影为真相源重建。            │
│   尽量复用官方 memory() reducer 逻辑，少自己发明。           │
│   ★ 一等约束：断线可恢复（靠投影/快照，不靠 delta 连续性）。  │
└───────────────┬─────────────────────────────────────────┘
                │ messages / sessionStatus / streamingPart
┌───────────────▼─────────────────────────────────────────┐
│ 视图状态层  View State                                     │
│   消费领域产出，处理呈现相关的交互细节：未读、可见性、          │
│   滚动跟随等。均为细节，不构成重构重心。                       │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ 交互层  Interaction                                        │
│   发送、附件、权限应答、提问应答、模型/Agent 选择。            │
│   向领域层发指令。                                          │
└─────────────────────────────────────────────────────────┘
```

领域模型（对齐 opencode）：**Session → Message → Part（11 种）→ ToolState（pending/running/completed/error 四态机）**。直接采用，不自行发明。

---

## 8. 领域层的核心契约（草案）

- 传输层产出：`RawEvent` 流 + 连接状态（online/reconnecting/offline）。
- 领域层产出（对上层）：
  - `messages: Message[]`（有序）
  - `sessionStatus: idle | busy | retry`
  - `streamingPart: { messageID, partID, field, buffer } | null`
- 领域层入口（对下层/指令）：`sendPrompt`、`abort`、`revert/unrevert`、`replyPermission/replyQuestion`。
- 恢复策略：进入会话 / 断线重连 / 切后台返回 → 调 `session.messages` 拉投影，替换/对账内存状态；实时 `.Ended` 事件作为完整值校正边界。

---

## 8bis. 事件处理映射表（领域层施工图）

> 领域层的实质就是"每个事件如何改变消息状态"。左列是现状（V1，来自 SessionScreen 的 SSE useEffect），右列是目标（V2）。重构时逐行对照，确保行为等价。事件外层解析见 §0。

### 现状 V1 事件 → 行为（必须复刻这些行为，不是复刻实现方式）

| V1 事件 (`type`) | 现状处理 | 对应功能点 |
|---|---|---|
| `message.updated` | 记录 `messageRoles[info.id] = role` | （辅助，V2 下不需要） |
| `session.idle` | sending=false，清横幅，移除 loading- 占位 | D1 |
| `session.status` type=idle | 同上 | D1 |
| `session.status` type=busy | sending=true | D2 |
| `session.status` type=retry | sending=true + "⚠️{message}"横幅 | D3 |
| `session.next.compaction.started` | "正在压缩对话..."横幅 | D4 |
| `session.next.compaction.ended` | 清横幅 + 插入 compaction 分隔消息 | D5 |
| `session.compacted` | 清横幅 | D5 |
| `session.error` | sending=false；非 abort 显示错误横幅 + 插错误气泡 | D6 |
| `message.part.updated` type=reasoning（空） | 标记 reasoning active，必要时新建 assistant 消息 | B2/C2 |
| `message.part.updated` type=reasoning（非空） | 设 reasoning 文本 | B2/C2 |
| `message.part.updated` type=text | 合并文本（按角色/loading 判定归属） | B2/C1 |
| `message.part.updated` type=tool | 新增/更新工具调用 | B3/C3 |
| `message.part.updated` type=step-finish | 更新 token；reason=stop → sending=false | C4 |
| `message.part.updated` type=file | 合并文件产物 | B2 |
| `message.part.delta` | 按 partID 追加文本/推理增量（用 reasoningPartIds 判类型） | C1/C2 |
| `permission.asked` / `permission.replied` | 增/删待处理权限（去重） | F4 |
| `question.asked` / `question.replied` / `question.rejected` | 增/删待处理提问（去重） | F4 |

### 目标 V2 事件 → 行为（重构后消费这些）

| V2 事件 | 行为 | 替代了哪些 V1 hack |
|---|---|---|
| `session.next.step.started` | 新建 assistant 消息（带 assistantMessageID） | 消除"新建消息靠 loading/角色推断" |
| `session.next.text.started/delta/ended` | 文本 part：起/增量/完整值（自带 textID） | 消除 messageRoles 猜归属 |
| `session.next.reasoning.started/delta/ended` | 推理 part（自带 reasoningID） | 消除 reasoningPartIds Set |
| `session.next.tool.input.started/delta/ended` | 工具入参流 | — |
| `session.next.tool.called` | 工具 → running | B3/C3 |
| `session.next.tool.success/failed` | 工具 → completed/error | B3/C3 |
| `session.next.step.ended` | assistant 完成（可选：拉完整消息替换对账） | C5 对账 |
| `session.next.compaction.started/delta/ended` | 压缩横幅 + 分隔消息 | D4/D5 |
| `session.next.retried` | retry 横幅 | D3 |
| `session.status` / `session.idle` | busy/idle 状态 | D1/D2 |
| `session.error` | 错误处理 | D6 |
| `permission.*` / `question.*` | 权限/提问增删 | F4（不变） |

> 注意：`memory()` reducer（opencode `message-updater.ts`）覆盖的是消息/part/工具/shell 的投影，**不包含** permission/question/compaction 横幅这类 UI 状态——这些仍需领域层或视图层自行处理。

---

## 9. 待决策项

**传输层：SSE 直连 vs 统一到 WebSocket。**
- 现状：SessionScreen 用 SSE 直连（`XMLHttpRequest` + 自实现重连退避）；Terminal 用 WS（bridge 的 SSE→WS 转换）。
- WS 对移动端更友好（断线检测更快、RN 支持好、双向）。
- 待定：未来是否把消息流也统一到 WS，收敛成单一传输机制。

---

## 10. 分阶段落地路径

> 分阶段、可验证推进，绝不一次性推倒。每阶段完成即可独立验证，控制回归风险。保护清单（绝不能碰坏）：打字机流畅度、SSE 断线重连、切后台恢复、滚动跟随。

**阶段 0：开发前最终验证**
- 在真实新版 opencode 上确认 `/global/event` 实际发出 `session.next.*` 事件、`session.messages` 返回投影结果（源码已证实，需运行时再确认一次）。
- 升级 bridge 绑定的 opencode 版本到带 Projector 的新版。

**阶段 1：领域层——接入 V2 事件（重构核心，全部价值所在）**
- 新建领域层 Hook（如 `useMessageStream`），消费 `session.next.*` 事件驱动消息状态机（Message/Part/ToolState/SessionStatus）。
- 复用/移植官方 `memory()` reducer 逻辑，少自己发明。
- 断线恢复改为拉 `session.messages` 投影，不再靠 delta 硬拼。
- 逐步移除 `reasoningPartIds`/`messageRoles`/`loading-` 前缀等 V1 hack。
- 可先抽离纯函数（`parseMessages`/`tokenSum` → `utils/`）作为无风险的准备动作。

**阶段 2：交互层拆分**
- 发送/附件（`useComposer`）、权限提问（`usePendingInteractions`）、模型选择（`useSessionModel`）按需抽离。

**阶段 3：视图层与传输层收敛**
- 视图细节（滚动跟随、未读、可见性）随手收敛为对应小 Hook——属于收尾清理，不是重点。
- 依据 §9 决策，决定传输层是否统一到 WS。

### 10bis. 实际落地结果（与计划的差异）

实际实施时按「一个功能一步、每步可运行可回滚」推进，比计划更细，且有几处与计划不同：

- **事件协议**：后端 opencode 1.18.1 发的是 `message.updated` / `message.part.updated` / `message.part.delta`（带 `field` 字段），而非计划里写的 `session.next.*`。`message.part.delta` 的 `field` 直接指明增量归属，这正是消灭 `reasoningPartIds` 的关键。事件名与官方桌面版 `packages/app/.../global-sync/event-reducer.ts` 一致，该文件成为 1:1 移植蓝本。
- **状态载体**：没有用「Hook（useMessageStream）」，而是两个纯 reducer + `useReducer`：
  - `app/src/chat/v2Reducer.ts` — 消息/part 状态（`messages` 有序数组 + `parts` 按 messageID 分组 + `partDelta` 增量累积）。
  - `app/src/chat/reducer.ts` — 会话级状态（sending / banner / 权限 / 提问）。
  - `app/src/chat/adaptMessages.ts` — V2 message+part → 现有渲染模型（`ListItem`），含 compaction。
- **渲染**：`renderMessages` 从 `adaptMessages(v2State)` 派生；revert banner 与乐观回显（pendingSend）作为纯视图层叠加，不进 reducer。**无混合列表、无 loading 占位**（参照官方）。
- **恢复**：进会话 / 翻页 / 断线用 `getMessagesPage` 拉取，经 `hydrate` / `upsert` 灌入 v2Reducer。
- **`sync` 事件**：后端另发事件溯源用的 `sync` 包（durable，带 seq/aggregateID），本端与官方一致，忽略不处理。
- **单测**：`effect`/`immer` 未引入；reducer 用纯 TS 手写不可变更新 + 二分插入，配 `*.test.ts`。
- **顺带修复的既有 bug**：进会话「思考中」卡住（改用最后一条 assistant 的 `time.completed` 判断）、重连倒计时与实际重试错乱、断网发送无限挂起（`promptMessage` 走统一 `request()` + 10s 超时）、多段文本拼接吃空格。

---

## 11. 风险与注意

- **测试现状**：核心纯逻辑已有单测——`chat/v2Reducer.test.ts`、`chat/reducer.test.ts`、`chat/adaptMessages.test.ts`（用 node `--experimental-strip-types` 直接跑）。UI 交互仍靠真机手动验证 + 保护清单。
- **`effect` 库能否在 RN 复用**：未引入。reducer 用纯 TS 手写不可变更新，避开了 `effect`/`immer` 的 RN 兼容与包体积问题。
- **delta 仍是 live-only**：断线可恢复必须作为领域层一等约束，靠投影/快照实现，不得依赖 delta 连续性。

---

## 12. 一手来源索引

- SDK V2 事件类型：`app/node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts`
- V2 事件发射器：`opencode/packages/core/src/session/runner/publish-llm-event.ts`
- 事件 schema（含 live-only 注释）：`opencode/packages/schema/src/session-event.ts`
- 投影器：`opencode/packages/core/src/session/projector.ts`
- 事件→消息 reducer：`opencode/packages/core/src/session/message-updater.ts`
- messages 接口（投影拉取）：`opencode/packages/server/src/handlers/message.ts`
- 事件桥接（GlobalBus 发射）：`opencode/packages/opencode/src/event-v2-bridge.ts`
- bridge 事件转发（纯透传）：`laycode/bridge/src/ws.ts`、`laycode/bridge/src/index.ts`
- 现状聊天页：`laycode/app/src/screens/SessionScreen.tsx`

---

## 13. 验收清单（复刻完整性检查表）

> 重构后逐条勾选。每条对应 §2bis 功能清单。全部通过 = 功能无遗漏复刻。建议在真机上分 iOS/Android 各走一遍。

**会话加载**
- [ ] 进入会话正确加载历史消息、标题、模型、agent、token 用量
- [ ] 进入即处于运行中的会话，能正确显示 sending 态并接上流
- [ ] 分页：上滑加载更多，无重复消息
- [ ] 切后台再回前台：自动重连 + 刷新，显示"已重连"

**实时流式**
- [ ] 文本打字机流畅
- [ ] 推理过程实时显示、可折叠
- [ ] 工具调用状态实时变化（pending→running→completed/error）
- [ ] 发送后乐观显示 user 消息 + loading，AI 回复到达后正确替换
- [ ] token 用量随 step-finish 更新

**会话状态横幅**
- [ ] busy/idle 正确切换
- [ ] retry 显示重试横幅
- [ ] 压缩：显示"正在压缩" + 结束后插入压缩分隔
- [ ] 出错显示错误横幅 + 错误气泡；中止不报错
- [ ] 横幅可手动关闭

**发送与附件**
- [ ] 发文本、发图片（拍照/相册）、发文件
- [ ] 附件预览与移除
- [ ] 发送失败正确回滚 + 提示
- [ ] 有待处理权限/提问时输入框禁用
- [ ] Stop 中止生效

**权限与提问**
- [ ] 权限请求 banner + 底部 prompt，once/always/reject 均生效
- [ ] reject 带 message 后 AI 继续
- [ ] 提问 answers/reject 生效
- [ ] 实时增删待处理项

**模型 / Agent**
- [ ] 模型选择并按 session 持久化
- [ ] agent 选择
- [ ] 默认模型回退正确

**Revert**
- [ ] 撤回显示 banner + diff + 回填输入
- [ ] 进入时恢复撤回态
- [ ] Unrevert 恢复

**子会话**
- [ ] task 工具点击跳子会话
- [ ] SubagentFooter 上/下切换
- [ ] 子 Agent 列表

**其它**
- [ ] 标题重命名
- [ ] FAB 拖拽 + 跳 Git/Terminal
- [ ] header 标题/副标题/状态点
- [ ] 滚动：贴底跟随、上滑停止、回到底部按钮、内容增长不顶动（iOS + Android 都验）

**连接鲁棒性**
- [ ] 断线指数退避重连 + 倒计时横幅
- [ ] 重连成功提示
- [ ] 退出会话正确清理连接
