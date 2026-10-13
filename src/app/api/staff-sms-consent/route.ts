import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { setSmsConsent, smsConsentFor, ensureSmsConsentCols } from '@/lib/smsConsentDb'

export const dynamic = 'force-dynamic'

// A staff member's own permission to be texted.
//   GET            -> { phone, consent, at }
//   PUT { consent } -> turn it on or off
//
// Staff only, and it only ever touches the caller's OWN record: the worker is
// found by the signed-in email, never by an id from the request body. Nobody can
// grant consent on somebody else's behalf through this route, which is the whole
// point — a consent record is worthless if anyone could have ticked it.
//
// /join covers people signing up from today. This covers everyone already on the
// roster, who never saw that form and therefore has not agreed to anything.

/** The caller's Worker row, matched on their sign-in email. Oldest id wins, the
 *  same tie-break the staff pages use when one person has duplicate records. */
async function myWorker(email: string): Promise<{ id: string; phone: string } | null> {
  const addr = (email || '').trim().toLowerCase()
  if (!addr) return null
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT id, phone FROM "Worker" WHERE lower(email) = ? ORDER BY id LIMIT 1`, addr)
    const r = rows?.[0]
    return r ? { id: String(r.id), phone: String(r.phone || '') } : null
  } catch { return null }
}

export async function GET() {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const me = await myWorker(String(gate.session?.user?.email || ''))
  if (!me) return NextResponse.json({ phone: '', consent: false, at: '', noRecord: true })
  const map = await smsConsentFor([me.id])
  const row = map.get(me.id)
  return NextResponse.json({ phone: me.phone, consent: !!row, at: row?.at || '' })
}

export async function PUT(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const me = await myWorker(String(gate.session?.user?.email || ''))
  if (!me) return NextResponse.json({ error: 'No staff record found for your account' }, { status: 404 })

  let body: { consent?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const consent = body.consent === true

  // Saying yes without a number on file would record permission we can't use and
  // can't evidence. Make them add the number first.
  if (consent && !me.phone.trim()) {
    return NextResponse.json({ error: 'Add your mobile number first, then turn texts on.' }, { status: 400 })
  }

  await ensureSmsConsentCols()
  await setSmsConsent(me.id, consent, 'profile')
  const map = await smsConsentFor([me.id])
  const row = map.get(me.id)
  return NextResponse.json({ ok: true, consent: !!row, at: row?.at || '' })
}
