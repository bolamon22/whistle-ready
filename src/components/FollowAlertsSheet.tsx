'use client'
import { useState } from 'react'
import { Bell, X, Share, SquarePlus } from 'lucide-react'
import { pushSupport, subscribeThisBrowser, deviceLabel } from '@/lib/pushClient'

// The soft ask, shown once on a device's first follow: "Get alerts for Ghost?"
// The browser's own permission prompt only appears after a yes here, because a
// permission prompt with no explanation gets denied -- and a denial is
// permanent until the visitor digs through browser settings.
//
// On an iPhone in Safari there is nothing to ask for yet: iOS only offers push
// to a site on the Home Screen, so the sheet shows those two steps instead.

export default function FollowAlertsSheet({ team, deviceId, onDone }: {
  team: string
  deviceId: string
  /** `enabled` is whether this phone now gets alerts. */
  onDone: (enabled: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { supported, needsInstall } = pushSupport()

  async function turnOn() {
    setBusy(true); setErr('')
    try {
      const r = await subscribeThisBrowser()
      if (!r.ok) {
        setErr(r.reason === 'denied'
          ? 'Notifications are blocked for this site. Allow them in your browser settings, then follow again.'
          : 'This browser can’t receive notifications. Your follows still save.')
        setBusy(false); return
      }
      const res = await fetch('/api/follows/device', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, subscription: r.subscription, label: deviceLabel() }),
      })
      if (!res.ok) throw new Error('Could not save this phone.')
      onDone(true)
    } catch (e: any) {
      setErr(e?.message || 'Could not turn on alerts on this device.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => onDone(false)}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fa-title">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center flex-shrink-0"><Bell size={17} /></span>
            <h3 id="fa-title" className="text-base font-bold text-slate-900 leading-tight">Get alerts for {team}?</h3>
          </div>
          <button type="button" onClick={() => onDone(false)} className="text-slate-400 hover:text-slate-600 -mr-1 -mt-1 p-1" aria-label="Close"><X size={18} /></button>
        </div>

        {needsInstall ? (
          <>
            <p className="text-sm text-slate-600">You&apos;re following {team}. To get game times and scores on this iPhone, add the schedule to your Home Screen first:</p>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2.5"><span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0"><Share size={13} /></span>Tap <strong>Share</strong> in Safari</li>
              <li className="flex items-center gap-2.5"><span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0"><SquarePlus size={13} /></span>Tap <strong>Add to Home Screen</strong>, then open it from there</li>
            </ol>
            <p className="mt-3 text-xs text-slate-400">Your follows are saved either way.</p>
            <button type="button" onClick={() => onDone(false)} className="mt-4 w-full rounded-xl bg-slate-100 text-slate-800 text-sm font-semibold py-3 hover:bg-slate-200">Got it</button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">When the schedule is out, when {team} plays and where, if a game moves, and every final. Nothing else.</p>
            {!supported && <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This browser can&apos;t receive notifications. Your follows still save; try Chrome or the installed app for alerts.</p>}
            {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={turnOn} disabled={busy || !supported}
                className="w-full rounded-xl bg-teal-600 text-white text-sm font-semibold py-3 hover:bg-teal-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                <Bell size={15} /> {busy ? 'Turning on…' : 'Turn on alerts'}
              </button>
              <button type="button" onClick={() => onDone(false)} className="w-full rounded-xl text-slate-600 text-sm font-semibold py-2.5 hover:bg-slate-50">Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
