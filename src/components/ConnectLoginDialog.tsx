'use client'

import { useEffect, useRef, useState } from 'react'
import { Link2, Mail, X, Loader2, AlertTriangle } from 'lucide-react'

// "Login not linked" on the registrations page: the contact's email has a login,
// but it can't open this registration, so their club portal doesn't show it. An
// admin can connect it here and now (Bo, Oct 7 2026: "I want to be able to do it
// as the administrator") after seeing whose login it is and what it already
// opens, or send the Account email, whose link connects it when they sign in.
//
// Logins aren't email-checked (anyone can make one with any address), so the
// dialog says plainly when nothing shows the login is really theirs.

export type ConnectResult = { name: string; email: string; clubName: string; already: boolean; rolePromoted: boolean; role: string }
type LoginInfo = { name: string; email: string; role: string; createdAt: string; already: boolean; sameClub: boolean; opens: { clubName: string; event: string }[]; openCount: number }

const ROLE_NAMES: Record<string, string> = { club_director: 'club director', parent: 'parent', coach: 'coach', viewer: 'viewer', director: 'tournament director', admin: 'admin' }
const day = (iso: string) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }

export default function ConnectLoginDialog({ reg, onClose, onConnected, onSendEmail }: {
  reg: { id: string; clubName: string; clubContact?: string; contactEmail?: string; accountName?: string; accountRole?: string }
  onClose: () => void
  onConnected: (r: ConnectResult) => void
  onSendEmail: () => void
}) {
  const [info, setInfo] = useState<LoginInfo | null>(null)
  const [looking, setLooking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closeBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let live = true
    fetch(`/api/registrations/${reg.id}/connect-login`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!live) return; if (r.ok) setInfo(d as LoginInfo); else setError(d.error || 'Couldn’t look this login up.') })
      .catch(() => { if (live) setError('Couldn’t look this login up. Check your connection.') })
      .finally(() => { if (live) setLooking(false) })
    return () => { live = false }
  }, [reg.id])

  const who = info?.name || reg.accountName || reg.clubContact || reg.contactEmail || 'This person'
  const role = info?.role ?? String(reg.accountRole || '')
  const becomesDirector = ['', 'parent', 'coach', 'viewer'].includes(role)
  const unproven = !!info && !info.sameClub && info.openCount === 0

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
      <div role="dialog" aria-modal="true" aria-labelledby="connect-login-title" className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id="connect-login-title" className="text-lg font-bold text-slate-900">Connect their login</h2>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close" className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="px-5 pt-2 pb-4 text-sm text-slate-600 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div className="font-semibold text-slate-900">{who}</div>
            <div className="text-slate-500 break-all">{info?.email || reg.contactEmail}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {[role ? `${ROLE_NAMES[role] || role} login` : '', info?.createdAt ? `made ${day(info.createdAt)}` : ''].filter(Boolean).join(' · ')}
            </div>
            {looking && <div className="text-xs text-slate-400 mt-2 inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Checking what this login opens…</div>}
            {info && info.openCount > 0 && (
              <div className="mt-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-700">Already opens</div>
                <ul className="mt-0.5 space-y-0.5">
                  {info.opens.map((o, i) => <li key={i}>{o.clubName}{o.event ? <span className="text-slate-400"> · {o.event}</span> : null}</li>)}
                  {info.openCount > info.opens.length && <li className="text-slate-400">and {info.openCount - info.opens.length} more</li>}
                </ul>
              </div>
            )}
          </div>
          {unproven && (
            <p className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-xs leading-relaxed">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
              <span>This login doesn’t open any club yet, and logins aren’t email-checked, so nothing here shows it belongs to whoever owns {info?.email}. If you’re not sure it’s theirs, send the Account email: only someone with that inbox can use its link.</span>
            </p>
          )}
          <p>Connecting gives this login <strong className="text-slate-800">{reg.clubName}</strong>&rsquo;s registration in their club portal: teams, rosters, player waivers and invoices. No email is sent.</p>
          {becomesDirector && info && <p className="text-xs text-slate-500">Their login becomes a club director login. If they’re signed in right now, they sign out and back in to see the portal.</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</p>}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onSendEmail} disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 px-2 py-2 disabled:opacity-50">
            <Mail size={15} /> Send the Account email instead
          </button>
          <button type="button" onClick={connect} disabled={busy || looking || !info}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Connect now
          </button>
        </div>
      </div>
    </div>
  )
}
