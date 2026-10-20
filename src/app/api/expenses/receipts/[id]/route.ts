import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { canSeeReceipt } from '@/lib/expenseGate'
import { receiptBytes, receiptMeta } from '@/lib/eventExpenses'

export const runtime = 'nodejs'

// A receipt file, for the people allowed to see it (lib/expenseGate canSeeReceipt):
// who uploaded it, whose receipt it is, the event's office and admins. Everyone
// else gets "not found", as if it didn't exist.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const meta = await receiptMeta(params.id)
  if (!meta || !(await canSeeReceipt(gate, meta))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const bytes = await receiptBytes(meta.id)
  if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ext = meta.mime === 'application/pdf' ? 'pdf' : meta.mime === 'image/png' ? 'png' : meta.mime === 'image/webp' ? 'webp' : 'jpg'
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': meta.mime,
      'Content-Disposition': `inline; filename="receipt.${ext}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
