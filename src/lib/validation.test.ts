import { describe, expect, it } from 'vitest'
import { isAllowedImage, registrationSchema, usernameSchema } from './validation'

describe('Milly input validation', () => {
  it('normalizes and validates usernames', () => {
    expect(usernameSchema.parse(' Shaark_1 ')).toBe('shaark_1')
    expect(usernameSchema.safeParse('ab').success).toBe(false)
    expect(usernameSchema.safeParse('me@example.com').success).toBe(false)
  })

  it('requires a display name and a sufficiently long password', () => {
    expect(registrationSchema.safeParse({ email: 'friend@example.com', password: 'long-password', displayName: 'Friend' }).success).toBe(true)
    expect(registrationSchema.safeParse({ email: 'not-an-email', password: 'short', displayName: '' }).success).toBe(false)
  })

  it('accepts only supported, non-empty images within the size limit', () => {
    expect(isAllowedImage('image/webp', 1024)).toBe(true)
    expect(isAllowedImage('image/svg+xml', 1024)).toBe(false)
    expect(isAllowedImage('image/jpeg', 8 * 1024 * 1024 + 1)).toBe(false)
    expect(isAllowedImage('image/png', 0)).toBe(false)
  })
})