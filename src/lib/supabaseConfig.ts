import { z } from 'zod'

export const supabaseEnvironmentSchema = z.object({
  VITE_SUPABASE_URL: z.string().trim().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().trim().min(1).optional(),
})
