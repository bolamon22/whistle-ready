'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Mail, MapPin, Pencil, Phone, Send, Trash2, X } from 'lucide-react'
import {
  contactCategory, initials, isNoReply, telHref, waitingLabel, type ContactRow, type ContactView, type Waiting,
} from '@/lib/contactTypes'
import { dueLabel, shortDate, type TaskTournament } from '@/lib/taskTemplate'

// The pieces both contact pages draw: a category dot, the event tags, the
// "who owes a reply" flag, a contact's row in a list, and its detail panel.

export function CatDot({ category }: { category: string }) {
  return <span aria-hidden className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${contactCategory(category).dot}`} />
}

export function shortName(name: string): string {
  return name.length > 30 ? name.replace(/\b(Lax|Lacrosse|Tournament)\b/g, '').replace(/\s+/g, ' ').trim() : name
}

export function EventTags({ c, tournaments }: { c: ContactView; tournaments: TaskTournament[] }) {
  const names = c.events.map(id => tournaments.find(t => t.id === id)).filter(Boolean) as TaskTournament[]
  return (
    <>
      {c.everyEvent && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">Every event</span>}
      {names.map(t => <span key={t.id} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-100">{shortName(t.name)}</span>)}
    </>
  )
}

export function WaitFlag({ c, today }: { c: ContactView; today: string }) {
  const label = waitingLabel(c, shortDate)
  if (!label) return null
  const red = isNoReply(c, today)
  return <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${c.waiting === 'us' ? 'bg-amber-50 text-amber-800' : red ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{label}</span>
}

/** One contact in the directory list. */
export function ContactListRow({ c, tournaments, today, selected, onSelect }: {
  c: ContactRow; tournaments: TaskTournament[]; today: string; selected: boolean; onSelect: () => void
}) {
  const tel = telHref(c.phone)
  return (
    <div className={`px-4 py-3 flex gap-3 ${selected ? 'bg-teal-50/70' : 'hover:bg-slate-50'}`}>
      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{initials(c.name)}</div>
      <div className="flex-1 min-w-0 lg:grid lg:grid-cols-12 lg:gap-3">
        <button type="button" onClick={onSelect} aria-expanded={selected} className="w-full lg:col-span-4 min-w-0 text-left">
          <span className="block font-semibold text-slate-800 truncate">{c.name}</span>
          <span className="block text-xs text-slate-500 truncate">{[c.role, c.company].filter(Boolean).join(' · ')}</span>
          <span className="mt-1 flex flex-wrap gap-1 items-center"><EventTags c={c} tournaments={tournaments} /><WaitFlag c={c} today={today} /></span>
        </button>
        <button type="button" onClick={onSelect} tabIndex={-1} className="w-full lg:col-span-5 mt-1.5 lg:mt-0 text-sm min-w-0 text-left">
          {c.gives && <span className="block text-slate-700"><span className="text-[11px] font-bold text-teal-700 uppercase mr-1">Gives</span>{c.gives}</span>}
          {c.needs && <span className="block text-slate-600 mt-0.5"><span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Needs</span>{c.needs}</span>}
        </button>
        <div className="lg:col-span-3 mt-2 lg:mt-0 flex flex-wrap lg:flex-col gap-1.5 lg:items-end text-sm min-w-0">
          {tel && <a href={tel} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-teal-700 font-semibold text-xs lg:text-sm lg:border-0 lg:p-0"><Phone size={13} />{c.phone}</a>}
          {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-teal-700 font-semibold text-xs lg:border-0 lg:p-0 lg:font-normal lg:text-slate-500 max-w-full"><Mail size={13} className="flex-shrink-0" /><span className="truncate">{c.email}</span></a>}
          <span className="text-[11px] text-slate-400 self-center lg:self-end">
            {c.lastContact ? `Last contact ${shortDate(c.lastContact)}${c.lastContact.slice(0, 4) !== today.slice(0, 4) ? `, ${c.lastContact.slice(0, 4)}` : ''}` : ''}
            {c.openTasks.length > 0 && <b className="text-slate-600">{c.lastContact ? ' · ' : ''}{c.openTasks.length} open</b>}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Everything about one contact, with the quick actions. */
export function ContactDetail({ c, tournaments, today, onPatch, onEdit, onDelete, onClose, onSend }: {
  c: ContactRow; tournaments: TaskTournament[]; today: string
  onPatch: (body: Partial<ContactView>) => void
  onEdit: () => void; onDelete: () => void; onClose?: () => void
  /** Opens Send a document with this contact picked. */
  onSend?: () => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => setConfirmDel(false), [c.id])
  const tel = telHref(c.phone)
  const eventName = (id: string) => tournaments.find(t => t.id === id)?.name || 'General'
  const waits: [Waiting, string][] = [['', 'Nothing pending'], ['us', 'We owe a reply'], ['them', 'Waiting on them']]
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center flex-shrink-0">{initials(c.name)}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800">{c.name}</div>
          <div className="text-xs text-slate-500">{c.role}{c.role && c.company ? <br /> : null}{c.company}</div>
        </div>
        <button type="button" onClick={onEdit} aria-label="Edit contact" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Pencil size={16} /></button>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>}
      </div>

      <div className="flex flex-wrap gap-2">
        {tel && <a href={tel} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Phone size={15} />{c.phone}</a>}
        {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Mail size={15} />Email</a>}
        {c.email && onSend && <button type="button" onClick={onSend} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Send size={15} />Send a document</button>}
      </div>
      {c.email && <div className="text-sm text-slate-600 break-all">{c.email}</div>}
      {c.address && <div className="text-xs text-slate-500 flex gap-1"><MapPin size={13} className="flex-shrink-0 mt-px" />{c.address}</div>}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 mr-1"><CatDot category={c.category} />{contactCategory(c.category).label}</span>
        <EventTags c={c} tournaments={tournaments} />
      </div>

      <div className="border-t border-slate-100 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Who owes a reply</div>
        <div className="flex flex-wrap gap-1.5">
          {waits.map(([w, label]) => (
            <button key={w || 'none'} type="button" aria-pressed={c.waiting === w} onClick={() => onPatch({ waiting: w })}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${c.waiting === w ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <WaitFlag c={c} today={today} />
          <span className="flex-1">{c.lastContact ? `Last contact ${shortDate(c.lastContact)}, ${c.lastContact.slice(0, 4)}` : 'No contact logged'}</span>
          {c.lastContact !== today && <button type="button" onClick={() => onPatch({ lastContact: today })} className="font-semibold text-teal-700 hover:underline">Talked today</button>}
        </div>
      </div>

      {(c.gives || c.needs) && (
        <div className="border-t border-slate-100 pt-3 space-y-1.5 text-sm">
          {c.gives && <p className="text-slate-700"><span className="block text-[11px] font-bold text-teal-700 uppercase">What we get</span>{c.gives}</p>}
          {c.needs && <p className="text-slate-700"><span className="block text-[11px] font-bold text-slate-500 uppercase">What they need</span>{c.needs}</p>}
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Open items</div>
        {c.openTasks.length ? (
          <ul className="space-y-1">
            {c.openTasks.map(t => (
              <li key={t.id}>
                <Link href={`/tasks?task=${encodeURIComponent(t.id)}`} className="group flex items-start gap-2 text-sm hover:bg-slate-50 rounded-lg -mx-1.5 px-1.5 py-1">
                  <span className="flex-1 min-w-0">
                    <span className="block text-slate-800">{t.title}</span>
                    <span className="block text-[11px] text-slate-500">{eventName(t.tournamentId)}{t.dueDate ? ` · ${t.dueDate < today ? `due ${shortDate(t.dueDate)}, ` : 'due '}${dueLabel(t.dueDate, today)}` : ''}</span>
                  </span>
                  <ArrowRight size={14} className="mt-1 text-slate-300 group-hover:text-teal-600" />
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">None. Link a task to this contact from its details on the Tasks page.</p>}
      </div>

      {c.notes && (
        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Notes</div>
          <p className="text-sm text-slate-600 whitespace-pre-line">{c.notes}</p>
        </div>
      )}

      <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center gap-2">
        {confirmDel ? (
          <>
            <span className="text-sm text-slate-600">Delete this contact?</span>
            <button type="button" onClick={onDelete} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Delete</button>
            <button type="button" onClick={() => setConfirmDel(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700">Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 size={14} /> Delete</button>
        )}
      </div>
    </div>
  )
}
