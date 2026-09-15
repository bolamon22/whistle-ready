import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { loadMediaApproval } from '@/lib/mediaApproval'
import { PHOTO_TYPES, VIDEO_TYPES, LIMITS } from '@/lib/mediaUpload'

export const runtime = 'nodejs'

// The blob-token handshake for a photographer's upload.
//
// The bytes go from their browser straight to Blob storage and never pass through a
// function here. That is not an optimization: a serverless request body is capped at
// 4.5 MB, so a ten-second clip could not be uploaded through this app at all. It
// also means the upload does not bill as function time or transfer.
//
// What this route does is decide whether to hand out a token at all. The 128-bit
// credential token in the URL is the authorization -- the same key the credential
// page itself uses -- and it must belong to an APPROVED credential. Somebody with a
// pending or declined application gets nothing.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Uploads are not switched on for this site yet. Tell the organizer — they need to connect photo storage.' }, { status: 503 })
  }

  let body: HandleUploadBody
  try { body = (await request.json()) as HandleUploadBody } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const a = await loadMediaApproval(params.token)
        if (!a || !a.approved) throw new Error('This credential is not approved for uploads.')
        return {
          allowedContentTypes: [...PHOTO_TYPES, ...VIDEO_TYPES],
          // Belt and braces: the browser already resized and refused oversized
          // clips, but the browser is not where a limit is enforced.
          maximumSizeInBytes: LIMITS.videoMaxBytes,
          addRandomSuffix: true,
          // Files are grouped by org and credential so an org's media can be found,
          // counted or removed later without a lookup table.
          tokenPayload: JSON.stringify({ orgId: a.orgId, submissionId: a.submission.id }),
        }
      },
      // Vercel calls this from outside, so it never fires against localhost. The
      // row is written by /api/media/[token]/gallery once the browser has the URL,
      // which works the same in both places -- this stays a no-op on purpose.
      onUploadCompleted: async () => { /* rows are recorded by the client callback */ },
    })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload was refused' }, { status: 400 })
  }
}
