import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@libsql/client'
import { Trophy, CalendarDays, Users, Flag, MapPin, ArrowRight, History } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import type { Metadata } from 'next'
import { orgAbs, clip } from '@/lib/seo'

// Recomputed from the game table rather than typed in, so importing another event
// updates the page by itself. An hour of cache: the numbers only move when a
// tournament is imported, and the queries scan every game the org has ever run.
export const revalidate = 3600

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

// Bracket slots that were never filled are stored as the placeholder the bracket
// drew ("Seed 4", "W-B3", "Bracket Winner B7"). They are not teams and must not be
// counted as ones.
const NOT_A_TEAM = `team <> '' AND team NOT LIKE 'TBD%' AND team NOT LIKE 'Bracket %'
  AND team NOT LIKE 'Seed %' AND team NOT LIKE 'W-B%' AND team NOT LIKE 'L-B%'
  AND team NOT LIKE 'Winner%' AND team NOT LIKE 'Loser%'`

const SERIES: [RegExp, string][] = [
  [/monster mash/i, 'Monster Mash'],
  [/fall classic/i, 'Fall Classic'],
  [/jingle brawl/i, 'Jingle Brawl'],
  [/summer kick ?off|sunshine state games/i, 'Summer Kick Off'],
]
function seriesOf(name: string) { for (const [re, l] of SERIES) if (re.test(name)) return l; return 'Other' }

// When each series actually started, and the field it drew in the years before
// there was anything online to import. One edition a year, which is how these ran
// until 2015. Owner's recollection, not a record: it is rendered as a sentence
// under the tiles and never added into them, because every number in a tile on
// this page can be opened and checked against a published result.
const ORIGINS: Record<string, { from: number; teams: number; known?: Record<number, number> }> = {
  // `known` is a year counted off the paper records in the Drive archive but not
  // imported here, because that year's scoresheets were never filled in. The team
  // count is a fact; the result is not, so the year stays out of the game table and
  // its teams are named in the sentence instead.
  'Jingle Brawl':    { from: 2007, teams: 60, known: { 2010: 28, 2012: 53, 2013: 68, 2014: 57 } },
  'Summer Kick Off': { from: 2009, teams: 90 },
  'Monster Mash':    { from: 2009, teams: 60 },
  'Fall Classic':    { from: 2010, teams: 60 },
}

// Which editions are missing from the counted years, and roughly how many teams
// they brought. Derived from the years actually in the game table rather than from
// a start year, because the archive fills in from both ends: Jingle Brawl 2011 is
// imported while 2012-2014 are not, so "everything before the first counted year"
// would quietly drop three events. Import another year and this shrinks by itself.
function priorTo(o: { from: number; teams: number; known?: Record<number, number> } | undefined,
                 counted: Set<string>, last: string) {
  if (!o) return { events: 0, teams: 0 }
  const end = Number(last) || new Date().getFullYear()
  const missing: number[] = []
  for (let y = o.from; y <= end; y++) if (!counted.has(String(y))) missing.push(y)
  // An unrecorded year is sized by the smallest year we do have a count for, not by
  // the typical field: these events grew, so the earliest ones were the smallest.
  const knownVals = Object.values(o.known || {})
  const floor = knownVals.length ? Math.min(...knownVals) : o.teams
  const teams = missing.reduce((sum, y) => sum + (o.known?.[y] ?? floor), 0)
  return { events: missing.length, teams }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db(); let name = params.slug
  try { const r = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) name = (r.rows[0] as any).name } catch {}
  const title = `By the numbers — ${name}`
  const description = clip(`Every tournament ${name} has run, counted: games played, teams hosted and champions crowned.`)
  const url = orgAbs(params.slug, '/stats')
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

const n = (v: any) => Number(v || 0)
const fmt = (v: number) => v.toLocaleString('en-US')

export default async function StatsPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) notFound()
  const org = orgRes.rows[0] as any

  let content: any = {}
  try { const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}') } catch {}
  if (content.logo) org.logoUrl = content.logo
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const contact = content.contact || {}
  const socials = content.socials || {}
  let forms: any = {}
  try { const fr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (fr.rows.length) forms = JSON.parse(((fr.rows[0] as any).value as string) || '{}') } catch {}
  const base = orgBase(params.slug)
  const workHref = (forms.staff?.enabled !== false) ? `${base}/work` : undefined
  const nav = buildNav(base, pages, gallery.length > 0, workHref)

  const today = new Date().toISOString().slice(0, 10)
  const tRes = await client.execute({ sql: 'SELECT id, name, startDate, endDate, location FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [org.id as string] })
  const past = (tRes.rows as any[]).filter(t => String(t.endDate || t.startDate || '') < today && String(t.name || ''))
  const ids = past.map(t => String(t.id))
  const reg = (tRes.rows as any[]).filter(t => String(t.endDate || t.startDate || '') >= today)[0]
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined

  const holes = ids.map(() => '?').join(',')
  type Agg = { games: number; scored: number; goals: number; champs: number; teams: number; divisions: number }
  const per: Record<string, Agg> = {}
  const blank = (): Agg => ({ games: 0, scored: 0, goals: 0, champs: 0, teams: 0, divisions: 0 })

  if (ids.length) {
    const gRes = await client.execute({
      sql: `SELECT tournamentId,
              COUNT(*) AS games,
              SUM(CASE WHEN score1 IS NOT NULL AND score2 IS NOT NULL THEN 1 ELSE 0 END) AS scored,
              SUM(COALESCE(score1,0) + COALESCE(score2,0)) AS goals,
              SUM(CASE WHEN isChampionship = 1 AND score1 IS NOT NULL AND score2 IS NOT NULL AND score1 <> score2 THEN 1 ELSE 0 END) AS champs,
              COUNT(DISTINCT division) AS divisions
            FROM "Game" WHERE tournamentId IN (${holes}) AND (isCanceled IS NULL OR isCanceled = 0)
            GROUP BY tournamentId`, args: ids })
    for (const r of gRes.rows as any[]) { const a = per[String(r.tournamentId)] ||= blank()
      a.games = n(r.games); a.scored = n(r.scored); a.goals = n(r.goals); a.champs = n(r.champs); a.divisions = n(r.divisions) }

    // A team counted once per division per event: a club fielding a boys and a girls
    // side is two entries, the same side across nine games is one.
    const tmRes = await client.execute({
      sql: `SELECT tournamentId, COUNT(*) AS teams FROM (
              SELECT DISTINCT tournamentId, division, team FROM (
                SELECT tournamentId, division, TRIM(team1) AS team FROM "Game" WHERE tournamentId IN (${holes}) AND (isCanceled IS NULL OR isCanceled = 0)
                UNION
                SELECT tournamentId, division, TRIM(team2) AS team FROM "Game" WHERE tournamentId IN (${holes}) AND (isCanceled IS NULL OR isCanceled = 0)
              ) WHERE ${NOT_A_TEAM}
            ) GROUP BY tournamentId`, args: [...ids, ...ids] })
    for (const r of tmRes.rows as any[]) { const a = per[String(r.tournamentId)] ||= blank(); a.teams = n(r.teams) }
  }

  const tot = blank()
  const byYear = new Map<string, { teams: number; games: number }>()
  const bySeries = new Map<string, { events: number; games: number; teams: number; champs: number; first: string; last: string; years: Set<string> }>()
  const venues = new Set<string>()
  for (const t of past) {
    const a = per[String(t.id)] || blank()
    tot.games += a.games; tot.scored += a.scored; tot.goals += a.goals; tot.champs += a.champs; tot.teams += a.teams; tot.divisions += a.divisions
    const y = String(t.startDate || '').slice(0, 4)
    if (y) { const e = byYear.get(y) || { teams: 0, games: 0 }; e.teams += a.teams; e.games += a.games; byYear.set(y, e) }
    const s = seriesOf(String(t.name))
    const e = bySeries.get(s) || { events: 0, games: 0, teams: 0, champs: 0, first: '9999', last: '0', years: new Set<string>() }
    e.events++; e.games += a.games; e.teams += a.teams; e.champs += a.champs
    if (y) e.years.add(y)
    if (y && y < e.first) e.first = y
    if (y && y > e.last) e.last = y
    bySeries.set(s, e)
    const loc = String(t.location || '').split(/[,\/]/)[0].trim()
    if (loc) venues.add(loc)
  }
  const years = [...byYear.keys()].sort()
  const seriesRows = [...bySeries.entries()].sort((a, b) => b[1].games - a[1].games)
  const avgTeams = past.length ? Math.round(tot.teams / past.length) : 0
  // The archive starts where the records start, not where the organization does.
  // Saying so turns the gap into the point: the counted years are a floor.
  const founded = String(content.foundedYear || '').trim()
  const firstCounted = years[0] || ''
  const predates = /^\d{4}$/.test(founded) && firstCounted && founded < firstCounted
  // Events run before online scorekeeping. Only the tournament count moves: the
  // owner knows how many they ran, but nobody has the scoresheets, so games, teams
  // and champions stay at what can be checked against a published result.
  // Summed from the same per-series gap the cards show, so the headline and the four
  // cards can never disagree -- they did, once, because one was typed into the
  // dashboard and the other was computed. The typed fields remain the fallback for an
  // org with no ORIGINS entry.
  const gaps = seriesRows.map(([n, v]) => priorTo(ORIGINS[n], v.years, v.last))
  const gapEvents = gaps.reduce((a, g) => a + g.events, 0)
  const gapTeams = gaps.reduce((a, g) => a + g.teams, 0)
  const priorEvents = gapEvents || Math.max(0, Number(String(content.priorEvents || '').replace(/[^0-9]/g, '')) || 0)
  const totalEvents = past.length + priorEvents
  const seasons = predates ? (Number(String(new Date().getFullYear())) - Number(founded) + 1) : years.length
  const historyNote = String(content.historyNote || '').trim()
  // Deliberately prose, never a tile. Every headline figure on this page can be
  // checked against a published result; one that cannot would put the others in
  // doubt, and it costs more credibility than the bigger number buys.
  const priorTeams = gapTeams || Math.max(0, Number(String(content.priorTeams || '').replace(/[^0-9]/g, '')) || 0)
  const goalsPerGame = tot.scored ? (tot.goals / tot.scored).toFixed(1) : '0'

  const HEADLINE = [
    { icon: <Trophy size={18} />, value: fmt(totalEvents), label: 'tournaments run' },
    { icon: <Flag size={18} />, value: fmt(tot.games), label: 'games played' },
    { icon: <Users size={18} />, value: fmt(tot.teams), label: 'team entries' },
    { icon: <Trophy size={18} />, value: fmt(tot.champs), label: 'champions crowned' },
    { icon: <CalendarDays size={18} />, value: fmt(seasons), label: 'seasons' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} registerHref={registerHref} />

      <section className="relative bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white">
        <div className="relative max-w-6xl mx-auto px-6 py-16">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">By the numbers</h1>
          <p className="text-teal-100 mt-2 max-w-2xl">
            {predates
              ? `Running lacrosse tournaments since ${founded}. Publishing every score since ${firstCounted} — that is what is counted here.`
              : firstCounted ? `Every ${org.name} tournament since ${firstCounted}, counted from the scoresheet.` : 'Counted from the scoresheet.'}
          </p>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {HEADLINE.map(h => (
              <div key={h.label} className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-5 border border-white/15">
                <div className="text-teal-200">{h.icon}</div>
                <div className="text-3xl sm:text-4xl font-black tracking-tight mt-2 tabular-nums">{h.value}</div>
                <div className="text-[13px] text-teal-100 mt-0.5">{h.label}</div>
              </div>
            ))}
          </div>
          {priorEvents > 0 && (
            <p className="text-[13px] text-teal-200/90 mt-5 max-w-3xl">
              {fmt(past.length)} of those tournaments have every game published on this site, from {firstCounted} onward — and those are the ones the games, teams and champions above are counted from.
            </p>
          )}
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-14 w-full flex-1 space-y-14">

        {predates && (
          <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
            <p className="text-slate-600 leading-relaxed max-w-3xl">
              <span className="font-bold text-slate-900">These are the counted years, not all of them.</span>{' '}
              {org.name} has been running lacrosse tournaments since {founded}
              {priorEvents > 0 ? ` — ${fmt(priorEvents)} of them before online scorekeeping arrived in ${firstCounted}` : ''}.
              Those earlier events are in the tournament count and nowhere else: their scoresheets were paper, so
              the games, teams and champions here are counted only from {firstCounted} on, where every one of them
              can be checked against a published result.
              {priorTeams > 0 && (
                <> Roughly {fmt(priorTeams)} more teams played those earlier events — near enough from what the
                fields held at the time, but an estimate, which is why it is written here rather than added to
                the figures above.</>
              )}
            </p>
          </section>
        )}

        <section>
          <h2 className="text-2xl font-extrabold text-slate-900">Why teams keep coming back</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {/* This was "98% of games scored and published". A percentage short of 100
                sends the reader hunting for the missing 2% instead of reading the point,
                and invites a question the page cannot answer on its own. The same fact
                as a count says it without the implied shortfall. */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-3xl font-black text-teal-700 tabular-nums">{fmt(tot.scored)}</p>
              <p className="font-bold text-slate-900 mt-1">results published</p>
              <p className="text-sm text-slate-500 mt-1">Final scores, standings and brackets for every division — not just a schedule, and not taken down after the weekend.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-3xl font-black text-teal-700 tabular-nums">{avgTeams}</p>
              <p className="font-bold text-slate-900 mt-1">teams at the average event</p>
              <p className="text-sm text-slate-500 mt-1">Across {fmt(tot.divisions)} divisions, so there is a bracket at your level rather than one everybody shares.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-3xl font-black text-teal-700 tabular-nums">{goalsPerGame}</p>
              <p className="font-bold text-slate-900 mt-1">goals a game</p>
              <p className="text-sm text-slate-500 mt-1">{fmt(tot.goals)} goals scored since {years[0] || ''} — the games are competitive, not blowouts.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-extrabold text-slate-900">The four events</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {seriesRows.map(([name, s]) => {
              const o = ORIGINS[name]
              const gap = priorTo(o, s.years, s.last)
              const before = gap.events
              return (
              <div key={name} className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-bold text-slate-900">{name}</h3>
                  <span className="text-xs font-semibold text-slate-400">{s.first === s.last ? s.first : `${s.first}–${s.last}`}</span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[[s.events, 'events'], [s.games, 'games'], [s.teams, 'teams'], [s.champs, 'champions']].map(([v, l]) => (
                    <div key={l as string}>
                      <div className="text-xl font-black text-slate-900 tabular-nums">{fmt(v as number)}</div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{l as string}</div>
                    </div>
                  ))}
                </div>
                {before > 0 && (
                  <p className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
                    <History size={13} className="text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      First run in {o.from}. {before === 1 ? 'One more edition' : `${before} more editions`} and
                      {' '}about {fmt(gap.teams)} more teams are not counted above — those years were scored on
                      paper and the sheets were never filled in, so the teams are known but the results are not.
                    </span>
                  </p>
                )}
              </div>
            )})}
          </div>
        </section>

        {venues.size > 0 && (
          <section>
            <h2 className="text-2xl font-extrabold text-slate-900">Where we have played</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...venues].sort().map(v => (
                <span key={v} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-sm text-slate-600">
                  <MapPin size={13} className="text-teal-600" /> {v}
                </span>
              ))}
            </div>
          </section>
        )}

        {historyNote && (
          <section className="border-l-2 border-teal-500 pl-6 sm:pl-8 max-w-3xl">
            <p className="text-lg sm:text-xl text-slate-700 leading-relaxed whitespace-pre-line">{historyNote}</p>
          </section>
        )}

        <section className="bg-gradient-to-br from-[#0b1f3a] to-[#0e7490] rounded-2xl px-8 py-10 text-white">
          <h2 className="text-2xl font-extrabold">Bring your club to the next one</h2>
          <p className="text-teal-100 mt-2 max-w-xl">Every result above is on this site, event by event. Have a look at how your division ran last year, then get your teams in.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {registerHref && (
              <Link href={registerHref} className="inline-flex items-center gap-1.5 bg-white text-teal-800 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-teal-50 transition-colors">
                Register a team <ArrowRight size={15} />
              </Link>
            )}
            <Link href={`${base}/results`} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/25 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-white/20 transition-colors">
              Browse every result
            </Link>
          </div>
        </section>
      </main>

      <OrgFooter org={org} contact={contact} socials={socials} base={base} pages={pages} />
    </div>
  )
}
