'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const ROLES = [
  { value: 'referee', label: 'Referee', icon: '🏃', desc: 'Officiate games on the field' },
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

// Labels for the role values STORED on Worker records (claim invites show these read-only)
const CLAIM_ROLE_LABELS: Record<string, string> = {
  ref: 'Referee', referee: 'Referee', scorekeeper: 'Scorekeeper',
  field_ops: 'Field Ops', athletic_trainer: 'Athletic Trainer', assigner: 'Assigner',
}

export default function AcceptInvitePage() {
  const { token } = useParams()
  const router = useRouter()

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'used' | 'expired'>('loading')
  const [invite, setInvite] = useState<{ email: string | null; name: string | null; tournamentName: string | null; kind?: string; needEmail?: boolean; orgName?: string | null; roles?: string[] } | null>(null)
  const [email, setEmail] = useState('')
  const [hadAccount, setHadAccount] = useState(false)

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [gender, setGender] = useState('both')
  const [certLevel, setCertLevel] = useState('youth')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Claim invites link an EXISTING staff-pool record — role/cert are already on file,
  // so the form is just (email if we don't have one) + password.
  const isClaim = invite?.kind === 'claim'

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          if (d.error.toLowerCase().includes('used')) setStatus('used')
          else if (d.error.toLowerCase().includes('expired')) setStatus('expired')
          else setStatus('invalid')
        } else {
          setInvite(d)
          setName(d.name ?? '')
          setStatus('valid')
        }
      })
      .catch(() => setStatus('invalid'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isClaim && !role) { setError('Please select your role'); return }
    if (isClaim && invite?.needEmail && !email.trim().includes('@')) { setError('Please enter your email address'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setSubmitting(true)
    setError('')

    const res = await fetch(`/api/invite/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isClaim ? { password, email: email.trim() } : { name, role, gender, certLevel, phone, password }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      setSubmitting(false)
    } else {
      if (data?.alreadyHadAccount) setHadAccount(true)
      setDone(true)
    }
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse">Checking your invite…</p>
    </div>
  )

  if (status !== 'valid') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">{status === 'used' ? '✅' : '⏰'}</div>
        <h1 className="text-lg font-bold text-slate-800 mb-2">
          {status === 'used' ? 'Invite already used' : status === 'expired' ? 'Invite expired' : 'Invalid invite'}
        </h1>
        <p className="text-sm text-slate-500">
          {status === 'used' ? 'This invite link has already been accepted.' : status === 'expired' ? 'This invite link has expired. Ask your coordinator to send a new one.' : 'This invite link is not valid.'}
        </p>
      </div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">You're all set!</h1>
        <p className="text-sm text-slate-500 mb-6">{hadAccount ? 'You already have a Whistle Ready login with this email — sign in with your existing password.' : isClaim ? 'Your staff login is ready. Sign in to see your assignments and schedule.' : 'Your staff profile has been created. Sign in to see your schedule.'}</p>
        <Link href="/login" className="inline-block bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">
          Sign in →
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md overflow-hidden">

        <div className="bg-[#0f1f3d] px-6 py-5">
          <p className="text-xs text-teal-400 font-medium mb-1">
            {isClaim ? (invite?.orgName ?? 'Whistle Ready') + ' · Staff login' : (invite?.tournamentName ?? 'Whistle Ready') + ' · Staff Invite'}
          </p>
          <h1 className="text-lg font-bold text-white">{isClaim ? 'Create your staff login' : 'Welcome aboard'}</h1>
          <p className="text-xs text-slate-400 mt-1">{isClaim ? (invite?.email ?? 'Set up your account below') : invite?.email}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {isClaim && (
            <>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{invite?.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(invite?.roles ?? []).map(r => (
                    <span key={r} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">{CLAIM_ROLE_LABELS[r] ?? r}</span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">Your details are already on file{invite?.orgName ? ' with ' + invite.orgName : ''} — just set up your login.</p>
              </div>
              {invite?.needEmail && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Your email</label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    value={email} onChange={e => setEmail(e.target.value)}
                    type="email" placeholder="you@example.com" required autoComplete="email"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">You&apos;ll use this to sign in.</p>
                </div>
              )}
            </>
          )}

          {!isClaim && (<>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Your name</label>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Full name" required autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">What's your role?</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <button key={r.value} type="button"
                  onClick={() => setRole(r.value)}
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

          {role === 'referee' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Which games can you officiate?</label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDERS.map(g => (
                    <button key={g.value} type="button"
                      onClick={() => setGender(g.value)}
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
                    <button key={c.value} type="button"
                      onClick={() => setCertLevel(c.value)}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-all ${certLevel === c.value ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={phone} onChange={e => setPhone(e.target.value)}
              type="tel" placeholder="(555) 000-0000" autoComplete="tel"
            />
          </div>

          </>)}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                value={password} onChange={e => setPassword(e.target.value)}
                type="password" placeholder="Min 6 chars" required autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                type="password" placeholder="Repeat password" required autoComplete="new-password"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button type="submit" disabled={submitting || (!isClaim && !role)}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-xl transition-colors">
            {submitting ? (isClaim ? 'Creating your login…' : 'Setting up your profile…') : (isClaim ? 'Create my login →' : 'Join the staff →')}
          </button>
        </form>
      </div>
    </div>
  )
}
