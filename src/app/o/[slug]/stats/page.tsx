import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@libsql/client'
import { Trophy, CalendarDays, Users, Flag, MapPin, ArrowRight, History } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import type { Metadata } from 'next'
import { orgAbs, clip } from '@/lib/seo'
import { computeOrgHistory, ORIGINS, priorTo } from '@/lib/orgHistory'

// Recomputed from the game table rather than typed in, so importing another event
// updates the page by itself. An hour of cache: the numbers only move when a
// tournament is imported, and the queries scan every game the org has ever run.
export const revalidate = 3600

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

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
  const reg = (tRes.rows as any[]).filter(t => String(t.endDate || t.startDate || '') >= today)[0]
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined

  // Every figure on this page, and the band on the front page, come from here. They were
  // computed separately once and disagreed in public -- see the note in lib/orgHistory.
  const H = await computeOrgHistory(client, past, content)
  const { per, byYear, seriesRows, years, venues, avgTeams, firstCounted, goalsPerGame,
          priorEvents, priorTeams, totalEvents, totalGames, totalTeams, estimated } = H
  const tot = H.counted

  // The archive starts where the records start, not where the organization does.
  // Saying so turns the gap into the point: the counted years are a floor.
  const founded = String(content.foundedYear || '').trim()
  const predates = /^\d{4}$/.test(founded) && firstCounted && founded < firstCounted
  const seasons = predates ? (Number(String(new Date().getFullYear())) - Number(founded) + 1) : years.length

  const historyNoteRaw = String(content.historyNote || '').trim()
  // A note that ends with a dash and a name ("… — Sunshine Events Group") renders as an
  // attributed pull-quote; anything else renders as a plain closing line. The dash must have
  // whitespace before it so hyphenated words at the end of a line aren't mistaken for it.
  const _histMatch = historyNoteRaw.match(/^([\s\S]*\S)\s+[\u2014\u2013-]\s*([^\n\u2014\u2013]{1,80})\s*$/)
  const historyAttrib = _histMatch ? _histMatch[2].trim() : ''
  const historyNote = (_histMatch ? _histMatch[1].trim() : historyNoteRaw)
    .replace(/^[\u201C\u201D"']\s*/, '').replace(/\s*[\u201C\u201D"']$/, '').trim()

  const HEADLINE = [
    { icon: <Trophy size={18} />, value: fmt(totalEvents), label: 'tournaments run' },
    { icon: <Flag size={18} />, value: fmt(totalGames), label: 'games played' },
    { icon: <Users size={18} />, value: fmt(totalTeams), label: 'team entries' },
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
              ? `Running lacrosse tournaments since ${founded}. The numbers below go all the way back — estimated for the years before ${firstCounted}, and counted from published scores since.`
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
          {estimated && (
            <p className="text-[13px] text-teal-200/90 mt-5 max-w-3xl">
              Figures for years prior to {firstCounted} are estimated from our own event records. From {firstCounted} on, every game, team and result is counted from a published scoresheet.
            </p>
          )}
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-14 w-full flex-1 space-y-14">

        {predates && (
          <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
            <p className="text-slate-600 leading-relaxed max-w-3xl">
              <span className="font-bold text-slate-900">Some of these years are estimated.</span>{' '}
              {org.name} has run lacrosse tournaments since {founded}, but online scorekeeping only arrived in {firstCounted}.
              The tournaments, games and teams above include an estimate for the years prior to {firstCounted}, drawn from our
              own event records rather than scoresheets{priorTeams > 0 ? ` — roughly ${fmt(priorEvents)} earlier events and about ${fmt(priorTeams)} more team entries` : ''}.
              Everything from {firstCounted} on is counted from a published result you can open and check; champions are
              counted from {firstCounted} only, since that is as far back as every winner can be named.
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
              // Fold the paper-era estimate into this series' events/games/teams too, so the cards
              // agree with the headline. Prior games scale off the series' own games-per-team ratio.
              const sGapGames = s.teams > 0 ? Math.round((s.games / s.teams) * gap.teams) : 0
              const dEvents = s.events + gap.events
              const dGames = s.games + sGapGames
              const dTeams = s.teams + gap.teams
              const dFirst = o && o.from < Number(s.first || '9999') ? String(o.from) : s.first
              return (
              <div key={name} className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-bold text-slate-900">{name}</h3>
                  <span className="text-xs font-semibold text-slate-400">{dFirst === s.last ? dFirst : `${dFirst}–${s.last}`}</span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[[dEvents, 'events'], [dGames, 'games'], [dTeams, 'teams'], [s.champs, 'champions']].map(([v, l]) => (
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
                      First run in {o.from}. The counts above fold in an estimate for
                      {' '}{before === 1 ? 'one earlier edition' : `${before} earlier editions`} and about {fmt(gap.teams)} teams
                      from years that were scored on paper. Champions are counted from published results only.
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
            <blockquote className="text-lg sm:text-2xl text-slate-700 leading-relaxed whitespace-pre-line">
              {historyAttrib ? `\u201C${historyNote}\u201D` : historyNote}
            </blockquote>
            {historyAttrib && <p className="mt-3 text-sm font-semibold uppercase tracking-[0.12em] text-teal-700">{`\u2014 ${historyAttrib}`}</p>}
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
