'use client'

import { useState, Suspense } from 'react'
import PasswordInput from '@/components/PasswordInput'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronRight, ClipboardList, Flag, Mail, Users } from 'lucide-react'

// Create account. It asks who the account is for first (Bo, Oct 14 2026): every
// Register / Create account / Create one link in the app came here, and this form
// could only make a Parent login, so referees who "signed up to officiate" ended
// up as parents with no staff record (Steve Newell, and Donald Chappe twice).
// Self-signup still never makes a staff login (api/auth/register): staff accounts
// come from the organizer's sign-up link or an invite, so the staff choice points
// there. A ?role= link (a coach's letter, a parent offer) skips the question.

export type WorkLink = { name: string; href: string }
type Pick = '' | 'staff' | 'parent' | 'club' | 'coach'
const ROLE_FOR: Record<string, Pick> = { parent: 'parent', coach: 'coach', club_director: 'coach' }

function RegisterInner({ workLinks, eventsHref }: { workLinks: WorkLink[]; eventsHref: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const role = ['parent', 'coach', 'club_director'].includes(sp.get('role') || '') ? String(sp.get('role')) : ''
  const forParam = sp.get('for') || ''
  const [pick, setPick] = useState<Pick>(ROLE_FOR[role] || (['staff', 'parent', 'club'].includes(forParam) ? forParam as Pick : ''))
  const [name, setName] = useState(sp.get('name') || '')
  const [email, setEmail] = useState(sp.get('email') || '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Honeypot — invisible to humans, irresistible to signup bots. If it has a
  // value, the API silently discards the submission.
  // LESSON (Jul 24): this was first named "company", and Chrome AUTOFILLED it
  // with the user's organization — real signups got silently eaten. The name
  // must never match an autofill heuristic (no company/name/email/phone/url).
  const [hpExtra, setHpExtra] = useState('')
  // The role this form creates: a ?role= link's own, else the choice made here.
  const formRole = role || (pick === 'coach' ? 'coach' : 'parent')
  const backTo = role ? null : () => { setPick(pick === 'coach' ? 'club' : ''); setError('') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role: formRole, hp_extra: hpExtra }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Registration failed.'); setLoading(false); return }
    // Auto sign in after register
    const signInRes = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (signInRes?.error) { router.push('/login') }
    else { router.push('/'); router.refresh() }
  }

  const back = backTo && (
    <button type="button" onClick={backTo} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 -mt-1 mb-4">
      <ArrowLeft size={15} />Back
    </button>
  )
  const signInLine = (
    <p className="text-center text-sm text-gray-500 mt-5">
      Already have an account?{' '}
      <Link href="/login" className="text-sky-600 hover:underline font-medium">Sign in</Link>
    </p>
  )

  // ── Who is it for? ──
  if (!pick) {
    const choices: { key: Pick; icon: React.ReactNode; title: string; sub: string }[] = [
      { key: 'staff', icon: <Flag size={20} />, title: 'Referee, scorekeeper, trainer or event staff', sub: 'Work games at events' },
      { key: 'parent', icon: <Users size={20} />, title: 'Parent or player', sub: "Waivers, player info and your team's games" },
      { key: 'club', icon: <ClipboardList size={20} />, title: 'Club director or coach', sub: "Your club's teams, rosters and schedule" },
    ]
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md">
        <div className="text-center mb-5">
          <h1 className="text-2xl font-bold text-gray-800">Create an account</h1>
          <p className="text-sm text-gray-500 mt-1">Who is it for?</p>
        </div>
        <div className="space-y-2.5">
          {choices.map(c => (
            <button key={c.key} type="button" onClick={() => setPick(c.key)}
              className="w-full flex items-center gap-3 text-left rounded-xl border border-gray-200 hover:border-sky-400 hover:bg-sky-50/50 px-4 py-3.5 transition-colors">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">{c.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-gray-800 leading-snug">{c.title}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{c.sub}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-gray-400" />
            </button>
          ))}
        </div>
        {signInLine}
      </div>
    )
  }

  // ── Staff: their account comes from the organizer, not this form ──
  if (pick === 'staff') return (
    <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md">
      {back}
      <h1 className="text-xl font-bold text-gray-800">Staff sign up with the organizer</h1>
      <p className="text-sm text-gray-600 mt-2 leading-relaxed">
        Referees, scorekeepers, trainers and event staff get their account from the event organizer, so it comes with the right events and pay. An account made on this page is a parent account, and it can&apos;t be put on games.
      </p>
      <div className="mt-5 space-y-4">
        <div className="flex gap-3">
          <span className="w-6 h-6 shrink-0 rounded-full bg-gray-800 text-white text-xs font-bold flex items-center justify-center">1</span>
          <p className="text-sm text-gray-700 leading-snug pt-0.5"><b>Got a sign-up link from an assigner?</b> Open it. It makes your staff account and adds you to the staff list.</p>
        </div>
        <div className="flex gap-3">
          <span className="w-6 h-6 shrink-0 rounded-full bg-gray-800 text-white text-xs font-bold flex items-center justify-center">2</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-700 leading-snug pt-0.5"><b>No link yet?</b> {workLinks.length ? 'Apply to work events. The organizer sends your sign-up link.' : 'Ask the event organizer for their staff sign-up link.'}</p>
            {workLinks.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {workLinks.map(w => (
                  <a key={w.href} href={w.href}
                    className="flex items-center justify-between gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold leading-snug px-4 py-2.5">
                    <span>Work with {w.name}</span><ArrowRight size={16} className="shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-6 rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-3 text-xs text-gray-600 leading-relaxed">
        <b className="text-gray-800">Already made a parent account by mistake?</b> Open your sign-up link and use the same email and password. We&apos;ll add staff to the account you have.
      </p>
      {signInLine}
    </div>
  )

  // ── Club directors and coaches ──
  if (pick === 'club') return (
    <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md">
      {back}
      <h1 className="text-xl font-bold text-gray-800">Club directors and coaches</h1>
      <div className="mt-4 space-y-4">
        <div>
          <p className="text-sm text-gray-700 leading-relaxed"><b>Club directors:</b> your club portal comes with your team registration. We email the director a link that sets a password and opens it.</p>
          <Link href="/login?portal=1" className="mt-2.5 inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-4 py-2.5">
            <Mail size={16} />Email me my portal link
          </Link>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-700 leading-relaxed"><b>Registering a team?</b> You don&apos;t need an account first. Open your event and tap Register.</p>
          <a href={eventsHref} className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:underline">Find your event<ArrowRight size={14} /></a>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-700 leading-relaxed"><b>Coaches:</b> want to follow your team&apos;s games?</p>
          <button type="button" onClick={() => setPick('coach')} className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:underline">Create a coach account<ArrowRight size={14} /></button>
        </div>
      </div>
      {signInLine}
    </div>
  )

  // ── The form: a parent account, or a coach account ──
  const isCoach = formRole === 'coach'
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
      {back}
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-sky-600 rounded-xl flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-800">{isCoach ? 'Create your coach account' : formRole === 'parent' ? 'Create your parent account' : 'Create Account'}</h1>
        <p className="text-sm text-gray-500 mt-1">{isCoach ? "Follow your team's games" : formRole === 'parent' ? 'Manage your players & register faster next time' : 'Join Whistle Ready'}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Honeypot: visually removed, excluded from tab order. The meaningless
            name + one-time-code autocomplete keep browser autofill away from it. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
          <input type="text" name="hp_extra" tabIndex={-1} autoComplete="one-time-code" value={hpExtra} onChange={e => setHpExtra(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input required value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Jane Smith" autoComplete="name" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="you@example.com" autoComplete="email" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <PasswordInput required value={password} onChange={setPassword}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="At least 6 characters" autoComplete="new-password" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
          <PasswordInput required value={confirm} onChange={setConfirm}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Repeat your password" autoComplete="new-password" />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      {signInLine}
    </div>
  )
}

export default function RegisterForm(props: { workLinks: WorkLink[]; eventsHref: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Suspense fallback={null}>
        <RegisterInner {...props} />
      </Suspense>
    </div>
  )
}
