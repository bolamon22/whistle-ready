'use client'

// Public staff recruiting signup. Reached from the org's recruiting link
// (Staff Pool → "Recruiting link"), which carries ?org= and a secret &code= —
// see /api/join for why the code exists (bot-hardening) and for the duplicate
// guard that links an existing pool record instead of creating a second one.

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const ROLES = [
  { value: 'ref', label: 'Referee', icon: '🏃', desc: 'Officiate games on the field' },
  { value: 'scorekeeper', label: 'Scorekeeper', icon: '📋', desc: 'Track scores and game stats' },
  { value: 'field_ops', label: 'Field Ops', icon: '🏗', desc: 'Field setup and operations' },
  { value: 'athletic_trainer', label: 'Athletic Trainer', icon: '🩺', desc: 'Player health and safety' },
]

const GENDERS = [
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
  { value: 'both', label: 'Both' },
]

const CERT_LEVELS = [
  { value: 'youth', label: 'Youth' },
  { value: 'hs', label: 'High School' },
  { value: 'college', label: 'College' },
  { value: 'none', label: 'N/A' },
]

function JoinForm() {
  const searchParams = useSearchParams()
  const orgId = searchParams.get('org') || ''
  const code = searchParams.get('code') || ''
  const roleParam = searchParams.get('role') || ''

  const [linkState, setLinkState] = useState<'loading' | 'invalid' | 'valid'>('loading')
  const [orgName, setOrgName] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState(ROLES.some(r => r.value === roleParam) ? roleParam : '')
  const [gender, setGender] = useState('both')
  const [certLevel, setCertLevel] = useState('youth')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [hpExtra, setHpExtra] = useState('') // honeypot — humans never see it
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [linked, setLinked] = useState(false)

  useEffect(() => {
    if (!code) { setLinkState('invalid'); return }
    fetch(`/api/join?code=${encodeURIComponent(code)}${orgId ? `&org=${encodeURIComponent(orgId)}` : ''}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setLinkState('invalid'); return }
        setOrgName(d.orgName ?? null)
        setLinkState('valid')
      })
      .catch(() => setLinkState('invalid'))
  }, [orgId, code])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) { setError('Please select your role'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setSubmitting(true)
    setError('')

    const res = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org: orgId, code, name, email, phone: phone || null, role, gender, certLevel, password, hp_extra: hpExtra }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'Could not sign you up'); setSubmitting(false); return }

    setLinked(!!data.linked)
    setDone(true)
  }

  if (linkState === 'loading') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse">Checking your link…</p>
    </div>
  )

  if (linkState === 'invalid') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-lg font-bold text-slate-800 mb-2">This signup link isn't active</h1>
        <p className="text-sm text-slate-500">Ask your assigner or coordinator for the current link — or if you already have an account, just sign in.</p>
        <Link href="/login" className="inline-block mt-5 bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">
          Sign in →
        </Link>
      </div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">You're all set!</h1>
        <p className="text-sm text-slate-500 mb-6">
          {linked
            ? `Good news — you were already on the ${orgName ?? 'staff'} list, so we connected your new login to your existing record.`
            : 'Your staff profile has been created. Sign in to set your availability and see your assignments.'}
        </p>
        <Link href="/login" className="inline-block bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">
          Sign in →
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-[#0f1f3d] px-6 py-5">
          <p className="text-xs text-teal-400 font-medium mb-1">{orgName ?? 'Whistle Ready'} · Staff signup</p>
          <h1 className="text-lg font-bold text-white">Join {orgName ? `the ${orgName} staff` : 'our staff'}</h1>
          <p className="text-xs text-slate-400 mt-1">Create your profile to get scheduled — it takes about a minute.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Honeypot — hidden from humans, filled by bots */}
          <div className="hidden" aria-hidden="true">
            <label>Leave this field empty<input tabIndex={-1} autoComplete="off" value={hpExtra} onChange={e => setHpExtra(e.target.value)} /></label>
          </div>

          {/* Name + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full name *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required autoComplete="name" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="(555) 000-0000" autoComplete="tel" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email address *</label>
            <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" required autoComplete="email" />
          </div>

          {/* Role picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">What's your role? *</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${role === r.value ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-400' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className="text-lg leading-none mt-0.5">{r.icon}</span>
                  <div>
                    <div className={`text-xs font-semibold ${role === r.value ? 'text-teal-700' : 'text-slate-700'}`}>{r.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Referee extras */}
          {role === 'ref' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Which games can you officiate?</label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDERS.map(g => (
                    <button key={g.value} type="button" onClick={() => setGender(g.value)}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-all ${gender === g.value ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Certification level</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CERT_LEVELS.map(c => (
                    <button key={c.value} type="button" onClick={() => setCertLevel(c.value)}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-all ${certLevel === c.value ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Min 6 chars" required autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={confirm} onChange={e => setConfirm(e.target.value)} type="password" placeholder="Repeat" required autoComplete="new-password" />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button type="submit" disabled={submitting || !role}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-xl transition-colors">
            {submitting ? 'Creating your profile…' : 'Join the Staff →'}
          </button>

          <p className="text-center text-xs text-slate-400">
            Already have an account? <Link href="/login" className="text-teal-600 hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function JoinStaffPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>}>
      <JoinForm />
    </Suspense>
  )
}
