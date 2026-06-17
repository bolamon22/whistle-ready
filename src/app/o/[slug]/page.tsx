import Link from 'next/link'
import { createClient } from '@libsql/client'
import { MapPin, CalendarDays, ArrowRight, Trophy } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Tourn { id: string; name: string; startDate: string; endDate: string; location: string; logoUrl: string; sport: string; teamRegEnabled: number }

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const fmtDay = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
const yr = (d: string) => (d ? d.split('-')[0] : '')
function fmtRange(s: string, e: string) {
  if (s && e && s !== e) return `${fmtDay(s)} – ${fmtDay(e)}, ${yr(e)}`
  if (s) return `${fmtDay(s)}, ${yr(s)}`
  return 'Dates TBA'
}

function initials(name: string) {
  return name.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0].toUpperCase()).join('') || name.slice(0, 2).toUpperCase()
}

function Card({ t }: { t: Tourn }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className="p-5 flex items-start gap-4">
        {t.logoUrl
          ? <img src={t.logoUrl} alt="" className="w-16 h-16 rounded-xl object-contain bg-white border border-slate-100 flex-shrink-0" />
          : <div className="w-16 h-16 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">{initials(t.name)}</div>}
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 leading-tight">{t.name}</h3>
          <p className="text-sm text-teal-700 font-medium mt-1 inline-flex items-center gap-1"><CalendarDays size={14} /> {fmtRange(t.startDate, t.endDate)}</p>
          {t.location && <p className="text-sm text-slate-500 mt-0.5 inline-flex items-center gap-1"><MapPin size={14} /> {t.location}</p>}
        </div>
      </div>
      <div className="mt-auto border-t border-slate-100 flex">
        <Link href={`/tournaments/${t.id}/public`} className="flex-1 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 py-3 transition-colors inline-flex items-center justify-center gap-1">
          Details <ArrowRight size={14} />
        </Link>
        {t.teamRegEnabled ? (
          <Link href={`/tournaments/${t.id}/register`} className="flex-1 text-center text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 py-3 transition-colors">
            Register
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export default async function OrgSite({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
        <div>
          <Trophy size={40} className="mx-auto text-slate-300" />
          <h1 className="mt-3 text-xl font-bold text-slate-800">Site not found</h1>
          <p className="text-slate-500 mt-1 text-sm">No organization matches “{params.slug}”.</p>
        </div>
      </div>
    )
  }
  const org = orgRes.rows[0] as any
  const tRes = await client.execute({
    sql: 'SELECT id, name, startDate, endDate, location, logoUrl, sport, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate',
    args: [org.id as string],
  })
  const all = (tRes.rows as any[]).map(r => ({ ...r, teamRegEnabled: Number(r.teamRegEnabled) })) as Tourn[]
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = all.filter(t => (t.endDate || t.startDate || '') >= today).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
  const past = all.filter(t => (t.endDate || t.startDate || '') < today).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-bold text-slate-900 text-lg">{org.name}</span>
          {upcoming[0] && (
            <Link href={`/tournaments/${upcoming[0].id}/register`} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg transition-colors">Register a team</Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="bg-[#0f1f3d] text-white">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <p className="text-teal-300 font-semibold tracking-wide text-sm uppercase">Tournaments</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold mt-2 leading-tight">{org.name}</h1>
          <p className="text-slate-300 mt-3 max-w-2xl text-lg">Upcoming events, schedules, standings and team registration — all in one place.</p>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-xl font-bold text-slate-900 mb-5">Upcoming tournaments</h2>
        {upcoming.length === 0
          ? <p className="text-slate-500">No upcoming tournaments posted yet — check back soon.</p>
          : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map(t => <Card key={t.id} t={t} />)}</div>}

        {past.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-slate-900 mt-12 mb-5">Past tournaments</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{past.map(t => <Card key={t.id} t={t} />)}</div>
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <div>
            <span className="font-semibold text-slate-700">{org.name}</span>
            {org.contactEmail && <span> · <a href={`mailto:${org.contactEmail}`} className="hover:text-teal-700">{org.contactEmail}</a></span>}
          </div>
          <span className="text-xs text-slate-400">Powered by Whistle Ready</span>
        </div>
      </footer>
    </div>
  )
}
