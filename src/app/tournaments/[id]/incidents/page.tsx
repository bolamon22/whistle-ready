'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast, { Toaster } from 'react-hot-toast'
import Link from 'next/link'
import { TriangleAlert, ChevronLeft, Trash2, Check } from 'lucide-react'
import TrainingLink from '@/components/TrainingLink'

const TYPES = ['Medical', 'Safety', 'Facility', 'Weather', 'Other']
const SEVERITIES = ['Low', 'Medium', 'High']
const sevClass = (s: string) => s === 'High' ? 'bg-red-100 text-red-700' : s === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'

export default function IncidentsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { id } = useParams()
  const { status } = useSession()
  const [incidents, setIncidents] = useState<any[]>([])
  const [type, setType] = useState('Medical')
  const [field, setField] = useState('')
  const [severity, setSeverity] = useState('Medium')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  function load() {
    fetch(`/api/tournaments/${id}/incidents`).then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.incidents)) setIncidents(d.incidents) }).catch(() => {})
  }
  useEffect(() => { if (id) load() }, [id])

  async function submit() {
    if (!description.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tournaments/${id}/incidents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, field, severity, description: description.trim() }),
      })
      if (res.ok) { toast.success('Incident logged'); setDescription(''); setField(''); load() }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Failed') }
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }
  async function resolve(iid: string) {
    try { const r = await fetch(`/api/tournaments/${id}/incidents`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: iid, status: 'resolved' }) }); if (r.ok) load() } catch {}
  }
  async function remove(iid: string) {
    try { const r = await fetch(`/api/tournaments/${id}/incidents?id=${encodeURIComponent(iid)}`, { method: 'DELETE' }); if (r.ok) load() } catch {}
  }

  if (status === 'loading') return <div className="p-10 text-center text-gray-400">Loading…</div>

  const open = incidents.filter(i => i.status !== 'resolved')
  const resolved = incidents.filter(i => i.status === 'resolved')
  const canSubmit = description.trim() && !saving

  return (
    <div className="max-w-2xl mx-auto">
      <Toaster position="top-right" />
      {!embedded && <>
        <Link href={`/tournaments/${id}/dashboard`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Dashboard</Link>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><TriangleAlert size={22} className="text-teal-600" /> Incidents</h1>
        <p className="text-sm text-slate-500 mb-5">Log medical, safety, or facility issues so the team can track and resolve them. For emergencies, call 911 first.</p>
        <TrainingLink id="incidents" className="-mt-3 mb-5" />
      </>}

      {/* report form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <label className="block text-[11px] text-slate-500 mb-1">Field / location (optional)</label>
        <input value={field} onChange={e => setField(e.target.value)} placeholder="e.g. Field 5" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
        <label className="block text-[11px] text-slate-500 mb-1">What happened</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe the incident…" className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-teal-500" />
        <button type="button" onClick={submit} disabled={!canSubmit}
          className={`w-full py-2.5 rounded-xl font-bold ${canSubmit ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>{saving ? 'Logging…' : 'Log incident'}</button>
      </div>

      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Open <span className="text-slate-300">· {open.length}</span></h2>
      {open.length === 0 && <p className="text-sm text-slate-400 mb-4">No open incidents. 🎉</p>}
      <div className="space-y-2 mb-6">
        {open.map(i => (
          <div key={i.id} className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${sevClass(i.severity)}`}>{i.severity}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{i.type}</span>
              {i.field && <span className="text-[11px] text-slate-500">{i.field}</span>}
              <span className="text-[11px] text-slate-400 ml-auto">{i.by} · {new Date(i.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            </div>
            <p className="text-sm text-slate-800">{i.description}</p>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => resolve(i.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-lg"><Check size={13} /> Resolve</button>
              <button type="button" onClick={() => remove(i.id)} className="text-slate-300 hover:text-red-500 ml-auto" title="Delete"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {resolved.length > 0 && (
        <>
          <button type="button" onClick={() => setShowResolved(s => !s)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 mb-2">{showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})</button>
          {showResolved && (
            <div className="space-y-2">
              {resolved.map(i => (
                <div key={i.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 opacity-75">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">Resolved</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{i.type}{i.field ? ` · ${i.field}` : ''}</span>
                    <span className="text-[11px] text-slate-400 ml-auto">{i.by}</span>
                  </div>
                  <p className="text-sm text-slate-600 line-through">{i.description}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
