import { NextRequest } from 'next/server'
import { createReadStream, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { requireStaff } from '@/lib/apiAuth'
import { trainingVideo } from '@/lib/training'

// Training videos, streamed only to signed-in staff (Bo, Oct 13 2026: "I don't really
// want them to be able to download them ... that would help competitors replicate what
// I've built"). The files live in videos/training/, outside public/, so there is no
// public URL to share; next.config.js traces them into this function.
// Range requests are supported, which is what lets the player seek.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const id = String(params.id || '')
  if (!trainingVideo(id) || !/^[a-z0-9-]+$/.test(id)) return new Response('Not found', { status: 404 })
  const file = path.join(process.cwd(), 'videos', 'training', `${id}.mp4`)
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
