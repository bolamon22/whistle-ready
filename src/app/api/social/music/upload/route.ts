import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireStaff } from '@/lib/apiAuth'

// Blob-token handshake for a track added to the org's Reel music list (lib/reelMusic).
// Same shape as ../../upload-video: the MP3 goes browser → Blob directly.
export const runtime = 'nodejs'
const MAX_AUDIO_BYTES = 40 * 1024 * 1024

export async function POST(request: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: 'File storage isn\'t connected' }, { status: 503 })
  let body: HandleUploadBody
  try { body = (await request.json()) as HandleUploadBody } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  try {
    const json = await handleUpload({
      body, request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave'],
        maximumSizeInBytes: MAX_AUDIO_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ orgId: gate.orgId, userId: gate.userId, kind: 'reel-music' }),
      }),
      onUploadCompleted: async () => { /* the list row is written by POST /api/social/music */ },
    })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload was refused' }, { status: 400 })
  }
}
