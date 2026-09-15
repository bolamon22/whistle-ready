'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TournamentNav from '../TournamentNav'
import { Camera, ChevronRight, Download, Trash2, ExternalLink } from 'lucide-react'

type Sub = { id: string; submittedAt: string; data: any }

const money = (n: any) => (Number(n) > 0 ? `$${Number(n).toLocaleString('en-US')}` : 'Ask')

export default function PhotoRequests() {
  const { id } = useParams() as { id: string }
  const [name, setName] = useState('Tournament')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [subs, setSubs] = useState<Sub[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [who, setWho] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined) } }).catch(() => {})
    fetch(`/api/tournaments/${id}/photo-requests`).then(r => r.ok ? r.json() : { submissions: [] })
      .then(d => setSubs(Array.isArray(d.submissions) ? d.submissions : [])).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const fmt = (s: string) => { try { return new Date(s).toLocaleString() } catch { return s } }

  // Grouped by photographer, because "who booked with them" is the question this
  // page exists to answer.
  const shooters = useMemo(() => {
    const m = new Map<string, number>()
    subs.forEach(s => { const k = String(s.data?.photographerName || '—'); m.set(k, (m.get(k) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [subs])

  const rows = useMemo(
    () => subs.slice().reverse().filter(s => !who || String(s.data?.photographerName || '') === who),
    [subs, who]
  )

  async function remove(s: Sub) {
    if (!confirm(`Delete this booking request?\n\nThis can't be undone.`)) return
    setDeleting(s.id)
    try {
      const r = await fetch(`/api/tournaments/${id}/photo-requests?subId=${encodeURIComponent(s.id)}`, { method: 'DELETE' })
      if (r.ok) { setSubs(p => p.filter(x => x.id !== s.id)); setOpen(null) }
      else alert((await r.json().catch(() => ({}))).error || 'Could not delete that.')
    } catch { alert('Could not delete that.') } finally { setDeleting(null) }
  }

  const exportCsv = () => {
    const cols = ['photographerName', 'packageName', 'packagePrice', 'contactName', 'email', 'phone', 'playerName', 'club', 'division', 'jersey', 'notes']
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map(s => [fmt(s.submittedAt), ...cols.map(c => s.data?.[c])].map(q).join(','))
    const blob = new Blob([[['Submitted', ...cols].join(','), ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'photo-bookings.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <TournamentNav id={id} name={name} logoUrl={logo} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 sm:mt-6 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Photo bookings</h1>
            <p className="text-sm text-slate-500">
              {subs.length} request{subs.length === 1 ? '' : 's'} for this tournament. Families book photographers directly &mdash; this is your record of it.
            </p>
          </div>
          {subs.length > 0 && (
            <button onClick={exportCsv} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><Download size={14} /> Export CSV</button>
          )}
        </div>

        {shooters.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => setWho('')} className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${!who ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>All {subs.length}</button>
            {shooters.map(([n, c]) => (
              <button key={n} onClick={() => setWho(who === n ? '' : n)}
                className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${who === n ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
                {n} {c}
              </button>
            ))}
          </div>
        )}

        {loading ? <p className="text-slate-400 text-center py-16">Loading…</p>
          : subs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
              <Camera size={32} className="mx-auto mb-2" />
              No photo bookings yet.
              <div className="mt-3">
                <Link href={`/dashboard/org/photographers`} className="text-teal-700 font-semibold hover:text-teal-900 text-sm">Manage photographers &rarr;</Link>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Photographer</th>
                    <th className="px-4 py-2.5 font-semibold">Booked by</th>
                    <th className="px-4 py-2.5 font-semibold">Player</th>
                    <th className="px-4 py-2.5 font-semibold">Package</th>
                    <th className="px-4 py-2.5 font-semibold">When</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(s => (
                    <Fragment key={s.id}>
                      <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(open === s.id ? null : s.id)}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{s.data?.photographerName || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{s.data?.contactName || '—'}<br /><span className="text-xs text-slate-400">{s.data?.email}</span></td>
                        <td className="px-4 py-2.5 text-slate-600">{s.data?.playerName || '—'}<br /><span className="text-xs text-slate-400">{[s.data?.club, s.data?.division].filter(Boolean).join(' · ')}</span></td>
                        <td className="px-4 py-2.5 text-slate-600">{s.data?.packageName || '—'}<br /><span className="text-xs text-slate-400 tabular-nums">{money(s.data?.packagePrice)}</span></td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{fmt(s.submittedAt)}</td>
                        <td className="px-4 py-2.5 text-slate-400"><ChevronRight size={15} className={open === s.id ? 'rotate-90 transition-transform' : 'transition-transform'} /></td>
                      </tr>
                      {open === s.id && (
                        <tr><td colSpan={6} className="px-4 py-3 bg-slate-50">
                          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                            {Object.entries(s.data || {})
                              .filter(([k]) => !['tournamentId', 'tournamentName', 'photographerSlug', 'packageId'].includes(k))
                              .map(([k, v]) => (
                                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1">
                                  <span className="text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                                  <span className="text-slate-700 text-right break-words min-w-0">{String(v || '—')}</span>
                                </div>
                              ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
                            {s.data?.photographerSlug && (
                              <a href={`/photographers/${s.data.photographerSlug}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                className="text-xs font-semibold rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 text-teal-700 hover:bg-teal-50 border border-teal-200">
                                <ExternalLink size={13} /> Their page
                              </a>
                            )}
                            {s.data?.email && (
                              <a href={`mailto:${s.data.email}`} onClick={e => e.stopPropagation()}
                                className="text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200">Email the family</a>
                            )}
                            <button onClick={e => { e.stopPropagation(); remove(s) }} disabled={deleting === s.id}
                              className="text-xs font-semibold rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50">
                              <Trash2 size={13} /> {deleting === s.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  )
}
