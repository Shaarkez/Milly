import { describe, expect, it } from 'vitest'
import { friendIdSchema, isAllowedImage, registrationSchema } from './validation'

describe('Milly input validation', () => {
  it('normalizes and validates exact public IDs', () => {
    expect(friendIdSchema.parse(' milly-a1b2c3d4 ')).toBe('MILLY-A1B2C3D4')
    expect(friendIdSchema.safeParse('MILLY-123').success).toBe(false)
    expect(friendIdSchema.safeParse('me@example.com').success).toBe(false)
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