'use client'

import { useEffect, useRef, useState } from 'react'
import { Link2, Mail, X, Loader2 } from 'lucide-react'

// "Login not linked" on the registrations page: the contact's email has a login,
// but it can't open this registration, so their club portal doesn't show it. An
// admin can connect it here and now (Bo, Oct 7 2026: "I want to be able to do it
// as the administrator") after seeing whose login it is, or send the Account
// email, whose link connects it when they sign in.

export type ConnectResult = { name: string; email: string; clubName: string; already: boolean; rolePromoted: boolean; role: string }

const ROLE_NAMES: Record<string, string> = { club_director: 'club director', parent: 'parent', coach: 'coach', viewer: 'viewer' }

export default function ConnectLoginDialog({ reg, onClose, onConnected, onSendEmail }: {
  reg: { id: string; clubName: string; clubContact?: string; contactEmail?: string; accountName?: string; accountRole?: string }
  onClose: () => void
  onConnected: (r: ConnectResult) => void
  onSendEmail: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const who = reg.accountName || reg.clubContact || reg.contactEmail || 'This person'
  const role = String(reg.accountRole || '')
  const becomesDirector = role !== 'club_director' && ['', 'parent', 'coach', 'viewer'].includes(role)

  async function connect() {
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/registrations/${reg.id}/connect-login`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'That didn’t connect. Try again.'); return }
      onConnected(d as ConnectResult)
    } catch {
      setError('That didn’t connect. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="connect-login-title" className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id="connect-login-title" className="text-lg font-bold text-slate-900">Connect their login</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="px-5 pt-2 pb-4 text-sm text-slate-600 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div className="font-semibold text-slate-900">{who}</div>
            <div className="text-slate-500 break-all">{reg.contactEmail}</div>
            {role && <div className="text-xs text-slate-500 mt-0.5">{ROLE_NAMES[role] || role} login</div>}
          </div>
          <p>Connecting gives this login <strong className="text-slate-800">{reg.clubName}</strong>&rsquo;s registration in their club portal: teams, rosters, player waivers and invoices. No email is sent.</p>
          {becomesDirector && <p className="text-xs text-slate-500">Their login becomes a club director login. If they’re signed in right now, they sign out and back in to see the portal.</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</p>}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onSendEmail} disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 px-2 py-2 disabled:opacity-50">
            <Mail size={15} /> Send the Account email instead
          </button>
          <button ref={first} type="button" onClick={connect} disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Connect now
          </button>
        </div>
      </div>
    </div>
  )
}
