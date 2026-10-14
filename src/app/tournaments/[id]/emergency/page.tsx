'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import EventBackLink from '@/components/EventBackLink'
import { Siren, Phone, MapPin, Pencil, Printer, Save, X } from 'lucide-react'
import { EAP_SECTIONS } from '@/lib/emergencyPlan'

// The event's emergency action plan (lib/emergencyPlan, api/tournaments/[id]/emergency).
// Staff open it on a phone in the middle of an emergency, so the read view leads
// with Call 911, the address to give, and tap-to-call numbers. Directors, field
// directors and athletic trainers get Edit.

const tel = (p: string) => p.replace(/[^\d+]/g, '')
const maps = (a: string) => `https://maps.google.com/?q=${encodeURIComponent(a)}`
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500'

export default function EmergencyPlanPage() {
  const { id } = useParams()
  const tid = Array.isArray(id) ? id[0] : String(id)
  const [data, setData] = useState<{ event: string; plan: Record<string, string>; saved: boolean; updatedAt: string | null; updatedBy: string | null; canEdit: boolean } | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  function load() {
    fetch(`/api/tournaments/${encodeURIComponent(tid)}/emergency`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Could not load the plan'); return }
      setData(d); setDraft(d.plan || {})
    }).catch(() => setErr('Could not load the plan'))
  }
  useEffect(load, [tid])

  async function save() {
    setBusy(true)
    const r = await fetch(`/api/tournaments/${encodeURIComponent(tid)}/emergency`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: draft }) }).catch(() => null)
    setBusy(false)
    if (!r?.ok) { const d = r ? await r.json().catch(() => ({})) : {}; toast.error(d.error || 'Could not save'); return }
    toast.success('Emergency plan saved'); setEdit(false); load()
  }

  if (err) return <div className="max-w-2xl mx-auto"><EventBackLink id={tid} /><p className="text-sm text-red-600">{err}</p></div>
  if (!data) return <div className="max-w-2xl mx-auto"><EventBackLink id={tid} /><p className="text-sm text-slate-400">Loading…</p></div>
  const p = data.plan

  const Call = ({ label, name, phone }: { label: string; name?: string; phone?: string }) => !name && !phone ? null : (
    <div className="flex items-center gap-3 py-2 border-t border-slate-100 first:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{name || phone}</p>
      </div>
      {phone && <a href={`tel:${tel(phone)}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold print:hidden"><Phone size={14} /> Call</a>}
      {phone && <span className="hidden print:inline text-sm">{phone}</span>}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <Toaster />
      <div className="print:hidden"><EventBackLink id={tid} /></div>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Siren size={22} className="text-red-600" /> Emergency plan</h1>
        <div className="flex gap-2 print:hidden">
          {!edit && <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-600"><Printer size={14} /> Print</button>}
          {data.canEdit && !edit && <button type="button" onClick={() => { setDraft(p); setEdit(true) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-semibold"><Pencil size={14} /> Edit</button>}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4">{data.event}{data.updatedAt ? ` · Updated ${new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${data.updatedBy ? ` by ${data.updatedBy}` : ''}` : ''}</p>

      {!data.saved && !edit && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm p-3 mb-4">
          This plan hasn&apos;t been filled in for this event yet. {data.canEdit ? 'Tap Edit to add the hospital, AED location and contacts.' : 'Ask the director or athletic trainer to fill it in.'}
        </div>
      )}

      {edit ? (
        <div className="space-y-5">
          {EAP_SECTIONS.map(s => (
            <section key={s.key} className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-800 mb-3">{s.title}</h2>
              <div className="space-y-3">
                {s.fields.map(f => (
                  <label key={f.key} className="block">
                    <span className="text-xs font-semibold text-slate-600">{f.label}</span>
                    {f.hint && <span className="block text-[11px] text-slate-400">{f.hint}</span>}
                    {f.long
                      ? <textarea rows={3} value={draft[f.key] || ''} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} className={`${inputCls} mt-1`} />
                      : <input type={f.phone ? 'tel' : 'text'} value={draft[f.key] || ''} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} className={`${inputCls} mt-1`} />}
                  </label>
                ))}
              </div>
            </section>
          ))}
          <div className="flex gap-2 sticky bottom-3">
            <button type="button" onClick={() => setEdit(false)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600"><X size={15} /> Cancel</button>
            <button type="button" onClick={save} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"><Save size={15} /> {busy ? 'Saving…' : 'Save plan'}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <a href="tel:911" className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-red-600 text-white text-lg font-bold print:hidden"><Phone size={20} /> Call 911</a>
          <section className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-1">Tell 911</p>
            <p className="text-base font-bold text-slate-800">{p.venueName || data.event}</p>
            {p.address && <a href={maps(p.address)} target="_blank" rel="noreferrer" className="text-sm text-slate-700 inline-flex items-start gap-1 mt-0.5"><MapPin size={14} className="mt-0.5 shrink-0" /> {p.address}</a>}
            {p.emsEntrance && <p className="text-sm text-slate-700 mt-2"><span className="font-semibold">Ambulance entrance:</span> {p.emsEntrance}</p>}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Call next</h2>
            <Call label="Medical lead" name={p.medicalLead} phone={p.medicalPhone} />
            <Call label="Director" name={p.directorName} phone={p.directorPhone} />
            <Call label="Emergency room" name={p.erName} phone={p.erPhone} />
            <Call label="Urgent care" name={p.ucName} phone={p.ucPhone} />
            <Call label="Police (non-emergency)" phone={p.police} />
            {p.erAddress && <a href={maps(p.erAddress)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 print:hidden"><MapPin size={14} /> Directions to the ER</a>}
            {p.erAddress && <p className="hidden print:block text-sm">ER: {p.erAddress}</p>}
            {p.ucAddress && <p className="text-xs text-slate-500 mt-1">Urgent care: {p.ucAddress}</p>}
          </section>

          {EAP_SECTIONS.filter(s => s.key !== 'venue' && s.key !== 'care').map(s => {
            const rows = s.fields.filter(f => f.long && p[f.key])
            if (!rows.length) return null
            return (
              <section key={s.key} className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-bold text-slate-800 mb-2">{s.title}</h2>
                <div className="space-y-2.5">
                  {rows.map(f => (
                    <div key={f.key}>
                      <p className="text-xs font-semibold text-slate-500">{f.label}</p>
                      <p className="text-sm text-slate-700 whitespace-pre-line">{p[f.key]}</p>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
