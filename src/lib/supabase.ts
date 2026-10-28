import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { supabaseEnvironmentSchema } from './supabaseConfig'

const environment = supabaseEnvironmentSchema.safeParse(import.meta.env)

export const isSupabaseConfigured = Boolean(
  environment.success && environment.data.VITE_SUPABASE_URL && environment.data.VITE_SUPABASE_ANON_KEY,
)

export const supabase = isSupabaseConfigured && environment.success
  ? createClient(environment.data.VITE_SUPABASE_URL!, environment.data.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export const pageSize = 50

export function readableError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Проверьте введённые данные.'
  if (error instanceof Error) return error.message
  return 'Не удалось выполнить действие. Проверьте подключение и попробуйте ещё раз.'
}