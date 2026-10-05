'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { FileText, Paperclip, Send, Inbox, X } from 'lucide-react'
import { announceTasksChanged, type TaskTournament } from '@/lib/taskTemplate'
import type { ContactRow } from '@/lib/contactTypes'
import { DOC_KINDS, MAX_ATTACHMENT_BYTES, docKind, draftEmail, isEmail, wantsDoc, type DocKind } from '@/lib/contactSend'
import { CatDot } from './ContactParts'

// Send a document (a certificate of insurance, a W-9...) to the right event
// contacts with the email already written. Drop the file in, check who it goes
// to, then Send -- or "Email it to me" to forward it from your own inbox. Never
// sends anything on its own.

const field = 'border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 bg-white w-full'

export default function SendDocumentDialog({ contacts, tournaments, today, tournamentId, contactId, initialKind = 'coi', onClose, onSent }: {
  contacts: ContactRow[]
  tournaments: TaskTournament[]
  today: string
  tournamentId?: string
  contactId?: string
  initialKind?: DocKind
  onClose: () => void
  onSent: () => void
}) {
  const { data: session } = useSession()
  const myName = (session?.user as { name?: string } | undefined)?.name || ''
  const myEmail = (session?.user as { email?: string } | undefined)?.email || ''
  const upcoming = useMemo(() => tournaments.filter(t => t.lastDay && t.lastDay >= today), [tournaments, today])
  const starting = contactId ? contacts.find(c => c.id === contactId) : undefined
  const [kind, setKind] = useState<DocKind>(initialKind)
  const [eventId, setEventId] = useState(tournamentId || starting?.events.find(e => upcoming.some(t => t.id === e)) || upcoming[0]?.id || '')
  const [file, setFile] = useState<File | null>(null)
  const [picked, setPicked] = useState<string[]>(contactId ? [contactId] : [])
  const [extra, setExtra] = useState('')
  const [copyMe, setCopyMe] = useState(true)
  const [saveDoc, setSaveDoc] = useState(true)
  const [taskIds, setTaskIds] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState<'' | 'send' | 'me'>('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const event = tournaments.find(t => t.id === eventId) || null
  // This event's contacts with an email; the ones who need this document first.
  const eventContacts = contacts.filter(c => c.email && (!eventId || c.everyEvent || c.events.includes(eventId)))
  const suggested = eventContacts.filter(c => wantsDoc(c, kind))
  const others = contacts.filter(c => c.email && !suggested.includes(c))

  // Opening without a contact: tick the one person who needs this document. With
  // several (Wellington AND the sports commission each want their own COI) tick
  // nobody -- each certificate names one holder, so the choice is Bo's.
  useEffect(() => {
    if (contactId) return
    setPicked(suggested.length === 1 ? [suggested[0].id] : [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, eventId])

  const people = picked.map(id => contacts.find(c => c.id === id)).filter(Boolean) as ContactRow[]
  const extras = extra.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
  const badExtra = extras.filter(e => !isEmail(e))

  // The message rewrites itself until it's edited by hand.
  useEffect(() => {
    if (edited) return
    const d = draftEmail({ kind, event, people, fileName: file?.name || '', signer: myName })
    setSubject(d.subject); setMessage(d.message)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, eventId, picked.join(','), file?.name, myName, edited])

  // Open tasks for the chosen contacts on this event that this document finishes.
  const finishes = people.flatMap(c => c.openTasks
    .filter(t => (!eventId || t.tournamentId === eventId) && docKind(kind).words.test(t.title))
    .map(t => ({ ...t, who: c.name })))
  useEffect(() => { setTaskIds(finishes.map(t => t.id)) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishes.map(t => t.id).join(',')])

  function choose(f: File | null | undefined) {
    if (!f) return
    if (f.size > MAX_ATTACHMENT_BYTES) { toast.error('That file is over 10 MB'); return }
    setFile(f)
  }
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  async function go(mode: 'send' | 'me') {
    if (!file) { toast.error('Attach the document first'); return }
    if (!people.length && !extras.length) { toast.error('Pick who it goes to'); return }
    if (badExtra.length) { toast.error(`Check this address: ${badExtra[0]}`); return }
    setBusy(mode)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      fd.append('tournamentId', eventId)
      fd.append('contactIds', JSON.stringify(picked))
      fd.append('emails', JSON.stringify(extras))
      fd.append('subject', subject)
      fd.append('message', message)
      fd.append('mode', mode)
      fd.append('copyMe', copyMe ? '1' : '0')
      fd.append('saveDoc', saveDoc ? '1' : '0')
      fd.append('taskIds', JSON.stringify(mode === 'send' ? taskIds : []))
      const r = await fetch('/api/contacts/send', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not send it')
      toast.success(mode === 'me' ? `Sent to ${d.to?.[0] || 'you'}. Open it in Gmail and forward it.` : `Sent to ${(d.to || []).join(', ')}`, { duration: 6000 })
      if (d.tasksDone?.length) announceTasksChanged('send-document')
      onSent()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send it')
    } finally { setBusy('') }
  }

  const row = (c: ContactRow) => (
    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4 accent-teal-700" />
      <CatDot category={c.category} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-800 truncate">{c.name}{c.company && c.company !== c.name ? <span className="font-normal text-slate-500"> · {c.company}</span> : null}</span>
        <span className="block text-xs text-slate-500 truncate">{c.email}{wantsDoc(c, kind) ? ' · needs it' : ''}</span>
      </span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => !busy && onClose()} />
      <div role="dialog" aria-modal="true" aria-labelledby="send-doc-title"
        className="relative w-full sm:max-w-2xl max-h-[94vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200">
          <h2 id="send-doc-title" className="flex-1 text-lg font-bold text-slate-800 flex items-center gap-2"><Send size={18} className="text-teal-600" /> Send a document</h2>
          <button type="button" onClick={onClose} disabled={!!busy} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {DOC_KINDS.map(k => (
              <button key={k.key} type="button" onClick={() => { setKind(k.key); setEdited(false) }} aria-pressed={kind === k.key}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${kind === k.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>{k.label}</button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Event
              <select value={eventId} onChange={e => { setEventId(e.target.value); setEdited(false) }} className={field}>
                <option value="">No event</option>
                {upcoming.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                {event && !upcoming.includes(event) && <option value={event.id}>{event.name}</option>}
              </select>
            </label>
            <div className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Document
              <input ref={fileRef} type="file" accept=".pdf,image/*,.doc,.docx" className="hidden" onChange={e => choose(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]) }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-dashed text-sm font-normal text-left ${dragging ? 'border-teal-500 bg-teal-50' : file ? 'border-teal-300 bg-teal-50/50 text-slate-800' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                {file ? <FileText size={16} className="text-teal-700 flex-shrink-0" /> : <Paperclip size={16} className="flex-shrink-0" />}
                <span className="truncate">{file ? file.name : 'Drop the PDF here, or choose it'}</span>
                {file && <span className="ml-auto text-xs text-slate-500 flex-shrink-0">{Math.max(1, Math.round(file.size / 1024))} KB</span>}
              </button>
            </div>
          </div>

          <fieldset className="min-w-0">
            <legend className="text-xs font-semibold text-slate-600 mb-1">Send to</legend>
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {suggested.length > 0 && <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Needs a {docKind(kind).label.toLowerCase()}{event ? ` for ${event.name}` : ''}</div>}
              {suggested.map(row)}
              {others.length > 0 && <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{suggested.length ? 'Everyone else' : 'Contacts'}</div>}
              {others.map(row)}
              {!contacts.some(c => c.email) && <p className="px-3 py-3 text-sm text-slate-500">No contacts with an email yet. Type an address below.</p>}
            </div>
            <input value={extra} onChange={e => setExtra(e.target.value)} placeholder="Another email address (optional)" aria-label="Another email address"
              className={`${field} mt-2 ${badExtra.length ? 'border-red-400' : ''}`} />
          </fieldset>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Subject
            <input value={subject} onChange={e => { setSubject(e.target.value); setEdited(true) }} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            <span className="flex items-baseline justify-between">Message
              {edited && <button type="button" onClick={() => setEdited(false)} className="font-semibold text-teal-700 hover:underline">Reset to the ready-made one</button>}
            </span>
            <textarea rows={7} value={message} onChange={e => { setMessage(e.target.value); setEdited(true) }} className={`${field} resize-y leading-relaxed`} />
          </label>

          <div className="space-y-1.5 text-sm text-slate-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={copyMe} onChange={e => setCopyMe(e.target.checked)} className="w-4 h-4 accent-teal-700" />Copy me{myEmail ? ` (${myEmail})` : ''}; replies come to me</label>
            {event && <label className="flex items-center gap-2"><input type="checkbox" checked={saveDoc} onChange={e => setSaveDoc(e.target.checked)} className="w-4 h-4 accent-teal-700" />Keep the file in {event.name}’s Documents ({docKind(kind).docCategory})</label>}
            {finishes.map(t => (
              <label key={t.id} className="flex items-center gap-2">
                <input type="checkbox" checked={taskIds.includes(t.id)} onChange={() => setTaskIds(ids => ids.includes(t.id) ? ids.filter(x => x !== t.id) : [...ids, t.id])} className="w-4 h-4 accent-teal-700" />
                Check off “{t.title}”
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <span className="mr-auto text-xs text-slate-500">{people.length + extras.length ? `${people.length + extras.length} recipient${people.length + extras.length === 1 ? '' : 's'}` : 'No one picked yet'}</span>
          <button type="button" onClick={() => go('me')} disabled={!!busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <Inbox size={15} />{busy === 'me' ? 'Sending…' : 'Email it to me to forward'}
          </button>
          <button type="button" onClick={() => go('send')} disabled={!!busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold disabled:opacity-60">
            <Send size={15} />{busy === 'send' ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
