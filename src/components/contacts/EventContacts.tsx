'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertCircle, ArrowRight, BookUser, Mail, Phone, Plus, Send, UserPlus, X } from 'lucide-react'
import { CONTACT_CATEGORIES, initials, telHref, type ContactRow } from '@/lib/contactTypes'
import { announceTasksChanged, byDue, dueLabel, shortDate, type TaskView } from '@/lib/taskTemplate'
import { CheckButton, dueTone } from '@/components/tasks/CheckButton'
import { useContacts } from './useContacts'
import ContactForm from './ContactForm'
import SendDocumentDialog from './SendDocumentDialog'
import { CatDot, ContactDetail, WaitFlag } from './ContactParts'

// One tournament's setup: its checklist (this event's Tasks, each showing the
// contact it depends on) and the contacts tagged with it plus every-event
// ones. The checklist IS the Tasks list -- checking one off here checks it off
// there. Used on /tournaments/[id]/contacts, and (contacts only) under the
// Tasks tab on phones, where the tab bar has no room for a seventh tab.

export default function EventContacts({ tournamentId, withChecklist = true }: { tournamentId: string; withChecklist?: boolean }) {
  const { data, failed, load, upsert, patch, remove } = useContacts(tournamentId)
  const [sending, setSending] = useState<{ contactId?: string } | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ContactRow | 'new' | null>(null)
  const [picking, setPicking] = useState(false)

  const today = data?.today || ''
  const tournaments = data?.tournaments || []
  const contacts = data?.contacts || []
  const selected = selId ? contacts.find(c => c.id === selId) || null : null
  const groups = CONTACT_CATEGORIES.map(k => ({ ...k, items: contacts.filter(c => c.category === k.key) })).filter(g => g.items.length)

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
            <ContactDetail c={selected} tournaments={tournaments} today={today}
              onPatch={body => patch(selected, body)} onEdit={() => setEditing(selected)}
              onDelete={() => { setSelId(null); remove(selected) }} onClose={() => setSelId(null)}
              onSend={() => { setSelId(null); setSending({ contactId: selected.id }) }} />
          </div>
        </div>
      )}
      {sending && (
        <SendDocumentDialog contacts={contacts} tournaments={tournaments} today={today} tournamentId={tournamentId} contactId={sending.contactId}
          onClose={() => setSending(null)} onSent={() => { setSending(null); load() }} />
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
