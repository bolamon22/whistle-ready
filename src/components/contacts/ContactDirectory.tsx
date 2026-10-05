'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, BookUser, Plus, Search, Send, Upload } from 'lucide-react'
import { CONTACT_CATEGORIES, contactHaystack, isNoReply, type ContactRow } from '@/lib/contactTypes'
import { announceTasksChanged } from '@/lib/taskTemplate'
import { useContacts } from './useContacts'
import ContactForm from './ContactForm'
import SendDocumentDialog from './SendDocumentDialog'
import VendorEmailDialog from './VendorEmailDialog'
import { CatDot, ContactDetail, ContactListRow, shortName } from './ContactParts'

// The org's Event contacts directory (/contacts): everyone we get something
// from or owe something to, grouped by category, filterable by event. Click a
// contact for its details beside the list (on a phone, in a sheet).

type Attention = '' | 'us' | 'noreply' | 'open'

export default function ContactDirectory() {
  const { data, failed, load, upsert, patch, remove } = useContacts()
  const [q, setQ] = useState('')
  const [event, setEvent] = useState('all')        // 'all' | 'every' | tournament id
  const [cat, setCat] = useState('')
  const [attention, setAttention] = useState<Attention>('')
  const [selId, setSelId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ContactRow | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [sending, setSending] = useState<{ contactId?: string } | null>(null)
  const [writing, setWriting] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // A link can open one contact (?c=<id>).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c')
    if (c) setSelId(c)
  }, [])

  const today = data?.today || ''
  const tournaments = useMemo(() => data?.tournaments || [], [data])
  const upcoming = tournaments.filter(t => t.lastDay && t.lastDay >= today)
  const all = useMemo(() => data?.contacts || [], [data])

  const counts = {
    us: all.filter(c => c.waiting === 'us').length,
    noreply: all.filter(c => isNoReply(c, today)).length,
    open: all.reduce((n, c) => n + c.openTasks.length, 0),
  }

  const shown = all.filter(c => {
    if (event === 'every' && !c.everyEvent) return false
    if (event !== 'all' && event !== 'every' && !(c.everyEvent || c.events.includes(event))) return false
    if (cat && c.category !== cat) return false
    if (attention === 'us' && c.waiting !== 'us') return false
    if (attention === 'noreply' && !isNoReply(c, today)) return false
    if (attention === 'open' && !c.openTasks.length) return false
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length) { const h = contactHaystack(c); if (!words.every(w => h.includes(w))) return false }
    return true
  })
  const groups = CONTACT_CATEGORIES.map(k => ({ ...k, items: shown.filter(c => c.category === k.key) })).filter(g => g.items.length)
  const selected = selId ? all.find(c => c.id === selId) || null : null

  async function importFile(file: File) {
    setImporting(true)
    try {
      let body: unknown
      try { body = JSON.parse(await file.text()) } catch { throw new Error('That file isn’t a contacts file (.json)') }
      const r = await fetch('/api/contacts/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not import')
      const parts = [`${d.added} contacts added`]
      if (d.skipped) parts.push(`${d.skipped} already here`)
      if (d.tasksAdded || d.tasksSkipped) parts.push(`${d.tasksAdded} tasks added${d.tasksSkipped ? ` (${d.tasksSkipped} skipped)` : ''}`)
      toast.success(parts.join(' · '), { duration: 6000 })
      if (d.unmatched?.length) toast.error(`No tournament matched: ${d.unmatched.join(', ')}`, { duration: 8000 })
      await load()
      if (d.tasksAdded) announceTasksChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not import')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const chip = (on: boolean) => `whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold border ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`
  const tile = (key: Attention, n: number, label: string, tone: string, border: string) => (
    <button type="button" onClick={() => setAttention(a => a === key ? '' : key)} aria-pressed={attention === key}
      className={`text-left bg-white rounded-xl px-3 py-2.5 border ${attention === key ? 'ring-2 ring-teal-500 border-teal-500' : n ? border : 'border-slate-200'}`}>
      <div className={`text-2xl font-bold ${n ? tone : 'text-slate-400'}`}>{n}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </button>
  )
  const detail = (c: ContactRow, close?: () => void) => (
    <ContactDetail c={c} tournaments={tournaments} today={today}
      tournamentId={event !== 'all' && event !== 'every' ? event : undefined}
      onPatch={body => patch(c, body)} onEdit={() => setEditing(c)}
      onDelete={() => { setSelId(null); remove(c) }} onClose={close}
      onSend={() => setSending({ contactId: c.id })} onWrite={() => setWriting(c.id)} />
  )

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="basis-full sm:basis-0 flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><BookUser size={24} className="text-teal-600" /> Event contacts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Everyone we get something from, or owe something to, for each event. Staff only.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {all.length > 0 && (
            <button type="button" onClick={() => setSending({})}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-300 bg-teal-50 text-sm font-semibold text-teal-800 hover:bg-teal-100">
              <Send size={15} />Send a document
            </button>
          )}
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f) }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={importing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <Upload size={15} />{importing ? 'Importing…' : 'Import'}
          </button>
          <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"><Plus size={16} />Add contact</button>
        </div>
      </div>

      {failed && <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle size={16} />{failed}</div>}
      {!data && !failed && <p className="text-slate-400 text-center py-16">Loading contacts…</p>}

      {data && !all.length && (
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-8 text-center">
          <BookUser size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 font-semibold text-slate-800">No contacts yet</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Add the city, county, sports commission, rental and vendor people for each event, or import a contacts file.</p>
        </div>
      )}

      {data && all.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
            <button type="button" onClick={() => { setAttention(''); setCat(''); setEvent('all'); setQ('') }}
              className="text-left bg-white border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="text-2xl font-bold text-slate-800">{all.length}</div>
              <div className="text-xs text-slate-500">contacts</div>
            </button>
            {tile('us', counts.us, 'we owe a reply', 'text-amber-700', 'border-amber-200')}
            {tile('noreply', counts.noreply, 'no reply in 2+ weeks', 'text-red-700', 'border-red-200')}
            {tile('open', counts.open, 'open items linked', 'text-teal-700', 'border-teal-200')}
          </div>

          <div className="mt-4 flex flex-col lg:flex-row gap-2 lg:items-center">
            <label className="relative w-full lg:w-72 flex-shrink-0">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, org, email, phone…" aria-label="Search contacts"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-sm" />
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0 -mx-3 px-3 sm:mx-0 sm:px-0">
              <button type="button" onClick={() => setEvent('all')} className={chip(event === 'all')}>All events</button>
              {upcoming.map(t => <button key={t.id} type="button" onClick={() => setEvent(t.id)} className={chip(event === t.id)}>{shortName(t.name)}</button>)}
              <button type="button" onClick={() => setEvent('every')} className={chip(event === 'every')}>Every event</button>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
            {CONTACT_CATEGORIES.map(k => {
              const n = all.filter(c => c.category === k.key).length
              if (!n) return null
              return (
                <button key={k.key} type="button" onClick={() => setCat(c => c === k.key ? '' : k.key)} aria-pressed={cat === k.key}
                  className={`whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cat === k.key ? 'bg-teal-50 border-teal-400 text-teal-900' : 'bg-white border-slate-200 text-slate-600'}`}>
                  <CatDot category={k.key} />{k.label} <span className="text-slate-400">{n}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex gap-4 items-start">
            <div className="flex-1 min-w-0 space-y-4">
              {!groups.length && <p className="text-slate-500 text-center py-10">No contacts match.</p>}
              {groups.map(g => (
                <section key={g.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <h2 className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <CatDot category={g.key} />{g.label}<span className="text-slate-400 normal-case font-normal">{g.items.length}</span>
                  </h2>
                  <ul>
                    {g.items.map((c, i) => (
                      <li key={c.id} className={i ? 'border-t border-slate-100' : ''}>
                        <ContactListRow c={c} tournaments={tournaments} today={today} selected={selId === c.id} onSelect={() => setSelId(s => s === c.id ? null : c.id)} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <aside className="hidden xl:block w-96 flex-shrink-0 sticky top-20 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              {selected ? detail(selected) : <p className="text-sm text-slate-500">Pick a contact to see what they give, what they need, open items and notes.</p>}
            </aside>
          </div>
        </>
      )}

      {/* Below xl, the details open as a sheet. */}
      {selected && (
        <div className="xl:hidden fixed inset-0 z-40 flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSelId(null)} />
          <div role="dialog" aria-modal="true" aria-label={selected.name} className="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-4">
            {detail(selected, () => setSelId(null))}
          </div>
        </div>
      )}

      {sending && (
        <SendDocumentDialog contacts={all} tournaments={tournaments} today={today} contactId={sending.contactId}
          tournamentId={event !== 'all' && event !== 'every' ? event : undefined}
          onClose={() => setSending(null)} onSent={() => { setSending(null); load() }} />
      )}

      {writing && all.some(c => c.id === writing) && (
        <VendorEmailDialog contact={all.find(c => c.id === writing)!} tournaments={tournaments} today={today}
          tournamentId={event !== 'all' && event !== 'every' ? event : undefined}
          onClose={() => setWriting(null)} onPatch={body => patch(all.find(c => c.id === writing)!, body)} />
      )}

      {editing && (
        <ContactForm contact={editing === 'new' ? null : editing} tournaments={tournaments} today={today}
          defaultEvent={event !== 'all' && event !== 'every' ? event : undefined}
          onClose={() => setEditing(null)}
          onSaved={c => { upsert(c); setEditing(null); setSelId(c.id) }} />
      )}
    </div>
  )
}
