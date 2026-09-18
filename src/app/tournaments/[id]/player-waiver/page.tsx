import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import PlayerRegForm, { type ClubOption, type CardContext, type SampleCard } from '@/app/o/[slug]/register/player/PlayerRegForm'
import { fmtRange, playerPassConfig, orgSiteConfig, eventQrFor, appBaseUrl, loadPlayerPass } from '@/lib/playerPass'
import { headers } from 'next/headers'
import { DOMAIN_BY_SLUG } from '@/lib/orgDomains'

// Cache policy for published pages.
//
// Jul 20 2026: these pages read Turso via @libsql/client, which uses fetch() under the
// hood, and Next caches fetch responses in its Data Cache. A `dynamic` export does NOT
// disable that, so pages re-rendered on every request while replaying a stale DB
// response — and since nothing expired, they stayed stale indefinitely (an org hero
// image and gallery went missing until it was noticed).
//
// `revalidate` is the fix rather than turning caching off: content is served from cache
// for this many seconds then re-fetched, so staleness is always bounded. Saving in the
// admin also calls revalidatePath() for an immediate refresh. Don't swap this back to
// dynamic/no-store — that made every visit re-run every query (~14s page loads).
export const revalidate = 30

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const DEFAULT_WAIVER = `## Player Participation Waiver & Release of Liability
By submitting this form I confirm I have read and agree to this waiver, that I am at least 18 years of age, that I am the participant or the legal parent/guardian of the minor participant, and that my typed name is my legal electronic signature.`
const DEFAULT_FIELDS = { gender: true, grade: true, teamName: true, parent2: true, hotelQuestion: false, newsletter: false, playerPass: false, position: true, homeTown: true }

export default async function TournamentPlayerWaiver({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, orgId, logoUrl, startDate, endDate, location FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  }
  const t = tRes.rows[0] as any
  const orgId = t.orgId as string

  let org: any = { name: '', logoUrl: '' }
  if (orgId) {
    const oRes = await client.execute({ sql: 'SELECT name, slug, logoUrl FROM "Organization" WHERE id = ?', args: [orgId] })
    if (oRes.rows.length) org = oRes.rows[0]
  }

  let forms: any = {}
  try {
    if (orgId) { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${orgId}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') }
  } catch { /* none */ }
  try {
    if (orgId) { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${orgId}`] }); if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo } }
  } catch { /* none */ }

  // Clubs registered for THIS tournament, each with its teams -> club picker, then team picker
  let teams: string[] = []
  let clubs: ClubOption[] = []
  try {
    const tr = await client.execute({
      sql: 'SELECT r.clubName AS club, r.clubLogoUrl AS clubLogo, r.clubBasedIn AS basedIn, t.teamName AS team, t.division AS division, t.logoUrl AS teamLogo FROM "TeamRegistration" r LEFT JOIN "RegisteredTeam" t ON t.registrationId = r.id WHERE r.tournamentId = ? AND r.deletedAt IS NULL ORDER BY r.clubName, t.teamName',
      args: [params.id],
    })
    // Keyed by name AND division, not name alone.
    //
    // H44 registered four teams for Monster Mash -- U12 A, U14 A, HS A, HS B --
    // and named every one of them "H44". Keyed by name, each row overwrote the
    // last and all four collapsed into a single dropdown entry whose division was
    // whichever row the database happened to return last. A parent could only
    // pick one of their four teams, and the waiver was filed against the wrong
    // division. Naming every team after the club is completely normal; the map
    // was wrong, not the data.
    const byClub = new Map<string, Map<string, { name: string; division: string }>>()
    const logoByClub = new Map<string, string>() // club logo from the registration, else a team's
    // Where the club says it is based -- prefills the family's home town on the
    // form. Free text, so it may not resolve; see parseBasedIn.
    const baseByClub = new Map<string, string>()
    for (const row of tr.rows as any[]) {
      const club = String(row.club || '').trim()
      if (!club) continue
      if (!byClub.has(club)) byClub.set(club, new Map())
      const team = String(row.team || '').trim()
      const division = String(row.division || '').trim()
      if (team) byClub.get(club)!.set(`${team}||${division}`, { name: team, division })
      const logo = String(row.clubLogo || '').trim() || String(row.teamLogo || '').trim()
      if (logo && !logoByClub.has(club)) logoByClub.set(club, logo)
      const based = String(row.basedIn || '').trim()
      if (based && !baseByClub.has(club)) baseByClub.set(club, based)
    }
    clubs = [...byClub.entries()].map(([name, ts]) => ({
      name,
      logoUrl: logoByClub.get(name) || '',
      basedIn: baseByClub.get(name) || '',
      // Sorted by division so a club's four teams read in a sensible order rather
      // than whatever order the rows arrived in.
      teams: [...ts.entries()]
        .map(([id, t]) => ({ id, name: t.name, division: t.division }))
        .sort((a, b) => a.division.localeCompare(b.division) || a.name.localeCompare(b.name)),
    }))
    teams = clubs.map(c => c.name)
  } catch { /* none */ }

  // Everything the live card preview shows that the form doesn't collect (only when the org's
  // Player pass switch is on).
  let cardContext: CardContext | undefined
  let sampleCard: SampleCard | undefined
  if ((forms.player?.fields || {}).playerPass === true && orgId) {
    const [cfg, site] = await Promise.all([playerPassConfig(orgId), orgSiteConfig(orgId)])
    const orgSite = (org.slug && DOMAIN_BY_SLUG[String(org.slug)]) || ''
    const eventQr = eventQrFor({ cfg, socials: site.socials, tournamentId: t.id, orgSite, base: appBaseUrl(headers()) })
    cardContext = {
      tournamentName: String(t.name || ''), tournamentLogoUrl: String(t.logoUrl || org.logoUrl || ''),
      tournamentDates: fmtRange(String(t.startDate || ''), String(t.endDate || '')), location: String(t.location || ''),
      orgName: String(org.name || ''), orgLogoUrl: String(org.logoUrl || ''), orgSite,
      eventQrUrl: eventQr.url, eventQrLabel: eventQr.label, theme: cfg.theme,
    }

    // THE EXAMPLE IS A REAL CARD. Bo picks one already in the system and the
    // form shows it whole -- that player's photo, club crest, number, position
    // and both of their actual QR codes (Bo, Sep 18 2026). Loaded by token at
    // render, so it is never a stale copy: change that card and the example on
    // the form changes with it.
    //
    // A missing or deleted token is not an error worth a 500 on a registration
    // page -- the form falls back to the drawn stand-in and nobody notices.
    if (cfg.sampleToken) {
      try {
        const base = appBaseUrl(headers())
        const s = await loadPlayerPass(cfg.sampleToken, base)
        if (s) sampleCard = { card: s.card, qrUrl: s.qrUrl, qr2Url: s.qr2Url }
      } catch { /* fall back to the stand-in */ }
    }
  }

  const pf = forms.player || {}
  const waiverTitle = pf.waiverTitle || 'Player Participation Waiver & Release of Liability'
  const waiverHtml = mdToHtml(pf.waiverText || DEFAULT_WAIVER)
  const fields = { ...DEFAULT_FIELDS, ...(pf.fields || {}) }
  const confirmationTitle = pf.confirmationTitle || "You're registered!"
  const confirmationHtml = mdToHtml(pf.confirmationMessage || "Thanks for registering. We've received your information and signed waiver.")

  return (
    <div className="min-h-screen bg-slate-50">
      <PlayerRegForm orgId={orgId} fields={fields} waiverTitle={waiverTitle} waiverHtml={waiverHtml} confirmationTitle={confirmationTitle} confirmationHtml={confirmationHtml} teams={teams} clubs={clubs} tournamentId={t.id} tournamentName={t.name} sampleCard={sampleCard}
        header={{ logoUrl: String(t.logoUrl || org.logoUrl || ''), title: String(t.name || '') }}
        cardContext={cardContext} />
    </div>
  )
}
