'use client'

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { CheckCircle2 } from 'lucide-react'

type Fields = { gender: boolean; grade: boolean; teamName: boolean; parent2: boolean; hotelQuestion: boolean; newsletter: boolean }
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

export type ClubOption = { name: string; teams: { name: string; division: string }[] }

export default function PlayerRegForm({ orgId, fields, waiverTitle, waiverHtml, confirmationTitle, confirmationHtml, teams, clubs, tournamentId, tournamentName }: { orgId: string; fields: Fields; waiverTitle: string; waiverHtml: string; confirmationTitle: string; confirmationHtml: string; teams?: string[]; clubs?: ClubOption[]; tournamentId?: string; tournamentName?: string }) {
  // Tournament forms pass the registered clubs with their teams: the parent picks the club,
  // then the team on it, and we store "Club — Team" so staff rosters line up exactly.
  const clubMode = !!clubs && clubs.length > 0
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [d, setD] = useState<any>({
    playerName: '', playerEmail: '', usLacrosse: '', dob: '', gender: '', grade: '', teamName: '', teamOther: '', clubName: '', teamPick: '', jerseyNumber: '',
    parentName: '', parentEmail: '', parentPhone: '',
    parent2Name: '', parent2Email: '', parent2Phone: '',
    emergencyName: '', emergencyPhone: '',
    hotel: '', hotelName: '', newsletter: false,
    agree: false, signature: '',
  })
  const set = (k: string, v: any) => setD((p: any) => ({ ...p, [k]: v }))
  const clubTeams = clubMode ? (clubs!.find(c => c.name === d.clubName)?.teams ?? []) : []
  const resolvedTeam: string = (() => {
    const other = String(d.teamOther || '').trim()
    if (clubMode) {
      if (d.clubName === '__other') return other
      if (!d.clubName) return ''
      if (d.teamPick === '__other') return other ? `${d.clubName} — ${other}` : d.clubName
      return d.teamPick ? `${d.clubName} — ${d.teamPick}` : d.clubName
    }
    return d.teamName === '__other' ? other : d.teamName
  })()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!d.agree || !d.signature.trim()) { toast.error('Please agree to the waiver and sign'); return }
    if (fields.teamName && clubMode && !d.clubName) { toast.error('Please select your club'); return }
    if (fields.teamName && clubMode && d.clubName !== '__other' && clubTeams.length > 0 && !d.teamPick) { toast.error('Please select your team'); return }
    if ((d.teamName === '__other' || d.clubName === '__other' || d.teamPick === '__other') && !String(d.teamOther || '').trim()) { toast.error('Please enter your team or club name'); return }
    setSubmitting(true)
    try {
      // "Other / not listed" stores the typed name, not the sentinel, so staff rosters read properly.
      const rest: any = { ...d }; delete rest.teamPick; delete rest.teamOther
      const data = { ...rest, teamName: resolvedTeam, clubName: clubMode && d.clubName !== '__other' ? d.clubName : '', tournamentId: tournamentId || '', tournamentName: tournamentName || '' }
      const res = await fetch('/api/org-forms/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, formType: 'player', data }) })
      if (res.ok) setDone(true)
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Submission failed') }
    } catch { toast.error('Submission failed') } finally { setSubmitting(false) }
  }

  const receiptRows: [string, string][] = [
    ['Player name', d.playerName], ['Player email', d.playerEmail], ['US Lacrosse #', d.usLacrosse], ['Date of birth', d.dob],
    ['Gender', d.gender], ['Grade', d.grade], ['Team', resolvedTeam], ['Jersey #', d.jerseyNumber],
    ['Parent', d.parentName], ['Parent email', d.parentEmail], ['Parent phone', d.parentPhone],
    ['Parent 2', d.parent2Name], ['Parent 2 email', d.parent2Email], ['Parent 2 phone', d.parent2Phone],
    ['Emergency contact', d.emergencyName], ['Emergency phone', d.emergencyPhone],
    ['Hotel / rental', d.hotel], ['Where staying', d.hotelName], ['Signature', d.signature],
  ]
  if (done) return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-teal-500" />
        <h1 className="text-2xl font-extrabold text-slate-900 mt-4">{confirmationTitle}</h1>
        <div className="text-slate-500 mt-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: confirmationHtml }} />
      </div>

      <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">Your submission</h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {receiptRows.filter(([, v]) => v && String(v).trim()).map(([label, v]) => (
            <div key={label} className="flex justify-between gap-4 text-sm border-b border-slate-50 py-1">
              <span className="text-slate-400">{label}</span><span className="text-slate-700 text-right">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 bg-teal-50 border border-teal-200 rounded-2xl p-5 text-center">
        <h3 className="font-bold text-slate-900">Create a parent account</h3>
        <p className="text-sm text-slate-600 mt-1">Manage your players, register faster for future tournaments, and update details anytime.</p>
        <a href={`/register?role=parent&name=${encodeURIComponent(d.parentName || d.playerName || '')}&email=${encodeURIComponent(d.parentEmail || d.playerEmail || '')}`}
          className="inline-block mt-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-2.5 rounded-full transition-colors">Create a parent account</a>
      </div>
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
          {fields.teamName && clubMode && (
            <>
              <div><label className={labelCls}>Club *</label>
                <select className={inputCls} value={d.clubName} onChange={e => { const c = e.target.value; setD((p: any) => ({ ...p, clubName: c, teamPick: '', teamOther: '' })) }} required>
                  <option value="">Select your club…</option>
                  {clubs!.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  <option value="__other">Other / not listed</option>
                </select>
              </div>
              {d.clubName && d.clubName !== '__other' && clubTeams.length > 0 && (
                <div><label className={labelCls}>Team *</label>
                  <select className={inputCls} value={d.teamPick} onChange={e => set('teamPick', e.target.value)} required>
                    <option value="">Select your team…</option>
                    {clubTeams.map(t => <option key={t.name} value={t.name}>{t.name}{t.division ? ` · ${t.division}` : ''}</option>)}
                    <option value="__other">Other / not listed</option>
                  </select>
                </div>
              )}
              {(d.clubName === '__other' || d.teamPick === '__other') && (
                <div><label className={labelCls}>{d.clubName === '__other' ? 'Enter your club and team name *' : 'Enter your team name *'}</label>
                  <input className={inputCls} value={d.teamOther} onChange={e => set('teamOther', e.target.value)} placeholder={d.clubName === '__other' ? 'e.g. Tampa Elite 2031' : 'e.g. 2031 Blue'} required />
                </div>
              )}
            </>
          )}
          {fields.teamName && !clubMode && <div><label className={labelCls}>Team or club name *</label>{teams && teams.length > 0
            ? <select className={inputCls} value={d.teamName} onChange={e => set('teamName', e.target.value)} required><option value="">Select your team…</option>{teams.map(tm => <option key={tm} value={tm}>{tm}</option>)}<option value="__other">Other / not listed</option></select>
            : <input className={inputCls} value={d.teamName} onChange={e => set('teamName', e.target.value)} required />}</div>}
          {fields.teamName && !clubMode && d.teamName === '__other' && <div><label className={labelCls}>Enter your team or club name *</label><input className={inputCls} value={d.teamOther} onChange={e => set('teamOther', e.target.value)} placeholder="e.g. Tampa Elite 2031" required /></div>}
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
          {d.hotel === 'Yes' && <div className="mt-3"><label className={labelCls}>Which hotel / where are you staying? *</label><input className={inputCls} value={d.hotelName} onChange={e => set('hotelName', e.target.value)} placeholder="Hotel or rental name" required /></div>}
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
