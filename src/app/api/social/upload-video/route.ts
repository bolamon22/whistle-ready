import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireStaff } from '@/lib/apiAuth'

export const runtime = 'nodejs'

// Blob-token handshake for a social post's video. Same shape as the photographer
// upload route: the bytes go browser → Blob storage directly (a serverless body is
// capped at 4.5 MB, so a Reel could never pass through a function here), and this
// route only decides whether to hand out a token. Photos keep using /api/upload
// (DB-backed) — this is for video, which is what Reels and video Stories need.
//
// Instagram's limits: Reels up to 15 minutes / 1 GB; Stories up to 60 s. The
// browser checks duration before uploading; the size cap here is the backstop.
const MAX_VIDEO_BYTES = 500 * 1024 * 1024

export async function POST(request: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Video storage isn\'t connected yet — create a Blob store for this project in Vercel (Storage → Blob) and redeploy.' }, { status: 503 })
  }

  let body: HandleUploadBody
  try { body = (await request.json()) as HandleUploadBody } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  try {
    const json = await handleUpload({
      body, request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['video/mp4', 'video/quicktime'],
        maximumSizeInBytes: MAX_VIDEO_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ orgId: gate.orgId, userId: gate.userId, kind: 'social-video' }),
      }),
      onUploadCompleted: async () => { /* the post row records the URL when it's saved */ },
    })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload was refused' }, { status: 400 })
  }
}
