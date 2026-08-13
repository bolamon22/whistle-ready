'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, LayoutGrid, CalendarDays, Activity, DollarSign, ClipboardList,
  Check, ArrowRight, Search, MapPin, Trophy, Loader2, LogIn,
} from 'lucide-react'

type Tournament = {
  id: string; name: string; sport: string
  startDate: string; endDate: string; location: string; logoUrl: string
}

const FEATURES = [
  { icon: Users, title: 'Team & player registration', desc: 'Divisions, pricing tiers, and online payment — sign up in minutes.' },
  { icon: LayoutGrid, title: 'Pools, brackets & flights', desc: 'Auto-generated pools and brackets with byes and consolation rounds.' },
  { icon: CalendarDays, title: 'Smart scheduling', desc: 'Auto-fill the grid with no double-books and proper rest between games.' },
  { icon: Activity, title: 'Live scores & standings', desc: 'Results, tiebreakers, and brackets update for everyone instantly.' },
  { icon: ClipboardList, title: 'Staff, refs & payroll', desc: 'Assign officials, track hours, and run pay summaries in one place.' },
  { icon: DollarSign, title: 'Payments & financials', desc: 'Collect fees online and see event revenue without a separate step.' },
]

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

export default function Landing() {
  const [all, setAll] = useState<Tournament[] | null>(null)
  const [query, setQuery] = useState('')

  // inquiry form
  const [form, setForm] = useState({ name: '', org: '', email: '', phone: '', sport: '', size: '', message: '' })
  const [hp, setHp] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')

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

  function setF(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submitInquiry(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.org.trim() || !form.email.trim()) {
      setFormError('Please add your name, organization, and email.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hp_extra: hp }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(data.error || 'Something went wrong. Please try again.'); setSending(false); return }
      setSent(true)
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    // -m-6 cancels the app layout's <main> padding so sections span full width
    <div className="-m-6 bg-white text-slate-800">

      {/* ── NAV ── */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-slate-900 text-lg">
            <img src="/whistle-ready-icon.png" alt="" className="w-9 h-9 rounded-lg object-contain" />
            Whistle Ready
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#tournaments" className="hover:text-slate-900 transition-colors">Find your tournament</a>
            <a href="#about" className="hover:text-slate-900 transition-colors">What we do</a>
            <a href="#organizations" className="hover:text-slate-900 transition-colors">Run a tournament</a>
          </nav>
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors">
            <LogIn className="w-4 h-4" /> Log in
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="px-6 pt-16 pb-10" style={{ background: 'radial-gradient(1100px 460px at 80% -12%, #f0fdfa, transparent)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1.5 rounded-full mb-5">
            <Trophy className="w-3.5 h-3.5" /> Schedules · standings · brackets · registration
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.08] mb-4">
            Find your <span className="text-teal-600">tournament.</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto mb-7">
            Live schedules, standings, and brackets for every event — plus online registration. No account needed to follow along.
          </p>
          {/* search */}
          <div className="max-w-md mx-auto relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by tournament, city, or sport"
              className="w-full border border-slate-300 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-colors shadow-sm"
            />
          </div>
          <a href="#tournaments" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-900 mt-4">
            Browse all events <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ── TOURNAMENT LIST ── */}
      <section id="tournaments" className="px-6 py-14 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-1">Upcoming & current</h2>
          <p className="text-slate-500 mb-6">Tap an event for its schedule, standings, bracket, and registration.</p>

          {all === null ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 py-16">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading events…
            </div>
          ) : upcoming.length === 0 && past.length === 0 ? (
            <div className="text-center border border-dashed border-slate-300 rounded-xl py-16">
              <Trophy className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-600">No events posted yet</p>
              <p className="text-sm text-slate-400 mt-1">Check back soon — new tournaments show up here automatically.</p>
            </div>
          ) : (
            <>
              {upcoming.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {upcoming.map(t => <TournamentCard key={t.id} t={t} action="view" />)}
                </div>
              ) : (
                <p className="text-slate-500">{query ? 'No upcoming events match your search.' : 'No upcoming events posted right now.'}</p>
              )}

              {past.length > 0 && (
                <>
                  <h3 className="text-lg font-bold text-slate-900 mt-10 mb-4">Recent results</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {past.slice(0, 6).map(t => <TournamentCard key={t.id} t={t} action="results" />)}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── WHAT WE DO ── */}
      <section id="about" className="px-6 py-16 bg-slate-50 border-y border-slate-200 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Powered by Whistle Ready</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-3">Everything a tournament needs, in one place</h2>
            <p className="text-lg text-slate-600">From sign-ups to final standings — registration, brackets, scheduling, staff, live scores, and payments.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div key={f.title} className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-1.5">{f.title}</h4>
                  <p className="text-sm text-slate-600">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── ORGANIZER INQUIRY ── */}
      <section id="organizations" className="px-6 py-20 scroll-mt-20">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">For organizers</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-3">Want to run your tournaments on Whistle Ready?</h2>
            <p className="text-lg text-slate-600 mb-5">
              We're onboarding organizations by hand right now. Tell us a bit about your events and we'll be in touch to get you set up.
            </p>
            <ul className="space-y-2 text-slate-600">
              {['Registration, scheduling, and brackets in one system', 'Live public schedules, standings, and results', 'Staff assignment, payroll, and event financials'].map(x => (
                <li key={x} className="flex items-start gap-2"><Check className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" /> {x}</li>
              ))}
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] p-7">
            {sent ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4"><Check className="w-6 h-6" /></div>
                <h3 className="text-lg font-bold text-slate-900">Thanks — we've got it.</h3>
                <p className="text-sm text-slate-500 mt-1">We'll reach out to {form.email} soon about running your tournaments.</p>
              </div>
            ) : (
              <form onSubmit={submitInquiry} className="space-y-3.5">
                <h3 className="text-lg font-bold text-slate-900">Get in touch</h3>
                {/* honeypot — hidden from humans */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
                  <input type="text" name="hp_extra" tabIndex={-1} autoComplete="one-time-code" value={hp} onChange={e => setHp(e.target.value)} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3.5">
                  <Field label="Your name *"><input required value={form.name} onChange={e => setF('name', e.target.value)} autoComplete="name" className={inputCls} placeholder="Jane Smith" /></Field>
                  <Field label="Organization *"><input required value={form.org} onChange={e => setF('org', e.target.value)} className={inputCls} placeholder="Riverside Lacrosse Club" /></Field>
                  <Field label="Email *"><input required type="email" value={form.email} onChange={e => setF('email', e.target.value)} autoComplete="email" className={inputCls} placeholder="you@club.com" /></Field>
                  <Field label="Phone"><input value={form.phone} onChange={e => setF('phone', e.target.value)} autoComplete="tel" className={inputCls} placeholder="(555) 123-4567" /></Field>
                  <Field label="Sport"><input value={form.sport} onChange={e => setF('sport', e.target.value)} className={inputCls} placeholder="Lacrosse" /></Field>
                  <Field label="Events / teams per year"><input value={form.size} onChange={e => setF('size', e.target.value)} className={inputCls} placeholder="e.g. 3 events, ~120 teams" /></Field>
                </div>
                <Field label="Anything else?"><textarea value={form.message} onChange={e => setF('message', e.target.value)} rows={3} className={inputCls} placeholder="Tell us about your events…" /></Field>
                {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
                <button type="submit" disabled={sending} className="w-full inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                  {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send inquiry'}
                </button>
                <p className="text-xs text-slate-400 text-center">No account is created — this just starts a conversation.</p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-6 py-10 border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <img src="/whistle-ready-icon.png" alt="" className="w-7 h-7 rounded-lg object-contain" />
            Whistle Ready
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#tournaments" className="hover:text-slate-800 transition-colors">Find your tournament</a>
            <a href="#organizations" className="hover:text-slate-800 transition-colors">Run a tournament</a>
            <Link href="/login" className="hover:text-slate-800 transition-colors">Log in</Link>
          </div>
        </div>
        <p className="max-w-6xl mx-auto text-xs text-slate-400 mt-6">© 2026 Whistle Ready · whistleready.app · Tournament management for every sport.</p>
      </footer>
    </div>
  )
}

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</span>
      {children}
    </label>
  )
}
