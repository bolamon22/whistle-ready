'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { year, type CostView } from '@/lib/costTypes'

// Loads cost lines (one event's and its vendors' past ones, or one vendor's)
// and saves changes, the way useContacts does.

export type CostEvent = { id: string; name: string; firstDay: string }
export type CostsData = { costs: CostView[]; tournaments: CostEvent[] }

/** "Monster Mash 2026", "Fall Classic 2023, Tamarac" -- what a line was for. */
export function costLabel(c: CostView, tournaments: CostEvent[]): string {
  const t = c.tournamentId ? tournaments.find(x => x.id === c.tournamentId) : null
  const name = t?.name || c.eventLabel || 'Event'
  const y = year(c.eventDate || c.quoteDate)
  return y && !name.includes(y) ? `${name} ${y}` : name
}

export function useCosts(q: { tournamentId?: string; contactId?: string }) {
  const [data, setData] = useState<CostsData | null>(null)
  const [failed, setFailed] = useState('')
  const qs = q.tournamentId ? `tournamentId=${encodeURIComponent(q.tournamentId)}` : q.contactId ? `contactId=${encodeURIComponent(q.contactId)}` : ''

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/costs${qs ? `?${qs}` : ''}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setFailed(d.error || 'Could not load costs'); return }
      setData({ costs: d.costs || [], tournaments: d.tournaments || [] })
      setFailed('')
    } catch { setFailed('Could not load costs') }
  }, [qs])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('costs-changed', load)
    return () => window.removeEventListener('costs-changed', load)
  }, [load])

  const save = useCallback(async (id: string | null, body: Partial<CostView>): Promise<CostView | null> => {
    try {
      const r = await fetch(id ? `/api/costs/${encodeURIComponent(id)}` : '/api/costs', {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.cost) throw new Error(d.error || 'Could not save')
      setData(cur => cur && { ...cur, costs: id ? cur.costs.map(c => c.id === id ? d.cost : c) : [d.cost, ...cur.costs] })
      window.dispatchEvent(new Event('costs-changed'))
      return d.cost
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
      return null
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/costs/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not delete')
      setData(cur => cur && { ...cur, costs: cur.costs.filter(c => c.id !== id) })
      window.dispatchEvent(new Event('costs-changed'))
      toast.success('Cost deleted')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete') }
  }, [])

  return { data, failed, load, save, remove }
}
