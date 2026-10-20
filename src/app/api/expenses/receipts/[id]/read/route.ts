import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff } from '@/lib/apiAuth'
import { canSeeReceipt } from '@/lib/expenseGate'
import { receiptBytes, receiptMeta, setReceiptRead, todayET } from '@/lib/eventExpenses'
import { cleanRead, RECEIPT_MODEL, RECEIPT_TOOL, receiptSystem } from '@/lib/receiptAi'

export const runtime = 'nodejs'
export const maxDuration = 30

// Reads a receipt photo or PDF (lib/receiptAi) so the form fills in the store, the
// day, the total and what was bought. The person still checks each one before it is
// turned in. The total read is kept with the receipt, so the office sees it if the
// amount typed differs. Same key and model as the other AI helpers.

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const meta = await receiptMeta(params.id)
  if (!meta || !(await canSeeReceipt(gate, meta))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (meta.read) return NextResponse.json({ read: meta.read })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Receipt reading isn’t set up. Type the details in.' }, { status: 503 })
  const bytes = await receiptBytes(meta.id)
  if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data = Buffer.from(bytes).toString('base64')
  const file: Anthropic.ContentBlockParam = meta.mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: meta.mime as 'image/jpeg' | 'image/png' | 'image/webp', data } }
  const today = todayET()
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const r = await client.messages.create({
      model: RECEIPT_MODEL,
      max_tokens: 400,
      system: receiptSystem(today),
      tools: [RECEIPT_TOOL],
      tool_choice: { type: 'tool', name: RECEIPT_TOOL.name },
      messages: [{ role: 'user', content: [file, { type: 'text', text: 'Read this receipt.' }] }],
    })
    const use = r.content.find(block => block.type === 'tool_use') as { input?: unknown } | undefined
    if (!use) return NextResponse.json({ error: 'Couldn’t read that receipt. Type the details in.' }, { status: 502 })
    const read = cleanRead(use.input, today)
    await setReceiptRead(meta.id, read)
    return NextResponse.json({ read })
  } catch (e) {
    console.error('[expenses] receipt read:', (e as Error)?.message || e)
    return NextResponse.json({ error: 'Couldn’t read that receipt. Type the details in.' }, { status: 502 })
  }
}
