import type { FileAttachment } from '../types'

export function canSendMessage(input: string, attachments: FileAttachment[]): boolean {
  return input.trim().length > 0 || attachments.length > 0
}
