import { mergeAssistantText, mergeMessageFile, mergeMessageText, canSendMessage } from './messageParts'

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`)
}

function assertDeepEqual(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) throw new Error(`Expected ${expectedJson}, got ${actualJson}`)
}

const pendingUser = {
  id: 'u-1',
  role: 'user' as const,
  text: 'hello',
  files: [{ url: 'data:image/png;base64,local', mime: 'image/png', filename: 'local.png' }],
}

const serverFile = { url: 'https://example.com/a.png', mime: 'image/png', filename: 'a.png' }
const secondServerFile = { url: 'https://example.com/b.png', mime: 'image/png', filename: 'b.png' }

const afterText = mergeMessageText([pendingUser], 'msg-1', 'hello')
assertDeepEqual(afterText, [
  {
    id: 'msg-1',
    role: 'user',
    text: 'hello',
    files: pendingUser.files,
  },
])

const afterFirstFile = mergeMessageFile(afterText, 'msg-1', serverFile)
const afterSecondFile = mergeMessageFile(afterFirstFile, 'msg-1', secondServerFile)
assertDeepEqual(afterSecondFile[0], {
  id: 'msg-1',
  role: 'user',
  text: 'hello',
  files: [pendingUser.files[0], serverFile, secondServerFile],
})

const afterDuplicate = mergeMessageFile(afterSecondFile, 'msg-1', serverFile)
assertEqual(afterDuplicate[0].files?.length, 3)

const assistantFinalText = mergeAssistantText([
  { id: 'loading-1', role: 'assistant' as const, reasoning: { text: '', isActive: false }, content: '', toolCalls: [] },
  afterSecondFile[0],
], 'assistant-1', 'final answer')
assertDeepEqual(assistantFinalText[0], {
  id: 'assistant-1',
  role: 'assistant',
  reasoning: { text: '', isActive: false },
  content: 'final answer',
  toolCalls: [],
})
assertDeepEqual(assistantFinalText[1], afterSecondFile[0])

assertEqual(canSendMessage('', []), false)
assertEqual(canSendMessage('', [{ id: 'a', uri: 'file://a', mime: 'image/png', filename: 'a.png', base64: 'abc' }]), true)
assertEqual(canSendMessage('hello', []), true)
