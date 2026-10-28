import { describe, expect, it } from 'vitest'
import { mergeMessages } from './messageOrdering'
import type { Message } from './types'

const message = (id: string, created_at: string): Message => ({
  id,
  conversation_id: 'conversation',
  sender_id: 'sender',
  body: id,
  image_path: null,
  created_at,
})

describe('mergeMessages', () => {
  it('orders messages by timestamp and uses the ID as a stable tie-breaker', () => {
    expect(mergeMessages([
      message('b', '2026-10-28T10:00:00.000Z'),
      message('c', '2026-10-28T10:01:00.000Z'),
      message('a', '2026-10-28T10:00:00.000Z'),
    ]).map(({ id }) => id)).toEqual(['a', 'b', 'c'])
  })

  it('deduplicates messages and lets later data replace earlier copies', () => {
    const original = message('a', '2026-10-28T10:00:00.000Z')
    const updated = { ...original, image_url: 'https://example.test/image' }
    expect(mergeMessages([original, message('b', original.created_at)], [updated]))
      .toEqual([updated, message('b', original.created_at)])
  })
})
