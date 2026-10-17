import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { CHAMP_VIDEO_TYPES, CHAMP_VIDEO_MAX_BYTES } from '@/lib/championMedia'

export const runtime = 'nodejs'

// Blob-token handshake for a champions' video (Awards page; Bo, Oct 17 2026: "a five
// second video of the champion team so we can video them winning and holding their
// trophies"). Same shape as /api/social/upload-video: the clip goes from the phone
// straight to Blob storage, because a serverless request body stops at 4.5 MB, and
// this route only decides whether to hand out a token -- to staff of this event, for
// a file under champions/<this event>/. The row records the URL afterwards (PATCH
// /api/tournaments/[id]/awards), which checks the same folder.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const no = eventGate(gate, params.id); if (no) return no
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Video storage isn’t connected yet. Create a Blob store for this project in Vercel (Storage, Blob) and redeploy.' }, { status: 503 })
  }
  let body: HandleUploadBody
  try { body = (await request.json()) as HandleUploadBody } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  try {
    const json = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`champions/${params.id}/`)) throw new Error('Upload the video from this event’s Awards page')
        return {
          allowedContentTypes: CHAMP_VIDEO_TYPES,
          // The browser already refused anything bigger; this is where the limit holds.
          maximumSizeInBytes: CHAMP_VIDEO_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ tournamentId: params.id, userId: gate.userId, kind: 'champions-video' }),
        }
      },
      // Vercel calls this from outside, so it never fires against localhost; the
      // Awards row is written by the browser once it has the URL.
      onUploadCompleted: async () => { /* recorded by PATCH /awards */ },
    })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload was refused' }, { status: 400 })
  }
}
