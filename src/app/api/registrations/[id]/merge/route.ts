import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { cleanName, nameKey } from '@/lib/names'

// Merge a duplicate registration INTO this one (the same club registering twice
// for the same tournament, e.g. two teams in August and two more in September).
//
//   POST /api/registrations/[id]/merge  { sourceId, dryRun?: true }
//
// Everything on the source moves to the target — its teams, its payment history,
// its invoice and discount amounts — so nothing is lost: the target ends up with
// all the teams, invoice = sum, discount = sum, paid = sum. Contact details stay
// the target's; any source detail that differs is written into the target's
// notes. The source is then soft-deleted and stamped mergedIntoId so its old
// pay link redirects and "Recently Deleted" explains what happened.
// dryRun returns the same plan without writing anything (the confirm dialog).

const fmtMoney = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDay = (d: Date | string) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return String(d) } }

async function ensureMergeColumns() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "mergedIntoId" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
}

async function rawExtras(id: string): Promise<Record<string, any>> {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "hotelName", "hotelRooms", "hotelNights", "instagramHandle", "qboInvoiceId", "mergedIntoId" FROM "TeamRegistration" WHERE id = ?`, id)
    return rows?.[0] || {}
  } catch { return {} }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const body = await req.json().catch(() => ({})) as any
  const sourceId = String(body?.sourceId || '')
  const dryRun = body?.dryRun === true
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })
  if (sourceId === params.id) return NextResponse.json({ error: 'Pick a different registration to merge in' }, { status: 400 })

  await ensureMergeColumns()
  const include = { teams: true, payments: { orderBy: { receivedAt: 'asc' as const } } }
  const [target, source] = await Promise.all([
    prisma.teamRegistration.findUnique({ where: { id: params.id }, include }),
    prisma.teamRegistration.findUnique({ where: { id: sourceId }, include }),
  ])
  if (!target || target.deletedAt) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
  if (!source || source.deletedAt) return NextResponse.json({ error: 'The registration to merge in was not found (already deleted?)' }, { status: 404 })
  if (source.tournamentId !== target.tournamentId) return NextResponse.json({ error: 'Both registrations must be in the same tournament' }, { status: 400 })
  const [tx, sx] = await Promise.all([rawExtras(target.id), rawExtras(source.id)])

  // ── the plan ──────────────────────────────────────────────────────────────
  const paidT = target.payments.reduce((s, p) => s + p.amount, 0)
  const paidS = source.payments.reduce((s, p) => s + p.amount, 0)
  const invoiceAmount = Math.round(((target.invoiceAmount || 0) + (source.invoiceAmount || 0)) * 100) / 100
  const discountAmount = Math.round(((target.discountAmount || 0) + (source.discountAmount || 0)) * 100) / 100
  const paid = Math.round((paidT + paidS) * 100) / 100
  const balance = Math.round((invoiceAmount - discountAmount - paid) * 100) / 100
  const discountNote = [target.discountNote, source.discountNote].map(x => String(x || '').trim()).filter(Boolean).join(' · ')

  // Details that differ get preserved in the notes rather than silently dropped.
  const differs: string[] = []
  const same = (a: any, b: any) => nameKey(a) === nameKey(b)
  if (source.clubContact && !same(source.clubContact, target.clubContact)) differs.push(`contact ${cleanName(source.clubContact)}`)
  if (source.contactEmail && !same(source.contactEmail, target.contactEmail)) differs.push(`email ${source.contactEmail.trim()}`)
  if (source.contactPhone && String(source.contactPhone).replace(/\D/g, '') !== String(target.contactPhone).replace(/\D/g, '')) differs.push(`phone ${source.contactPhone.trim()}`)
  if (source.clubBasedIn && target.clubBasedIn && !same(source.clubBasedIn, target.clubBasedIn)) differs.push(`based in ${cleanName(source.clubBasedIn)}`)
  if (source.paymentMethod && source.paymentMethod !== target.paymentMethod) differs.push(`pay method ${source.paymentMethod}`)
  if (source.needsHotel && source.needsHotel !== target.needsHotel) differs.push(`hotel ${source.needsHotel}`)
  if (sx.hotelName && sx.hotelName !== tx.hotelName) differs.push(`staying at ${sx.hotelName}${sx.hotelRooms ? ` (${sx.hotelRooms} rooms × ${sx.hotelNights || '?'} nights)` : ''}`)
  if (sx.instagramHandle && sx.instagramHandle !== tx.instagramHandle) differs.push(`instagram @${sx.instagramHandle}`)
  if (source.notes && source.notes.trim()) differs.push(`notes: ${source.notes.trim()}`)

  const mergeNote = `Merged in the ${fmtDay(source.createdAt)} registration (${source.teams.length} team${source.teams.length === 1 ? '' : 's'}: ${source.teams.map(t => t.teamName).join(', ') || '—'}; invoice ${fmtMoney(source.invoiceAmount || 0)}${source.discountAmount ? `, discount ${fmtMoney(source.discountAmount)}` : ''}, paid ${fmtMoney(paidS)})${differs.length ? ` — it listed ${differs.join('; ')}` : ''}.`
  const notes = [String(target.notes || '').trim(), mergeNote].filter(Boolean).join('\n')

  // Empty target fields get filled from the source so nothing is lost.
  const fill: Record<string, string> = {}
  if (!target.clubBasedIn && source.clubBasedIn) fill.clubBasedIn = cleanName(source.clubBasedIn)
  if (!target.clubWebsite && source.clubWebsite) fill.clubWebsite = source.clubWebsite.trim()
  if (!target.clubLogoUrl && source.clubLogoUrl) fill.clubLogoUrl = source.clubLogoUrl
  const rawFill: Record<string, any> = {}
  if (!tx.hotelName && sx.hotelName) { rawFill.hotelName = sx.hotelName; rawFill.hotelRooms = Number(sx.hotelRooms) || 0; rawFill.hotelNights = Number(sx.hotelNights) || 0 }
  if (!tx.instagramHandle && sx.instagramHandle) rawFill.instagramHandle = sx.instagramHandle

  const warnings: string[] = []
  if (sx.qboInvoiceId) warnings.push(`The ${fmtDay(source.createdAt)} registration was synced to QuickBooks as invoice #${sx.qboInvoiceId}. The merged registration keeps ${tx.qboInvoiceId ? `invoice #${tx.qboInvoiceId}` : 'no QuickBooks link'} — adjust or void #${sx.qboInvoiceId} in QuickBooks yourself.`)
  else if (tx.qboInvoiceId) warnings.push(`QuickBooks invoice #${tx.qboInvoiceId} was synced for ${fmtMoney(target.invoiceAmount || 0)}; the merged total is ${fmtMoney(invoiceAmount)}. Update the invoice in QuickBooks.`)
  if (!same(source.clubName, target.clubName)) warnings.push(`Club names differ ("${target.clubName}" vs "${source.clubName}") — the merged registration keeps "${target.clubName}".`)

  const plan = {
    target: { id: target.id, clubName: target.clubName, createdAt: target.createdAt, teams: target.teams.length, invoiceAmount: target.invoiceAmount, discountAmount: target.discountAmount, paid: paidT },
    source: { id: source.id, clubName: source.clubName, createdAt: source.createdAt, teams: source.teams.length, invoiceAmount: source.invoiceAmount, discountAmount: source.discountAmount, paid: paidS },
    result: {
      teams: [...target.teams, ...source.teams].map(t => ({ teamName: t.teamName, division: t.division, from: t.registrationId === source.id ? 'source' : 'target' })),
      invoiceAmount, discountAmount, discountNote, paid, balance,
      paymentsMoved: source.payments.length,
      filled: Object.keys({ ...fill, ...rawFill }),
      mergeNote,
    },
    warnings,
  }
  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, plan })

  // ── apply ─────────────────────────────────────────────────────────────────
  try {
    await prisma.$transaction([
      prisma.registeredTeam.updateMany({ where: { registrationId: source.id }, data: { registrationId: target.id } }),
      prisma.registrationPayment.updateMany({ where: { registrationId: source.id }, data: { registrationId: target.id } }),
      prisma.teamRegistration.update({
        where: { id: target.id },
        data: { invoiceAmount, discountAmount, discountNote, notes, numTeams: target.teams.length + source.teams.length, ...fill },
      }),
      prisma.teamRegistration.update({
        where: { id: source.id },
        data: { deletedAt: new Date(), numTeams: 0, notes: `Merged into ${target.clubName} (${target.id}) on ${fmtDay(new Date())}. Teams, payments, invoice and discount were moved there.` },
      }),
    ])
  } catch (e: any) {
    console.error('merge failed:', e)
    return NextResponse.json({ error: e?.message || 'Merge failed — nothing was changed' }, { status: 500 })
  }
  // Raw columns (not in the Prisma schema): where the source went, and any hotel /
  // instagram details the target was missing. Best-effort — the merge itself is done.
  try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "mergedIntoId" = ? WHERE id = ?`, target.id, source.id) } catch {}
  for (const [k, v] of Object.entries(rawFill)) {
    try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "${k}" = ? WHERE id = ?`, v, target.id) } catch {}
  }

  const merged = await prisma.teamRegistration.findUnique({ where: { id: target.id }, include })
  return NextResponse.json({ ok: true, plan, registration: merged })
}
