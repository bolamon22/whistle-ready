'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import {
  Users, LayoutGrid, CalendarDays, Activity, DollarSign,
  ClipboardList, ShieldCheck, Check, ArrowRight, Eye, Flag,
  UserRound, UserCog, Loader2,
} from 'lucide-react'

const FEATURES = [
  { icon: Users, title: 'Team & player registration',
    desc: 'Custom pricing tiers, divisions, early-bird discounts, and online payment — teams and individuals sign up in minutes.' },
  { icon: LayoutGrid, title: 'Divisions, pools & brackets',
    desc: 'Auto-generate pools and brackets, handle byes and consolation rounds, and split divisions into flights with one click.' },
  { icon: CalendarDays, title: 'Smart scheduling',
    desc: "Auto-fill the grid with no double-books, proper rest between games, and fields spread the way you'd do it by hand." },
  { icon: Activity, title: 'Live scores & standings',
    desc: 'Scorekeepers post results from any device; standings, tiebreakers, and brackets update for everyone instantly.' },
  { icon: ClipboardList, title: 'Staff, refs & payroll',
    desc: 'Assign officials to games, track availability and hours, and run pay summaries — the whole crew in one workspace.' },
  { icon: DollarSign, title: 'Payments & financials',
    desc: 'Collect registration fees online and see revenue, payouts, and event financials without a separate accounting step.' },
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
  admin: '/',
  director: '/dashboard/director',
  club_director: '/dashboard/club-director',
  assigner: '/dashboard/assigner',
  coach: '/dashboard/coach',
  ref: '/dashboard/ref',
  scorekeeper: '/dashboard/scorekeeper',
  parent: '/dashboard/parent',
  viewer: '/dashboard/viewer',
}

export default function Landing() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('Invalid email or password.')
      return
    }
    const sessionData = await fetch('/api/auth/session').then(r => r.json()).catch(() => null)
    const role = sessionData?.user?.role ?? 'viewer'
    router.push(ROLE_DESTINATIONS[role] ?? '/')
    router.refresh()
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
            <a href="#login" className="hover:text-slate-900 transition-colors">Log in</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="#login" className="hidden sm:inline-flex text-sm font-semibold text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Log in</a>
            <Link href="/register" className="inline-flex items-center gap-1.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg transition-colors">Get started</Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="px-6 pt-16 pb-10" style={{ background: 'radial-gradient(1100px 460px at 82% -12%, #f0fdfa, transparent)' }}>
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
              <Link href="/register" className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-3 rounded-xl transition-colors">
                Start free <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#login" className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold px-5 py-3 rounded-xl transition-colors">
                Log in
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-green-600" /> No credit card to start</span>
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-green-600" /> Any sport</span>
              <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-green-600" /> Built for directors</span>
            </div>
          </div>

          {/* Functional login card */}
          <div id="login" className="scroll-mt-24">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] p-7 max-w-md mx-auto lg:mx-0">
              <h3 className="text-lg font-bold text-slate-900">Log in to Whistle Ready</h3>
              <p className="text-sm text-slate-500 mt-0.5 mb-5">Welcome back — pick up right where you left off.</p>
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                    autoComplete="email" placeholder="you@club.com"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
                  <input required type="password" value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" placeholder="••••••••"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-colors" />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Logging in…</> : 'Log in'}
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
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">One login, the right view</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-3">A place for everyone on the field</h2>
            <p className="text-lg text-slate-600">Each person sees exactly what they need — nothing more. Directors run the event; everyone else just shows up ready.</p>
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

      {/* ── CTA BAND ── */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-14 text-center text-white">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(600px 220px at 50% -30%, rgba(20,184,166,0.35), transparent)' }} />
            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight mb-3">Ready to run your next event?</h2>
              <p className="text-lg text-slate-300 mb-7">Set up your first tournament in an afternoon — free until you go live.</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/register" className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-900 font-semibold px-5 py-3 rounded-xl transition-colors">
                  Create your account <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="#login" className="inline-flex items-center gap-2 border border-white/30 hover:bg-white/10 text-white font-semibold px-5 py-3 rounded-xl transition-colors">
                  Log in
                </a>
              </div>
            </div>
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
            <a href="#who" className="hover:text-slate-800 transition-colors">Who it&apos;s for</a>
            <a href="#login" className="hover:text-slate-800 transition-colors">Log in</a>
            <Link href="/register" className="hover:text-slate-800 transition-colors">Get started</Link>
          </div>
        </div>
        <p className="max-w-6xl mx-auto text-xs text-slate-400 mt-6">© 2026 Whistle Ready · whistleready.app · Tournament management for every sport.</p>
      </footer>
    </div>
  )
}
