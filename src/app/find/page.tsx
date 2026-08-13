'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, MapPin, ArrowRight, Search, Trophy, Loader2, LogIn } from 'lucide-react'

type Tournament = {
  id: string; name: string; sport: string
  startDate: string; endDate: string; location: string; logoUrl: string
}

const fmtDay = (d: string) => {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return ''
  return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const yr = (d: string) => (d ? d.split('-')[0] : '')
function fmtRange(s: string, e: string) {
  if (s && e && s !== e) return `${fmtDay(s)} – ${fmtDay(e)}, ${yr(e)}`
  if (s) return `${fmtDay(s)}, ${yr(s)}`
  return 'Dates TBA'
}
function initials(name: string) {
  return name.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0].toUpperCase()).join('') || name.slice(0, 2).toUpperCase()
}

function TournamentCard({ t, action }: { t: Tournament; action: 'view' | 'results' }) {
  return (
    <Link
      href={action === 'results' ? `/tournaments/${t.id}/public` : `/tournaments/${t.id}/event`}
      className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-teal-300 hover:shadow-md transition-all"
    >
      {t.logoUrl
        ? <img src={t.logoUrl} alt="" className="w-14 h-14 rounded-lg object-contain border border-slate-100 bg-slate-50 flex-shrink-0" />
        : <div className="w-14 h-14 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold flex-shrink-0">{initials(t.name)}</div>}
      <div className="min-w-0 flex-1">
        <div className="font-bold text-slate-900 truncate group-hover:text-teal-700">{t.name}</div>
        <div className="text-sm text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {fmtRange(t.startDate, t.endDate)}</span>
          {t.location && <span className="inline-flex items-center gap-1 truncate"><MapPin className="w-3.5 h-3.5" /> {t.location}</span>}
        </div>
      </div>
      <span className="text-sm font-semibold text-teal-700 inline-flex items-center gap-1 flex-shrink-0">
        {action === 'results' ? 'Results' : 'View'} <ArrowRight className="w-4 h-4" />
      </span>
    </Link>
  )
}

export default function FindTournamentPage() {
  const [all, setAll] = useState<Tournament[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/public/tournaments')
      .then(r => r.json())
      .then((d: Tournament[]) => setAll(Array.isArray(d) ? d : []))
      .catch(() => setAll([]))
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const matches = (t: Tournament) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return `${t.name} ${t.location} ${t.sport}`.toLowerCase().includes(q)
  }
  const list = all ?? []
  const upcoming = list.filter(t => (t.endDate || t.startDate || '') >= today).filter(matches).reverse()
  const past = list.filter(t => (t.endDate || t.startDate || '') < today).filter(matches)
  const hasSearch = query.trim().length > 0

  return (
    <div className="-m-6 bg-white text-slate-800 min-h-screen">

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-slate-900 text-lg">
            <img src="/whistle-ready-icon.png" alt="" className="w-9 h-9 rounded-lg object-contain" />
            Whistle Ready
          </Link>
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors">
            <LogIn className="w-4 h-4" /> Log in
          </Link>
        </div>
      </header>

      {/* ── HERO + SEARCH ── */}
      <section className="px-6 pt-14 pb-8" style={{ background: 'radial-gradient(1000px 420px at 80% -12%, #f0fdfa, transparent)' }}>
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1.5 rounded-full mb-5">
            <Trophy className="w-3.5 h-3.5" /> Schedules · standings · brackets
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-3">Find your <span className="text-teal-600">tournament.</span></h1>
          <p className="text-lg text-slate-600 mb-7">Live schedules, standings, and brackets — no account needed.</p>
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by tournament, city, or sport"
              className="w-full border border-slate-300 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-colors shadow-sm"
            />
          </div>
        </div>
      </section>

      {/* ── RESULTS ── */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          {all === null ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 py-16">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading events…
            </div>
          ) : (upcoming.length === 0 && past.length === 0) ? (
            hasSearch ? (
              <p className="text-center text-slate-500 py-10">No events match “{query}”.</p>
            ) : (
              <div className="text-center border border-dashed border-slate-300 rounded-xl py-16">
                <Trophy className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-600">No events posted yet</p>
                <p className="text-sm text-slate-400 mt-1">New tournaments show up here automatically.</p>
              </div>
            )
          ) : (
            <>
              {upcoming.length > 0 && (
                <>
                  <h2 className="text-xl font-bold text-slate-900 mb-4">{hasSearch ? 'Matching events' : 'Upcoming & current'}</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {upcoming.map(t => <TournamentCard key={t.id} t={t} action="view" />)}
                  </div>
                </>
              )}
              {past.length > 0 && (
                <>
                  <h3 className="text-lg font-bold text-slate-900 mt-10 mb-4">Recent results</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {past.slice(0, hasSearch ? past.length : 6).map(t => <TournamentCard key={t.id} t={t} action="results" />)}
                  </div>
                </>
              )}
            </>
          )}

          <div className="text-center mt-12">
            <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5">
              ← Back to Whistle Ready
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
