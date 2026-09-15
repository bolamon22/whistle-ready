'use client'

// "Claim your team" — the bridge between registering a team and getting portal access.
// Reached from the confirmation letter/email. The token in the URL is the authorization.

import { useEffect, useState } from 'react'
import PasswordInput from '@/components/PasswordInput'
import { useParams, useRouter } from 'next/navigation'
import { signIn, signOut } from 'next-auth/react'
import { ClipboardList, Check, ShieldCheck, Users, CreditCard, CalendarDays } from 'lucide-react'

type Info = {
  clubName: string
  tournamentName: string
  contactEmail: string
  contactName: string
  alreadyClaimed: boolean
  accountExists: boolean
  orgName?: string
  orgLogoUrl?: string
}

export default function ClaimPage() {
  const { token } = useParams() as { token: string }
  const router = useRouter()

  const [info, setInfo] = useState<Info | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/claim?token=${encodeURIComponent(String(token))}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setLoadErr(d.error || 'This link is not valid.'); return }
        setInfo(d)
        setName(d.contactName || '')
      })
      .catch(() => setLoadErr('Could not check this link. Please try again.'))
      .finally(() => setLoading(false))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not complete that.'); setBusy(false); return }

      // The role is written into the NextAuth token at sign-in and never
      // refreshed, so a promotion only takes effect on the next authentication.
      if (d.wasSignedIn && d.rolePromoted) {
        // Already signed in, so there is no password here to re-authenticate
        // with. Clearing the stale session is the only way the new role lands —
        // otherwise they bounce straight back out of the portal they just earned.
        setDone(true)
        await signOut({ redirect: false }).catch(() => {})
        setTimeout(() => router.push('/login?claimed=1'), 900)
        return
      }
      // Sign them in so they land inside the portal, not on a login screen.
      await signIn('credentials', {
        email: info?.contactEmail, password, redirect: false,
      }).catch(() => {})
      setDone(true)
      setTimeout(() => router.push('/dashboard/club-director'), 900)
    } catch {
      setErr('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )

  if (loading) return shell(<p className="text-center text-slate-400 text-sm">Checking your link…</p>)

  if (loadErr || !info) return shell(
    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <h1 className="text-lg font-bold text-slate-800">Link not valid</h1>
      <p className="text-sm text-slate-500 mt-2">{loadErr || 'This link is not valid.'}</p>
      <a href="/login" className="inline-block mt-5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5">Sign in</a>
    </div>
  )

  if (done) return shell(
    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center"><Check size={22} /></div>
      <h1 className="text-lg font-bold text-slate-800">You&apos;re all set!</h1>
      <p className="text-sm text-slate-500 mt-2">Taking you to your team dashboard…</p>
    </div>
  )

  if (info.alreadyClaimed) return shell(
    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <h1 className="text-lg font-bold text-slate-800">Already claimed</h1>
      <p className="text-sm text-slate-500 mt-2">
        <strong>{info.clubName}</strong> has already been linked to an account. Sign in to view your team.
      </p>
      <a href="/login" className="inline-block mt-5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5">Sign in</a>
    </div>
  )

  return shell(
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="bg-slate-900 px-6 py-5">
        {/* The organizer's mark, not ours: this link arrives from their domain in
            their email, and Whistle Ready is a name the coach has never seen. */}
        {(info.orgLogoUrl || info.orgName) && (
          <div className="flex items-center gap-2 mb-3">
            {info.orgLogoUrl && <img src={info.orgLogoUrl} alt="" className="w-6 h-6 rounded object-contain bg-white/10" />}
            {info.orgName && <span className="text-[12px] font-semibold text-white/80">{info.orgName}</span>}
          </div>
        )}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-300">{info.tournamentName}</p>
        <h1 className="text-lg font-bold text-white mt-1">Set up your team account</h1>
        <p className="text-xs text-slate-300 mt-1">for {info.clubName}</p>
      </div>

      <div className="px-6 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">What you&apos;ll be able to do</p>
        <ul className="space-y-1.5 mb-5">
          {[
            [<Users key="u" size={14} />,       'Manage your roster and player waivers'],
            [<CreditCard key="c" size={14} />,  'See your invoice, payments and balance'],
            [<CalendarDays key="s" size={14} />,'View your schedule once it’s posted'],
            [<ClipboardList key="r" size={14} />,'Register more teams without re-typing everything'],
          ].map(([icon, label], i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm text-slate-600">
              <span className="text-teal-600">{icon}</span>{label as string}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={submit} className="px-6 pb-6 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
          <input value={info.contactEmail} readOnly
            className="w-full border border-slate-200 bg-slate-50 text-slate-500 rounded-lg px-3 py-2 text-sm" />
          <p className="text-[11px] text-slate-400 mt-1">The address used to register {info.clubName}.</p>
        </div>

        {!info.accountExists && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Your name</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {info.accountExists ? 'Your existing password' : 'Create a password'}
          </label>
          <PasswordInput value={password} onChange={setPassword} required
            minLength={info.accountExists ? 1 : 8} autoComplete={info.accountExists ? 'current-password' : 'new-password'}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <p className="text-[11px] text-slate-400 mt-1">
            {info.accountExists
              ? 'You already have an account — enter your password to link this team to it.'
              : 'At least 8 characters.'}
          </p>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <button type="submit" disabled={busy}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-colors">
          {busy ? 'Setting up…' : info.accountExists ? 'Link this team to my account' : 'Create account'}
        </button>

        <p className="flex items-start gap-1.5 text-[11px] text-slate-400 pt-1">
          <ShieldCheck size={13} className="mt-px flex-shrink-0" />
          This link is unique to your registration and can only be used once.
        </p>
      </form>
    </div>
  )
}
