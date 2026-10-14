'use client'

// Who on this event's roster will actually get a buzz, and who won't.
//
// The point is the UNCOVERED list, with phone numbers, so the gap becomes a
// short call list instead of a worry. Everyone-gets-another-email is what you
// do when you don't know who's missing.
//
// iPhones are the usual reason somebody is missing: web push only works from a
// Home Screen app, so an iPhone staffer who just opened the site in Safari and
// tapped around has not actually turned anything on. Android works in-browser.

import { useEffect, useState } from 'react'
import { BellRing, BellOff, RefreshCw } from 'lucide-react'

type Covered = { id: string; name: string; role: string; devices: number; labels: string[] }
type Uncovered = { id: string; name: string; role: string; email: string; phone: string; reason: string }
type Data = { total: number; covered: Covered[]; uncovered: Uncovered[] }

const tel = (p: string) => String(p || '').replace(/[^\d+]/g, '')

export default function AlertsCoverage({ tournamentId }: { tournamentId: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [showOn, setShowOn] = useState(false)

  async function load() {
    setBusy(true)
    const r = await fetch(`/api/tournaments/${tournamentId}/alerts-coverage`)
      .then(x => (x.ok ? x.json() : null)).catch(() => null)
    setD(r)
    setBusy(false)
  }
  useEffect(() => { load() }, [tournamentId])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return null
  if (!d.total) return null

  const on = d.covered.length
  const pct = d.total ? Math.round((on / d.total) * 100) : 0
  const allSet = d.uncovered.length === 0

  return (
    <div className={`rounded-2xl border p-4 ${allSet ? 'border-teal-200 bg-teal-50/60' : 'border-amber-200 bg-amber-50/70'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {allSet ? <BellRing size={18} className="text-teal-700" /> : <BellOff size={18} className="text-amber-700" />}
        <p className="font-bold text-slate-900">
          {allSet ? 'Every staff member has alerts on' : `${d.uncovered.length} of ${d.total} staff won't get alerts`}
        </p>
        <span className="text-xs font-bold text-slate-500">{on}/{d.total} · {pct}%</span>
        <button type="button" onClick={load} disabled={busy}
          className="ml-auto text-slate-400 hover:text-slate-600 disabled:opacity-40" title="Refresh">
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mt-2.5 h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {!allSet && (
        <>
          <p className="text-sm text-slate-600 mt-3">
            These people get nothing when a field request goes out. Most are iPhones — web alerts only work once
            the app is added to the Home Screen, so tapping around in Safari does not count.
            Send them to <strong className="text-slate-800">/dashboard/alerts</strong> (there is a QR code on that page) or grab them at check-in.
          </p>
          <ul className="mt-3 divide-y divide-amber-200/70">
            {d.uncovered.map(u => (
              <li key={u.id} className="py-2 flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-slate-800 text-sm">{u.name}</span>
                {!!u.role && <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{u.role}</span>}
                {u.reason === 'no email on file' && (
                  <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                    No email — can&apos;t be matched
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3">
                  {!!u.phone && <a href={`tel:${tel(u.phone)}`} className="text-sm text-teal-700 font-semibold hover:underline">{u.phone}</a>}
                  {!!u.phone && <a href={`sms:${tel(u.phone)}`} className="text-xs text-slate-500 hover:text-slate-700">Text</a>}
                  {!u.phone && <span className="text-xs text-slate-400">No phone on file</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {on > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowOn(v => !v)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline underline-offset-2">
            {showOn ? 'Hide' : `Show the ${on} who are set up`}
          </button>
          {showOn && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {d.covered.map(c => (
                <li key={c.id} className="text-xs bg-white border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">
                  {c.name}{c.devices > 1 ? ` · ${c.devices} devices` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
