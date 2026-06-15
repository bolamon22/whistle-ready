'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Phone, MessageSquare, Search, ChevronLeft, Users } from 'lucide-react'

interface Worker { id: string; name: string; email?: string | null; phone?: string | null; defaultRole?: string; isAssigner?: boolean; photoUrl?: string | null }
interface RosterEntry { id: string; worker: Worker }

const ROLE_LABELS: Record<string, string> = {
  ref: 'Referees', scorekeeper: 'Scorekeepers', staff: 'Staff',
  athletic_trainer: 'Athletic Trainers', field_ops: 'Field Ops', director: 'Directors',
}
const roleLabel = (r?: string) => ROLE_LABELS[r || ''] || (r ? r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, ' ') : 'Staff')
const ROLE_ORDER = ['Field Ops', 'Athletic Trainers', 'Scorekeepers', 'Assigners', 'Referees', 'Directors', 'Staff']

export default function DirectoryPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { id } = useParams()
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!id) return
    fetch(`/api/tournaments/${id}/roster`).then(r => r.ok ? r.json() : []).then(d => { setRoster(Array.isArray(d) ? d : []); setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  const groups = useMemo(() => {
    const workers = roster.map(e => e.worker).filter(Boolean)
      .filter(w => !q || w.name.toLowerCase().includes(q.toLowerCase()))
    const byGroup: Record<string, Worker[]> = {}
    for (const w of workers) {
      const g = w.isAssigner ? 'Assigners' : roleLabel(w.defaultRole)
      ;(byGroup[g] ||= []).push(w)
    }
    const keys = Object.keys(byGroup).sort((a, b) => {
      const ia = ROLE_ORDER.indexOf(a), ib = ROLE_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    keys.forEach(k => byGroup[k].sort((a, b) => a.name.localeCompare(b.name)))
    return keys.map(k => ({ label: k, people: byGroup[k] }))
  }, [roster, q])

  const total = roster.length

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto">
      {!embedded && <>
        <Link href={`/tournaments/${id}/dashboard`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Dashboard</Link>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><Users size={22} className="text-teal-600" /> Staff directory</h1>
      </>}
      <p className="text-sm text-slate-500 mb-4">{total} staff on this tournament’s roster. Tap to call or text.</p>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search staff…"
          className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>

      {total === 0 && <p className="text-sm text-slate-400">No staff on the roster yet. Add them under Roster.</p>}
      {total > 0 && groups.length === 0 && <p className="text-sm text-slate-400">No staff match “{q}”.</p>}

      <div className="space-y-5">
        {groups.map(g => (
          <div key={g.label}>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{g.label} <span className="text-slate-300">· {g.people.length}</span></h2>
            <div className="space-y-2">
              {g.people.map(w => (
                <div key={w.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                  {w.photoUrl
                    ? <img src={w.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-100 flex-shrink-0" />
                    : <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 font-bold flex items-center justify-center flex-shrink-0">{w.name?.[0]?.toUpperCase() || '?'}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{w.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{w.isAssigner ? 'Assigner' : roleLabel(w.defaultRole).replace(/s$/, '')}{w.phone ? ` · ${w.phone}` : ''}</p>
                  </div>
                  {w.phone ? (
                    <div className="flex gap-2 flex-shrink-0">
                      <a href={`tel:${w.phone}`} title={`Call ${w.name}`} className="w-9 h-9 rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center"><Phone size={15} /></a>
                      <a href={`sms:${w.phone}`} title={`Text ${w.name}`} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"><MessageSquare size={15} /></a>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 flex-shrink-0">no #</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
