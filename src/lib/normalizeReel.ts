// Browser helper: hand a just-uploaded Blob video URL to the server, which re-muxes
// it into a progressive, Instagram-ingestible MP4 (see api/social/normalize-video)
// and returns the new URL. On ANY failure it returns the original URL unchanged, so
// a hiccup in normalization never blocks a post from being created.
// onFail hears why (Oct 18 2026: the route had been failing with ENOENT and nobody
// knew, because the fallback was silent; Instagram then rejected the Reel with 2207082).
export async function normalizeReel(url: string, onFail?: (why: string) => void): Promise<string> {
  try {
    const r = await fetch('/api/social/normalize-video', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    })
    const j = await r.json().catch(() => ({} as any))
    if (r.ok && typeof j?.url === 'string' && j.url) return j.url
    onFail?.(String(j?.error || `HTTP ${r.status}`))
    return url
  } catch (e: any) { onFail?.(String(e?.message || 'network error')); return url }
}
