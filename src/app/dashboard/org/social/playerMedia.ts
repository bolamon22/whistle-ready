'use client'
// Images for cleared-player posts on the social scheduler, made in the browser.
//
// The player posts themselves are drawn on the server (/pass/<token>/post/<style>.png,
// lib/socialPosts) as PNG. Instagram's API only takes JPEG photos, so the scheduler
// redraws the PNG onto a canvas and saves a JPEG, and it builds the 9:16 Story version
// the same way: the post over a blurred copy of itself, the event name above and the
// family's Instagram handle below. Both go up through /api/upload like any photo.

const loadImg = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not build the player post — try again')); i.src = url
})

let fontsReady: Promise<void> | null = null
function ensureFonts(): Promise<void> {
  if (fontsReady) return fontsReady
  fontsReady = (async () => {
    if (!document.querySelector('link[data-player-fonts]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600&display=swap'
      link.setAttribute('data-player-fonts', '1'); document.head.appendChild(link)
    }
    try { await Promise.all([document.fonts.load('80px Anton'), document.fonts.load('600 40px "Barlow Condensed"')]) } catch {}
  })()
  return fontsReady
}

export const postPngUrl = (token: string, style: string, days: number | null, w?: number) =>
  `/pass/${encodeURIComponent(token)}/post/${encodeURIComponent(style)}.png?${[w ? `w=${w}` : '', days != null && days >= 0 ? `days=${days}` : ''].filter(Boolean).join('&')}`

const toJpeg = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not save the image')), 'image/jpeg', 0.92))

/** The 4:5 feed post as a JPEG (1080×1350). */
export async function feedJpeg(token: string, style: string, days: number | null): Promise<Blob> {
  const img = await loadImg(postPngUrl(token, style, days))
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1080, 1350)
  ctx.drawImage(img, 0, 0, 1080, 1350)
  return toJpeg(c)
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, start: number, min: number): number {
  let px = start
  for (; px > min; px -= 4) { ctx.font = font(px); if (ctx.measureText(text).width <= maxW) break }
  ctx.font = font(px); return px
}

/** The 9:16 Story version (1080×1920): the post centered over a blurred copy of
 *  itself, the event name above, the family's handle and the dates below. Text stays
 *  out of the top and bottom ~250 px, where Instagram draws its own buttons. */
export async function storyJpeg(token: string, style: string, days: number | null, o: { event: string; sub: string; handle: string }): Promise<Blob> {
  await ensureFonts()
  const img = await loadImg(postPngUrl(token, style, days))
  const W = 1080, H = 1920
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.filter = 'blur(44px) brightness(0.42) saturate(1.2)'
  ctx.drawImage(img, (W - W * 1.6) / 2, (H - 1350 * 1.6) / 2, W * 1.6, 1350 * 1.6)
  ctx.restore()
  // Event name.
  const ev = (o.event || '').toUpperCase()
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  if (ev) { fitText(ctx, ev, px => `${px}px Anton, Impact, "Arial Narrow", sans-serif`, W - 140, 84, 44); ctx.fillText(ev, W / 2, 320) }
  // The post, with a soft shadow.
  const pw = 864, ph = 1080, px = (W - pw) / 2, py = 370
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18
  ctx.fillStyle = '#000'; ctx.fillRect(px, py, pw, ph); ctx.restore()
  ctx.drawImage(img, px, py, pw, ph)
  let y = py + ph + 100
  // Handle pill.
  if (o.handle) {
    ctx.font = '600 52px "Barlow Condensed", "Arial Narrow", sans-serif'
    const tw = ctx.measureText(o.handle).width, bw = tw + 72, bh = 84
    ctx.fillStyle = '#fff'
    const bx = (W - bw) / 2, by = y - 62, r = 18
    ctx.beginPath(); ctx.moveTo(bx + r, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, r); ctx.arcTo(bx + bw, by + bh, bx, by + bh, r); ctx.arcTo(bx, by + bh, bx, by, r); ctx.arcTo(bx, by, bx + bw, by, r); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#0f172a'; ctx.fillText(o.handle, W / 2, y)
    y += 92
  }
  if (o.sub) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    fitText(ctx, o.sub, px2 => `600 ${px2}px "Barlow Condensed", "Arial Narrow", sans-serif`, W - 160, 44, 28)
    ctx.fillText(o.sub, W / 2, y)
  }
  return toJpeg(c)
}

/** Uploads a JPEG and returns its URL (/api/img/<id>), which Meta fetches at publish time. */
export async function uploadJpeg(blob: Blob, name: string): Promise<string> {
  const fd = new FormData(); fd.append('file', new File([blob], name, { type: 'image/jpeg' }))
  const res = await fetch('/api/upload', { method: 'POST', body: fd }); const d = await res.json().catch(() => ({}))
  if (!res.ok || !d.url) throw new Error(d.error || 'Upload failed')
  if (d.inlineFallback || String(d.url).startsWith('data:')) throw new Error('Image storage is unavailable right now — try again in a minute')
  return d.url
}
