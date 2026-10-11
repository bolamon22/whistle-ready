import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/encrypt'

// Staff W-9s. A ref asked Bo (Oct 11 2026) "Is there a place to upload the W-9? Would
// prefer not to send via email"; the signup form's upload had been pulled on Sep 4, so
// there was none. Staff now upload it on their portal (components/StaffW9Card ->
// /api/staff-portal/w9); the signup route still takes one the same way.
//
// - The file, as a data: URL, is AES-256-GCM encrypted (lib/encrypt) under AppSetting
//   `w9:{workerId}`: never on the Worker row, so it never rides along in list payloads.
// - Only directors can open it (/api/workers/[id]/w9). Staff can replace theirs but
//   never download it: they have the original, and a stolen login shouldn't hand over
//   a tax ID.
// - `w9meta:{workerId}` is what the portal shows back (when, file name, type, size).
// - Worker.w9OnFile is the flag the Staff pool shows ("W-9 ✓").
// - The type comes from the file's own first bytes, never from what the browser
//   claimed: the director's viewer serves the file inline, so an HTML or SVG file
//   labelled as a W-9 would run in the app's own origin.

export const W9_MAX_BYTES = 2 * 1024 * 1024
export type W9Type = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'
export type W9Meta = { at: string; name: string; type: W9Type; size: number; via: 'portal' | 'signup' }

const blobKey = (workerId: string) => `w9:${workerId}`
const metaKey = (workerId: string) => `w9meta:${workerId}`

/** Encrypting with lib/encrypt's built-in fallback key would only look safe. */
export function w9StorageReady(): boolean {
  return !!process.env.ENCRYPTION_KEY
}

/** What the bytes really are: a PDF (its header may sit anywhere in the first 1 KB),
 *  a JPEG, a PNG or a WebP. Anything else is null. */
export function sniffW9(b: Uint8Array): W9Type | null {
  const head = b.subarray(0, 1024)
  for (let i = 0; i + 4 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return 'application/pdf'   // %PDF-
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

/** A data: URL from the signup form, checked like an upload. */
export function w9FromDataUrl(s: string): { bytes: Buffer; type: W9Type } | null {
  const m = /^data:[a-zA-Z0-9/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(s)
  if (!m) return null
  const bytes = Buffer.from(m[1], 'base64')
  if (!bytes.length || bytes.length > W9_MAX_BYTES) return null
  const type = sniffW9(bytes)
  return type ? { bytes, type } : null
}

function cleanFileName(s: string): string {
  const base = String(s || '').split(/[\\/]/).pop() || ''
  return base.replace(/[\u0000-\u001f\u007f<>"]/g, '').trim().slice(0, 80) || 'W-9'
}

async function ensureW9Column(): Promise<void> {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "w9OnFile" INTEGER NOT NULL DEFAULT 0`) } catch { /* exists */ }
}

/** The staff record a login belongs to: the same match /api/staff-portal makes (email,
 *  oldest record first). Never a worker id from the browser. */
export async function workerIdForEmail(email: string): Promise<string | null> {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return null
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC LIMIT 1`, e)
  return rows[0]?.id ? String(rows[0].id) : null
}

function readMeta(v: string | undefined | null): W9Meta | null {
  try { const m = v ? JSON.parse(v) : null; return m && typeof m === 'object' && typeof m.at === 'string' ? m : null } catch { return null }
}

/** On file or not, and what the portal shows about it. Never reads the file itself. */
export async function w9Status(workerId: string): Promise<{ onFile: boolean; meta: W9Meta | null }> {
  const [blob, meta] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: blobKey(workerId) }, select: { key: true } }),
    prisma.appSetting.findUnique({ where: { key: metaKey(workerId) } }),
  ])
  return { onFile: !!blob, meta: blob ? readMeta(meta?.value) : null }
}

/** Store (or replace) a W-9. `type` must come from sniffW9. */
export async function saveW9(workerId: string, file: { bytes: Buffer; type: W9Type; name: string }, via: W9Meta['via']): Promise<W9Meta> {
  const value = encrypt(`data:${file.type};base64,${file.bytes.toString('base64')}`)
  const meta: W9Meta = { at: new Date().toISOString(), name: cleanFileName(file.name), type: file.type, size: file.bytes.length, via }
  const mv = JSON.stringify(meta)
  await prisma.appSetting.upsert({ where: { key: blobKey(workerId) }, update: { value }, create: { key: blobKey(workerId), value } })
  await prisma.appSetting.upsert({ where: { key: metaKey(workerId) }, update: { value: mv }, create: { key: metaKey(workerId), value: mv } })
  await ensureW9Column()
  await prisma.$executeRawUnsafe(`UPDATE "Worker" SET w9OnFile = 1, updatedAt = datetime('now') WHERE id = ?`, workerId)
  return meta
}

/** Merging two staff records: the W-9 goes with the person. The newer of the two is
 *  kept (as a re-upload would replace the older one), under the kept record's id.
 *  True when the kept record ends up with one. */
export async function mergeW9(keepId: string, removeId: string): Promise<boolean> {
  const [kb, rb, km, rm] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: blobKey(keepId) }, select: { key: true } }),
    prisma.appSetting.findUnique({ where: { key: blobKey(removeId) } }),
    prisma.appSetting.findUnique({ where: { key: metaKey(keepId) } }),
    prisma.appSetting.findUnique({ where: { key: metaKey(removeId) } }),
  ])
  if (!kb && !rb) return false
  const keepAt = readMeta(km?.value)?.at || ''
  const removeAt = readMeta(rm?.value)?.at || ''
  if (rb && (!kb || removeAt > keepAt)) {
    await prisma.appSetting.upsert({ where: { key: blobKey(keepId) }, update: { value: rb.value }, create: { key: blobKey(keepId), value: rb.value } })
    if (rm) await prisma.appSetting.upsert({ where: { key: metaKey(keepId) }, update: { value: rm.value }, create: { key: metaKey(keepId), value: rm.value } })
    else await prisma.appSetting.deleteMany({ where: { key: metaKey(keepId) } })
  }
  if (rb || rm) await prisma.appSetting.deleteMany({ where: { key: { in: [blobKey(removeId), metaKey(removeId)] } } })
  await ensureW9Column()
  await prisma.$executeRawUnsafe(`UPDATE "Worker" SET w9OnFile = 1 WHERE id = ?`, keepId)
  return true
}
