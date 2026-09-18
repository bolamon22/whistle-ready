import Link from 'next/link'
import { redirect } from 'next/navigation'
import { orgBase } from '../../_chrome'
import { createClient } from '@libsql/client'
import { Trophy, CalendarDays, MapPin, ChevronRight } from 'lucide-react'
import { fmtRange } from '@/lib/playerPass'

// THIS PAGE NO LONGER HOSTS A FORM. It picks the event, then hands off.
//
// Sep 2026: it used to render <PlayerRegForm> directly with no `teams`, no `clubs`
// and no `tournamentId`, which meant two things went wrong at once. The team field
// fell back to free text, so families typed whatever they had in front of them --
// usually the DIVISION off the schedule ("Girls High School A") or a team name that
// was never registered ("2033/2034 Select Team"). And with no tournament attached,
// the waiver landed with no event to belong to.
//
// Measured on Monster Mash before the fix: of 22 LaxManiax waivers, only 7 carried a
// tag matching a registered team. The other 15 were divisions or invented names,
// which is why the club-director page (which matches waivers to the club's actual
// registration) showed far fewer players than the waiver list did. Nothing was
// double-counting -- the tags simply pointed at nothing.
//
// Rather than duplicate the club/team loading into a second form, this page now
// routes to /tournaments/{id}/player-waiver, which already loads the tournament's
// registered clubs and their teams and renders the picker. One form, one code path.
// Links already in circulation keep working; they just ask which event first, and
// when only one event is open they don't even ask that.
export const revalidate = 30

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

function Shell({ slug, org, children }: { slug: string; org: any; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0b1220] text-white">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-3">
          <Link href={orgBase(slug) || '/'} aria-label={`${org.name} home`}>
            {org.logoUrl
              ? <img src={org.logoUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/95 p-1" />
              : <span className="font-extrabold text-lg">{org.name}</span>}
          </Link>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-teal-300">Player Waiver</div>
            <h1 className="text-xl font-extrabold leading-tight">{org.name}</h1>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}

export default async function PlayerRegistrationPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
        <div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Form not found</h1></div>
      </div>
    )
  }
  const org = orgRes.rows[0] as any

  // org-site logo override for brand consistency
  try {
    const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo }
  } catch { /* none */ }

  // Events still ahead of us, soonest first. An event with no end date is judged on its
  // start date, and one with no dates at all sorts last rather than disappearing.
  let events: any[] = []
  try {
    const r = await client.execute({
      sql: `SELECT id, name, startDate, endDate, location, logoUrl FROM "Tournament"
            WHERE orgId = ? AND COALESCE(NULLIF(endDate, ''), startDate, '') >= ?
            ORDER BY CASE WHEN COALESCE(startDate, '') = '' THEN 1 ELSE 0 END, startDate`,
      args: [String(org.id), new Date().toISOString().slice(0, 10)],
    })
    events = r.rows as any[]
  } catch { /* fall through to the empty state */ }

  // One event open: don't make a parent choose from a list of one. Must stay outside a
  // try/catch -- Next implements redirect() by throwing.
  if (events.length === 1) redirect(`/tournaments/${events[0].id}/player-waiver`)

  if (events.length === 0) {
    return (
      <Shell slug={params.slug} org={org}>
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Trophy size={36} className="mx-auto text-slate-300" />
          <h2 className="mt-3 text-lg font-bold text-slate-800">No events open right now</h2>
          <p className="mt-2 text-sm text-slate-500">
            Player waivers open once an event is scheduled. Check back soon, or take a look at what&rsquo;s coming up.
          </p>
          <Link href={orgBase(params.slug) || '/'} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-2">
            See our events <ChevronRight size={14} />
          </Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell slug={params.slug} org={org}>
      <h2 className="text-lg font-bold text-slate-800">Which event is your player attending?</h2>
      <p className="mt-1 text-sm text-slate-500">Pick the event and we&rsquo;ll bring up the waiver with your club&rsquo;s teams ready to choose from.</p>
      <ul className="mt-5 space-y-3">
        {events.map((t: any) => {
          const dates = fmtRange(String(t.startDate || ''), String(t.endDate || ''))
          return (
            <li key={String(t.id)}>
              <Link
                href={`/tournaments/${t.id}/player-waiver`}
                className="group flex items-center gap-4 bg-white border border-slate-200 hover:border-teal-400 hover:shadow-sm rounded-xl p-4 transition-colors"
              >
                {t.logoUrl || org.logoUrl
                  ? <img src={String(t.logoUrl || org.logoUrl)} alt="" className="w-12 h-12 rounded-lg object-contain bg-slate-50 flex-shrink-0" />
                  : <span className="w-12 h-12 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0"><Trophy size={20} /></span>}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate group-hover:text-teal-700">{String(t.name || 'Event')}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {dates ? <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {dates}</span> : null}
                    {t.location ? <span className="inline-flex items-center gap-1"><MapPin size={12} /> {String(t.location)}</span> : null}
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-300 group-hover:text-teal-600 flex-shrink-0" />
              </Link>
            </li>
          )
        })}
      </ul>
    </Shell>
  )
}
