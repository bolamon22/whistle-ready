'use client'

import { useEffect, useState } from 'react'

// "Can ref" filter shared by the Staff roster, Availability and Pay summary tabs.
// One value per tournament, remembered on this device, so picking "Girls refs" on
// the roster still holds after switching to Availability. A ref whose gender is
// "both" counts as a boys ref and a girls ref; other roles (scorekeepers,
// trainers) have no gender and drop out once a ref filter is picked.

export type RefGender = 'all' | 'boys' | 'girls' | 'both'

export const REF_GENDER_OPTIONS: { value: RefGender; label: string }[] = [
  { value: 'all',   label: 'All staff' },
  { value: 'boys',  label: 'Boys refs' },
  { value: 'girls', label: 'Girls refs' },
  { value: 'both',  label: 'Refs who do both' },
]

type W = { roles?: string | null; defaultRole?: string | null; gender?: string | null }

export function workerRoles(w: W): string[] {
  try { const r = JSON.parse(w.roles || '[]'); if (Array.isArray(r) && r.length) return r } catch {}
  return w.defaultRole ? [w.defaultRole] : []
}

export function matchesRefGender(w: W, g: RefGender): boolean {
  if (g === 'all') return true
  if (!workerRoles(w).includes('ref')) return false
  const wg = w.gender || 'both'
  return g === 'both' ? wg === 'both' : wg === g || wg === 'both'
}

export function useRefGender(tournamentId: string): [RefGender, (g: RefGender) => void] {
  const key = 'wr-staff-gender:' + tournamentId
  const [g, setG] = useState<RefGender>('all')
  useEffect(() => {
    try { const v = localStorage.getItem(key) as RefGender | null; if (v && REF_GENDER_OPTIONS.some(o => o.value === v)) setG(v) } catch {}
  }, [key])
  const set = (v: RefGender) => { setG(v); try { localStorage.setItem(key, v) } catch {} }
  return [g, set]
}

export function RefGenderSelect({ value, onChange, className = '' }: { value: RefGender; onChange: (g: RefGender) => void; className?: string }) {
  return (
    <select aria-label="Can ref" className={`select !w-auto min-w-0 text-sm ${value !== 'all' ? '!border-teal-400 !text-teal-800' : ''} ${className}`} value={value} onChange={e => onChange(e.target.value as RefGender)}>
      {REF_GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
