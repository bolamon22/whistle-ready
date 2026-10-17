import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { createReadStream, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { authOptions } from '@/lib/auth'
import { howToVideo, howToVis } from '@/lib/howToVideos'
import { getHowToVisibility } from '@/lib/videoVisibility'

// How-to videos that aren't served straight from public/ (lib/howToVideos howToSrc). A
// video set to Club directors streams only to a signed-in club director or staff member,
// never to parents, coaches or the public (Bo, Oct 17 2026: the club portal tour would
// show a competitor how the portal works); one set to Public streams to anyone. Members
// files live in videos/how-to/, outside public/; next.config.js traces both folders into
// this function. Range requests let the player seek.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SHUT_OUT = ['parent', 'coach']

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = String(params.id || '')
  if (!/^[a-z0-9-]+$/.test(id) || !howToVideo(id)) return new Response('Not found', { status: 404 })
  const open = howToVis(id, await getHowToVisibility()) === 'public'
  if (!open) {
    const session = await getServerSession(authOptions)
    const role = String((session?.user as any)?.role || '')
    if (!session) return new Response('Sign in to watch', { status: 401 })
    if (!role || SHUT_OUT.includes(role)) return new Response('Not allowed', { status: 403 })
  }
  let file = ''; let size = 0
  for (const dir of [['videos', 'how-to'], ['public', 'how-to']]) {
    const f = path.join(process.cwd(), ...dir, `${id}.mp4`)
    try { size = statSync(f).size; file = f; break } catch { /* try the next folder */ }
  }
  if (!file) return new Response('Not found', { status: 404 })

  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': open ? 'public, max-age=300' : 'private, no-store',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
  }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '')
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2] || 0))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream
    return new Response(stream, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } })
  }
  const stream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream
  return new Response(stream, { status: 200, headers: { ...headers, 'Content-Length': String(size) } })
}
