// Browser-side prep for the player card photo: crop to a square (biased toward the top,
// where faces are in portrait shots), shrink to `size`, re-encode as JPEG — a 12 MB phone
// photo becomes ~60 KB before it goes to /api/upload — then upload and return its URL.
export async function squareJpeg(file: File, size: number): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file isn't a photo we can read")); i.src = url })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) * 0.25
    const out = Math.min(size, side)
    const canvas = document.createElement('canvas'); canvas.width = out; canvas.height = out
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not process the photo')
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.86))
    if (!blob) throw new Error('Could not process the photo')
    return blob
  } finally { URL.revokeObjectURL(url) }
}

/** Club logo: no crop, fit inside `max`×`max`, PNG so transparent backgrounds survive. */
export async function fitPng(file: File, max: number): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file isn't an image we can read")); i.src = url })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k))
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not process the image')
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('Could not process the image')
    return blob
  } finally { URL.revokeObjectURL(url) }
}

export async function uploadClubLogo(file: File): Promise<string> {
  const blob = await fitPng(file, 512)
  const fd = new FormData(); fd.append('file', new File([blob], 'club-logo.png', { type: 'image/png' }))
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.url) throw new Error(j.error || 'Upload failed')
  return String(j.url)
}

export async function uploadPlayerPhoto(file: File): Promise<string> {
  const blob = await squareJpeg(file, 640)
  const fd = new FormData(); fd.append('file', new File([blob], 'player.jpg', { type: 'image/jpeg' }))
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.url) throw new Error(j.error || 'Upload failed')
  return String(j.url)
}

// Hotel photos (Builder > Hotels): fit inside 1600px, JPEG. A hotel's press photos
// are often 4000px and several megabytes; 1600px is plenty for the full-screen
// viewer, and the families' pages show the same file as the thumbnails, so this
// also keeps those pages light. The re-encode drops EXIF, GPS included.

export const HOTEL_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

/** No crop, fit inside `max`x`max`, JPEG on white (a see-through PNG would go black). */
export async function fitJpeg(file: File, max: number, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("not a photo we can read")); i.src = url })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k))
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('could not process the photo')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', quality))
    if (!blob) throw new Error('could not process the photo')
    // Shrunk: always the new file. Already small enough: whichever is lighter.
    return k < 1 || blob.size < file.size || file.type !== 'image/jpeg' ? blob : file
  } finally { URL.revokeObjectURL(url) }
}

/** One hotel photo. Resolves to its address (/api/img/<id>), or throws saying why. */
export async function uploadHotelPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error(`${file.name}: use a JPEG, PNG or WebP photo`)
  let blob: Blob
  try { blob = await fitJpeg(file, 1600) } catch (e: any) { throw new Error(`${file.name}: ${e?.message || 'could not process the photo'}`) }
  const fd = new FormData(); fd.append('file', new File([blob], 'hotel-photo.jpg', { type: blob.type || 'image/jpeg' }))
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  const j = await res.json().catch(() => ({}))
  // /api/upload falls back to a data: URL for a tiny picture when storage fails;
  // that would sit inside the event's JSON, so it counts as a failed upload here.
  if (!res.ok || !String(j.url || '').startsWith('/api/img/')) throw new Error(`${file.name}: did not upload`)
  return String(j.url)
}
