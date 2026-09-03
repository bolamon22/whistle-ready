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
