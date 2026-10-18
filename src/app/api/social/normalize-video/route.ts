import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { put } from '@vercel/blob'
import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, readFile, rm, mkdtemp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The browser records a Reel with MediaRecorder, which can only emit a FRAGMENTED
// MP4 (repeating moof/mdat) or WebM. Instagram's Graph API rejects both with error
// 2207082 ("Media upload has failed"). This route takes the just-uploaded Blob URL,
// re-muxes it into a standard progressive, fast-start MP4 (one ftyp/moov/mdat) and
// returns a new Blob URL. H.264/AAC files stream-copy in a fraction of a second at
// no quality loss (any length); only a non-MP4 fallback (e.g. a WebM/VP9 recording)
// is re-encoded. Best-effort: the client falls back to the original URL on failure.
export const runtime = 'nodejs'
export const maxDuration = 300

const run = promisify(execFile)
// Where the ffmpeg binary really is. Bundling once pointed ffmpeg-static at
// .next/server/app/api/social/normalize-video/ffmpeg (ENOENT on Vercel, Oct 18 2026),
// so every Reel silently went out un-normalized. The traced copy lives in node_modules.
function ffmpegBin(): string {
  const tries = [ffmpegPath as unknown as string, join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'), '/var/task/node_modules/ffmpeg-static/ffmpeg']
  return tries.find(p => !!p && existsSync(p)) || ''
}
/** Does the file carry an audio stream? (`ffmpeg -i` with no output exits 1; the stream list is in stderr.) */
async function hasAudio(bin: string, file: string): Promise<boolean> {
  try { await run(bin, ['-hide_banner', '-i', file], { maxBuffer: 1 << 24 }) } catch (e: any) { return /Stream #\S+.*Audio:/.test(String(e?.stderr || '')) }
  return false
}
// Only ever fetch from Vercel Blob storage — never an arbitrary URL (SSRF guard).
const BLOB_HOST = /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i

export async function POST(request: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: 'Video storage isn\'t connected' }, { status: 503 })

  let url = ''
  try { url = String(((await request.json()) as any)?.url || '') } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!BLOB_HOST.test(url)) return NextResponse.json({ error: 'Only Blob videos can be normalized' }, { status: 400 })
  const bin = ffmpegBin()
  if (!bin) return NextResponse.json({ error: 'Video tooling unavailable' }, { status: 500 })

  const dir = await mkdtemp(join(tmpdir(), 'reel-'))
  const inp = join(dir, 'in'); const outp = join(dir, 'out.mp4')
  try {
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ error: 'Could not read the uploaded video' }, { status: 400 })
    await writeFile(inp, Buffer.from(await res.arrayBuffer()))

    // Fast path: stream-copy H.264/AAC into a progressive container. If the input
    // can't be copied into MP4 (a WebM/VP9 recording), re-encode to spec.
    // A Reel recorded with no music (or for an Instagram song on top) has no audio
    // track at all; Instagram wants AAC audio, so add a silent one (video still copied).
    const silent = !(await hasAudio(bin, inp))
    try {
      await run(bin, silent
        ? ['-y', '-i', inp, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-map', '0:v:0', '-map', '1:a:0',
           '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', outp]
        : ['-y', '-i', inp, '-c', 'copy', '-movflags', '+faststart', outp], { maxBuffer: 1 << 27 })
    } catch {
      await run(bin, ['-y', '-i', inp, ...(silent ? ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-map', '0:v:0', '-map', '1:a:0', '-shortest'] : []), '-r', '30', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1',
        '-crf', '20', '-preset', 'veryfast', '-maxrate', '8M', '-bufsize', '12M',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', outp], { maxBuffer: 1 << 27 })
    }

    const outBuf = await readFile(outp)
    const base = (url.split('/').pop() || 'reel').split('?')[0].replace(/\.(mp4|mov|webm)$/i, '').replace(/[^\w.-]+/g, '_')
    const blob = await put(`social-video/${base}.mp4`, outBuf, { access: 'public', contentType: 'video/mp4', addRandomSuffix: true, multipart: true })
    return NextResponse.json({ url: blob.url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not normalize the video' }, { status: 500 })
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
