'use client'

import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TournamentNav from '../TournamentNav'
import InvitePanel from './InvitePanel'
import { Camera, ChevronRight, ExternalLink, Download, Trash2, Check, X, Link2 } from 'lucide-react'

type Sub = { id: string; submittedAt: string; data: any; status?: string; passToken?: string | null }

const LEVEL_LABEL: Record<string, string> = { contribute: 'Contribute', book: 'Bookings', sell: 'Sell' }

function StatusChip({ s }: { s: Sub }) {
  const cls = 'text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 whitespace-nowrap'
  if (s.status === 'approved') return <span className={`${cls} bg-teal-50 text-teal-700 border border-teal-200`}>Credentialed</span>
  if (s.status === 'declined') return <span className={`${cls} bg-slate-100 text-slate-500`}>Declined</span>
  return <span className={`${cls} bg-amber-50 text-amber-700 border border-amber-200`}>Needs review</span>
}

/** The levels they applied for, as short chips. */
function Levels({ data }: { data: any }) {
  const ids: string[] = Array.isArray(data?.levels) ? data.levels : []
  if (!ids.length) return <span className="text-slate-400">&mdash;</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map(i => (
        <span key={i} className="text-[11px] font-semibold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{LEVEL_LABEL[i] || i}</span>
      ))}
    </span>
  )
}

export default function MediaRequestEntries() {
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
    fetch(`/api/tournaments/${id}/media-requests`).then(r => r.ok ? r.json() : { submissions: [] }).then(d => setSubs(Array.isArray(d.submissions) ? d.submissions : [])).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const rows = subs.slice().reverse()
  const pending = subs.filter(s => !s.status).length
  const fmt = (s: string) => { try { return new Date(s).toLocaleString() } catch { return s } }
  const who = (s: Sub) => String(s.data?.company || s.data?.name || 'this applicant')

  // Approving mints the credential token and emails them their pass. Nothing is
  // charged either way, so unlike a vendor there is no amount to confirm first.
  async function act(s: Sub, action: 'approve' | 'decline' | 'reset') {
    if (action === 'approve' && !confirm(`Credential ${who(s)}?\n\nThey'll be emailed their credential page with the field rules and check-in details.`)) return
    if (action === 'decline' && !confirm(`Decline ${who(s)}?\n\nNo email is sent — reply yourself if you want to explain. You can undo this.`)) return
    setActing(s.id)
    try {
      const res = await fetch(`/api/tournaments/${id}/media-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId: s.id, action }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.submission) {
        setSubs(prev => prev.map(x => (x.id === s.id ? { ...x, ...j.submission } : x)))
        if (action === 'approve') {
          alert(j.emailed
            ? `Credentialed. ${who(s)} has been emailed their pass.`
            : `Credentialed — but the email didn't send. Copy their credential link from the row and send it yourself.`)
        }
      } else alert(j.error || 'Could not update that application.')
    } catch { alert('Could not update that application.') } finally { setActing(null) }
  }

  const credLink = (s: Sub) => (s.passToken ? `${window.location.origin}/media/${s.passToken}` : '')
  const copyLink = (s: Sub) => { const l = credLink(s); if (l) { navigator.clipboard?.writeText(l); alert('Credential link copied.') } }

  async function remove(s: Sub) {
    if (!confirm(`Delete the application from "${who(s)}"?\n\nThis can't be undone.`)) return
    setDeleting(s.id)
    try {
      const res = await fetch(`/api/tournaments/${id}/media-requests?subId=${encodeURIComponent(s.id)}`, { method: 'DELETE' })
      if (res.ok) { setSubs(prev => prev.filter(x => x.id !== s.id)); setOpen(null) }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Could not delete that application.') }
    } catch { alert('Could not delete that application.') } finally { setDeleting(null) }
  }

  function Actions({ s }: { s: Sub }) {
    const busy = acting === s.id
    const btn = 'text-xs font-semibold rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50'
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
        {s.data?.portfolio && (
          <a href={/^https?:\/\//i.test(String(s.data.portfolio)) ? String(s.data.portfolio) : `https://${s.data.portfolio}`}
            target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            className={`${btn} text-teal-700 hover:bg-teal-50 border border-teal-200`}>
            <ExternalLink size={13} /> Open portfolio
          </a>
        )}
        {s.status === 'approved' && s.passToken && (
          <button onClick={e => { e.stopPropagation(); copyLink(s) }} className={`${btn} text-slate-600 hover:bg-slate-100 border border-slate-200`}>
            <Link2 size={13} /> Copy credential link
          </button>
        )}
        {s.status !== 'approved' && (
          <button onClick={e => { e.stopPropagation(); act(s, 'approve') }} disabled={busy} className={`${btn} bg-teal-600 hover:bg-teal-700 text-white`}>
            <Check size={13} /> {busy ? 'Working…' : 'Credential & send pass'}
          </button>
        )}
        {s.status !== 'declined' && (
          <button onClick={e => { e.stopPropagation(); act(s, 'decline') }} disabled={busy} className={`${btn} text-slate-600 hover:bg-slate-100 border border-slate-200`}>
            <X size={13} /> Decline
          </button>
        )}
        {(s.status === 'approved' || s.status === 'declined') && (
          <button onClick={e => { e.stopPropagation(); act(s, 'reset') }} disabled={busy} className={`${btn} text-slate-500 hover:bg-slate-100`}>Undo</button>
        )}
        <button onClick={e => { e.stopPropagation(); remove(s) }} disabled={deleting === s.id} className={`${btn} text-red-600 hover:text-red-700 hover:bg-red-50`}>
          <Trash2 size={13} /> {deleting === s.id ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    )
  }

  const exportCsv = () => {
    const cols = ['name', 'company', 'email', 'phone', 'portfolio', 'platforms', 'shoots', 'gear', 'insurance', 'levelNames', 'notes']
    const head = ['Submitted', ...cols, 'Status'].join(',')
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map(s => [fmt(s.submittedAt), ...cols.map(c => s.data?.[c]), s.status || 'needs review'].map(q).join(','))
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'media-credentials.csv'; a.click(); URL.revokeObjectURL(url)
  }

  // The detail list renders whatever the form collected, so a new field shows up
  // without being added here. The humanised key is right most of the time and
  // wrong in a few places -- "Shoots" for stills-or-video, "Gear" for a question
  // that no longer uses that word -- so only those get an override.
  const FIELD_LABELS: Record<string, string> = {
    shoots: 'Stills or video', gear: 'Camera and lenses', portfolio: 'Portfolio',
    platforms: 'Posts on',
    company: 'Business', insurance: 'Liability insurance', notes: 'Anything else',
  }
  const Detail = ({ s }: { s: Sub }) => (
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
      {Object.entries(s.data || {})
        .filter(([k]) => !['tournamentId', 'tournamentName', 'tournamentIds', 'groupId', 'groupSize', 'levels', 'agree'].includes(k))
        .map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1">
            <span className="text-slate-400 flex-shrink-0">{FIELD_LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span>
            <span className="text-slate-700 text-right break-words min-w-0">{String(v || '—')}</span>
          </div>
        ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <TournamentNav id={id} name={name} logoUrl={logo} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 sm:mt-6 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Media credentials</h1>
            <p className="text-sm text-slate-500">
              {subs.length} application{subs.length === 1 ? '' : 's'}{pending > 0 ? ` · ${pending} waiting on you` : ''}.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <Link href={`/tournaments/${id}/shoot`} target="_blank" className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><ExternalLink size={14} /> Open form</Link>
            {subs.length > 0 && <button onClick={exportCsv} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><Download size={14} /> Export CSV</button>}
          </div>
        </div>

        <InvitePanel id={id} />

        {loading ? <p className="text-slate-400 text-center py-16">Loading…</p>
          : subs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
              <Camera size={32} className="mx-auto mb-2" />No credential applications yet.
            </div>
          ) : (
            <>
              {/* Phones: one card per application */}
              <div className="sm:hidden space-y-2">
                {rows.map(s => (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full text-left px-3 py-2.5 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 truncate">{s.data?.company || s.data?.name || '—'}</div>
                        <div className="text-sm text-slate-600 truncate">{s.data?.name || '—'}{s.data?.email ? ` · ${s.data.email}` : ''}</div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">{fmt(s.submittedAt)}</div>
                        <div className="mt-1.5 flex items-center gap-2"><StatusChip s={s} /><Levels data={s.data} /></div>
                      </div>
                      <ChevronRight size={16} className={`text-slate-400 flex-shrink-0 mt-1 transition-transform ${open === s.id ? 'rotate-90' : ''}`} />
                    </button>
                    {open === s.id && (
                      <div className="px-3 py-3 bg-slate-50 border-t border-slate-100"><Detail s={s} /><Actions s={s} /></div>
                    )}
                  </div>
                ))}
              </div>

              <div className="hidden sm:block bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Applicant</th>
                      <th className="px-4 py-2.5 font-semibold">Contact</th>
                      <th className="px-4 py-2.5 font-semibold">Wants to</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">Submitted</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(s => (
                      <Fragment key={s.id}>
                        <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(open === s.id ? null : s.id)}>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{s.data?.company || s.data?.name || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{s.data?.name || '—'}<br /><span className="text-xs text-slate-400">{s.data?.email}</span></td>
                          <td className="px-4 py-2.5"><Levels data={s.data} /></td>
                          <td className="px-4 py-2.5"><StatusChip s={s} /></td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{fmt(s.submittedAt)}</td>
                          <td className="px-4 py-2.5 text-slate-400"><ChevronRight size={15} className={open === s.id ? 'rotate-90 transition-transform' : 'transition-transform'} /></td>
                        </tr>
                        {open === s.id && (
                          <tr><td colSpan={6} className="px-4 py-3 bg-slate-50"><Detail s={s} /><Actions s={s} /></td></tr>
                        )}
                      </Fragment>
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
