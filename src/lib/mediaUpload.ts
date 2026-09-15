// What a credentialed photographer is allowed to upload, and the browser-side work
// that happens before anything leaves their machine.
//
// Pure module -- imported by a client component, so no prisma and no mailer.
//
// ON SIZE. Selling is still shut off (the media release covers promotional use, not
// commercial resale of images of minors), so there is nothing to sell a 10 MB
// original of yet, and storing one would be paying to keep a file nobody can buy.
// Photos are therefore resized in the browser to web size before upload. The
// existing gallery averages 256 KB a photo (measured: 20-photo sample across the
// 193 on sunshineeventsgroup.com, Sep 15 2026), and these land in the same range --
// so a three-photographer weekend is well under a gigabyte instead of twenty.
// When the release is signed and originals start earning money, that is the moment
// to add a second, full-size copy -- not before.
//
// ON VIDEO. A phone shooting 4K at 100 Mbit/s makes a 125 MB ten-second clip. The
// cap below is what keeps a weekend of clips a rounding error instead of the
// largest line on the bill, and the duration is checked in the browser so somebody
// does not wait out a two-minute upload to be told no at the end.

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime']

export const LIMITS = {
  /** Long edge, in pixels, after the browser resize. */
  photoMaxEdge: 2400,
  photoQuality: 0.85,
  /** Refuse before resizing -- a 200 MB file is a mistake, not a photo. */
  photoMaxInputBytes: 60 * 1024 * 1024,
  /** After resizing. A 2400px JPEG at q0.85 lands far below this. */
  photoMaxBytes: 4 * 1024 * 1024,
  videoMaxBytes: 40 * 1024 * 1024,
  videoMaxSeconds: 10,
  /** Per batch, so one drop of a whole card doesn't run for an hour. */
  maxFiles: 60,
}

export const limitsBlurb = (): string =>
  `JPEG or PNG photos, and MP4 clips up to ${LIMITS.videoMaxSeconds} seconds. Up to ${LIMITS.maxFiles} files at a time. Photos are resized for the web before they upload — keep your originals.`

export function kindOf(type: string): 'photo' | 'video' | '' {
  const t = String(type || '').toLowerCase()
  if (PHOTO_TYPES.includes(t)) return 'photo'
  if (VIDEO_TYPES.includes(t)) return 'video'
  return ''
}

export type Prepared = {
  file: File
  kind: 'photo' | 'video'
  width: number
  height: number
  durationMs: number
}

/** Shrink to the long edge and re-encode as JPEG. EXIF is dropped with the re-encode,
 *  which also strips GPS -- these are photos of other people's children, and the
 *  coordinates of the field they were standing on do not belong in a public file. */
async function resizePhoto(file: File): Promise<Prepared> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error(`${file.name}: not an image we can read`))
      i.src = url
    })
    const k = Math.min(1, LIMITS.photoMaxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * k))
    const h = Math.max(1, Math.round(img.naturalHeight * k))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(`${file.name}: could not process`)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', LIMITS.photoQuality))
    if (!blob) throw new Error(`${file.name}: could not process`)
    if (blob.size > LIMITS.photoMaxBytes) throw new Error(`${file.name}: still too large after resizing`)
    const name = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return { file: new File([blob], `${name}.jpg`, { type: 'image/jpeg' }), kind: 'photo', width: w, height: h, durationMs: 0 }
  } finally { URL.revokeObjectURL(url) }
}

/** Read the clip's real duration and dimensions. Nothing is transcoded in the
 *  browser -- a clip that is too long or too big is refused so the photographer can
 *  trim it, which is the honest answer rather than a silent re-encode. */
async function checkVideo(file: File): Promise<Prepared> {
  if (file.size > LIMITS.videoMaxBytes) {
    throw new Error(`${file.name}: ${(file.size / 1048576).toFixed(0)} MB — the limit is ${LIMITS.videoMaxBytes / 1048576} MB. Export it at 1080p and try again.`)
  }
  const url = URL.createObjectURL(file)
  try {
    const v = await new Promise<HTMLVideoElement>((res, rej) => {
      const el = document.createElement('video')
      el.preload = 'metadata'
      el.onloadedmetadata = () => res(el)
      el.onerror = () => rej(new Error(`${file.name}: not a video we can read`))
      el.src = url
    })
    const secs = Number.isFinite(v.duration) ? v.duration : 0
    if (secs > LIMITS.videoMaxSeconds + 0.5) {
      throw new Error(`${file.name}: ${secs.toFixed(1)}s — clips are capped at ${LIMITS.videoMaxSeconds} seconds.`)
    }
    return { file, kind: 'video', width: v.videoWidth || 0, height: v.videoHeight || 0, durationMs: Math.round(secs * 1000) }
  } finally { URL.revokeObjectURL(url) }
}

/** One file, checked and made ready. Throws with a message meant to be shown. */
export async function prepare(file: File): Promise<Prepared> {
  const kind = kindOf(file.type)
  if (!kind) throw new Error(`${file.name}: we take JPEG, PNG and MP4.`)
  if (kind === 'photo') {
    if (file.size > LIMITS.photoMaxInputBytes) throw new Error(`${file.name}: that file is unusually large for a photo.`)
    return resizePhoto(file)
  }
  return checkVideo(file)
}

export const fmtBytes = (n: number): string =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
