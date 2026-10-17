// The champions' photo and short video (Awards page -> public bracket, Bo Oct 17 2026:
// "a hero type image of the champion team" and "a five second video of the champion
// team ... winning and holding their trophies").
//
// Pure on purpose -- no '@/lib/db' -- because the Awards page imports it (a db import
// in a client graph is what 500'd the photographer pages on Oct 3). The upload route
// and lib/awards import the same limits so the browser and the server agree.

import { upload } from '@vercel/blob/client'
import { fitJpeg } from '@/lib/photoClient'

export const CHAMP_VIDEO_TYPES = ['video/mp4', 'video/quicktime']
/** Five seconds is the ask; ten leaves room for a slow start. */
export const CHAMP_VIDEO_MAX_SECONDS = 10
/** A 1080p phone clip of ten seconds is well under this; 4K at full bitrate is not,
 *  and every family who opens the bracket downloads the clip. */
export const CHAMP_VIDEO_MAX_BYTES = 40 * 1024 * 1024

/** A clip this app stored for this event: a public Blob URL under champions/<id>/. */
export function isChampionVideoUrl(u: string, tournamentId: string): boolean {
  try {
    const x = new URL(u)
    return x.protocol === 'https:' && x.hostname.endsWith('.public.blob.vercel-storage.com') && x.pathname.startsWith(`/champions/${tournamentId}/`)
  } catch { return false }
}

async function uploadJpeg(blob: Blob, name: string): Promise<string> {
  const fd = new FormData(); fd.append('file', new File([blob], name, { type: blob.type || 'image/jpeg' }))
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  const j = await res.json().catch(() => ({}))
  // /api/upload falls back to a data: URL for a tiny picture when storage fails; that
  // would sit inside the awards record, so it counts as a failed upload here.
  if (!res.ok || !String(j.url || '').startsWith('/api/img/')) throw new Error('The photo didn’t upload. Try again.')
  return String(j.url)
}

/** The champions' photo: fit inside 2000px, JPEG. A phone photo is 3 to 12 MB and the
 *  public bracket hands this one file to every family; the re-encode also drops EXIF,
 *  GPS included. Resolves to /api/img/<id>. */
export async function uploadChampionPhoto(file: File): Promise<string> {
  let blob: Blob
  try { blob = await fitJpeg(file, 2000, 0.85) } catch { throw new Error('That file isn’t a photo we can read.') }
  return uploadJpeg(blob, 'champions.jpg')
}

/** Length, size and a cover frame, read in the browser before anything uploads, so
 *  nobody waits out an upload to be told it was too long. */
async function probeClip(file: File): Promise<{ seconds: number; poster: Blob | null }> {
  const url = URL.createObjectURL(file)
  try {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('That video can’t be read here. Use an MP4 or a phone video.')) })
    const seconds = Number.isFinite(v.duration) ? v.duration : 0
    let poster: Blob | null = null
    try {
      // The cover frame about a second in: the team has usually lifted the trophy by then.
      await new Promise<void>((res, rej) => { v.onseeked = () => res(); v.onerror = () => rej(new Error('seek')); v.currentTime = Math.min(1, seconds / 2) })
      const k = Math.min(1, 1600 / Math.max(v.videoWidth || 1, v.videoHeight || 1))
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round((v.videoWidth || 1) * k)); c.height = Math.max(1, Math.round((v.videoHeight || 1) * k))
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
      poster = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85))
    } catch { poster = null }
    return { seconds, poster }
  } finally { URL.revokeObjectURL(url) }
}

/** The champions' video: checked, a cover frame saved, then sent straight to Blob
 *  storage (a serverless request body stops at 4.5 MB, so it can't pass through the
 *  app). Throws with a message meant to be shown. */
export async function uploadChampionVideo(file: File, tournamentId: string, rowKey: string, onProgress?: (pct: number) => void): Promise<{ videoUrl: string; posterUrl: string }> {
  const type = (file.type || '').toLowerCase()
  if (!CHAMP_VIDEO_TYPES.includes(type)) throw new Error('Use a phone video or an MP4.')
  if (file.size > CHAMP_VIDEO_MAX_BYTES) throw new Error(`That clip is ${(file.size / 1048576).toFixed(0)} MB; the limit is ${CHAMP_VIDEO_MAX_BYTES / 1048576} MB. Shoot it at 1080p, or trim it to 5 seconds.`)
  const info = await probeClip(file)
  if (info.seconds > CHAMP_VIDEO_MAX_SECONDS + 0.5) throw new Error(`That clip is ${Math.round(info.seconds)} seconds. Keep it to ${CHAMP_VIDEO_MAX_SECONDS} or less: 5 is plenty.`)
  const posterUrl = info.poster ? await uploadJpeg(info.poster, 'champions-cover.jpg') : ''
  const ext = type === 'video/quicktime' ? 'mov' : 'mp4'
  const safe = rowKey.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) || 'division'
  const blob = await upload(`champions/${tournamentId}/${safe}.${ext}`, file, {
    access: 'public',
    handleUploadUrl: `/api/tournaments/${encodeURIComponent(tournamentId)}/awards/upload-video`,
    onUploadProgress: p => onProgress?.(Math.round(p.percentage)),
  })
  return { videoUrl: blob.url, posterUrl }
}
