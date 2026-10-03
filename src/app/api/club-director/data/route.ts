import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'
import { rosterLock } from '@/lib/rosterLock'
import { isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility, applyPublicView } from '@/lib/publicView'
import { readConfirmMany } from '@/lib/changeRequest'
import { eventInfo, divisionFull, addPolicy, addBlock } from '@/lib/clubPortal'
import { parsePricing } from '@/lib/regPricing'
import { divisionBadge } from '@/lib/regStatus'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tournamentId = req.nextUrl.searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })

  const as = viewAs(session, req.nextUrl.searchParams.get('userId'))
  if (!as.ok) return as.res

  // Get clubs this user is linked to for this tournament
  const links = await prisma.clubDirectorLink.findMany({
    where: { userId: as.userId, tournamentId },
  })
  if (links.length === 0) return NextResponse.json({ clubs: [] })

  const clubNames = links.map(l => l.clubName)

  // Get registrations for their clubs only.
  //
  // Selected field by field rather than returned whole. TeamRegistration also
  // carries `notes`, which is where staff write things like "Merged in the Sep 1
  // registration -- it listed based in Brandenton, FL; pay method check". That
  // is back-office bookkeeping about the club, not for the club, and returning
  // the model wholesale shipped it to their browser whether or not the page drew
  // it. Everything below is something the club's own director should be able to
  // read about themselves.
  const registrations = await prisma.teamRegistration.findMany({
    // deletedAt: null, or a registration staff removed still counts against
    // the club. LaxManiax saw $8,970 owing on an account paid in full,
    // because deleted duplicates kept their invoice while only the live
    // registration's payments were credited (Sep 15 2026).
    where: { tournamentId, clubName: { in: clubNames }, deletedAt: null },
    select: {
      id: true, clubName: true, clubContact: true, contactEmail: true, contactPhone: true,
      clubBasedIn: true, needsHotel: true, paymentMethod: true, clubLogoUrl: true,
      invoiceAmount: true, discountAmount: true, discountNote: true, createdAt: true,
      teams: {
        select: {
          id: true, teamName: true, division: true, logoUrl: true,
          coachName: true, coachPhone: true, coachEmail: true, waitlisted: true,
        },
      },
      // No payment reference: the Stripe payment-intent id staff use for
      // reconciliation means nothing to a club and is not theirs to hold.
      payments: { select: { amount: true, method: true, receivedAt: true } },
    },
  })

  // Get player registrations for their clubs
  const playerRegs = await prisma.playerRegistration.findMany({
    where: { tournamentId, teamClubName: { in: clubNames } },
    orderBy: { playerName: 'asc' },
  })

  // Get games involving their teams
  const teamNames = registrations.flatMap(r => r.teams.map(t => t.teamName)).filter(Boolean)
  const rawGames = await prisma.game.findMany({
    where: {
      tournamentId,
      OR: [
        { team1: { in: teamNames } },
        { team2: { in: teamNames } },
      ],
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })
  // Club directors see the schedule when the public does, not while it's being built.
  const games = (await isStaffRequest()) ? rawGames : applyPublicView(rawGames, await getPublicVisibility(tournamentId))

  // The actual signed waivers.
  //
  // WHY THIS AND NOT playerRegs: a waiver filed on /player-waiver lands in
  // OrgFormSubmission, while PlayerRegistration is a different, largely unused
  // store -- so the Players tab was reading a table the waiver form never
  // writes to and showing an empty list to clubs whose parents had filed. Same
  // source the staff registrations page counts from (lib/waiverCounts.ts), so
  // the two can never disagree.
  //
  // Matched the same way too: the form records the team as "Club — Team", not
  // the bare team name.
  let waivers: any[] = []
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "playerName", "teamName", "clubName", "jersey", "submittedAt", "data"
       FROM "OrgFormSubmission"
       WHERE "tournamentId" = ? AND "formType" = 'player' AND "archivedAt" IS NULL
       ORDER BY "playerName" ASC`, tournamentId)
    const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    const SEP = /\s+[\u2014\u2013]\s+|\s+-\s+/
    const mine = new Set(clubNames.map(norm))
    waivers = (rows || []).map(r => {
      const tag = String(r.teamName ?? '').trim()
      const m = SEP.exec(tag)
      const club = m ? tag.slice(0, m.index) : ''
      const team = m ? tag.slice(m.index + m[0].length) : tag
      let d: any = {}
      try { d = JSON.parse(String(r.data || '{}')) } catch { /* keep the row */ }
      return {
        id: String(r.id), playerName: String(r.playerName || d.playerName || ''),
        team, club: String(r.clubName || club || ''),
        jersey: r.jersey ?? d.jerseyNumber ?? null,
        grade: d.grade || '', parentName: d.parentName || '',
        // The card view shows a face, a position and a way to reach the parent.
        // No signature, no date of birth, no USA Lacrosse number: a coach needs
        // to know the waiver is done, not to hold the family's identifiers.
        position: d.position || '', photoUrl: d.photoUrl || '',
        // Date of birth: a coach checks it against the division's age cutoff,
        // which is the whole reason the waiver asks for it.
        dob: d.dob || '',
        parentPhone: d.parentPhone || '', parentEmail: d.parentEmail || '',
        signed: !!(d.signature || d.playerName),
        submittedAt: String(r.submittedAt || ''),
      }
    })
      // Club match ONLY. A waiver we cannot confidently attribute to this club is
      // not shown to it: these are children's names, parents' names and jersey
      // numbers, and team names here are generic enough to collide across clubs
      // ("HS Select", "2031/32", "Middle School Select" are all in use). Falling
      // back to a bare team-name match would hand one club another club's minors.
      // Nothing is lost by being strict — the club is recoverable from the
      // "Club — Team" tag when the clubName column is blank, which is done above.
      .filter(w => mine.has(norm(w.club)))
  } catch { /* no waivers table yet -- the tab shows none rather than failing */ }

  // The club's COACH waivers, same store and same club-only scoping as the players
  // above (formType 'coach' instead of 'player'). Joe Frederick asked for this
  // directly, Sep 22 2026: "I'm also looking to see which of our coaches have
  // completed the waivers" -- until now that list existed only on the staff page.
  //
  // Contact details ARE included here, unlike on the player rows. These are the
  // club's own adult staff and the reason a director opens the list at all is to
  // chase the ones who have not signed.
  let coachWaivers: any[] = []
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "playerName", "teamName", "clubName", "submittedAt", "data"
         FROM "OrgFormSubmission"
        WHERE "tournamentId" = ? AND "formType" = 'coach' AND "archivedAt" IS NULL
        ORDER BY "submittedAt" DESC`, tournamentId)
    const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    const SEP = /\s+[\u2014\u2013]\s+|\s+-\s+/
    const mine = new Set(clubNames.map(norm))
    coachWaivers = (rows || []).map(r => {
      let d: any = {}
      try { d = JSON.parse(String(r.data || '{}')) } catch { /* keep the row */ }
      const tag = String(r.teamName ?? '').trim()
      const m = SEP.exec(tag)
      return {
        id: String(r.id),
        name: String(d.coachFullName || r.playerName || ''),
        club: String(r.clubName || d.clubName || (m ? tag.slice(0, m.index) : '')),
        team: m ? tag.slice(m.index + m[0].length) : tag,
        role: String(d.coachingRole || ''),
        division: String(d.division || ''),
        email: String(d.email || ''),
        phone: String(d.mobilePhone || ''),
        signed: !!(d.signature || d.coachFullName),
        submittedAt: String(r.submittedAt || ''),
      }
    }).filter(c => mine.has(norm(c.club)))
  } catch { /* no submissions table yet -- the tab shows none rather than failing */ }

  // Where to actually send a check or a Zelle, so a director who switches their
  // pay method is not left to go hunting for it in an old email.
  //
  // THREE FIELDS ONLY, and the omission is the point: the Organization row also
  // carries achBankName, achRoutingNumber and achAccountNumber. Those are the
  // org's own bank account. They are not on the public registration form, not on
  // the pay page, and they are not going into a club's browser either -- ACH
  // payers go through Stripe on /pay/<id>, which never needs them. The three
  // below are already shown publicly at registration time.
  let payTo: { zelleHandle: string; checkPayableTo: string; checkAddress: string } | null = null
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT o."zelleHandle", o."checkPayableTo", o."checkAddress"
         FROM "Organization" o
         JOIN "Tournament" t ON t."orgId" = o.id
        WHERE t.id = ?`, tournamentId)
    const r = rows?.[0]
    if (r) payTo = {
      zelleHandle: String(r.zelleHandle || ''),
      checkPayableTo: String(r.checkPayableTo || ''),
      checkAddress: String(r.checkAddress || ''),
    }
  } catch { /* columns not there yet -- the portal falls back to "contact the tournament" */ }

  // Whether this director can still move players between their own teams, and why not.
  // Sent with the data so the portal can say so up front rather than only on a refusal.
  const lock = await rosterLock(tournamentId)

  // Where each registration stands with the office: confirmed, a change
  // requested (and what it says: the club's own words, nothing from staff), or
  // waiting for them to confirm a list the office just changed.
  const confirm = await readConfirmMany(registrations.map(r => r.id)).catch(() => new Map())
  const regsOut = registrations.map(r => ({ ...r, confirm: confirm.get(r.id) || { status: '', note: '', at: '' } }))

  // What the portal needs to add a team or ask for a move: the divisions, which
  // are marked full, which still take a team directly (see lib/clubPortal), and
  // the price list for the invoice preview.
  let event: unknown = null
  try {
    const info = await eventInfo(tournamentId)
    const policy = await addPolicy(tournamentId)
    if (info) event = {
      name: info.name,
      ended: policy.ended,
      posted: policy.posted,
      pricing: parsePricing(info.pricingRaw),
      divisions: info.divisions.map(name => ({
        name,
        full: divisionFull(info, name),
        label: divisionBadge(name, info.site)?.suffix || '',
        directAdd: addBlock(policy, name) === null,
      })),
    }
  } catch { /* the portal hides add and move rather than failing */ }

  return NextResponse.json({ clubs: clubNames, registrations: regsOut, playerRegs, games, teamNames, waivers, coachWaivers, lock, payTo, event })
}
