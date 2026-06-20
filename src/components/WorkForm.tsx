'use client'

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { CheckCircle2 } from 'lucide-react'

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

function isRefPosition(p: string) { return /referee|official|umpire/i.test(p) }

export default function WorkForm({ orgId, introHtml, positions, refLevels, ageLabel, confirmationTitle, confirmationHtml, tournamentId, tournamentName, days, events, preselect }: {
  orgId: string; introHtml: string; positions: string[]; refLevels: string[]; ageLabel: string
  confirmationTitle: string; confirmationHtml: string; tournamentId?: string; tournamentName?: string; days?: string[]
  events?: { id: string; name: string }[]; preselect?: string
}) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [d, setD] = useState<any>(() => ({ name: '', email: '', phone: '', positions: [] as string[], eventIds: (preselect ? [preselect] : []) as string[], experience: '', certifications: '', refLevel: '', refGender: '', availability: '', availDays: [] as string[], ageConfirm: false, notes: '' }))
  const set = (k: string, v: any) => setD((p: any) => ({ ...p, [k]: v }))
  const togglePos = (p: string) => setD((s: any) => ({ ...s, positions: s.positions.includes(p) ? s.positions.filter((x: string) => x !== p) : [...s.positions, p] }))
  const toggleDay = (day: string) => setD((s: any) => ({ ...s, availDays: s.availDays.includes(day) ? s.availDays.filter((x: string) => x !== day) : [...s.availDays, day] }))
  const toggleEvent = (eid: string) => setD((s: any) => ({ ...s, eventIds: s.eventIds.includes(eid) ? s.eventIds.filter((x: string) => x !== eid) : [...s.eventIds, eid] }))
  const hasEvents = Array.isArray(events) && events.length > 0
  const selectedEventNames = hasEvents ? events!.filter(e => d.eventIds.includes(e.id)).map(e => e.name) : []
  const refSelected = (d.positions as string[]).some(isRefPosition)
  const useDayChecks = Array.isArray(days) && days.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!d.positions.length) { toast.error('Please choose at least one position'); return }
    if (hasEvents && !d.eventIds.length) { toast.error('Please choose at least one event') ; return }
    if (ageLabel && !d.ageConfirm) { toast.error('Please confirm the age requirement'); return }
    setSubmitting(true)
    try {
      const availability = useDayChecks ? d.availDays.join(', ') : d.availability
      const data: any = {
        name: d.name, email: d.email, phone: d.phone,
        positions: (d.positions as string[]).join(', '),
        experience: d.experience, certifications: d.certifications,
        availability, ageConfirm: d.ageConfirm ? 'Yes' : '', notes: d.notes,
        tournamentId: tournamentId || '', tournamentName: tournamentName || '',
      }
      if (hasEvents) data.events = selectedEventNames.join(', ')
      if (refSelected) { data.refLevel = d.refLevel; data.refGender = d.refGender }
      const res = await fetch('/api/org-forms/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, formType: 'staff', data }) })
      if (res.ok) setDone(true)
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Submission failed') }
    } catch { toast.error('Submission failed') } finally { setSubmitting(false) }
  }

  const receiptRows: [string, string][] = [
    ['Name', d.name], ['Email', d.email], ['Phone', d.phone], ['Positions', (d.positions as string[]).join(', ')],
    ['Events', selectedEventNames.join(', ')],
    ['Officiating level', refSelected ? d.refLevel : ''], ['Officiates', refSelected ? d.refGender : ''],
    ['Experience', d.experience], ['Certifications', d.certifications],
    ['Availability', useDayChecks ? d.availDays.join(', ') : d.availability], ['Notes', d.notes],
  ]
  if (done) return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-teal-500" />
        <h1 className="text-2xl font-extrabold text-slate-900 mt-4">{confirmationTitle}</h1>
        <div className="text-slate-500 mt-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: confirmationHtml }} />
      </div>
      <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">Your application</h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {receiptRows.filter(([, v]) => v && String(v).trim()).map(([label, v]) => (
            <div key={label} className="flex justify-between gap-4 text-sm border-b border-slate-50 py-1"><span className="text-slate-400">{label}</span><span className="text-slate-700 text-right">{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <Toaster position="top-right" />
      {introHtml && <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: introHtml }} />}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">About you</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Full name *</label><input className={inputCls} value={d.name} onChange={e => set('name', e.target.value)} required /></div>
          <div><label className={labelCls}>Email *</label><input className={inputCls} type="email" value={d.email} onChange={e => set('email', e.target.value)} required /></div>
          <div><label className={labelCls}>Mobile phone *</label><input className={inputCls} type="tel" value={d.phone} onChange={e => set('phone', e.target.value)} required /></div>
        </div>
      </div>

      {hasEvents && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-bold text-slate-800 mb-1 pb-2 border-b border-slate-100">Which events?</h2>
          <p className="text-xs text-slate-400 mb-3">Select the upcoming events you'd like to work. *</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {events!.map(ev => (
              <label key={ev.id} className={`flex items-center gap-2.5 border rounded-lg p-3 cursor-pointer hover:bg-slate-50 ${d.eventIds.includes(ev.id) ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200'}`}>
                <input type="checkbox" className="accent-teal-500 w-4 h-4" checked={d.eventIds.includes(ev.id)} onChange={() => toggleEvent(ev.id)} />
                <span className="text-sm text-slate-700">{ev.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-1 pb-2 border-b border-slate-100">Positions</h2>
        <p className="text-xs text-slate-400 mb-3">Select all you're interested in. *</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {positions.map(p => (
            <label key={p} className={`flex items-center gap-2.5 border rounded-lg p-3 cursor-pointer hover:bg-slate-50 ${d.positions.includes(p) ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200'}`}>
              <input type="checkbox" className="accent-teal-500 w-4 h-4" checked={d.positions.includes(p)} onChange={() => togglePos(p)} />
              <span className="text-sm text-slate-700">{p}</span>
            </label>
          ))}
        </div>

        {refSelected && (
          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Officiating details</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>Certification level *</label>
                <select className={inputCls} value={d.refLevel} onChange={e => set('refLevel', e.target.value)} required={refSelected}>
                  <option value="">Select…</option>{refLevels.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>I officiate *</label>
                <select className={inputCls} value={d.refGender} onChange={e => set('refGender', e.target.value)} required={refSelected}>
                  <option value="">Select…</option><option>Boys</option><option>Girls</option><option>Both</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100">Experience &amp; availability</h2>
        <div><label className={labelCls}>Relevant experience</label><textarea className={`${inputCls} min-h-[90px]`} value={d.experience} onChange={e => set('experience', e.target.value)} placeholder="Years officiating, scorekeeping, event work, etc." /></div>
        <div><label className={labelCls}>Certifications / credentials</label><input className={inputCls} value={d.certifications} onChange={e => set('certifications', e.target.value)} placeholder="Association, trainer certs, CPR/first aid, etc." /></div>
        <div>
          <label className={labelCls}>Availability{useDayChecks ? ' — which days can you work?' : ''}</label>
          {useDayChecks ? (
            <div className="flex flex-wrap gap-2">
              {days!.map(day => (
                <label key={day} className={`text-sm border rounded-lg px-3 py-1.5 cursor-pointer ${d.availDays.includes(day) ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <input type="checkbox" className="hidden" checked={d.availDays.includes(day)} onChange={() => toggleDay(day)} />{day}
                </label>
              ))}
            </div>
          ) : (
            <textarea className={`${inputCls} min-h-[70px]`} value={d.availability} onChange={e => set('availability', e.target.value)} placeholder="Which days / dates can you work?" />
          )}
        </div>
        <div><label className={labelCls}>Anything else?</label><textarea className={`${inputCls} min-h-[70px]`} value={d.notes} onChange={e => set('notes', e.target.value)} placeholder="Questions, preferred role, references…" /></div>
      </div>

      {ageLabel && (
        <label className="flex items-start gap-3 cursor-pointer bg-white rounded-2xl border border-slate-200 p-5">
          <input type="checkbox" checked={d.ageConfirm} onChange={e => set('ageConfirm', e.target.checked)} className="mt-0.5 accent-teal-500 w-4 h-4" />
          <span className="text-sm text-slate-700">{ageLabel} *</span>
        </label>
      )}

      <button type="submit" disabled={submitting} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-colors">{submitting ? 'Submitting…' : 'Submit application'}</button>
    </form>
  )
}
