'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { Check, UserPlus } from 'lucide-react'
import { PREFILL_FAMILY_KEYS, PREFILL_PLAYER_KEYS, type Prefill } from '@/lib/parentWaiverFields'

// Top of the player waiver for returning families (Bo, Oct 9 2026: if they register
// for another tournament with the same login, "their information will auto
// populate"; and "make sure they can connect siblings").
//   - Signed in with players in the account: one chip per player fills in that
//     player's details plus the family's; "New player" fills in only the family's,
//     for a brother or sister. ?sibling=1 (from "Add a brother or sister") picks it.
//   - Signed out: "Sign in and we'll fill this in", signing in right here so the
//     page and anything typed stay put.
// Never fills the event's own answers (club, team, hotel) or the signature.
// Data: GET /api/parent/prefill (lib/parentWaivers prefillFor).

type Mode = 'checking' | 'out' | 'in'

export default function WaiverPrefillBar({ eventId, onFill, className = '' }: { eventId?: string; onFill: (values: Record<string, string>) => void; className?: string }) {
  const [mode, setMode] = useState<Mode>('checking')
  const [pre, setPre] = useState<Prefill>({ players: [], family: {} })
  const [picked, setPicked] = useState('')
  const [justSignedIn, setJustSignedIn] = useState(false)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const autoPicked = useRef(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/parent/prefill${eventId ? `?event=${encodeURIComponent(eventId)}` : ''}`, { cache: 'no-store' })
      if (r.status === 401) { setMode('out'); return }
      if (!r.ok) { setMode('out'); return }
      const j = await r.json()
      setPre({ players: Array.isArray(j?.players) ? j.players : [], family: j?.family && typeof j.family === 'object' ? j.family : {} })
      setMode('in')
    } catch { setMode('out') }
  }, [eventId])
  useEffect(() => { load() }, [load])

  const blankPlayer = Object.fromEntries(PREFILL_PLAYER_KEYS.map(k => [k, '']))
  const familyOnly = (src: Record<string, string>) => Object.fromEntries(PREFILL_FAMILY_KEYS.map(k => [k, String(src?.[k] ?? '')]))
  const hasFamily = Object.values(pre.family || {}).some(v => String(v || '').trim())

  const pick = useCallback((key: string) => {
    setPicked(key)
    if (key === 'new') { onFill({ ...blankPlayer, ...familyOnly(pre.family) }); return }
    const p = pre.players.find(x => x.key === key)
    if (p) onFill({ ...blankPlayer, ...p.data })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre, onFill])

  // "Add a brother or sister" lands here with ?sibling=1: start them on New player.
  useEffect(() => {
    if (mode !== 'in' || autoPicked.current || !hasFamily) return
    autoPicked.current = true
    try { if (new URLSearchParams(window.location.search).get('sibling') === '1') pick('new') } catch { /* no window */ }
  }, [mode, hasFamily, pick])

  async function doSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setErr('')
    if (!email.trim() || !password) { setErr('Enter your email and password.'); return }
    setBusy(true)
    try {
      const r = await signIn('credentials', { email: email.trim().toLowerCase(), password, redirect: false })
      if (!r?.ok || r?.error) { setErr('That email and password don’t match. Try again, or reset your password.'); return }
      setPassword(''); setOpen(false); setJustSignedIn(true)
      await load()
    } catch { setErr('Could not reach the server. Try again.') } finally { setBusy(false) }
  }

  if (mode === 'checking') return null

  if (mode === 'out') return (
    <div className={className}>
    <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3" data-testid="prefill-signin">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">Filled out one of our waivers before?</p>
          <p className="text-xs text-slate-600 mt-0.5">Sign in to your parent account and we&rsquo;ll fill this in for you.</p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-2">Sign in</button>
        )}
      </div>
      {open && (
        // Its own small form, above the waiver's, so Enter signs in instead of submitting the waiver.
        <form onSubmit={doSignIn} className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start" noValidate>
          <input type="email" autoComplete="username" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <input type="password" autoComplete="current-password" placeholder="Password" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <button type="submit" disabled={busy} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg px-4 py-2">{busy ? 'Signing in…' : 'Sign in'}</button>
          {err && <p role="alert" className="sm:col-span-3 text-xs text-red-600">{err}</p>}
          <p className="sm:col-span-3 text-xs text-slate-500">
            <a href="/forgot" target="_blank" rel="noopener" className="underline hover:text-slate-700">Forgot your password?</a>
            {' · '}New here? Just fill in the form below.
          </p>
        </form>
      )}
    </div>
    </div>
  )

  if (!pre.players.length && !hasFamily) {
    return justSignedIn
      ? <div className={className}><div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-slate-700" data-testid="prefill-empty">You&rsquo;re signed in. There&rsquo;s nothing to fill in from yet, so fill in the form below.</div></div>
      : null
  }

  const welcome = String(pre.family?.parentName || '').trim().split(/\s+/)[0]
  const p = pre.players.find(x => x.key === picked)
  return (
    <div className={className}>
    <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3" data-testid="prefill-bar">
      <p className="text-sm font-semibold text-slate-800">Welcome back{welcome ? `, ${welcome}` : ''}. Who is this waiver for?</p>
      <div className="flex flex-wrap gap-2 mt-2">
        {pre.players.map(x => (
          <button key={x.key} type="button" onClick={() => pick(x.key)} aria-pressed={picked === x.key}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${picked === x.key ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-teal-200 text-teal-800 hover:bg-teal-100'}`}>
            {picked === x.key && <Check size={14} />}{x.name}
          </button>
        ))}
        {hasFamily && (
          <button type="button" onClick={() => pick('new')} aria-pressed={picked === 'new'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${picked === 'new' ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-teal-200 text-teal-800 hover:bg-teal-100'}`}>
            <UserPlus size={14} /> New player
          </button>
        )}
      </div>
      <p className="text-xs text-slate-600 mt-2 leading-relaxed" aria-live="polite">
        {picked === 'new'
          ? 'Parent and emergency contact are filled in. Add the new player’s details, pick the team, and sign.'
          : p
            ? `Filled in from ${p.name}’s last waiver${p.lastEvent ? ` (${p.lastEvent})` : ''}. Check it, then pick the team and sign.`
            : 'Tap a name to fill in their details. The team and signature are new for each event.'}
      </p>
    </div>
    </div>
  )
}
