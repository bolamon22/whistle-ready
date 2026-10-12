'use client'
import { useEffect, useState } from 'react'
import { Bell, BellRing, Share, PlusSquare, Smartphone } from 'lucide-react'
import { pushSupport, isIOS, currentSubscription, subscribeThisBrowser, deviceLabel } from '@/lib/pushClient'

// Turn on game-day alerts (field requests) for THIS phone, and pick which
// requests buzz it. iPhones only allow web alerts once the site is on the Home
// Screen, so they get the steps instead of a button until then.

const GROUPS: { key: string; label: string; hint: string }[] = [
  { key: 'medical', label: 'Medical', hint: 'Trainer needed' },
  { key: 'fieldops', label: 'Field Ops', hint: 'Balls, water, equipment' },
  { key: 'refs', label: 'Refs', hint: 'Ref needed' },
  { key: 'scorekeepers', label: 'Scorekeepers', hint: 'Scorer requests' },
  { key: 'assigners', label: 'Assigners', hint: 'Staffing problems' },
]

type State = 'loading' | 'install' | 'unsupported' | 'off' | 'on' | 'blocked'

export default function StaffAlerts({ tournamentId, compact = false }: { tournamentId?: string; compact?: boolean }) {
  const [state, setState] = useState<State>('loading')
  const [groups, setGroups] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [endpoint, setEndpoint] = useState('')

  useEffect(() => {
    const sup = pushSupport()
    if (sup.needsInstall) { setState('install'); return }
    if (!sup.supported) { setState('unsupported'); return }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') { setState('blocked'); return }
    ;(async () => {
      const sub = await currentSubscription()
      const ep = sub?.endpoint || ''
      setEndpoint(ep)
      const d = await fetch(`/api/staff-alerts${ep ? `?endpoint=${encodeURIComponent(ep)}` : ''}`).then(r => r.ok ? r.json() : null).catch(() => null)
      if (d?.subscribed) { setGroups(d.groups || []); setState('on') }
      else { setGroups(d?.defaultGroups || GROUPS.map(g => g.key)); setState('off') }
    })()
  }, [])

  async function turnOn() {
    setBusy(true); setMsg('')
    try {
      const r = await subscribeThisBrowser()
      if (!r.ok) { setState(r.reason === 'denied' ? 'blocked' : 'unsupported'); setBusy(false); return }
      const res = await fetch('/api/staff-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: r.subscription, groups, label: deviceLabel(), tournamentId }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not turn alerts on')
      setEndpoint(String(r.subscription.endpoint || ''))
      setState('on'); setMsg('Alerts are on for this phone.')
      try { localStorage.removeItem('wr-alerts-nudge') } catch {}
    } catch (e: any) { setMsg(e?.message || 'Could not turn alerts on') }
    setBusy(false)
  }
  async function toggleGroup(k: string) {
    const next = groups.includes(k) ? groups.filter(g => g !== k) : [...groups, k]
    setGroups(next)
    if (state === 'on' && endpoint) {
      await fetch('/api/staff-alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint, groups: next }) }).catch(() => {})
    }
  }
  async function test() {
    setMsg('')
    const r = await fetch('/api/staff-alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) }).then(x => x.json()).catch(() => null)
    setMsg(r?.ok ? 'Test sent — it should pop up in a few seconds.' : 'The test did not go through. Try turning alerts off and on again.')
  }
  async function turnOff() {
    setBusy(true)
    await fetch('/api/staff-alerts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) }).catch(() => {})
    setState('off'); setMsg('Alerts are off for this phone.'); setBusy(false)
  }

  if (state === 'loading') return null

  return (
    <div className={`rounded-2xl border ${state === 'on' ? 'border-teal-200 bg-teal-50/60' : 'border-amber-200 bg-amber-50/70'} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-2">
        {state === 'on' ? <BellRing size={18} className="text-teal-700" /> : <Bell size={18} className="text-amber-700" />}
        <p className="font-bold text-slate-900">{state === 'on' ? 'Game-day alerts are on' : 'Get game-day alerts on this phone'}</p>
      </div>
      <p className="text-sm text-slate-600 mt-1">Field requests (trainer, balls, water, ref needed) buzz your phone, and you hear when someone is on the way to yours.</p>

      {state === 'install' && (
        <ol className="mt-3 space-y-2 text-sm text-slate-800">
          <li className="flex items-start gap-2"><span className="font-bold text-amber-700">1</span><span>Tap <Share size={14} className="inline -mt-0.5" /> <strong>Share</strong> at the bottom of Safari.</span></li>
          <li className="flex items-start gap-2"><span className="font-bold text-amber-700">2</span><span>Tap <PlusSquare size={14} className="inline -mt-0.5" /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</span></li>
          <li className="flex items-start gap-2"><span className="font-bold text-amber-700">3</span><span>Open <strong>Whistle Ready</strong> from your Home Screen, sign in, and tap <strong>Turn on alerts</strong> there.</span></li>
          <li className="text-xs text-slate-500 pl-5">iPhones only allow website alerts this way. Android phones can turn them on right here.</li>
        </ol>
      )}
      {state === 'unsupported' && <p className="mt-2 text-sm text-slate-600"><Smartphone size={14} className="inline -mt-0.5" /> This browser can&apos;t get alerts. Try Chrome on Android, or Safari from the Home Screen on iPhone.</p>}
      {state === 'blocked' && <p className="mt-2 text-sm text-slate-700">Notifications are blocked for this site. Allow them in your phone&apos;s Settings for Whistle Ready (or this browser), then reload.</p>}

      {(state === 'off' || state === 'on') && (
        <>
          <p className="text-xs font-semibold text-slate-500 mt-3 mb-1.5">Alert me for</p>
          <div className="flex flex-wrap gap-1.5">
            {GROUPS.map(g => {
              const on = groups.includes(g.key)
              return (
                <button key={g.key} type="button" onClick={() => toggleGroup(g.key)} aria-pressed={on} title={g.hint}
                  className={`px-3 py-2 rounded-full text-sm font-semibold border transition-colors ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{g.label}</button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">&quot;All staff&quot; requests reach everyone with alerts on.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {state === 'off' ? (
              <button type="button" onClick={turnOn} disabled={busy || groups.length === 0}
                className="px-5 py-2.5 rounded-full bg-teal-600 hover:bg-teal-700 text-white font-bold disabled:opacity-50">{busy ? 'Turning on…' : 'Turn on alerts'}</button>
            ) : (
              <>
                <button type="button" onClick={test} className="px-4 py-2 rounded-full bg-white border border-slate-300 text-slate-700 font-semibold text-sm">Send a test</button>
                <button type="button" onClick={turnOff} disabled={busy} className="px-4 py-2 rounded-full text-slate-500 font-semibold text-sm hover:text-red-600">Turn off</button>
              </>
            )}
          </div>
        </>
      )}
      {msg && <p className="text-sm text-slate-700 mt-2">{msg}</p>}
      {isIOS() && state === 'on' && <p className="text-[11px] text-slate-500 mt-2">Keep Whistle Ready on your Home Screen; deleting it turns alerts off.</p>}
    </div>
  )
}
