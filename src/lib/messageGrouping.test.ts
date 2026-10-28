import { describe, expect, it } from 'vitest'
import { messagesBelongToSameGroup } from './messageGrouping'

describe('message grouping', () => {
  const first = { sender_id: 'user-1', created_at: '2026-10-28T09:00:00.000Z' }

  it('groups messages by the same sender within five minutes', () => {
    expect(messagesBelongToSameGroup(first, { sender_id: 'user-1', created_at: '2026-10-28T09:05:00.000Z' })).toBe(true)
  })

  it('starts a new group when the sender changes or five minutes pass', () => {
    expect(messagesBelongToSameGroup(first, { sender_id: 'user-2', created_at: '2026-10-28T09:01:00.000Z' })).toBe(false)
    expect(messagesBelongToSameGroup(first, { sender_id: 'user-1', created_at: '2026-10-28T09:05:00.001Z' })).toBe(false)
  })

  it('starts a new group when the date changes', () => {
    expect(messagesBelongToSameGroup(first, { sender_id: 'user-1', created_at: '2026-10-29T00:01:00.000Z' })).toBe(false)
  })
})
