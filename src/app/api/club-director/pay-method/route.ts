// A CLUB DIRECTOR CHANGING HOW THEY INTEND TO PAY.
//
// Clubs pick a method during registration to get their teams in, not because
// they have decided anything -- whatever is quickest to click gets them to the
// end of the form. Weeks later they come back to actually settle the invoice
// and the answer has changed: the treasurer would rather send a check, or the
// check never went out and they want to put it on a card. Until now that field
// was frozen at whatever they picked in a hurry, so the registrations page told
// Bo to expect a Zelle that was never coming (Bo, Sep 28 2026).
//
// This only records INTENT. Paying still happens on /pay/<id>, which offers every
// online method regardless of what is stored here, and Zelle and check are
// recorded by staff when the money lands. Keeping the field honest is what makes
// the staff page's "how is this club paying" column worth reading.
//
// WHAT MAKES THIS SAFE is the rule the coach and roster routes already use: the
// registration is fetched by id and its club checked against the caller's
// ClubDirectorLink rows for this tournament, so guessing an id reaches nothing.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'
import { nameKey } from '@/lib/names'

// Exactly what the public registration form offers, and nothing else. A method
// is a slug the staff page, the CSV export and the pay letters all switch on, so
// an unrecognized value would render as raw text in Bo's reports forever.
const METHODS = new Set(['ach', 'credit_card', 'paypal', 'zelle', 'check'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tournamentId = String(body?.tournamentId || '').trim()
  const registrationId = String(body?.registrationId || '').trim()
  const paymentMethod = String(body?.paymentMethod || '').trim().toLowerCase()
  if (!tournamentId || !registrationId) {
    return NextResponse.json({ error: 'tournamentId and registrationId are required' }, { status: 400 })
  }
  if (!METHODS.has(paymentMethod)) {
    return NextResponse.json({ error: 'That is not a payment method we accept' }, { status: 400 })
  }

  const as = viewAs(session, req.nextUrl.searchParams.get('userId'))
  if (!as.ok) return as.res

  const links = await prisma.clubDirectorLink.findMany({ where: { userId: as.userId, tournamentId } })
  if (!links.length) return NextResponse.json({ error: 'You are not linked to a club for this event' }, { status: 403 })
  const mine = new Set(links.map(l => nameKey(l.clubName)))

  const reg = await prisma.teamRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, clubName: true, tournamentId: true, deletedAt: true, paymentMethod: true },
  })
  // A registration staff soft-deleted is not editable either -- same reason as
  // the coach route: it is on its way out, and a write here would resurrect a
  // stale value if it is ever restored.
  if (!reg || reg.tournamentId !== tournamentId || reg.deletedAt) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
  }
  if (!mine.has(nameKey(reg.clubName))) {
    return NextResponse.json({ error: 'That is not one of your registrations' }, { status: 403 })
  }

  await prisma.teamRegistration.update({
    where: { id: reg.id },
    data: { paymentMethod },
  })

  return NextResponse.json({ ok: true, clubName: reg.clubName, from: reg.paymentMethod, paymentMethod })
}
