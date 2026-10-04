import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ownRegistration, addStaffNote } from '@/lib/clubPortal'
import { directorsOf } from '@/lib/clubAccess'
import { createInvite, cancelInvite, INVITE_DAYS } from '@/lib/clubInvites'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { orgForTournament, orgLogoUrl } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { renderEmail, button, esc, absUrl, imageSize, fitBox } from '@/lib/emailLayout'
import { cleanName } from '@/lib/names'
import { officeStamp } from '@/lib/changeRequest'

export const dynamic = 'force-dynamic'

// A director adds another director to their registration (Bo, Oct 4 2026:
// "Director adds them"). Access is per registration (lib/clubAccess), so this is
// how a club's second director, or a new one taking over, gets in without the
// office. The invited address gets a single-use link (lib/clubInvites); following
// it proves the inbox and opens this one registration.
//
// Only a director who can open the registration may invite, never the staff view
// of a portal (ownRegistration refuses it): staff add people on the Users page.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// POST { tournamentId, registrationId, email, name? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tournamentId = String(body.tournamentId || '').trim()
  const registrationId = String(body.registrationId || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const name = cleanName(body.name, 80)

  const own = await ownRegistration(session, req.nextUrl.searchParams.get('userId'), tournamentId, registrationId)
  if (!own.ok) return own.res
  if (!EMAIL_RE.test(email) || email.length > 160) {
    return NextResponse.json({ error: 'That email address does not look right' }, { status: 400 })
  }
  if (!emailEnabled()) {
    return NextResponse.json({ error: 'Email is not available right now, so the invite could not be sent. Ask the tournament office to add them.' }, { status: 503 })
  }
  const already = (await directorsOf([registrationId])).get(registrationId) || []
  if (already.some(d => d.email === email)) {
    return NextResponse.json({ error: `${email} can already open this registration.` }, { status: 409 })
  }

  const by = own.who || cleanName(session?.user?.email, 120) || 'A club director'
  const made = await createInvite({ registrationId, tournamentId, email, name, by, byUserId: own.userId })
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: 429 })

  // The letter comes from the organizer, on their domain, like the claim email.
  const reg = own.reg
  const org = await orgForTournament(tournamentId)
  const base = tournamentAbs(org?.slug, '').replace(/\/$/, '')
  const link = `${base}/claim/${made.invite.token}`
  const logo = org ? absUrl(base, await orgLogoUrl(org.id, org.logoUrl)) : ''
  let eventName = 'the tournament'
  try {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } })
    if (t?.name) eventName = t.name
  } catch { /* a generic name is fine */ }
  const club = esc(reg.clubName || 'your club')
  const sent = await sendEmail({
    to: email,
    subject: `${by} added you as a club director for ${reg.clubName || 'your club'}`,
    html: renderEmail({
      orgName: org?.name || 'Whistle Ready', logoUrl: logo, logoBox: logo ? fitBox(await imageSize(logo), 150, 46) : undefined,
      eyebrow: 'Club portal', title: `Join ${reg.clubName || 'your club'}'s club portal`,
      body: `<p style="margin:0 0 4px">${name ? `Hi ${esc(name)}, ` : ''}${esc(by)} added you as a club director for ${club} at ${esc(eventName)}. The club portal has your teams, player waivers, invoice and schedule in one place.</p>`
        + button(link, `Join ${reg.clubName || 'the club'}'s portal`)
        + `<p style="margin:16px 0 0">Choose a password, or sign in with the one you already have for this email. The link works once and expires in ${INVITE_DAYS} days.</p>`
        + `<p style="margin:18px 0 0;font-size:13px;color:#94a3b8">Not expecting this? You can ignore it, and nothing changes.</p>`,
    }),
    ...orgSender(org),
  })
  if (!sent.ok) {
    await cancelInvite(registrationId, email)
    return NextResponse.json({ error: 'The invite email could not be sent. Check the address and try again.' }, { status: 502 })
  }

  // A line for the office, like every other portal action.
  try { await addStaffNote(reg.id, reg.notes, `[Club portal ${officeStamp()}, ${by}] Invited ${email}${name ? ` (${name})` : ''} as a club director.`) } catch { /* the invite stands */ }
  return NextResponse.json({ ok: true, email })
}

// DELETE { tournamentId, registrationId, email }: take back an invite that hasn't been used.
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tournamentId = String(body.tournamentId || '').trim()
  const registrationId = String(body.registrationId || '').trim()
  const email = String(body.email || '').trim().toLowerCase()

  const own = await ownRegistration(session, req.nextUrl.searchParams.get('userId'), tournamentId, registrationId)
  if (!own.ok) return own.res
  if (!(await cancelInvite(registrationId, email))) {
    return NextResponse.json({ error: 'No open invite to that address.' }, { status: 404 })
  }
  try { await addStaffNote(own.reg.id, own.reg.notes, `[Club portal ${officeStamp()}, ${own.who || 'club director'}] Took back the club director invite to ${email}.`) } catch { /* fine */ }
  return NextResponse.json({ ok: true })
}
