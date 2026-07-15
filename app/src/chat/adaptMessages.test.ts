import { adaptMessage, adaptMessages } from './adaptMessages'
import type { Message, Part } from '@opencode-ai/sdk/v2'

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FAIL: ' + msg)
}

const userMsg = (id: string): Message => ({ id, sessionID: 's', role: 'user', time: { created: 1 } } as unknown as Message)
const asstMsg = (id: string, error?: unknown): Message =>
  ({ id, sessionID: 's', role: 'assistant', time: { created: 1 }, error } as unknown as Message)

const p = (o: Record<string, unknown>): Part => o as unknown as Part

// ---- user 消息：text + file ----
const u = adaptMessage(userMsg('u1'), [
  p({ id: 't', messageID: 'u1', sessionID: 's', type: 'text', text: 'hello' }),
  p({ id: 'f', messageID: 'u1', sessionID: 's', type: 'file', url: 'http://x/a.png', mime: 'image/png', filename: 'a.png' }),
]) as any
eq(u.role, 'user', 'user role')
eq(u.text, 'hello', 'user text')
eq(u.files, [{ url: 'http://x/a.png', mime: 'image/png', filename: 'a.png' }], 'user files')

// ---- assistant：reasoning + 多段 text 拼接 + tool ----
const a = adaptMessage(asstMsg('a1'), [
  p({ id: 'r', messageID: 'a1', sessionID: 's', type: 'reasoning', text: 'thinking', time: { start: 1, end: 2 } }),
  p({ id: 't1', messageID: 'a1', sessionID: 's', type: 'text', text: 'Hello' }),
  p({ id: 't2', messageID: 'a1', sessionID: 's', type: 'text', text: ' world' }),
  p({ id: 'tool1', messageID: 'a1', sessionID: 's', type: 'tool', tool: 'bash', state: { status: 'completed', input: { cmd: 'ls' }, output: 'ok' } }),
]) as any
eq(a.role, 'assistant', 'assistant role')
eq(a.reasoning.text, 'thinking', 'reasoning text')
eq(a.reasoning.isActive, false, 'reasoning inactive when time.end present')
// 先拼接再整体处理：段间空格保留（修正了旧 parseMessages 逐段 trim 吃空格的问题）。
eq(a.content, 'Hello world', 'multi text parts joined preserving inter-segment space')
eq(a.toolCalls.length, 1, 'one tool call')
eq(a.toolCalls[0].name, 'bash', 'tool name')
eq(a.toolCalls[0].status, 'completed', 'tool status mapped')

// ---- reasoning 未结束 → isActive=true ----
const active = adaptMessage(asstMsg('a2'), [
  p({ id: 'r', messageID: 'a2', sessionID: 's', type: 'reasoning', text: '...', time: { start: 1 } }),
]) as any
eq(active.reasoning.isActive, true, 'reasoning active when no time.end')

// ---- <think> 标签被 stripThinking 去除 ----
const think = adaptMessage(asstMsg('a3'), [
  p({ id: 't', messageID: 'a3', sessionID: 's', type: 'text', text: '<think>secret</think>visible' }),
]) as any
eq(think.content, 'visible', 'think tag stripped from content')

// ---- <think> 跨段拼接后仍能整体剥离 ----
const thinkSplit = adaptMessage(asstMsg('a3b'), [
  p({ id: 't1', messageID: 'a3b', sessionID: 's', type: 'text', text: '<think>hid' }),
  p({ id: 't2', messageID: 'a3b', sessionID: 's', type: 'text', text: 'den</think>shown' }),
]) as any
eq(thinkSplit.content, 'shown', 'think tag split across parts still stripped after join')

// ---- 错误消息：content 变为 ⚠️ ----
const err = adaptMessage(asstMsg('a4', { name: 'APIError', message: 'boom' }), [
  p({ id: 't', messageID: 'a4', sessionID: 's', type: 'text', text: 'ignored when error' }),
]) as any
assert(err.content.startsWith('⚠️'), 'error content prefixed with warning')
assert(err.content.includes('boom'), 'error message included')

// ---- 工具状态映射：pending/running → running, error → error ----
const st = adaptMessage(asstMsg('a5'), [
  p({ id: 'x', messageID: 'a5', sessionID: 's', type: 'tool', tool: 't', state: { status: 'running', input: {} } }),
  p({ id: 'y', messageID: 'a5', sessionID: 's', type: 'tool', tool: 't', state: { status: 'error', input: {} } }),
]) as any
eq(st.toolCalls[0].status, 'running', 'running status')
eq(st.toolCalls[1].status, 'error', 'error status')

// ---- SKIP 类 part（step-start 等）不产出正文（adapt 只读它认识的类型）----
const skip = adaptMessage(asstMsg('a6'), [
  p({ id: 's1', messageID: 'a6', sessionID: 's', type: 'step-start' }),
  p({ id: 't', messageID: 'a6', sessionID: 's', type: 'text', text: 'ok' }),
]) as any
eq(skip.content, 'ok', 'step-start ignored, text kept')

// ---- compaction part → CompactionMsg（auto / manual）----
const compAuto = adaptMessage(asstMsg('c1'), [
  p({ id: 'cp', messageID: 'c1', sessionID: 's', type: 'compaction', auto: true }),
]) as any
eq(compAuto.role, 'compaction', 'compaction role')
eq(compAuto.reason, 'auto', 'auto compaction reason')
const compManual = adaptMessage(asstMsg('c2'), [
  p({ id: 'cp', messageID: 'c2', sessionID: 's', type: 'compaction', auto: false }),
]) as any
eq(compManual.reason, 'manual', 'manual compaction reason')

// ---- adaptMessages：整体，保持 messages 顺序 ----
const many = adaptMessages(
  [asstMsg('m1'), userMsg('m2')],
  { m1: [p({ id: 't', messageID: 'm1', sessionID: 's', type: 'text', text: 'A' })], m2: [p({ id: 't', messageID: 'm2', sessionID: 's', type: 'text', text: 'B' })] },
)
eq(many.map((m) => m.id), ['m1', 'm2'], 'order preserved')
eq((many[1] as any).text, 'B', 'user content in order')

console.log('chat/adaptMessages.test.ts: all assertions passed')
