import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { saveReceipt, sniffReceipt } from '@/lib/eventExpenses'
import { RECEIPT_MAX_BYTES } from '@/lib/expenseTypes'

export const runtime = 'nodejs'

// A receipt photo or PDF, before it goes on an expense (POST multipart `file`).
// Kept private in ExpenseReceipt (lib/eventExpenses), not in the public /api/upload
// store: a receipt can show a card's last digits and where someone shops. The form
// shrinks a phone photo to a JPEG first, so this is a few hundred KB.

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let file: File | null = null
  try { file = (await req.formData()).get('file') as File | null } catch { /* below */ }
  if (!file || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (file.size > RECEIPT_MAX_BYTES) return NextResponse.json({ error: `That file is over ${RECEIPT_MAX_BYTES / 1048576} MB. Take a photo of the receipt instead.` }, { status: 413 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffReceipt(bytes)
  if (!mime) return NextResponse.json({ error: 'Use a photo (JPEG or PNG) or a PDF.' }, { status: 415 })
  const id = await saveReceipt(bytes, mime, gate.userId, gate.orgId || '')
  return NextResponse.json({ id, type: mime === 'application/pdf' ? 'pdf' : 'image' })
}
