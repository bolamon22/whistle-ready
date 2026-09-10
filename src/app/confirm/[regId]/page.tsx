'use client'

// Public confirm-your-teams page — reached from the "Confirm your teams" email.
// The regId in the URL is the key (same trust model as /pay/[regId]). One click
// to confirm, or a change request that flags the registration on the org side.

import { useEffect, useState } from 'react'

type Data = {
  clubName: string; eventName: string; startDate: string; endDate: string
  teams: { teamName: string; division: string }[]
  confirmStatus: string; confirmAt: string
}

const fmtDates = (a: string, b: string) => {
  const f = (d: string) => { const x = new Date(d); return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  const s = f(a), e = f(b)
  return s && e && s !== e ? `${s}–${e}` : s || e
}

export default function ConfirmTeamsPage({ params }: { params: { regId: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'idle' | 'change'>('idle')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'confirmed' | 'change_requested' | ''>('')

  useEffect(() => {
    fetch(`/api/registrations/${params.regId}/confirm`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Failed to load'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
  }, [params.regId])

  async function submit(action: 'confirm' | 'change') {
    setBusy(true)
    try {
      const res = await fetch(`/api/registrations/${params.regId}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'change' ? { action, message } : { action }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) throw new Error(d.error || 'Something went wrong — try again')
      setDone(d.status)
    } catch (e: any) { setError(e?.message || 'Something went wrong') }
    finally { setBusy(false) }
  }

  if (error && !data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><p className="text-slate-500 text-sm">{error}</p></div>
  if (!data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><p className="text-slate-400 text-sm">Loading…</p></div>

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-[#0f1f3d] px-6 py-5">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-teal-400 mb-1">{data.eventName.toUpperCase()}</p>
            <h1 className="text-lg font-bold text-white">Confirm your teams — {data.clubName}</h1>
            {fmtDates(data.startDate, data.endDate) && <p className="text-xs text-slate-400 mt-1">{fmtDates(data.startDate, data.endDate)}</p>}
          </div>
          <div className="p-6">
            {done === 'confirmed' ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11.5L9 16.5L18 6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <p className="font-bold text-slate-800">You're confirmed — thank you!</p>
                <p className="text-sm text-slate-500 mt-1">We've marked {data.clubName} as set. See you at {data.eventName}.</p>
              </div>
            ) : done === 'change_requested' ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 6V12M11 15.5V16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
                </div>
                <p className="font-bold text-slate-800">Change request sent</p>
                <p className="text-sm text-slate-500 mt-1">We got it — we'll update your registration and follow up if we have questions.</p>
              </div>
            ) : (
              <>
                {data.confirmStatus === 'confirmed' && (
                  <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
                    Already confirmed{data.confirmAt ? ` on ${new Date(data.confirmAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''} — you can still send a change below.
                  </p>
                )}
                {data.confirmStatus === 'change_requested' && (
                  <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                    We have your change request and we&rsquo;re working on it — we&rsquo;ll let you know once the list below is updated.
                  </p>
                )}
                {data.confirmStatus === 'awaiting' && (
                  <p className="text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-4">
                    We made the change you asked for. Please give the list one more look and confirm.
                  </p>
                )}
                <p className="text-sm text-slate-600 mb-3">Here's what we have for {data.clubName}. Take a quick look:</p>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 mb-5">
                  {data.teams.length ? data.teams.map((t, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm font-semibold text-slate-800">{t.teamName}</span>
                      {t.division && <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5">{t.division}</span>}
                    </div>
                  )) : <div className="px-4 py-3 text-sm text-slate-400">No teams on file yet — tell us below what we should have.</div>}
                </div>
                {mode === 'idle' ? (
                  <div className="flex flex-col gap-2">
                    <button onClick={() => submit('confirm')} disabled={busy}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 rounded-xl disabled:opacity-50">
                      {busy ? 'Saving…' : "Everything's right — confirm"}
                    </button>
                    <button onClick={() => setMode('change')} disabled={busy}
                      className="w-full border border-amber-300 text-amber-700 hover:bg-amber-50 font-semibold text-sm py-3 rounded-xl disabled:opacity-50">
                      Something changed — send an update
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">What changed?</label>
                    <textarea rows={4} autoFocus value={message} onChange={e => setMessage(e.target.value)}
                      placeholder="e.g. Our 2030 boys team moved up a division, and we added a 2032 girls team"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => submit('change')} disabled={busy || !message.trim()}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm py-2.5 rounded-xl disabled:opacity-50">
                        {busy ? 'Sending…' : 'Send change request'}
                      </button>
                      <button onClick={() => setMode('idle')} disabled={busy} className="text-sm text-slate-500 px-3">Back</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Questions? Just reply to the email that brought you here.</p>
      </div>
    </div>
  )
}
