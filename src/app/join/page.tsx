'use client'

import { useState } from 'react'
import Link from 'next/link'

const ROLES = [
  { value: 'ref',              label: 'Referee',          icon: '🏃', desc: 'Officiate games on the field' },
  { value: 'scorekeeper',      label: 'Scorekeeper',      icon: '📋', desc: 'Track scores and game stats'  },
  { value: 'field_ops',        label: 'Field Ops',        icon: '🏗',  desc: 'Field setup and operations'  },
  { value: 'athletic_trainer', label: 'Athletic Trainer', icon: '🩺', desc: 'Player health and safety'     },
]

const GENDERS = [
  { value: 'boys',  label: 'Boys games'        },
  { value: 'girls', label: 'Girls games'        },
  { value: 'both',  label: 'Both boys & girls'  },
]

const CERT_LEVELS = [
  { value: 'youth',   label: 'Youth'       },
  { value: 'hs',      label: 'High School' },
  { value: 'college', label: 'College'     },
  { value: 'none',    label: 'N/A'         },
]

export default function JoinStaffPage() {
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [role, setRole]           = useState('')
  const [gender, setGender]       = useState('both')
  const [certLevel, setCertLevel] = useState('youth')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role)               { setError('Please select your role'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setSubmitting(true)
    setError('')

    const roles = JSON.stringify([role])

    // Create worker
    const wRes = await fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone: phone || null, defaultRole: role, roles, certLevel, gender, payMethod: 'check' }),
    })
    const wData = await wRes.json()
    if (!wRes.ok) { setError(wData.error || 'Could not create profile'); setSubmitting(false); return }

    // Create user account
    const uRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    const uData = await uRes.json()
    if (!uRes.ok) { setError(uData.error || 'Could not create account'); setSubmitting(false); return }

    setDone(true)
  }

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">You're all set!</h1>
        <p className="text-sm text-slate-500 mb-6">Your staff profile has been created. Sign in to see your schedule and availability.</p>
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
          <h1 className="text-lg font-bold text-white">Join our Staff</h1>
          <p className="text-xs text-slate-400 mt-1">Create your profile to get scheduled for games.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Name + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full name *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="(555) 000-0000" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email address *</label>
            <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" required />
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
                <div className="flex gap-2">
                  {GENDERS.map(g => (
                    <button key={g.value} type="button" onClick={() => setGender(g.value)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${gender === g.value ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Certification level</label>
                <div className="flex gap-2">
                  {CERT_LEVELS.map(c => (
                    <button key={c.value} type="button" onClick={() => setCertLevel(c.value)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${certLevel === c.value ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Min 6 chars" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={confirm} onChange={e => setConfirm(e.target.value)} type="password" placeholder="Repeat" required />
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
