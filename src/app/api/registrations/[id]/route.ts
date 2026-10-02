import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { recordTeamPayment } from '@/lib/paymentGuard'
import { notifyPaymentReceived } from '@/lib/paymentNotify'
import { requireStaff } from '@/lib/apiAuth'
import { cleanName, nameKey } from '@/lib/names'
import { renameTeamRefs, renameClubRefs, removeTeamRefs } from '@/lib/teamRename'
import { ensurePaymentGuard } from '@/lib/paymentGuard'
import { pruneOrphanPoolNames } from '@/lib/poolMembership'
import { sendSpotOpened, type PromotedTeam } from '@/lib/spotOpened'

async function ensureRegistrationColumns() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "clubLogoUrl" TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelName" TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelRooms" INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelNights" INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  // Waiting-list teams: registered but not invoiced. See src/lib/regPricing.ts.
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "RegisteredTeam" ADD COLUMN "waitlisted" BOOLEAN NOT NULL DEFAULT 0`) } catch { /* already exists */ }
}

// A team that leaves the event here takes its games with it, the same as a
// delete on the Divisions page. Leaving them kept opponents booked against a
// team that no longer exists, and the hole was invisible: the board looked full.
// With the games gone, the empty slots show on the Scheduler and the Divisions
// rail flags the pool as short.
//
// Skipped for any name still registered in that division through another
// registration (a club entered twice), whose games are still real.
async function dropTeamsFromSchedule(tournamentId: string, gone: { teamName: string; division: string }[]) {
  if (!tournamentId || !gone.length) return
  const still = await prisma.registeredTeam.findMany({
    where: { registration: { tournamentId, deletedAt: null } },
    select: { teamName: true, division: true },
  })
  const k = (d: string, t: string) => nameKey(d) + '|' + nameKey(t)
  const live = new Set(still.map((t: { teamName: string; division: string }) => k(t.division, t.teamName)))
  for (const t of gone) {
    if (!t.teamName || live.has(k(t.division, t.teamName))) continue
    try { await removeTeamRefs(tournamentId, t.teamName, t.division || undefined) } catch { /* the registration change still stands */ }
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  await ensurePaymentGuard()
  const body = await req.json()

  // Stripe paid-marking from the public register page: anonymous but VERIFIED --
  // we confirm with Stripe (secret key) that this intent really succeeded for THIS
  // registration before recording a payment. Nothing else is writable on this path.
  if (body.stripeConfirm) {
    if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    const piId = String(body.stripeConfirm)
    if (!/^pi_[A-Za-z0-9]+$/.test(piId)) return NextResponse.json({ error: 'Bad payment intent id' }, { status: 400 })
    const stripeHeaders: Record<string, string> = {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': '2024-06-20',
    }
    if (process.env.STRIPE_ACCOUNT_ID) stripeHeaders['Stripe-Context'] = process.env.STRIPE_ACCOUNT_ID
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${piId}?expand[]=latest_charge`, { headers: stripeHeaders })
    const pi = await piRes.json()
    if (!piRes.ok) return NextResponse.json({ error: pi?.error?.message || 'Stripe lookup failed' }, { status: 502 })
    if (pi.status !== 'succeeded' || pi.metadata?.registrationId !== params.id) {
      return NextResponse.json({ error: 'Payment not verified' }, { status: 400 })
    }
    {
      // Record the BASE amount (what they owed) when the intent carries it; the
      // 3% card fee goes in the note so invoiced-vs-paid balances stay clean.
      // Method comes from the CHARGE actually made, not payment_method_types —
      // intents created without explicit types inherit the account's whole
      // payment-method configuration (card + us_bank_account + …), which made
      // includes('us_bank_account') label real card payments as ACH.
      const pmType = (pi.latest_charge && typeof pi.latest_charge === 'object'
        ? pi.latest_charge?.payment_method_details?.type : '') || ''
      const isAchPayment = pmType ? pmType === 'us_bank_account'
        : (pi.payment_method_types || []).join(',') === 'us_bank_account'
      const charged = (pi.amount_received ?? pi.amount ?? 0) / 100
      const base = parseFloat(pi.metadata?.baseAmount || '')
      const recordAmount = base > 0 && base <= charged ? base : charged
      // recordTeamPayment owns the "already recorded?" question now -- it asks
      // it AND lets the unique index settle the race the old check could not.
      const wrote = await recordTeamPayment({
        registrationId: params.id,
        amount: recordAmount,
        method: isAchPayment ? 'ach' : 'credit_card',
        receivedAt: new Date().toISOString().split('T')[0],
        notes: `Stripe · ${piId}${recordAmount < charged ? ` · incl. $${(charged - recordAmount).toFixed(2)} card fee (charged $${charged.toFixed(2)})` : ''}`,
        piId,
      })
      // Only on a row we actually wrote, or a webhook arriving a second later
      // pings Bo twice for one payment.
      if (wrote) await notifyPaymentReceived({
        registrationId: params.id,
        amount: recordAmount,
        method: isAchPayment ? 'ach' : 'credit_card',
        charged,
      })
    }
    return NextResponse.json({ ok: true })
  }

  // Travel-only update (from the Travel & hotels report page): touches ONLY the
  // hotel columns. Deliberately separate from the full PATCH below, which
  // deletes + recreates the team list -- a travel edit must never do that.
  if (body.travel) {
    const gate = await requireStaff(); if (!gate.ok) return gate.res
    await ensureRegistrationColumns()
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "TeamRegistration" SET "needsHotel" = ?, "hotelName" = ?, "hotelRooms" = ?, "hotelNights" = ? WHERE id = ?`,
        String(body.needsHotel || 'No'), String(body.hotelName || '').slice(0, 120),
        Number(body.hotelRooms) || 0, Number(body.hotelNights) || 0, params.id)
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.error(e)
      return NextResponse.json({ error: 'Failed to update travel info' }, { status: 500 })
    }
  }
  // Full staff edit below (deletes + recreates the team list) -- never anonymous.
  const gate = await requireStaff(); if (!gate.ok) return gate.res

  const {
    clubName, clubContact, contactEmail, contactPhone,
    clubBasedIn, clubWebsite, needsHotel, paymentMethod, notes, teams,
    invoiceAmount, discountAmount, discountNote, clubLogoUrl,
  } = body

  await ensureRegistrationColumns()
  // The drawer sends the whole team list back without ids, so the rows are
  // recreated. Keep the previous names so a rename (or a whitespace cleanup)
  // can be carried through to pools, games, brackets and waivers below.
  const before = await prisma.teamRegistration.findUnique({
    where: { id: params.id },
    include: { teams: true },
  })
  await prisma.registeredTeam.deleteMany({ where: { registrationId: params.id } })

  const club = cleanName(clubName)
  const cleanTeams = (teams || []).map((t: any) => ({
    clubName: cleanName(t.clubName) || club,
    teamName: cleanName(t.teamName),
    division: cleanName(t.division),
    coachName: cleanName(t.coachName),
    coachPhone: String(t.coachPhone || '').trim(),
    coachEmail: String(t.coachEmail || '').trim(),
    logoUrl: t.logoUrl || (clubLogoUrl || ''),
    // This PATCH deletes every team and recreates it, so a flag not carried here
    // is a flag silently cleared: editing a club's phone number would put two
    // waiting-list teams back on the invoice.
    waitlisted: !!t.waitlisted,
  }))

  const registration = await prisma.teamRegistration.update({
    where: { id: params.id },
    data: {
      clubName: club,
      clubContact: cleanName(clubContact),
      contactEmail: String(contactEmail || '').trim(),
      contactPhone: String(contactPhone || '').trim(),
      clubBasedIn: cleanName(clubBasedIn),
      clubWebsite: String(clubWebsite || '').trim(),
      numTeams: cleanTeams.length,
      needsHotel: needsHotel || 'No',
      paymentMethod: paymentMethod || 'check',
      notes: notes || '',
      invoiceAmount: Number(invoiceAmount) || 0,
      discountAmount: Number(discountAmount) || 0,
      discountNote: discountNote || '',
      clubLogoUrl: clubLogoUrl || '',
      teams: { create: cleanTeams },
    },
    include: { teams: true, payments: { orderBy: { receivedAt: 'asc' } } },
  })

  // Carry renames through. Rows have no ids, so match by position — only when
  // the list is the same length (add/remove changes positions and is skipped).
  if (before) {
    if (before.clubName && before.clubName !== club) {
      await renameClubRefs(before.tournamentId, before.clubName, club)
    }
    if (before.teams.length === cleanTeams.length) {
      for (let i = 0; i < cleanTeams.length; i++) {
        const was = before.teams[i]?.teamName || ''
        const now = cleanTeams[i].teamName
        if (was && now && was !== now) await renameTeamRefs(before.tournamentId, was, now, club, before.teams[i]?.division || undefined)
      }
    }
    // This PATCH deletes and recreates the whole team list, so dropping a team
    // here removes its RegisteredTeam but left its name behind in the pool.
    // Renames are handled above by renameTeamRefs; this catches the removals.
    if (before.teams.length !== cleanTeams.length) {
      const kept = new Set(cleanTeams.map((t: { teamName: string; division: string }) => nameKey(t.division) + '|' + nameKey(t.teamName)))
      const gone = before.teams.filter((t: { teamName: string; division: string }) => !kept.has(nameKey(t.division) + '|' + nameKey(t.teamName)))
      await dropTeamsFromSchedule(before.tournamentId, gone)
      await pruneOrphanPoolNames(before.tournamentId)
    }
  }

  // OFF THE WAITING LIST. Which teams were waitlisted before this save and are
  // not now? Matched by name+division first, then by position when the list kept
  // its length -- the same position rule the rename carry-through uses, so a team
  // renamed and promoted in one save is still caught.
  const promoted: PromotedTeam[] = []
  if (before) {
    cleanTeams.forEach((t: { teamName: string; division: string; waitlisted: boolean }, i: number) => {
      if (t.waitlisted) return
      const byName = before.teams.find(b => nameKey(b.teamName) === nameKey(t.teamName) && nameKey(b.division) === nameKey(t.division))
      const byPos = before.teams.length === cleanTeams.length ? before.teams[i] : undefined
      const prev = byName || byPos
      if (prev && (prev as { waitlisted?: boolean }).waitlisted) promoted.push({ teamName: t.teamName, division: t.division })
    })
  }
  // Emailed only when the staff drawer asked for it (its checkbox defaults on).
  // Unticking a waitlist box to correct a data-entry mistake must not tell a club
  // it has a spot.
  let spotOpenedEmail: { sent: boolean; to: string[]; error?: string } | null = null
  if (promoted.length && body.notifyPromoted === true) {
    const r = await sendSpotOpened(params.id, promoted)
    spotOpenedEmail = { sent: r.ok, to: r.to, ...(r.error ? { error: r.error } : {}) }
  }

  return NextResponse.json({ ...registration, promoted, spotOpenedEmail })
  } catch (e: any) {
    console.error('Registration PATCH failed:', e)
    return NextResponse.json({ error: e?.message || 'Failed to save registration' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const reg = await prisma.teamRegistration.findUnique({ where: { id: params.id }, select: { tournamentId: true, teams: { select: { teamName: true, division: true } } } })
  await prisma.teamRegistration.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })
  if (reg?.tournamentId) await dropTeamsFromSchedule(reg.tournamentId, reg.teams ?? [])
  // The club's teams are gone from the event, so take their names out of the
  // pools too. Only the Divisions page used to do this, which is how a team
  // removed here stayed on the public standings with nothing able to shift it.
  if (reg?.tournamentId) await pruneOrphanPoolNames(reg.tournamentId)
  return NextResponse.json({ ok: true })
}
