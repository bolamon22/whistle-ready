'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import { CONTACT_CATEGORIES, type ContactView } from '@/lib/contactTypes'
import type { TaskTournament } from '@/lib/taskTemplate'

// Add or edit one event contact. Saves through /api/contacts. A new contact
// opened from a tournament's page starts tagged with that tournament.

const EMPTY: ContactView = {
  id: '', name: '', role: '', company: '', category: 'venue', phone: '', email: '', address: '',
  gives: '', needs: '', notes: '', events: [], everyEvent: false, waiting: '', waitingSince: '', lastContact: '',
}

const input = 'border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-normal text-slate-800 bg-white w-full'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-05-16" -> "May 2026": the year alone didn't tell this May's Summer Kick Off from next May's. */
const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] || ''} ${d.slice(0, 4)}`.trim()
const lbl = 'flex flex-col gap-1 text-xs font-semibold text-slate-600'

export default function ContactForm({ contact, tournaments, today, defaultEvent, onClose, onSaved }: {
  contact: ContactView | null
  tournaments: TaskTournament[]
  today: string
  defaultEvent?: string
  onClose: () => void
  onSaved: (c: ContactView) => void
}) {
  const [f, setF] = useState<ContactView>(() => contact ? { ...contact } : { ...EMPTY, events: defaultEvent ? [defaultEvent] : [] })
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof ContactView>(k: K, v: ContactView[K]) => setF(x => ({ ...x, [k]: v }))
  const toggleEvent = (id: string) => set('events', f.events.includes(id) ? f.events.filter(e => e !== id) : [...f.events, id])
  // Upcoming events, then past ones (newest first) only when asked for or already
  // ticked. Oct 8 2026: past events sat in the same row in the same style, and a
  // new athletic trainer was ticked onto May's Summer Kick Off, one chip over from
  // next year's, so she showed under no upcoming event.
  const [showPast, setShowPast] = useState(false)
  const upcoming = tournaments.filter(t => t.lastDay && t.lastDay >= today)
  const past = tournaments.filter(t => !(t.lastDay && t.lastDay >= today)).sort((a, b) => (b.firstDay || '').localeCompare(a.firstDay || ''))
  const pastShown = past.filter((t, i) => f.events.includes(t.id) || (showPast && i < 6))
  const morePast = !showPast && past.some(t => !f.events.includes(t.id))
  const isUpcoming = (id: string) => upcoming.some(t => t.id === id)
  const onlyPast = !f.everyEvent && f.events.length > 0 && !f.events.some(isUpcoming)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) { toast.error('Add a name'); return }
    setSaving(true)
    try {
      const { id, ...body } = f
      const r = await fetch(contact ? `/api/contacts/${encodeURIComponent(id)}` : '/api/contacts', {
        method: contact ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.contact) throw new Error(d.error || 'Could not save')
      toast.success(contact ? 'Saved' : 'Contact added')
      onSaved(d.contact)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="contact-form-title"
        className="relative w-full sm:max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200">
          <h2 id="contact-form-title" className="flex-1 text-lg font-bold text-slate-800">{contact ? 'Edit contact' : 'Add a contact'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className={lbl}>Name<input ref={nameRef} value={f.name} onChange={e => set('name', e.target.value)} className={input} placeholder="Ryan Hagopian" /></label>
            <label className={lbl}>Title<input value={f.role} onChange={e => set('role', e.target.value)} className={input} placeholder="Athletic Programs Manager" /></label>
            <label className={lbl}>Organization<input value={f.company} onChange={e => set('company', e.target.value)} className={input} placeholder="Village of Wellington" /></label>
            <label className={lbl}>Category
              <select value={f.category} onChange={e => set('category', e.target.value)} className={input}>
                {CONTACT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className={lbl}>Phone<input type="tel" value={f.phone} onChange={e => set('phone', e.target.value)} className={input} /></label>
            <label className={lbl}>Email<input type="email" value={f.email} onChange={e => set('email', e.target.value)} className={input} /></label>
            <label className={`${lbl} sm:col-span-2`}>Address<input value={f.address} onChange={e => set('address', e.target.value)} className={input} /></label>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-slate-600 mb-1.5">Events</legend>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => set('everyEvent', !f.everyEvent)} aria-pressed={f.everyEvent}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${f.everyEvent ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300'}`}>Every event</button>
              {[...upcoming, ...pastShown].map(t => {
                const on = f.events.includes(t.id)
                const old = !isUpcoming(t.id)
                return (
                  <button key={t.id} type="button" onClick={() => toggleEvent(t.id)} aria-pressed={on}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${on ? 'bg-teal-700 text-white border-teal-700' : old ? 'bg-white text-slate-500 border-slate-300 border-dashed' : 'bg-white text-slate-700 border-slate-300'}`}>
                    {t.name}{t.firstDay ? ` · ${monthYear(t.firstDay)}` : ''}{old ? ' (past)' : ''}
                  </button>
                )
              })}
              {morePast && <button type="button" onClick={() => setShowPast(true)} className="px-2 py-1 text-xs font-semibold text-teal-700 hover:underline">Past events…</button>}
            </div>
            {onlyPast && <p className="mt-1.5 text-xs text-amber-700">Only past events are ticked, so this contact won’t show on any upcoming event’s Contacts tab.</p>}
            {!f.everyEvent && !f.events.length && <p className="mt-1.5 text-xs text-slate-500">No event ticked: this contact will show in the directory only.</p>}
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className={lbl}>What we get from them
              <textarea rows={2} value={f.gives} onChange={e => set('gives', e.target.value)} className={`${input} resize-y`} placeholder="Fields, invoice, permit packet…" />
            </label>
            <label className={lbl}>What they need from us
              <textarea rows={2} value={f.needs} onChange={e => set('needs', e.target.value)} className={`${input} resize-y`} placeholder="COI, schedule, team counts…" />
            </label>
          </div>
          <label className={lbl}>Notes
            <textarea rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} className={`${input} resize-y`} placeholder="Payment rules, who signs, what happened last year…" />
          </label>
          <label className={`${lbl} sm:w-1/2`}>Last email or call
            <input type="date" value={f.lastContact} onChange={e => set('lastContact', e.target.value)} className={input} />
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : contact ? 'Save' : 'Add contact'}</button>
        </div>
      </form>
    </div>
  )
}
