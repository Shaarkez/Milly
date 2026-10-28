import type { Message } from './types'

export function mergeMessages(...groups: Message[][]): Message[] {
  const messages = new Map<string, Message>()
  for (const group of groups) {
    for (const message of group) messages.set(message.id, message)
  }
  return [...messages.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )
}
