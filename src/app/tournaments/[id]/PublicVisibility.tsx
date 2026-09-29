'use client'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Globe, ChevronDown } from 'lucide-react'

// The two Publish switches for the public schedule page (see lib/publicView.ts).
// Used on the Divisions sidebar (card) and in the Scheduler header (compact).

export type Vis = 'live' | 'hidden'
export interface Visibility { pools: Vis; schedule: Vis; publishedAt: string | null }

export function usePublicVisibility(tournamentId: string, refreshKey?: unknown) {
  const [vis, setVis] = useState<Visibility | null>(null)
  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/visibility`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.pools) setVis({ pools: d.pools, schedule: d.schedule, publishedAt: d.publishedAt ?? null }) })
      .catch(() => {})
  }, [tournamentId, refreshKey])
  async function update(patch: Partial<Pick<Visibility, 'pools' | 'schedule'>>) {
    const res = await fetch(`/api/tournaments/${tournamentId}/visibility`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    const d = await res.json().catch(() => null)
    if (!res.ok || !d?.pools) { toast.error(d?.error || 'Could not change what the public sees'); return }
    setVis({ pools: d.pools, schedule: d.schedule, publishedAt: d.publishedAt ?? null })
    return d as Visibility
  }
  return { vis, update }
}

function Switch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} disabled={disabled}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-green-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Rows({ tournamentId, vis, update, busy, setBusy }: {
  tournamentId: string; vis: Visibility; update: (p: Partial<Pick<Visibility, 'pools' | 'schedule'>>) => Promise<unknown>
  busy: boolean; setBusy: (b: boolean) => void
}) {
  async function flip(key: 'pools' | 'schedule') {
    const next: Vis = vis[key] === 'live' ? 'hidden' : 'live'
    setBusy(true)
    let d: unknown
    if (key === 'schedule' && next === 'live' && !vis.publishedAt) {
      // Never published: going live means publishing now, which fixes the times the
      // public sees.
      const r = await fetch(`/api/tournaments/${tournamentId}/publish`, { method: 'POST' })
      d = r.ok ? await update({ schedule: 'live' }) : null
      if (!r.ok) toast.error('Could not publish the schedule')
    } else {
      d = await update({ [key]: next })
    }
    setBusy(false)
    if (d) toast.success(key === 'pools'
      ? (next === 'live' ? 'Teams & pools are public' : 'Teams & pools hidden from the public')
      : (next === 'live' ? 'Schedule is public (last published version)' : 'Schedule hidden from the public'))
  }
  const row = (key: 'pools' | 'schedule', label: string, hint: string) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          {vis[key] === 'live' ? <Eye size={13} className="text-green-600" /> : <EyeOff size={13} className="text-slate-400" />}
          {label}
        </p>
        <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{hint}</p>
      </div>
      <Switch on={vis[key] === 'live'} onClick={() => flip(key)} disabled={busy} />
    </div>
  )
  return (
    <div className="divide-y divide-slate-100">
      {row('pools', 'Teams & pools', 'Pool lists and standings')}
      {row('schedule', 'Schedule & brackets', vis.publishedAt
        ? `Times and fields as of the last Publish (${new Date(vis.publishedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})`
        : 'Not published yet. Turning this on publishes the current schedule')}
    </div>
  )
}

/** Card for the Divisions sidebar. */
export function PublicVisibilityCard({ tournamentId }: { tournamentId: string }) {
  const { vis, update } = usePublicVisibility(tournamentId)
  const [busy, setBusy] = useState(false)
  if (!vis) return null
  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1.5"><Globe size={12} /> Public page</p>
      <Rows tournamentId={tournamentId} vis={vis} update={update} busy={busy} setBusy={setBusy} />
    </div>
  )
}

/** Compact pill + dropdown for the Scheduler header. */
export function PublicVisibilityMenu({ tournamentId, vis, update }: {
  tournamentId: string; vis: Visibility | null; update: (p: Partial<Pick<Visibility, 'pools' | 'schedule'>>) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  if (!vis) return null
  const label = vis.schedule === 'live' ? 'Public: schedule' : vis.pools === 'live' ? 'Public: pools only' : 'Public: hidden'
  const tone = vis.schedule === 'live' ? 'text-green-700 border-green-200 bg-green-50' : vis.pools === 'live' ? 'text-sky-700 border-sky-200 bg-sky-50' : 'text-slate-600 border-slate-300 bg-white'
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} title="What the public schedule page shows"
        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1 whitespace-nowrap ${tone}`}>
        {vis.schedule === 'live' || vis.pools === 'live' ? <Eye size={13} /> : <EyeOff size={13} />} {label} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50">
          <Rows tournamentId={tournamentId} vis={vis} update={update} busy={busy} setBusy={setBusy} />
          <p className="text-[11px] text-slate-400 mt-2 leading-snug">Scores always update live. Moving games stays private until you Publish again.</p>
        </div>
      )}
    </div>
  )
}
