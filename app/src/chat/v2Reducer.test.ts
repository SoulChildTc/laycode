import { v2Reducer } from './v2Reducer'
import { initialV2State } from './v2Types'
import type { Message, Part } from '@opencode-ai/sdk/v2'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FAIL: ' + msg)
}
function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
}

const asstMsg = (id: string): Message => ({
  id, sessionID: 's1', role: 'assistant', time: { created: 1 },
  parentID: 'p', modelID: 'm', providerID: 'pr', mode: 'chat',
  path: { cwd: '/', root: '/' }, cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
} as unknown as Message)

const textPart = (id: string, messageID: string, text = ''): Part =>
  ({ id, sessionID: 's1', messageID, type: 'text', text } as unknown as Part)
const reasoningPart = (id: string, messageID: string, text = ''): Part =>
  ({ id, sessionID: 's1', messageID, type: 'reasoning', text, time: { start: 1 } } as unknown as Part)
const stepStart = (id: string, messageID: string): Part =>
  ({ id, sessionID: 's1', messageID, type: 'step-start' } as unknown as Part)

// ---- message.upsert：有序插入 ----
let s = initialV2State
s = v2Reducer(s, { type: 'message.upsert', message: asstMsg('m2') })
s = v2Reducer(s, { type: 'message.upsert', message: asstMsg('m1') })
s = v2Reducer(s, { type: 'message.upsert', message: asstMsg('m3') })
eq(s.messages.map((m) => m.id), ['m1', 'm2', 'm3'], 'messages sorted by id')

// ---- message.upsert：同 id 替换，不新增 ----
const before = s.messages.length
s = v2Reducer(s, { type: 'message.upsert', message: asstMsg('m2') })
assert(s.messages.length === before, 'upsert same id does not grow')

// ---- part.upsert：按 messageID 分组 ----
s = v2Reducer(s, { type: 'part.upsert', part: reasoningPart('r1', 'm1') })
s = v2Reducer(s, { type: 'part.upsert', part: textPart('t1', 'm1') })
eq(s.parts['m1'].map((p) => p.id), ['r1', 't1'], 'parts grouped & sorted under m1')

// ---- SKIP_PARTS：step-start 被忽略 ----
const sBefore = s.parts['m1'].length
s = v2Reducer(s, { type: 'part.upsert', part: stepStart('ss1', 'm1') })
assert(s.parts['m1'].length === sBefore, 'step-start skipped')

// ---- part.delta：按 field 累加（取代 reasoningPartIds）----
s = v2Reducer(s, { type: 'part.delta', messageID: 'm1', partID: 't1', field: 'text', delta: 'Hel' })
s = v2Reducer(s, { type: 'part.delta', messageID: 'm1', partID: 't1', field: 'text', delta: 'lo' })
const t1 = s.parts['m1'].find((p) => p.id === 't1') as any
eq(t1.text, 'Hello', 'text delta accumulates on part field')
eq(s.partDelta['t1'], 'Hello', 'partDelta tracks accumulated value')

// ---- delta 作用于 reasoning field 同样生效（无需标记 part 类型）----
s = v2Reducer(s, { type: 'part.delta', messageID: 'm1', partID: 'r1', field: 'text', delta: 'think' })
const r1 = s.parts['m1'].find((p) => p.id === 'r1') as any
eq(r1.text, 'think', 'reasoning delta accumulates without type-guessing')

// ---- part.upsert 完整值到达：清掉该 part 的 delta 累积 ----
s = v2Reducer(s, { type: 'part.upsert', part: textPart('t1', 'm1', 'Hello world') })
const t1b = s.parts['m1'].find((p) => p.id === 't1') as any
eq(t1b.text, 'Hello world', 'full part value overwrites')
assert(s.partDelta['t1'] === undefined, 'delta accum cleared after full value')

// ---- part.remove ----
s = v2Reducer(s, { type: 'part.remove', messageID: 'm1', partID: 'r1' })
eq(s.parts['m1'].map((p) => p.id), ['t1'], 'part removed')

// ---- message.remove：连带删 part 与 delta ----
s = v2Reducer(s, { type: 'message.remove', messageID: 'm1' })
eq(s.messages.map((m) => m.id), ['m2', 'm3'], 'message removed')
assert(s.parts['m1'] === undefined, 'parts of removed message dropped')
assert(s.partDelta['t1'] === undefined, 'delta of removed message dropped')

// ---- hydrate：整体重建 ----
s = v2Reducer(s, { type: 'hydrate', messages: [asstMsg('x1')], parts: { x1: [textPart('tx', 'x1', 'hi')] } })
eq(s.messages.map((m) => m.id), ['x1'], 'hydrate replaces messages')
eq((s.parts['x1'][0] as any).text, 'hi', 'hydrate replaces parts')
eq(s.partDelta, {}, 'hydrate clears delta accum')

// ---- 纯函数：原 state 不被修改 ----
eq(initialV2State.messages, [], 'initial state untouched')

console.log('chat/v2Reducer.test.ts: all assertions passed')
