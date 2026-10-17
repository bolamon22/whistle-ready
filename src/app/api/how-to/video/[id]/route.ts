import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { createReadStream, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { authOptions } from '@/lib/auth'
import { howToVideo } from '@/lib/howToVideos'

// Members-only how-to videos (lib/howToVideos `members`), streamed to a signed-in club
// director or staff member, never to parents, coaches or the public (Bo, Oct 17 2026:
// the club portal tour would show a competitor how the portal works). The files live in
// videos/how-to/, outside public/, so there is no public URL; next.config.js traces them
// into this function. Range requests let the player seek.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SHUT_OUT = ['parent', 'coach']

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const role = String((session?.user as any)?.role || '')
  if (!session) return new Response('Sign in to watch', { status: 401 })
  if (!role || SHUT_OUT.includes(role)) return new Response('Not allowed', { status: 403 })
  const id = String(params.id || '')
  if (!/^[a-z0-9-]+$/.test(id) || !howToVideo(id)?.members) return new Response('Not found', { status: 404 })
  const file = path.join(process.cwd(), 'videos', 'how-to', `${id}.mp4`)
  let size = 0
  try { size = statSync(file).size } catch { return new Response('Not found', { status: 404 }) }

  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
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
