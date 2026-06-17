'use client'

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { CheckCircle2 } from 'lucide-react'

type Fields = { gender: boolean; grade: boolean; teamName: boolean; parent2: boolean; hotelQuestion: boolean; newsletter: boolean }
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

export default function PlayerRegForm({ orgId, fields, waiverTitle, waiverHtml }: { orgId: string; fields: Fields; waiverTitle: string; waiverHtml: string }) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [d, setD] = useState<any>({
    playerName: '', playerEmail: '', usLacrosse: '', dob: '', gender: '', grade: '', teamName: '', jerseyNumber: '',
    parentName: '', parentEmail: '', parentPhone: '',
    parent2Name: '', parent2Email: '', parent2Phone: '',
    emergencyName: '', emergencyPhone: '',
    hotel: '', newsletter: false,
    agree: false, signature: '',
  })
  const set = (k: string, v: any) => setD((p: any) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!d.agree || !d.signature.trim()) { toast.error('Please agree to the waiver and sign'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/org-forms/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, formType: 'player', data: d }) })
      if (res.ok) setDone(true)
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Submission failed') }
    } catch { toast.error('Submission failed') } finally { setSubmitting(false) }
  }

  if (done) return (
    <div className="max-w-xl mx-auto px-6 py-20 text-center">
      <CheckCircle2 size={48} className="mx-auto text-teal-500" />
      <h1 className="text-2xl font-extrabold text-slate-900 mt-4">You're registered!</h1>
      <p className="text-slate-500 mt-2">Thanks, {d.playerName || 'player'}. Your registration and waiver have been received.</p>
    </div>
  )

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <Toaster position="top-right" />

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Player information</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Player full name *</label><input className={inputCls} value={d.playerName} onChange={e => set('playerName', e.target.value)} required /></div>
          <div><label className={labelCls}>Player email</label><input className={inputCls} type="email" value={d.playerEmail} onChange={e => set('playerEmail', e.target.value)} /></div>
          <div><label className={labelCls}>US Lacrosse member # *</label><input className={inputCls} value={d.usLacrosse} onChange={e => set('usLacrosse', e.target.value)} required /></div>
          <div><label className={labelCls}>Date of birth *</label><input className={inputCls} type="date" value={d.dob} onChange={e => set('dob', e.target.value)} required /></div>
          {fields.gender && <div><label className={labelCls}>Gender *</label><select className={inputCls} value={d.gender} onChange={e => set('gender', e.target.value)} required><option value="">Select…</option><option>Female</option><option>Male</option></select></div>}
          {fields.grade && <div><label className={labelCls}>Player grade *</label><select className={inputCls} value={d.grade} onChange={e => set('grade', e.target.value)} required><option value="">Select…</option>{GRADES.map(g => <option key={g}>{g}</option>)}</select></div>}
          {fields.teamName && <div><label className={labelCls}>Team or club name *</label><input className={inputCls} value={d.teamName} onChange={e => set('teamName', e.target.value)} required /></div>}
          <div><label className={labelCls}>Jersey number</label><input className={inputCls} value={d.jerseyNumber} onChange={e => set('jerseyNumber', e.target.value)} /></div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Parent information</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Parent name *</label><input className={inputCls} value={d.parentName} onChange={e => set('parentName', e.target.value)} required /></div>
          <div><label className={labelCls}>Parent email *</label><input className={inputCls} type="email" value={d.parentEmail} onChange={e => set('parentEmail', e.target.value)} required /></div>
          <div><label className={labelCls}>Parent mobile phone *</label><input className={inputCls} type="tel" value={d.parentPhone} onChange={e => set('parentPhone', e.target.value)} required /></div>
        </div>
        {fields.parent2 && (
          <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
            <div><label className={labelCls}>Parent 2 name</label><input className={inputCls} value={d.parent2Name} onChange={e => set('parent2Name', e.target.value)} /></div>
            <div><label className={labelCls}>Parent 2 email</label><input className={inputCls} type="email" value={d.parent2Email} onChange={e => set('parent2Email', e.target.value)} /></div>
            <div><label className={labelCls}>Parent 2 mobile phone</label><input className={inputCls} type="tel" value={d.parent2Phone} onChange={e => set('parent2Phone', e.target.value)} /></div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Emergency contact</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Name *</label><input className={inputCls} value={d.emergencyName} onChange={e => set('emergencyName', e.target.value)} required /></div>
          <div><label className={labelCls}>Phone *</label><input className={inputCls} type="tel" value={d.emergencyPhone} onChange={e => set('emergencyPhone', e.target.value)} required /></div>
        </div>
      </div>

      {fields.hotelQuestion && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <label className={labelCls}>Is your family staying at a hotel or vacation rental during the tournament? *</label>
          <select className={inputCls} value={d.hotel} onChange={e => set('hotel', e.target.value)} required><option value="">Select…</option><option>Yes</option><option>No</option><option>Maybe</option></select>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">{waiverTitle}</h2>
        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 leading-relaxed mb-4 max-h-56 overflow-y-auto" dangerouslySetInnerHTML={{ __html: waiverHtml }} />
        <label className="flex items-start gap-3 cursor-pointer mb-4">
          <input type="checkbox" checked={d.agree} onChange={e => set('agree', e.target.checked)} className="mt-0.5 accent-teal-500 w-4 h-4" />
          <span className="text-sm text-slate-700">I have read and agree to the waiver and release of liability above *</span>
        </label>
        <label className={labelCls}>Type your full name as signature *</label>
        <input className={inputCls} value={d.signature} onChange={e => set('signature', e.target.value)} placeholder="Full legal name" required />
      </div>

      {fields.newsletter && (
        <label className="flex items-start gap-3 cursor-pointer px-1">
          <input type="checkbox" checked={d.newsletter} onChange={e => set('newsletter', e.target.checked)} className="mt-0.5 accent-teal-500 w-4 h-4" />
          <span className="text-sm text-slate-600">Keep me in the loop with updates and offers.</span>
        </label>
      )}

      <button type="submit" disabled={submitting || !d.agree} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-colors">
        {submitting ? 'Submitting…' : 'Submit registration'}
      </button>
    </form>
  )
}
