'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import type { AccountOffer } from '@/lib/parentWaiverFields'

// The end of the player waiver (Bo, Oct 9 2026): "ask them if they want to set
// their account up by creating a password at the end. That way they don't have to
// go back later when they want to make edits." The waiver is already saved when
// this shows; it only makes a login (or uses the one already on that email) and
// puts the waiver in it. Server side: /api/parent/account, lib/parentWaivers.

const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

export default function ParentAccountOffer({ offer, playerName }: { offer: AccountOffer; playerName: string }) {
  const first = String(playerName || '').trim().split(/\s+/)[0] || ''
  const whose = first ? possessive(first) : 'your player’s'
  const [mode, setMode] = useState<'new' | 'existing' | 'done'>('linked' in offer ? 'done' : offer.existing ? 'existing' : 'new')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)
  const email = offer.email

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!('token' in offer) || busy) return
    setError('')
    if (!password) { setError(mode === 'existing' ? 'Enter your password.' : 'Choose a password.'); return }
    if (mode === 'new' && password.length < 8) { setError('Use at least 8 characters.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/parent/account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: offer.token, password }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 409 && j.existing) {
        // Made from another tab a moment ago, or the password didn't match.
        setError(mode === 'existing' ? 'That password doesn’t match. Try again, or reset it.' : `${email} already has an account. Enter its password instead.`)
        setMode('existing'); setPassword('')
        return
      }
      if (!res.ok) { setError(j.error || 'That didn’t save. Try again.'); return }
      setCreated(!!j.created)
      if (!j.signedIn) await signIn('credentials', { email, password, redirect: false }).catch(() => null)
      setPassword('')
      setMode('done')
    } catch {
      setError('That didn’t save. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  if (mode === 'done') return (
    <div className="mt-8 bg-teal-50 border border-teal-200 rounded-2xl p-5 sm:p-6" data-testid="parent-account-done">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={24} className="text-teal-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="font-bold text-slate-900">{created ? 'Your account is ready' : 'Saved to your account'}</h2>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            {first ? `${whose} waiver` : 'This waiver'} is in your account. Sign in with <span className="font-semibold text-slate-800 break-all">{email}</span> any time to update {whose} details.
          </p>
          <a href="/dashboard/parent?tab=players" className="inline-block mt-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-2.5 rounded-full text-sm transition-colors">Open my account &rarr;</a>
        </div>
      </div>
    </div>
  )

  const existing = mode === 'existing'
  return (
    <div className="mt-8 bg-white border-2 border-teal-200 rounded-2xl p-5 sm:p-6 shadow-sm" data-testid="parent-account-offer">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shrink-0"><Lock size={18} /></div>
        <div className="min-w-0">
          <h2 className="font-bold text-slate-900">{existing ? `Add ${first || 'this player'} to your account?` : 'Save your info for next time?'}</h2>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            {existing
              ? <>You already have an account with us. Enter its password and {whose} waiver goes into it, so you can update it any time.</>
              : <>Create a password and you can come back any time to update {whose} details (jersey number, phone numbers, emergency contact) without filling out the waiver again.</>}
          </p>
        </div>
      </div>
      <form onSubmit={save} className="mt-4 space-y-3" noValidate>
        <div>
          <label htmlFor="pa-email" className="block text-xs font-semibold text-slate-500 mb-1">{existing ? 'Your account' : 'Your login'}</label>
          <input id="pa-email" type="email" name="username" autoComplete="username" value={email} readOnly
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600" />
        </div>
        <div>
          <label htmlFor="pa-password" className="block text-xs font-semibold text-slate-500 mb-1">{existing ? 'Password' : 'Create a password'}</label>
          <div className="relative">
            <input id="pa-password" type={show ? 'text' : 'password'} name="password" value={password}
              onChange={e => { setPassword(e.target.value); if (error) setError('') }}
              autoComplete={existing ? 'current-password' : 'new-password'} autoCapitalize="none" spellCheck={false}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? 'Hide' : 'Show'}
            </button>
          </div>
          {!existing && <p className="text-xs text-slate-400 mt-1">At least 8 characters.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap pt-1">
          <button type="submit" disabled={busy}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-full transition-colors">
            {busy ? 'Saving…' : existing ? 'Add to my account' : 'Create my account'}
          </button>
          {existing && <a href="/forgot" target="_blank" rel="noopener" className="text-sm text-teal-700 hover:text-teal-900 hover:underline">Forgot your password?</a>}
        </div>
      </form>
    </div>
  )
}
