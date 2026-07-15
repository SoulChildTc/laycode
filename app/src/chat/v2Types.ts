import type { Message, Part } from '@opencode-ai/sdk/v2'

// V2 消息数据模型。照搬官方 opencode 桌面版（packages/app/.../global-sync）：
// message 与 part 分离存储，事件自带完整归属，不再需要 messageRoles / reasoningPartIds 之类的猜测。
//
// 单会话版：SessionScreen 一次只展示一个 session，故不像官方按 sessionID 分组，
// 直接持有当前会话的 messages。part 仍按 messageID 分组（一条消息含多个 part）。
export interface V2State {
  // 当前会话的消息，按 id 升序（与官方一致：用有序数组 + 二分维护）。
  messages: Message[]
  // part 按 messageID 分组。渲染时按 message.id 取对应 part 列表。
  parts: Record<string, Part[]>
  // 文本类 part 的增量累积（delta）。key=partID，value=累计文本。
  // 取代旧的 reasoningPartIds + 手动拼接：delta 事件自带 field，直接按 field 累加。
  partDelta: Record<string, string>
}

export const initialV2State: V2State = {
  messages: [],
  parts: {},
  partDelta: {},
}

// 事件语义 action。字段命名对齐 V2 事件 properties，翻译层（SSE → action）保持极薄。
export type V2Action =
  // message.updated：完整 Message（含 role / 完成态），按 id 插入或替换。
  | { type: 'message.upsert'; message: Message }
  // message.removed：删除某条消息及其 part。
  | { type: 'message.remove'; messageID: string }
  // message.part.updated：完整 Part（含 type / messageID），按 id 插入或替换。
  | { type: 'part.upsert'; part: Part }
  // message.part.removed：删除某个 part。
  | { type: 'part.remove'; messageID: string; partID: string }
  // message.part.delta：按 field 追加增量到对应 part 的字段（如 text）。
  | { type: 'part.delta'; messageID: string; partID: string; field: string; delta: string }
  // 进会话 / 断线恢复：用投影拉取的完整消息+part 整体重建。
  | { type: 'hydrate'; messages: Message[]; parts: Record<string, Part[]> }
