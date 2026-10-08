'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertCircle, ArrowRight, BookUser, Mail, Phone, Plus, Search, Send, UserPlus, X } from 'lucide-react'
import { CONTACT_CATEGORIES, contactHaystack, initials, telHref, type ContactRow } from '@/lib/contactTypes'
import { announceTasksChanged, byDue, dueLabel, shortDate, type TaskView } from '@/lib/taskTemplate'
import { CheckButton, dueTone } from '@/components/tasks/CheckButton'
import { useContacts } from './useContacts'
import ContactForm from './ContactForm'
import SendDocumentDialog from './SendDocumentDialog'
import VendorEmailDialog from './VendorEmailDialog'
import { CatDot, ContactDetail, WaitFlag } from './ContactParts'

// One tournament's setup: its checklist (this event's Tasks, each showing the
// contact it depends on) and the contacts tagged with it plus every-event
// ones. The checklist IS the Tasks list -- checking one off here checks it off
// there. Used on /tournaments/[id]/contacts, and (contacts only) under the
// Tasks tab on phones, where the tab bar has no room for a seventh tab.

export default function EventContacts({ tournamentId, withChecklist = true }: { tournamentId: string; withChecklist?: boolean }) {
  const { data, failed, load, upsert, patch, remove } = useContacts(tournamentId)
  const [sending, setSending] = useState<{ contactId?: string } | null>(null)
  const [writing, setWriting] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ContactRow | 'new' | null>(null)
  const [picking, setPicking] = useState(false)

  const today = data?.today || ''
  const tournaments = data?.tournaments || []
  const contacts = data?.contacts || []
  const selected = selId ? contacts.find(c => c.id === selId) || null : null

  // Search and a category filter (Bo, Oct 8 2026: "can we have a filter or a
  // search?"). A search also looks through the rest of the directory, fetched the
  // first time someone types, so a contact who isn't tagged with this event (Oct 8:
  // a new athletic trainer saved under May's Summer Kick Off) still turns up, one
  // click from being added here.
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [dir, setDir] = useState<ContactRow[] | null>(null)
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const matches = (c: ContactRow) => (!cat || c.category === cat) && words.every(w => contactHaystack(c).includes(w))
  const shown = contacts.filter(matches)
  const groups = CONTACT_CATEGORIES.map(k => ({ ...k, items: shown.filter(c => c.category === k.key) })).filter(g => g.items.length)
  const cats = CONTACT_CATEGORIES.map(k => ({ ...k, n: contacts.filter(c => c.category === k.key).length })).filter(k => k.n)
  useEffect(() => {
    if (!searching || dir) return
    let live = true
    fetch('/api/contacts').then(r => r.ok ? r.json() : { contacts: [] }).then(d => { if (live) setDir(d.contacts || []) }).catch(() => { if (live) setDir([]) })
    return () => { live = false }
  }, [searching, dir])
  const onEvent = new Set(contacts.map(c => c.id))
  const elsewhere = searching ? (dir || []).filter(c => !onEvent.has(c.id) && matches(c)) : []
  const eventLabel = (id: string) => {
    const t = tournaments.find(x => x.id === id)
    return t ? `${t.name}${t.lastDay && t.lastDay < today ? ' (past)' : ''}` : 'another event'
  }
  const addHere = (c: ContactRow) => { const events = [...c.events, tournamentId]; upsert({ ...c, events }); patch(c, { events }) }
  const chip = (on: boolean) => `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`

  const list = (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-slate-800 flex-1 flex items-center gap-2">
          <BookUser size={18} className="text-teal-600" /> Contacts<span className="hidden sm:inline -ml-1">for this event</span> {data && <span className="text-slate-400 font-normal text-sm">{contacts.length}</span>}
        </h2>
        {contacts.length > 0 && <button type="button" onClick={() => setSending({})} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-teal-300 bg-teal-50 text-xs font-semibold text-teal-800 hover:bg-teal-100"><Send size={13} />Send a document</button>}
        <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"><UserPlus size={13} />From directory</button>
        <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus size={13} />New</button>
      </div>
      {contacts.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, org, phone…" aria-label="Search contacts"
              className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-slate-300 bg-white text-sm" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700"><X size={14} /></button>}
          </div>
          {cats.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setCat('')} aria-pressed={!cat} className={chip(!cat)}>All <span className="opacity-60">{contacts.length}</span></button>
              {cats.map(k => (
                <button key={k.key} type="button" onClick={() => setCat(c => c === k.key ? '' : k.key)} aria-pressed={cat === k.key} className={chip(cat === k.key)}>
                  <CatDot category={k.key} />{k.label} <span className="opacity-60">{k.n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {failed && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><AlertCircle size={15} />{failed}</div>}
      {!data && !failed && <p className="text-sm text-slate-400 py-6 text-center">Loading contacts…</p>}
      {data && !contacts.length && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-center text-sm text-slate-500">
          No contacts tagged with this event yet. <Link href="/contacts" className="font-semibold text-teal-700 hover:underline">Open the directory</Link>
        </div>
      )}
      {groups.map(g => (
        <div key={g.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <h3 className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><CatDot category={g.key} />{g.label}</h3>
          <ul>
            {g.items.map((c, i) => {
              const tel = telHref(c.phone)
              return (
                <li key={c.id} className={`px-3 py-2 flex items-center gap-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                  <button type="button" onClick={() => setSelId(c.id)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
                    <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">{initials(c.name)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{c.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0"><span className="truncate">{c.company || c.role}</span><WaitFlag c={c} today={today} /></span>
                    </span>
                  </button>
                  {c.openTasks.length > 0 && <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">{c.openTasks.length} open</span>}
                  {tel && <a href={tel} aria-label={`Call ${c.name}`} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-teal-700 hover:bg-teal-50"><Phone size={15} /></a>}
                  {c.email && <a href={`mailto:${c.email}`} aria-label={`Email ${c.name}`} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-teal-700 hover:bg-teal-50"><Mail size={15} /></a>}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {data && contacts.length > 0 && !shown.length && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-sm text-slate-500">
          No one on this event matches{searching ? <> “{q.trim()}”</> : ' that filter'}.{' '}
          <button type="button" onClick={() => { setQ(''); setCat('') }} className="font-semibold text-teal-700 hover:underline">Clear</button>
        </div>
      )}
      {searching && dir === null && <p className="text-xs text-slate-400 px-1">Checking the rest of the directory…</p>}
      {elsewhere.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <h3 className="px-3 py-1.5 border-b border-amber-200 text-[11px] font-semibold uppercase tracking-wide text-amber-800">In the directory, not on this event</h3>
          <ul>
            {elsewhere.map((c, i) => (
              <li key={c.id} className={`px-3 py-2 flex items-center gap-2.5 ${i ? 'border-t border-amber-100' : ''}`}>
                <CatDot category={c.category} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{c.name}{(c.role || c.company) && <span className="font-normal text-slate-500"> · {c.role || c.company}</span>}</span>
                  <span className="block text-xs text-slate-500">{c.events.length ? `On ${c.events.map(eventLabel).join(', ')}` : 'Not on any event'}</span>
                </span>
                <button type="button" onClick={() => addHere(c)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold whitespace-nowrap"><Plus size={13} />Add to this event</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )

  return (
    <div>
      {withChecklist ? (
        <div className="grid lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-7 min-w-0"><EventChecklist tournamentId={tournamentId} contacts={contacts} onContact={setSelId} /></div>
          <div className="lg:col-span-5 min-w-0">{list}</div>
        </div>
      ) : list}

      {selected && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSelId(null)} />
          <div role="dialog" aria-modal="true" aria-label={selected.name} className="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-4">
            <ContactDetail c={selected} tournaments={tournaments} today={today} tournamentId={tournamentId}
              onPatch={body => patch(selected, body)} onEdit={() => setEditing(selected)}
              onDelete={() => { setSelId(null); remove(selected) }} onClose={() => setSelId(null)}
              onSend={() => { setSelId(null); setSending({ contactId: selected.id }) }}
              onWrite={() => { setSelId(null); setWriting(selected.id) }} />
          </div>
        </div>
      )}
      {sending && (
        <SendDocumentDialog contacts={contacts} tournaments={tournaments} today={today} tournamentId={tournamentId} contactId={sending.contactId}
          onClose={() => setSending(null)} onSent={() => { setSending(null); load() }} />
      )}
      {writing && contacts.some(c => c.id === writing) && (
        <VendorEmailDialog contact={contacts.find(c => c.id === writing)!} tournaments={tournaments} today={today} tournamentId={tournamentId}
          onClose={() => setWriting(null)} onPatch={body => patch(contacts.find(c => c.id === writing)!, body)} />
      )}
      {editing && (
        <ContactForm contact={editing === 'new' ? null : editing} tournaments={tournaments} today={today} defaultEvent={tournamentId}
          onClose={() => setEditing(null)} onSaved={c => { upsert(c); setEditing(null) }} />
      )}
      {picking && (
        <DirectoryPicker tournamentId={tournamentId} have={new Set(contacts.map(c => c.id))}
          onClose={() => setPicking(false)}
          onPick={c => { upsert({ ...c, events: [...c.events, tournamentId] }); patch(c, { events: [...c.events, tournamentId] }) }} />
      )}
    </div>
  )
}

/** This event's Tasks as a setup checklist, open items first by due date. */
function EventChecklist({ tournamentId, contacts, onContact }: { tournamentId: string; contacts: ContactRow[]; onContact: (id: string) => void }) {
  const [tasks, setTasks] = useState<TaskView[] | null>(null)
  const [today, setToday] = useState('')
  const [showDone, setShowDone] = useState(false)
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/tasks?tournamentId=${encodeURIComponent(tournamentId)}`)
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setTasks((d.tasks || []).filter((t: TaskView) => t.kind === 'task')); setToday(d.today || '') }
    } catch { /* the tasks page shows its own error */ }
  }, [tournamentId])
  useEffect(() => { load() }, [load])

  async function toggle(t: TaskView) {
    setTasks(ts => ts && ts.map(x => x.id === t.id ? { ...x, done: !t.done } : x))
    try {
      const r = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: !t.done }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save')
      announceTasksChanged('event-contacts')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); load() }
  }

  const open = (tasks || []).filter(t => !t.done).sort(byDue)
  const done = (tasks || []).filter(t => t.done)
  const total = (tasks || []).length
  const row = (t: TaskView, i: number) => {
    const known = t.contactId && contacts.some(c => c.id === t.contactId)
    return (
      <li key={t.id} className={`px-4 py-2.5 flex gap-3 items-start ${i ? 'border-t border-slate-100' : ''}`}>
        <span className="mt-0.5"><CheckButton done={t.done} onClick={() => toggle(t)} label={`${t.done ? 'Reopen' : 'Mark done'}: ${t.title}`} /></span>
        <div className="flex-1 min-w-0">
          <Link href={`/tournaments/${tournamentId}/tasks?task=${encodeURIComponent(t.id)}`} className={`block text-sm font-medium hover:underline ${t.done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.title}</Link>
          {t.notes && !t.done && <div className="text-xs text-slate-500 line-clamp-2">{t.notes}</div>}
          {t.contactName && (
            known
              ? <button type="button" onClick={() => onContact(t.contactId!)} className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700 hover:border-teal-300"><CatDot category={contacts.find(c => c.id === t.contactId)!.category} />{t.contactName}</button>
              : <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-xs text-slate-500">{t.contactName}</span>
          )}
        </div>
        <span className={`text-xs font-semibold whitespace-nowrap ${dueTone(t, today)}`}>
          {t.done ? 'Done' : dueLabel(t.dueDate, today)}
          {!t.done && t.dueDate < today && t.dueDate && <span className="block text-[11px] font-normal text-slate-500 text-right">Due {shortDate(t.dueDate)}</span>}
        </span>
      </li>
    )
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <h2 className="font-bold text-slate-800 flex-1">Setup checklist</h2>
        {total > 0 && <span className="text-xs text-slate-500">{done.length} of {total} done</span>}
        <Link href={`/tournaments/${tournamentId}/tasks`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open in Tasks<ArrowRight size={12} /></Link>
      </div>
      {total > 0 && <div className="h-1.5 bg-slate-100"><div className="h-full bg-teal-600" style={{ width: `${Math.round(done.length / total * 100)}%` }} /></div>}
      {!tasks && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}
      {tasks && !total && <p className="text-sm text-slate-500 px-4 py-6 text-center">No tasks for this event yet. <Link href={`/tournaments/${tournamentId}/tasks`} className="font-semibold text-teal-700 hover:underline">Start from the template</Link></p>}
      <ul>{open.map(row)}</ul>
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone(s => !s)} className="w-full text-left px-4 py-2 border-t border-slate-100 text-xs font-semibold text-teal-700 hover:bg-slate-50">
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && <ul className="border-t border-slate-100">{done.map(row)}</ul>}
        </>
      )}
      <p className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">These are this event’s Tasks. Link a contact to a task from its details on the Tasks page.</p>
    </section>
  )
}

/** Tag an existing directory contact with this event. */
function DirectoryPicker({ tournamentId, have, onClose, onPick }: {
  tournamentId: string; have: Set<string>; onClose: () => void; onPick: (c: ContactRow) => void
}) {
  const [all, setAll] = useState<ContactRow[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    fetch('/api/contacts').then(r => r.ok ? r.json() : { contacts: [] }).then(d => setAll(d.contacts || [])).catch(() => setAll([]))
  }, [])
  const rows = (all || []).filter(c => !have.has(c.id) && !c.events.includes(tournamentId))
    .filter(c => !q.trim() || `${c.name} ${c.company}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Add from directory" className="relative w-full sm:max-w-md max-h-[80vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <h2 className="flex-1 font-bold text-slate-800">Add from the directory</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-3 border-b border-slate-100"><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search the directory" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" /></div>
        <ul className="flex-1 overflow-y-auto">
          {!all && <li className="p-4 text-sm text-slate-400">Loading…</li>}
          {all && !rows.length && <li className="p-4 text-sm text-slate-500">Everyone in the directory is already on this event.</li>}
          {rows.map(c => (
            <li key={c.id} className="border-b border-slate-100">
              <button type="button" onClick={() => { onPick(c); onClose() }} className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50">
                <CatDot category={c.category} />
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-slate-800 truncate">{c.name}</span><span className="block text-xs text-slate-500 truncate">{c.company}</span></span>
                <Plus size={15} className="text-teal-700" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
