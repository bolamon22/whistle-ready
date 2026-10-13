'use client'

// Lets a staff member who is already on the roster say yes (or no) to being
// texted. /join covers new signups; this covers everyone who was here before the
// checkbox existed and has therefore never agreed to anything.
//
// It sits next to StaffAlerts on the staff home on purpose: push alerts and text
// alerts are the same question to the person reading it, and one of them should
// not be buried in a settings page the other isn't.

import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { smsConsentText } from '@/lib/smsConsent'

type Loaded = { phone: string; consent: boolean; at: string; noRecord?: boolean }

export default function SmsConsent({ orgName = 'Whistle Ready', compact = false }: { orgName?: string; compact?: boolean }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/staff-sms-consent')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData(d || null))
      .catch(() => setData(null))
  }, [])

  async function set(consent: boolean) {
    setBusy(true); setErr('')
    const r = await fetch('/api/staff-sms-consent', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent }),
    }).then(x => x.json()).catch(() => null)
    setBusy(false)
    if (!r || r.error) { setErr(r?.error || 'Could not save that. Try again.'); return }
    setData(d => (d ? { ...d, consent: !!r.consent, at: r.at || '' } : d))
  }

  // No staff record (an admin login with no Worker row) — nothing to consent with.
  if (!data || data.noRecord) return null

  const on = data.consent
  const noPhone = !data.phone.trim()

  return (
    <div className={`rounded-2xl border ${on ? 'border-teal-200 bg-teal-50/60' : 'border-slate-200 bg-white'} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-2">
        <MessageSquare size={18} className={on ? 'text-teal-700' : 'text-slate-400'} />
        <p className="font-bold text-slate-900">{on ? 'Text alerts are on' : 'Text alerts are off'}</p>
      </div>

      {noPhone ? (
        <p className="text-sm text-slate-600 mt-1">
          We don&apos;t have a mobile number for you. Ask the office to add one to your staff record, then turn this on.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600 mt-1">
            {on
              ? <>We can text you at <strong className="text-slate-800">{data.phone}</strong>.</>
              : <>We have <strong className="text-slate-800">{data.phone}</strong> on file, but we will not text it unless you say so.</>}
          </p>

          {/* The exact wording from src/lib/smsConsent.ts — the same words the
              /join checkbox uses, because a verification reviewer compares what
              we show people against what we actually send. */}
          <p className="text-xs leading-relaxed text-slate-500 mt-2.5 bg-white/70 border border-slate-200 rounded-xl px-3 py-2.5">
            {smsConsentText(orgName)}{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-teal-700 underline underline-offset-2">Terms</a>
            {' · '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-teal-700 underline underline-offset-2">Privacy</a>
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button type="button" disabled={busy} onClick={() => set(!on)}
              className={`text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 ${on
                ? 'border border-slate-300 hover:border-slate-400 text-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>
              {busy ? 'Saving…' : on ? 'Turn texts off' : 'Yes, text me'}
            </button>
            {on && !!data.at && (
              <span className="text-xs text-slate-400">
                You agreed on {new Date(data.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </>
      )}

      {!!err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  )
}
