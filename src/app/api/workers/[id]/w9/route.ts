import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { orgGateFor, requireDirector } from '@/lib/apiAuth'
import { decrypt } from '@/lib/encrypt'
import { sniffW9 } from '@/lib/staffW9'

// W-9 retrieval — DIRECTOR-ONLY, deliberately stricter than the rest of the staff
// APIs: a W-9 carries a tax ID. The file is stored AES-256-GCM-encrypted under
// AppSetting w9:{workerId} (lib/staffW9: the staff portal, and /api/join); this route decrypts and streams
// it so the browser renders the PDF/image directly. It never appears in any list
// payload. A director gets only their own organization's staff (lib/orgScope): with
// more than one organization on Whistle Ready, any director could read anyone's.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  const w = await prisma.worker.findUnique({ where: { id: params.id }, select: { orgId: true } })
  if (!w || orgGateFor(gate, w.orgId)) return NextResponse.json({ error: 'No W-9 on file' }, { status: 404 })

  const row = await prisma.appSetting.findUnique({ where: { key: `w9:${params.id}` } })
  if (!row) return NextResponse.json({ error: 'No W-9 on file' }, { status: 404 })

  const dataUrl = decrypt(row.value)
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!m) return NextResponse.json({ error: 'Stored W-9 is unreadable' }, { status: 500 })

  // Served as what the bytes are, never the stored label: an SVG or HTML file sent in
  // as a "W-9" would otherwise open in this origin with the director's login.
  const bytes = Buffer.from(m[2], 'base64')
  const type = sniffW9(bytes)
  if (!type) return NextResponse.json({ error: 'This file isn’t a PDF or a photo, so it can’t be opened here.' }, { status: 415 })
  const ext = type === 'application/pdf' ? 'pdf' : type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'
  return new NextResponse(bytes, {
    headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Disposition': `inline; filename="w9.${ext}"` },
  })
}
