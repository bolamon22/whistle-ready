'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TournamentNav from '../TournamentNav'
import { Inbox, ChevronRight, ExternalLink, Download, Trash2, Check, X, Link2 } from 'lucide-react'

type Sub = { id: string; submittedAt: string; data: any; status?: string; amountDue?: number; paymentStatus?: string; passToken?: string | null }

const money = (n?: number) => (Number(n) > 0 ? `$${Number(n).toLocaleString('en-US')}` : '—')

/** Where an application stands, in one chip. Paid outranks approved — that's the state
 *  anyone scanning this list actually cares about. */
function StatusChip({ s }: { s: Sub }) {
  const cls = 'text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 whitespace-nowrap'
  if (s.paymentStatus === 'paid') return <span className={`${cls} bg-teal-600 text-white`}>Paid</span>
  if (s.status === 'approved') return <span className={`${cls} bg-teal-50 text-teal-700 border border-teal-200`}>Approved</span>
  if (s.status === 'declined') return <span className={`${cls} bg-slate-100 text-slate-500`}>Declined</span>
  return <span className={`${cls} bg-amber-50 text-amber-700 border border-amber-200`}>Needs review</span>
}

export default function VendorRequestEntries() {
  const { id } = useParams() as { id: string }
  const [name, setName] = useState('Tournament')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [subs, setSubs] = useState<Sub[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined) } }).catch(() => {})
    fetch(`/api/tournaments/${id}/vendor-requests`).then(r => r.ok ? r.json() : { submissions: [] }).then(d => setSubs(Array.isArray(d.submissions) ? d.submissions : [])).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const rows = subs.slice().reverse()
  const fmt = (s: string) => { try { return new Date(s).toLocaleString() } catch { return s } }

  // Approve / decline. Approving emails the applicant their booth page — the link that
  // carries the packet and the payment — so confirm the amount before it goes out.
  async function act(s: Sub, action: 'approve' | 'decline' | 'reset') {
    const company = s.data?.companyName || 'this company'
    let amount: number | undefined
    if (action === 'approve') {
      const suggested = Number(s.data?.boothFee) || 0
      const typed = prompt(`Booth fee for ${company}?\n\nThey'll be emailed a link to pay this. Leave as-is to use the current price for their booth type.`, suggested ? String(suggested) : '')
      if (typed === null) return
      amount = Number(typed) || 0
    } else if (action === 'decline') {
      if (!confirm(`Decline ${company}?\n\nNothing is charged. You can undo this afterwards.`)) return
    }
    setActing(s.id)
    try {
      const res = await fetch(`/api/tournaments/${id}/vendor-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId: s.id, action, amount }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.submission) {
        setSubs(prev => prev.map(x => (x.id === s.id ? { ...x, ...j.submission } : x)))
        if (action === 'approve') alert(j.emailed ? `Approved. ${company} has been emailed their booth page.` : `Approved — but the email didn't send. Copy their booth link from the row and send it yourself.`)
      } else alert(j.error || 'Could not update that application.')
    } catch { alert('Could not update that application.') } finally { setActing(null) }
  }

  const boothLink = (s: Sub) => (s.passToken ? `${window.location.origin}/vendor/${s.passToken}` : '')
  const copyLink = (s: Sub) => { const l = boothLink(s); if (l) { navigator.clipboard?.writeText(l); alert('Booth link copied.') } }

  /** The approve / decline / copy-link row shown inside an expanded application. */
  function Actions({ s }: { s: Sub }) {
    const busy = acting === s.id
    const btn = 'text-xs font-semibold rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50'
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
        {s.status === 'approved' && s.passToken && (
          <button onClick={e => { e.stopPropagation(); copyLink(s) }} className={`${btn} text-slate-600 hover:bg-slate-100 border border-slate-200`}>
            <Link2 size={13} /> Copy booth link
          </button>
        )}
        {s.status !== 'approved' && (
          <button onClick={e => { e.stopPropagation(); act(s, 'approve') }} disabled={busy} className={`${btn} bg-teal-600 hover:bg-teal-700 text-white`}>
            <Check size={13} /> {busy ? 'Working…' : 'Approve & send link'}
          </button>
        )}
        {s.status !== 'declined' && s.paymentStatus !== 'paid' && (
          <button onClick={e => { e.stopPropagation(); act(s, 'decline') }} disabled={busy} className={`${btn} text-slate-600 hover:bg-slate-100 border border-slate-200`}>
            <X size={13} /> Decline
          </button>
        )}
        {(s.status === 'approved' || s.status === 'declined') && s.paymentStatus !== 'paid' && (
          <button onClick={e => { e.stopPropagation(); act(s, 'reset') }} disabled={busy} className={`${btn} text-slate-500 hover:bg-slate-100`}>
            Undo
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); remove(s) }} disabled={deleting === s.id}
          className={`${btn} text-red-600 hover:text-red-700 hover:bg-red-50`}>
          <Trash2 size={13} /> {deleting === s.id ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    )
  }

  // Deleting is permanent, so confirm first and name the company in the prompt.
  async function remove(s: Sub) {
    if (!confirm(`Delete the vendor request from "${s.data?.companyName || 'this company'}"?\n\nThis can't be undone.`)) return
    setDeleting(s.id)
    try {
      const res = await fetch(`/api/tournaments/${id}/vendor-requests?subId=${encodeURIComponent(s.id)}`, { method: 'DELETE' })
      if (res.ok) { setSubs(prev => prev.filter(x => x.id !== s.id)); setOpen(null) }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Could not delete that request.') }
    } catch { alert('Could not delete that request.') } finally { setDeleting(null) }
  }
  const exportCsv = () => {
    const cols = ['companyName', 'companyContact', 'phone', 'email', 'website', 'level', 'products']
    const head = ['Submitted', ...cols, 'Status', 'Fee', 'Payment'].join(',')
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map(s => [fmt(s.submittedAt), ...cols.map(c => s.data?.[c]), s.status || 'needs review', money(s.amountDue), s.paymentStatus || 'unpaid'].map(esc).join(','))
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'vendor-requests.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <TournamentNav id={id} name={name} logoUrl={logo} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 sm:mt-6 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Vendor requests</h1>
            <p className="text-sm text-slate-500">{subs.length} request{subs.length === 1 ? '' : 's'} for this tournament.</p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <Link href={`/tournaments/${id}/vendor-request`} target="_blank" className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><ExternalLink size={14} /> Open form</Link>
            {subs.length > 0 && <button onClick={exportCsv} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><Download size={14} /> Export CSV</button>}
          </div>
        </div>

        {loading ? <p className="text-slate-400 text-center py-16">Loading…</p>
          : subs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400"><Inbox size={32} className="mx-auto mb-2" />No vendor requests yet.</div>
          ) : (
            <>
            {/* Phones: one card per request */}
            <div className="sm:hidden space-y-2">
              {rows.map(s => (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full text-left px-3 py-2.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate">{s.data?.companyName || '—'}</div>
                      <div className="text-sm text-slate-600 truncate">{s.data?.companyContact || '—'}{s.data?.email ? ` · ${s.data.email}` : ''}</div>
                      <div className="text-xs text-slate-400 truncate">{s.data?.level || '—'} · {fmt(s.submittedAt)}</div>
                      <div className="mt-1.5"><StatusChip s={s} /></div>
                    </div>
                    <ChevronRight size={16} className={`text-slate-400 flex-shrink-0 mt-1 transition-transform ${open === s.id ? 'rotate-90' : ''}`} />
                  </button>
                  {open === s.id && (
                    <div className="px-3 py-3 bg-slate-50 border-t border-slate-100">
                      <div className="grid gap-y-1 text-sm">
                        {Object.entries(s.data || {}).filter(([k]) => !['tournamentId', 'tournamentName', 'agree'].includes(k)).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1"><span className="text-slate-400 capitalize flex-shrink-0">{k.replace(/([A-Z])/g, ' $1')}</span><span className="text-slate-700 text-right break-words min-w-0">{String(v || '—')}</span></div>
                        ))}
                      </div>
                      <Actions s={s} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden sm:block bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                  <tr><th className="px-4 py-2.5 font-semibold">Company</th><th className="px-4 py-2.5 font-semibold">Contact</th><th className="px-4 py-2.5 font-semibold">Level</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Submitted</th><th className="px-4 py-2.5"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(s => (
                    <>
                      <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(open === s.id ? null : s.id)}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{s.data?.companyName || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{s.data?.companyContact || '—'}<br /><span className="text-xs text-slate-400">{s.data?.email}</span></td>
                        <td className="px-4 py-2.5 text-slate-600">{s.data?.level || '—'}</td>
                        <td className="px-4 py-2.5"><StatusChip s={s} />{s.status === 'approved' && <div className="text-xs text-slate-400 mt-1 tabular-nums">{money(s.amountDue)}</div>}</td>
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
                          <Actions s={s} />
                        </td></tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
      </div>
    </div>
  )
}
