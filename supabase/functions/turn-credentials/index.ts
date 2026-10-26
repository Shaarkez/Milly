import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const sharedSecret = Deno.env.get('TURN_SHARED_SECRET')
  const turnUrls = Deno.env.get('TURN_URLS')?.split(',').map((value) => value.trim()).filter(Boolean)

  if (!authorization?.startsWith('Bearer ') || !projectUrl || !anonKey) return reply({ error: 'Unauthorized' }, 401)

  const authClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await authClient.auth.getUser()
  if (error || !data.user) return reply({ error: 'Unauthorized' }, 401)
  if (!sharedSecret || !turnUrls?.length) return reply({ error: 'TURN is not configured' }, 503)

  const ttl = Math.min(3600, Math.max(300, Number(Deno.env.get('TURN_TTL_SECONDS') || 900)))
  const expiresAt = Math.floor(Date.now() / 1000) + ttl
  const username = `${expiresAt}:${data.user.id}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(sharedSecret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(username)))
  const password = btoa(String.fromCharCode(...signature))

  return reply({ iceServers: [{ urls: turnUrls, username, credential: password }], expiresAt }, 200)
})

function reply(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}