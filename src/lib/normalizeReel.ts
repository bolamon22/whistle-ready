// Browser helper: hand a just-uploaded Blob video URL to the server, which re-muxes
// it into a progressive, Instagram-ingestible MP4 (see api/social/normalize-video)
// and returns the new URL. On ANY failure it returns the original URL unchanged, so
// a hiccup in normalization never blocks a post from being created.
export async function normalizeReel(url: string): Promise<string> {
  try {
    const r = await fetch('/api/social/normalize-video', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    })
    if (!r.ok) return url
    const j = await r.json().catch(() => ({} as any))
    return typeof j?.url === 'string' && j.url ? j.url : url
  } catch { return url }
}
