// Loading a signed coach waiver as a printable credential.
//
// Mirrors src/lib/playerPass.ts, and deliberately reuses its satori helpers
// (imageForSatori / qrDataUrl / loadPassFonts) rather than growing a second copy
// of the same plumbing.
//
// THE CREDENTIAL IS OPTIONAL. Bo's rule: a coach is not turned away for not having
// it (Sep 17 2026). So nothing here may read as a gate — the page offers a print
// and a wallet copy, and the QR is a convenience for the coaches' tent rather than
// a ticket. What IS required is the signed waiver, and that is already on file by
// the time this token exists.
import { getSubmissionByPassToken } from './formSubmissions'
import { orgById } from './org'
import { prisma } from './db'
import { fmtRange } from './playerPass'
import type { CredentialCardData } from './credentialCard'
import { COACH_WAIVER_VERSION, CERT_SHORT } from './coachForm'

export type CoachPass = {
  token: string
  orgId: string
  tournamentId: string
  card: Omit<CredentialCardData, 'qrDataUrl' | 'qr2DataUrl'>
  /** What the big QR opens — the credential page itself, so a scan proves it is live. */
  qrUrl: string
  /** Second QR: the event page, so a scan at the tent lands on the schedule. */
  qr2Url: string
  data: any
  signedOn: string
  teams: { club: string; team: string; division: string }[]
}

const s = (x: unknown) => String(x ?? '').trim()

/** Short human code for the badge, derived from the token so it never drifts. */
export function coachCode(token: string): string {
  return `CO-${token.slice(0, 4).toUpperCase()}`
}

export async function loadCoachPass(token: string, base: string): Promise<CoachPass | null> {
  const sub = await getSubmissionByPassToken(token)
  if (!sub || sub.formType !== 'coach') return null

  const d: any = sub.data || {}
  const org = await orgById(sub.orgId)

  let tournamentName = s(d.tournamentName)
  let dates = '', location = '', tLogo = ''
  if (sub.tournamentId) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        'SELECT name, startDate, endDate, location, logoUrl FROM "Tournament" WHERE id = ?', sub.tournamentId)
      const r = rows?.[0]
      if (r) {
        if (!tournamentName) tournamentName = s(r.name)
        dates = fmtRange(s(r.startDate), s(r.endDate))
        location = s(r.location)
        tLogo = s(r.logoUrl)
      }
    } catch { /* the badge just omits the dates */ }
  }

  const teams: CoachPass['teams'] = Array.isArray(d.teams)
    ? d.teams.map((t: any) => ({ club: s(t?.club), team: s(t?.team), division: s(t?.division) })).filter((t: any) => t.team)
    : []

  // ONE credential covers every team they coach -- the whole reason the form lets
  // them tick several. Listing them is what makes the badge usable at a gate.
  const clearances = teams.length
    ? teams.map(t => [t.team, t.division].filter(Boolean).join(' · ')).slice(0, 3)
    : [s(d.coachingRole) || 'Coach'].filter(Boolean)

  const certs: string[] = Array.isArray(d.certifications) ? d.certifications.map(s).filter(Boolean) : []
  const certLine = certs.map(c => CERT_SHORT[c] || c).join(' · ')

  const signedOn = sub.submittedAt
    ? new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  const card: CoachPass['card'] = {
    code: coachCode(token),
    role: 'coach',
    status: 'approved',
    name: s(d.coachFullName) || 'Coach',
    business: s(d.clubName),
    clubLogoUrl: s(d.clubLogoUrl),
    // The role they told us, with their certifications after it -- a gate wants to
    // know "head coach" first and "SafeSport" second.
    title: [s(d.coachingRole) || 'Coach', certLine].filter(Boolean).join(' · '),
    photoUrl: s(d.photoUrl),
    eventNames: tournamentName,
    eventDates: dates,
    location,
    clearances,
    orgName: s(org?.name),
    orgLogoUrl: s(org?.logoUrl) || tLogo,
    orgSite: '',
    qrLabel: 'My credential',
    qr2Label: 'Event info',
    issuedOn: signedOn,
  }

  return {
    token,
    orgId: sub.orgId,
    tournamentId: sub.tournamentId,
    card,
    qrUrl: `${base}/coach/${token}`,
    qr2Url: sub.tournamentId ? `${base}/tournaments/${sub.tournamentId}/event` : base,
    data: d,
    signedOn,
    teams,
  }
}

/** The waiver version a record was signed against — shown so it is auditable. */
export function waiverVersionOf(data: any): string {
  return s(data?.waiverVersion) || COACH_WAIVER_VERSION
}
