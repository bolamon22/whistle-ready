import { NextRequest, NextResponse } from 'next/server'
import { appBaseUrl, imageForSatori, loadPlayerPass } from '@/lib/playerPass'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /pass/<token>/img/photo|club|event — the player's photo or a logo, served from this
// origin so the Reel maker's canvas can draw it and still be recorded (a cross-origin
// image would taint the canvas). Same images the card already shows.
export async function GET(req: NextRequest, { params }: { params: { token: string; kind: string } }) {
  const base = appBaseUrl(req)
  const pass = await loadPlayerPass(params.token, base)
  if (!pass) return new NextResponse('Not found', { status: 404 })
  const url = params.kind === 'photo' ? pass.card.photoUrl : params.kind === 'club' ? pass.card.clubLogoUrl : params.kind === 'event' ? pass.card.tournamentLogoUrl : ''
  const src = await imageForSatori(url, base)
  if (!src) return new NextResponse('Not found', { status: 404 })
  let bytes: ArrayBuffer, type = 'image/png'
  const m = /^data:([^;,]+);base64,(.*)$/.exec(src)
  if (m) { type = m[1]; const b = Buffer.from(m[2], 'base64'); bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
  else {
    // Only public https images (the uploads are data URLs above).
    let u: URL | null = null
    try { u = new URL(src) } catch {}
    if (!u || u.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) return new NextResponse('Not found', { status: 404 })
    const r = await fetch(u, { redirect: 'error' }).catch(() => null)
    if (!r || !r.ok) return new NextResponse('Not found', { status: 404 })
    type = r.headers.get('content-type') || type
    if (!type.startsWith('image/')) return new NextResponse('Not found', { status: 404 })
    bytes = await r.arrayBuffer()
  }
  return new NextResponse(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300' } })
}
