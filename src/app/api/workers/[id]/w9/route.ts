import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireDirector } from '@/lib/apiAuth'
import { decrypt } from '@/lib/encrypt'

// W-9 retrieval — DIRECTOR-ONLY, deliberately stricter than the rest of the staff
// APIs: a W-9 carries a tax ID. The file is stored AES-256-GCM-encrypted under
// AppSetting w9:{workerId} (written by /api/join); this route decrypts and streams
// it so the browser renders the PDF/image directly. It never appears in any list
// payload.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res

  const row = await prisma.appSetting.findUnique({ where: { key: `w9:${params.id}` } })
  if (!row) return NextResponse.json({ error: 'No W-9 on file' }, { status: 404 })

  const dataUrl = decrypt(row.value)
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!m) return NextResponse.json({ error: 'Stored W-9 is unreadable' }, { status: 500 })

  return new NextResponse(Buffer.from(m[2], 'base64'), {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="w9"' },
  })
}
