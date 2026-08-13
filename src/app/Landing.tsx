'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import {
  Users, LayoutGrid, CalendarDays, Activity, DollarSign, ClipboardList,
  ShieldCheck, Check, ArrowRight, Search, Eye, Flag, UserRound, UserCog, Loader2,
} from 'lucide-react'

const FEATURES = [
  { icon: Users, title: 'Team & player registration', desc: 'Custom pricing tiers, divisions, early-bird discounts, and online payment — teams and individuals sign up in minutes.' },
  { icon: LayoutGrid, title: 'Divisions, pools & brackets', desc: 'Auto-generate pools and brackets, handle byes and consolation rounds, and split divisions into flights with one click.' },
  { icon: CalendarDays, title: 'Smart scheduling', desc: "Auto-fill the grid with no double-books, proper rest between games, and fields spread the way you'd do it by hand." },
  { icon: Activity, title: 'Live scores & standings', desc: 'Scorekeepers post results from any device; standings, tiebreakers, and brackets update for everyone instantly.' },
  { icon: ClipboardList, title: 'Staff, refs & payroll', desc: 'Assign officials to games, track availability and hours, and run pay summaries — the whole crew in one workspace.' },
  { icon: DollarSign, title: 'Payments & financials', desc: 'Collect registration fees online and see revenue, payouts, and event financials without a separate accounting step.' },
]

const ROLES = [
  { icon: UserCog, label: 'Directors' },
  { icon: ShieldCheck, label: 'Club directors' },
  { icon: ClipboardList, label: 'Coaches' },
  { icon: UserRound, label: 'Parents' },
  { icon: Flag, label: 'Referees' },
  { icon: Activity, label: 'Scorekeepers' },
  { icon: CalendarDays, label: 'Assigners' },
  { icon: Eye, label: 'Spectators' },
]

const ROLE_DESTINATIONS: Record<string, string> = {
  admin: '/', director: '/dashboard/director', club_director: '/dashboard/club-director',
  assigner: '/dashboard/assigner', scheduler: '/dashboard/scheduler', coach: '/dashboard/coach',
  ref: '/dashboard/ref', scorekeeper: '/dashboard/scorekeeper', parent: '/dashboard/parent',
  viewer: '/dashboard/viewer',
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

export default function Landing() {
  const router = useRouter()

  // login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // inquiry
  const [form, setForm] = useState({ name: '', org: '', email: '', phone: '', sport: '', size: '', message: '' })
  const [hp, setHp] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')
  const setF = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoggingIn(false)
    if (res?.error) { setLoginError('Invalid email or password.'); return }
    const s = await fetch('/api/auth/session').then(r => r.json()).catch(() => null)
    const role = s?.user?.role ?? 'viewer'
    router.push(ROLE_DESTINATIONS[role] ?? '/')
    router.refresh()
  }

  async function submitInquiry(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.org.trim() || !form.email.trim()) {
      setFormError('Please add your name, organization, and email.'); return
    }
    setSending(true)
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hp_extra: hp }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(data.error || 'Something went wrong. Please try again.'); setSending(false); return }
      setSent(true)
    } catch { setFormError('Something went wrong. Please try again.') }
    finally { setSending(false) }
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
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#who" className="hover:text-slate-900 transition-colors">Who it&apos;s for</a>
            <Link href="/find" className="hover:text-slate-900 transition-colors">Find your tournament</Link>
          </nav>
          <div className="flex items-center gap-2">
            <a href="#login" className="hidden sm:inline-flex text-sm font-semibold text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Log in</a>
            <a href="#organizations" className="inline-flex items-center gap-1.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg transition-colors">Run a tournament</a>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="px-6 pt-16 pb-12" style={{ background: 'radial-gradient(1100px 460px at 82% -12%, #f0fdfa, transparent)' }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_.9fr] gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1.5 rounded-full mb-5">
              <Check className="w-3.5 h-3.5" /> Tournament management, start to finish
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.08] mb-4">
              Run your whole tournament <span className="text-teal-600">in one place.</span>
            </h1>
            <p className="text-lg text-slate-600 max-w-xl mb-7">
              Whistle Ready handles registration, divisions and brackets, scheduling, staff and payouts,
              live scores, and public standings — so directors spend less time on spreadsheets and more time on game day.
            </p>
            <div className="flex flex-wrap gap-3 mb-6">
              <Link href="/find" className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-3 rounded-xl transition-colors">
                Find your tournament <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#organizations" className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold px-5 py-3 rounded-xl transition-colors">
                Run a tournament
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-green-600" /> Any sport</span>
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-green-600" /> Built for directors</span>
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-green-600" /> Free public schedules</span>
            </div>
          </div>

          {/* Functional login card */}
          <div id="login" className="scroll-mt-24">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] p-7 max-w-md mx-auto lg:mx-0">
              <h3 className="text-lg font-bold text-slate-900">Log in to Whistle Ready</h3>
              <p className="text-sm text-slate-500 mt-0.5 mb-5">Directors, coaches, parents, and staff — pick up right where you left off.</p>
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@club.com" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
                  <input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" className={inputCls} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 font-medium text-slate-600"><input type="checkbox" className="w-auto" /> Remember me</label>
                  <Link href="/forgot" className="text-teal-600 hover:underline font-semibold">Forgot password?</Link>
                </div>
                {loginError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{loginError}</p>}
                <button type="submit" disabled={loggingIn} className="w-full inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                  {loggingIn ? <><Loader2 className="w-4 h-4 animate-spin" /> Logging in…</> : 'Log in'}
                </button>
              </form>
              <p className="text-center text-sm text-slate-500 mt-5">
                New here? <Link href="/register" className="text-teal-600 hover:underline font-semibold">Create an account</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SPORTS STRIP ── */}
      <div className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-semibold">
          <span className="text-slate-400 tracking-wide">TRUSTED FOR</span>
          {['Lacrosse', 'Volleyball', 'Baseball', 'Basketball', '+ any bracket sport'].map(s => (
            <span key={s} className="text-slate-500">{s}</span>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="px-6 py-20 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Everything the day needs</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-3">One platform from sign-ups to standings</h2>
            <p className="text-lg text-slate-600">Stop stitching together forms, spreadsheets, and group texts. Whistle Ready runs the entire event on a single system.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div key={f.title} className="bg-white border border-slate-200 rounded-xl p-6 hover:border-slate-300 hover:shadow-md transition-all">
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

      {/* ── WHO IT'S FOR ── */}
      <section id="who" className="px-6 py-20 bg-slate-50 border-y border-slate-200 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">One login, the right view</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-3">A place for everyone on the field</h2>
            <p className="text-lg text-slate-600">Each person sees exactly what they need. Directors run the event; everyone else just shows up ready.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {ROLES.map(r => {
              const Icon = r.icon
              return (
                <div key={r.label} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3.5 font-semibold text-slate-700">
                  <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  {r.label}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── FIND YOUR TOURNAMENT (pointer to the page) ── */}
      <section className="px-6 py-16">
        <div className="max-w-5xl mx-auto rounded-3xl border border-slate-200 bg-white p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-6 justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-1">Attending an event?</h2>
            <p className="text-slate-600">Find your tournament's live schedule, standings, and bracket — no account needed.</p>
          </div>
          <Link href="/find" className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex-shrink-0">
            <Search className="w-4 h-4" /> Find your tournament
          </Link>
        </div>
      </section>

      {/* ── ORGANIZER INQUIRY ── */}
      <section id="organizations" className="px-6 py-20 bg-slate-50 border-t border-slate-200 scroll-mt-20">
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
      <footer className="px-6 py-10 border-t border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <img src="/whistle-ready-icon.png" alt="" className="w-7 h-7 rounded-lg object-contain" />
            Whistle Ready
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#features" className="hover:text-slate-800 transition-colors">Features</a>
            <Link href="/find" className="hover:text-slate-800 transition-colors">Find your tournament</Link>
            <a href="#organizations" className="hover:text-slate-800 transition-colors">Run a tournament</a>
            <a href="#login" className="hover:text-slate-800 transition-colors">Log in</a>
          </div>
        </div>
        <p className="max-w-6xl mx-auto text-xs text-slate-400 mt-6">© 2026 Whistle Ready · whistleready.app · Tournament management for every sport.</p>
      </footer>
    </div>
  )
}
