import { describe, expect, it } from 'vitest'
import { supabaseEnvironmentSchema } from './supabaseConfig'

describe('Supabase environment configuration', () => {
  it('trims whitespace around the URL and publishable key', () => {
    expect(supabaseEnvironmentSchema.parse({
      VITE_SUPABASE_URL: ' https://example.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' sb_publishable_example \r\n',
    })).toEqual({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_example',
    })
  })

  it('rejects an empty key after trimming', () => {
    expect(supabaseEnvironmentSchema.safeParse({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: '   ',
    }).success).toBe(false)
  })
})
