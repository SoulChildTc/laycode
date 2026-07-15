import { canSendMessage } from './messageParts'

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`)
}

assertEqual(canSendMessage('', []), false)
assertEqual(canSendMessage('   ', []), false)
assertEqual(canSendMessage('', [{ id: 'a', uri: 'file://a', mime: 'image/png', filename: 'a.png', base64: 'abc' }]), true)
assertEqual(canSendMessage('hello', []), true)

console.log('utils/messageParts.test.ts: all assertions passed')
