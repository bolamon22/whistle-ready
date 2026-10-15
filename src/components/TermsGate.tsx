'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { ScrollText } from 'lucide-react'
import { isLegalPath } from '@/lib/legalRoutes'
import { TERMS_VERSION, TERMS_UPDATED, TERMS_AGREE_LABEL } from '@/lib/termsVersion'

// Asks every signed-in person to agree to the current Terms of Use once (Bo, Oct
// 15 2026: "we updated our terms of use" on their next sign-in). It covers people
// who made an account before the box existed and anyone after a TERMS_VERSION
// bump. One tick per version; the answer is cached for the tab so this costs one
// request per visit, not per page.
//
// Never shown on /terms, /privacy or /sms, so the link in the prompt can be read.
// If the check fails (network, database) nothing is shown: the gate must never be
// the thing that stops staff using the app on game day.

const cacheKey = (userId: string) => `wr-terms:${TERMS_VERSION}:${userId}`

export default function TermsGate() {
  const { data, status } = useSession()
  const pathname = usePathname() || ''
  const userId = (data?.user as { id?: string } | undefined)?.id || ''
  const [required, setRequired] = useState(false)
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (status !== 'authenticated' || !userId) { setRequired(false); return }
    try { if (sessionStorage.getItem(cacheKey(userId)) === 'ok') return } catch { /* private mode */ }
    let cancelled = false
    fetch('/api/terms', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled || !j) return
        if (j.required) setRequired(true)
        else { try { sessionStorage.setItem(cacheKey(userId), 'ok') } catch { /* ignore */ } }
      })
      .catch(() => { /* fail open */ })
    return () => { cancelled = true }
  }, [status, userId])

  if (!required || isLegalPath(pathname)) return null

  async function agree() {
    if (!checked || saving) return
    setSaving(true); setErr('')
    try {
      const r = await fetch('/api/terms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agree: true, version: TERMS_VERSION }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'Could not save. Try again.'); return }
      try { sessionStorage.setItem(cacheKey(userId), 'ok') } catch { /* ignore */ }
      setRequired(false)
    } catch {
      setErr('Could not save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 flex items-end sm:items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl p-5 sm:p-6 text-slate-700">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0"><ScrollText size={18} /></span>
          <h2 id="terms-gate-title" className="text-lg font-semibold text-slate-900">We updated our Terms of Use</h2>
        </div>
        <p className="mt-3 text-sm leading-6">
          Please read and agree to the Whistle Ready Terms of Use (updated {TERMS_UPDATED}) to keep using your account.
          They cover how you may use Whistle Ready, including keeping what you see in it confidential.
        </p>
        <a href="/terms" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-teal-700 underline underline-offset-2">Read the Terms of Use</a>
        <label className="mt-4 flex gap-2.5 items-start text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-teal-600 shrink-0" checked={checked} onChange={e => setChecked(e.target.checked)} />
          <span>{TERMS_AGREE_LABEL}</span>
        </label>
        {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={() => signOut({ callbackUrl: '/login' })} className="text-sm text-slate-500 hover:text-slate-800">Sign out</button>
          <button type="button" onClick={agree} disabled={!checked || saving}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Saving…' : 'Agree and continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
