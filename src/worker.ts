interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/music/search') {
      const query = url.searchParams.get('q')?.trim().slice(0, 120) || 'popular hits'
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)))
      const upstream = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
        headers: { Accept: 'application/json' },
      })
      const body = await upstream.text()
      return new Response(body, {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
        },
      })
    }
    return env.ASSETS.fetch(request)
  },
}
