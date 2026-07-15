import { chatReducer } from './reducer'
import { initialChatState } from './types'
import type { PermissionRequest, QuestionRequest } from '../types'

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`)
}

const perm = (id: string): PermissionRequest => ({
  id,
  sessionID: 's1',
  permission: 'bash',
  patterns: [],
  metadata: {},
  always: [],
})

const question = (id: string): QuestionRequest => ({
  id,
  sessionID: 's1',
  questions: [{ question: 'q?', header: 'h', options: [] }],
})

// ---- permission/asked：新增 ----
const s1 = chatReducer(initialChatState, { type: 'permission/asked', request: perm('p1') })
assertEqual(s1.pendingPermissions.length, 1)
assertEqual(s1.pendingPermissions[0].id, 'p1')

// ---- permission/asked：去重（同 id 不重复加，且返回原引用）----
const s2 = chatReducer(s1, { type: 'permission/asked', request: perm('p1') })
assertEqual(s2, s1)

// ---- permission/asked：不同 id 追加 ----
const s3 = chatReducer(s1, { type: 'permission/asked', request: perm('p2') })
assertEqual(s3.pendingPermissions.length, 2)

// ---- permission/removed：删除命中项 ----
const s4 = chatReducer(s3, { type: 'permission/removed', id: 'p1' })
assertEqual(s4.pendingPermissions.length, 1)
assertEqual(s4.pendingPermissions[0].id, 'p2')

// ---- permission/removed：删除不存在的 id（返回原引用）----
const s5 = chatReducer(s4, { type: 'permission/removed', id: 'nope' })
assertEqual(s5, s4)

// ---- question 同理 ----
const q1 = chatReducer(initialChatState, { type: 'question/asked', request: question('q1') })
assertEqual(q1.pendingQuestions.length, 1)
const q2 = chatReducer(q1, { type: 'question/asked', request: question('q1') })
assertEqual(q2, q1)
const q3 = chatReducer(q1, { type: 'question/removed', id: 'q1' })
assertEqual(q3.pendingQuestions.length, 0)

// ---- 不相关 action 不动其它字段 ----
assertEqual(s1.sending, false)
assertEqual(s1.banner, null)

// ---- session/sending：切换 ----
const send1 = chatReducer(initialChatState, { type: 'session/sending', sending: true })
assertEqual(send1.sending, true)
// 同值返回原引用
const send2 = chatReducer(send1, { type: 'session/sending', sending: true })
assertEqual(send2, send1)
// 切回 false
const send3 = chatReducer(send1, { type: 'session/sending', sending: false })
assertEqual(send3.sending, false)
// 不影响权限/提问
assertEqual(send1.pendingPermissions.length, 0)

// ---- banner/set：设置文字横幅 ----
const b1 = chatReducer(initialChatState, { type: 'banner/set', banner: { text: '加载失败' } })
assertEqual(b1.banner?.text, '加载失败')
// 同内容返回原引用
const b2 = chatReducer(b1, { type: 'banner/set', banner: { text: '加载失败' } })
assertEqual(b2, b1)
// 不同内容更新
const b3 = chatReducer(b1, { type: 'banner/set', banner: { text: '已重连' } })
assertEqual(b3.banner?.text, '已重连')
// 清空
const b4 = chatReducer(b3, { type: 'banner/set', banner: null })
assertEqual(b4.banner, null)
// null → null 返回原引用
const b5 = chatReducer(b4, { type: 'banner/set', banner: null })
assertEqual(b5, b4)
// 带 bg 字段
const b6 = chatReducer(initialChatState, { type: 'banner/set', banner: { text: 'x', bg: '#0f0' } })
assertEqual(b6.banner?.bg, '#0f0')

// ---- 原 state 不被修改（纯函数）----
assertEqual(initialChatState.pendingPermissions.length, 0)

console.log('chat/reducer.test.ts: all assertions passed')
