'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { PAY_GROUPS, type PayGroup } from '@/lib/payGroups'

// Which staff pay one assigner sees on Staff pay, Assignments, the roster and the
// Staff Pool (lib/payGroups). Each click saves. Tick all four when one person runs
// everybody. Used on Users (admin) and Your team (director).
export default function AssignerPayAccess({ userId, groups, custom, onSaved }: {
  userId: string
  groups: PayGroup[]
  custom?: boolean
  onSaved?: (groups: PayGroup[]) => void
}) {
  const [sel, setSel] = useState<PayGroup[]>(groups)
  const [isCustom, setIsCustom] = useState(!!custom)
  const [busy, setBusy] = useState(false)

  async function toggle(g: PayGroup) {
    const before = sel
    const next = sel.includes(g) ? sel.filter(x => x !== g) : [...sel, g]
    setSel(next); setBusy(true)
    try {
      const res = await fetch('/api/assigner-pay', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, groups: next }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setSel(before); toast.error(d?.error || 'That didn’t save. Please try again.'); return }
      const saved: PayGroup[] = Array.isArray(d?.groups) ? d.groups : next
      setSel(saved); setIsCustom(true); onSaved?.(saved)
      toast.success('Pay access saved')
    } catch {
      setSel(before); toast.error('That didn’t save. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Pay access">
      <span className="text-[11px] font-semibold text-slate-500 mr-0.5">Sees pay for</span>
      {PAY_GROUPS.map(g => {
        const on = sel.includes(g.value)
        return (
          <button key={g.value} type="button" disabled={busy} onClick={() => toggle(g.value)} title={g.hint} aria-pressed={on}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-60 ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-700'}`}>
            {on ? '✓ ' : ''}{g.label}
          </button>
        )
      })}
      {!isCustom && <span className="text-[11px] text-slate-400">Default until you pick</span>}
      {sel.length === 0 && <span className="text-[11px] text-amber-700">No staff pay</span>}
    </div>
  )
}
