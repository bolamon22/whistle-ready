'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TournamentNav from '../TournamentNav'
import { Inbox, ChevronRight, ExternalLink, Download } from 'lucide-react'

type Sub = { id: string; submittedAt: string; data: any }

export default function VendorRequestEntries() {
  const { id } = useParams() as { id: string }
  const [name, setName] = useState('Tournament')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [subs, setSubs] = useState<Sub[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined) } }).catch(() => {})
    fetch(`/api/tournaments/${id}/vendor-requests`).then(r => r.ok ? r.json() : { submissions: [] }).then(d => setSubs(Array.isArray(d.submissions) ? d.submissions : [])).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const rows = subs.slice().reverse()
  const fmt = (s: string) => { try { return new Date(s).toLocaleString() } catch { return s } }
  const exportCsv = () => {
    const cols = ['companyName', 'companyContact', 'phone', 'email', 'website', 'level', 'products', 'paymentOption']
    const head = ['Submitted', ...cols].join(',')
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map(s => [fmt(s.submittedAt), ...cols.map(c => s.data?.[c])].map(esc).join(','))
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'vendor-requests.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <TournamentNav id={id} name={name} logoUrl={logo} />
        <div className="flex items-center justify-between mt-6 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Vendor requests</h1>
            <p className="text-sm text-slate-500">{subs.length} request{subs.length === 1 ? '' : 's'} for this tournament.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/tournaments/${id}/vendor-request`} target="_blank" className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><ExternalLink size={14} /> Open form</Link>
            {subs.length > 0 && <button onClick={exportCsv} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-2 inline-flex items-center gap-1.5"><Download size={14} /> Export CSV</button>}
          </div>
        </div>

        {loading ? <p className="text-slate-400 text-center py-16">Loading…</p>
          : subs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400"><Inbox size={32} className="mx-auto mb-2" />No vendor requests yet.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                  <tr><th className="px-4 py-2.5 font-semibold">Company</th><th className="px-4 py-2.5 font-semibold">Contact</th><th className="px-4 py-2.5 font-semibold">Level</th><th className="px-4 py-2.5 font-semibold">Payment</th><th className="px-4 py-2.5 font-semibold">Submitted</th><th className="px-4 py-2.5"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(s => (
                    <>
                      <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(open === s.id ? null : s.id)}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{s.data?.companyName || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{s.data?.companyContact || '—'}<br /><span className="text-xs text-slate-400">{s.data?.email}</span></td>
                        <td className="px-4 py-2.5 text-slate-600">{s.data?.level || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{s.data?.paymentOption || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{fmt(s.submittedAt)}</td>
                        <td className="px-4 py-2.5 text-slate-400"><ChevronRight size={15} className={open === s.id ? 'rotate-90 transition-transform' : 'transition-transform'} /></td>
                      </tr>
                      {open === s.id && (
                        <tr key={s.id + '-d'}><td colSpan={6} className="px-4 py-3 bg-slate-50">
                          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                            {Object.entries(s.data || {}).filter(([k]) => !['tournamentId', 'tournamentName', 'agree'].includes(k)).map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1"><span className="text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="text-slate-700 text-right">{String(v || '—')}</span></div>
                            ))}
                          </div>
                        </td></tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  )
}
