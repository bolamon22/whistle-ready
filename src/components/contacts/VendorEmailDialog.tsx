'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Bookmark, Copy, ExternalLink, Inbox, Mail, Send, X } from 'lucide-react'
import type { TaskTournament } from '@/lib/taskTemplate'
import type { ContactRow, ContactView } from '@/lib/contactTypes'
import { lastOrder } from '@/lib/costTypes'
import { VENDOR_EMAILS, fillTemplate, gmailCompose, templateVars, toTemplate, vendorEmail, type VendorEmailKind } from '@/lib/vendorEmails'
import { costLabel, useCosts } from '@/components/costs/useCosts'

// Write an email to a vendor from a ready-made one: ask for a quote (last
// time's order filled in), approve it, confirm delivery, ask for the invoice --
// or the email Bo sends them every year, saved on the contact (Oct 8 2026).
// Send it from Whistle Ready (from the org sender, replies to Bo, a copy to
// him), email it to Bo to forward, open it in Gmail, or copy it. Nothing goes
// out until Bo presses a button.

const field = 'border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 bg-white w-full min-w-0'

export default function VendorEmailDialog({ contact, tournaments, today, tournamentId, onClose, onPatch }: {
  contact: ContactRow
  tournaments: TaskTournament[]
  today: string
  tournamentId?: string
  onClose: () => void
  /** Logs the contact once the email is opened to send. */
  onPatch: (body: Partial<ContactView>) => void
}) {
  const { data: session } = useSession()
  const myName = (session?.user as { name?: string } | undefined)?.name || ''
  const { data } = useCosts({ contactId: contact.id })
  const costs = useMemo(() => data?.costs || [], [data])

  // This vendor's events: tagged ones first, coming up first.
  const events = useMemo(() => {
    const mine = tournaments.filter(t => contact.everyEvent || contact.events.includes(t.id))
    const list = mine.length ? mine : tournaments
    const up = list.filter(t => t.lastDay && t.lastDay >= today)
    const past = list.filter(t => !(t.lastDay && t.lastDay >= today)).reverse()
    return [...up, ...past]
  }, [tournaments, contact, today])
  const [eventId, setEventId] = useState(tournamentId || events[0]?.id || '')
  const event = tournaments.find(t => t.id === eventId) || null
  const cost = costs.find(c => c.tournamentId === eventId) || null
  const last = lastOrder(costs, contact.id, eventId)

  // The obvious next email for where this vendor stands on this event.
  const suggested: VendorEmailKind = useMemo(() => {
    if (event?.lastDay && event.lastDay < today) return 'invoice'
    if (!cost || cost.status === 'budget') return 'quote'
    if (cost.status === 'quoted') return 'book'
    return 'confirm'
  }, [event, cost, today])
  const hasSaved = !!(contact.emailBody || '').trim()
  const [kind, setKind] = useState<VendorEmailKind | 'saved' | null>(null)
  const k = kind || (hasSaved ? 'saved' : suggested)

  // Teams registered for the event, for {teams} in a saved email.
  const [teams, setTeams] = useState<number | null>(null)
  useEffect(() => {
    setTeams(null)
    if (!eventId) return
    fetch(`/api/registrations?tournamentId=${encodeURIComponent(eventId)}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setTeams(d.reduce((s: number, r: { teams?: unknown[] }) => s + (r.teams || []).length, 0)) }).catch(() => {})
  }, [eventId])
  const vars = templateVars({ event, teams, contactName: contact.name, signer: myName })

  // Where it's delivered: the event's location to start with (a venue
  // contact's address is usually their office, not the field), editable.
  const [address, setAddress] = useState(event?.location || '')
  useEffect(() => { setAddress(event?.location || '') }, [event?.location])

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [edited, setEdited] = useState(false)
  const [logIt, setLogIt] = useState(true)
  useEffect(() => {
    if (edited) return
    if (k === 'saved') {
      setSubject(fillTemplate(contact.emailSubject || '', vars)); setMessage(fillTemplate(contact.emailBody || '', vars))
      return
    }
    const d = vendorEmail({
      kind: k, contact, event, address, cost, signer: myName,
      last: last ? { ...last, label: costLabel(last, data?.tournaments || []) } : null,
    })
    setSubject(d.subject); setMessage(d.message)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, eventId, cost?.id, cost?.status, last?.id, address, myName, edited, teams, contact.emailBody, contact.emailSubject])

  const [busy, setBusy] = useState<'' | 'send' | 'me'>('')
  /** Through Whistle Ready: to them (copy and replies to Bo), or to Bo alone to forward. */
  async function sendIt(mode: 'send' | 'me') {
    if (!subject.trim() || !message.trim()) { toast.error('Add a subject and a message'); return }
    if (/\[(event|dates|year|teams|place|first|me|link[^\]]*)\]/i.test(subject + message) && !window.confirm('The email still has a [blank] in it. Send anyway?')) return
    setBusy(mode)
    try {
      const fd = new FormData()
      fd.append('plain', '1')
      fd.append('kind', 'other')
      fd.append('tournamentId', eventId)
      fd.append('contactIds', JSON.stringify([contact.id]))
      fd.append('subject', subject)
      fd.append('message', message)
      fd.append('mode', mode)
      fd.append('copyMe', '1')
      const r = await fetch('/api/contacts/send', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not send it')
      toast.success(mode === 'me' ? `Sent to ${d.to?.[0] || 'you'}. Open it in Gmail and forward it.` : `Sent to ${(d.to || []).join(', ')}`, { duration: 6000 })
      if (mode === 'send') onPatch({ lastContact: today, ...(contact.waiting === 'us' ? { waiting: '' as const } : {}) })
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send it')
    } finally { setBusy('') }
  }

  /** Keep this email as theirs for next year, with this year's facts turned into blanks. */
  function saveAsUsual() {
    onPatch({ emailSubject: toTemplate(subject, vars), emailBody: toTemplate(message, vars) })
    toast.success(`Saved as ${contact.company || contact.name}’s usual email. Next time the event, dates and team count fill in.`, { duration: 6000 })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function logged() {
    if (logIt) onPatch({ lastContact: today, waiting: k === 'invoice' || k === 'quote' ? 'them' : contact.waiting })
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${message}`)
      toast.success('Copied. Paste it into your email.')
      logged()
    } catch { toast.error('Could not copy') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="vendor-email-title" className="relative w-full sm:max-w-2xl max-h-[94vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200">
          <h2 id="vendor-email-title" className="flex-1 min-w-0 text-lg font-bold text-slate-800 flex items-center gap-2"><Mail size={18} className="text-teal-600 flex-shrink-0" /><span className="truncate">Email {contact.company || contact.name}</span></h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {hasSaved && (
              <button type="button" onClick={() => { setKind('saved'); setEdited(false) }} aria-pressed={k === 'saved'}
                className={`col-span-2 sm:col-span-4 px-2.5 py-1.5 rounded-xl text-left border ${k === 'saved' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                <span className="block text-sm font-semibold">Their usual email</span>
                <span className={`block text-[11px] ${k === 'saved' ? 'text-slate-300' : 'text-slate-500'}`}>The one you send every year, filled in for this event</span>
              </button>
            )}
            {VENDOR_EMAILS.map(v => (
              <button key={v.key} type="button" onClick={() => { setKind(v.key); setEdited(false) }} aria-pressed={k === v.key}
                className={`px-2.5 py-1.5 rounded-xl text-left border ${k === v.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                <span className="block text-sm font-semibold">{v.label}</span>
                <span className={`block text-[11px] ${k === v.key ? 'text-slate-300' : 'text-slate-500'}`}>{v.key === suggested ? 'Up next' : v.when}</span>
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Event
              <select value={eventId} onChange={e => { setEventId(e.target.value); setKind(null); setEdited(false) }} className={field}>
                {events.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                {!events.length && <option value="">No events</option>}
              </select>
            </label>
            <div className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">To
              <div className="px-2.5 py-1.5 text-sm font-normal text-slate-800 truncate">{contact.email || <span className="text-red-600">No email on this contact</span>}</div>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">{contact.category === 'rentals' ? 'Deliver to' : 'Where'}
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Park name and street address" className={field} />
          </label>
          {k === 'quote' && !last && <p className="-mt-2 text-xs text-slate-500">No past order from them in Costs yet, so fill in the list. Once a quote is in Costs, next year’s request lists it for you.</p>}
          {k === 'book' && !cost?.quoteRef && <p className="-mt-2 text-xs text-slate-500">Add their quote under Costs to put its number and total in this email.</p>}

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Subject
            <input value={subject} onChange={e => { setSubject(e.target.value); setEdited(true) }} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            <span className="flex items-baseline justify-between">Message
              {edited && <button type="button" onClick={() => setEdited(false)} className="font-semibold text-teal-700 hover:underline">Reset to the ready-made one</button>}
            </span>
            <textarea rows={11} value={message} onChange={e => { setMessage(e.target.value); setEdited(true) }} className={`${field} resize-y leading-relaxed`} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={logIt} onChange={e => setLogIt(e.target.checked)} className="w-4 h-4 accent-teal-700" />Log today when I open it in Gmail or copy it{k === 'quote' || k === 'invoice' ? ' (and mark “Waiting on them”)' : ''}</label>
            <button type="button" onClick={saveAsUsual} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline"><Bookmark size={14} />{hasSaved ? 'Update their usual email' : 'Save as their usual email'}</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Copy size={15} />Copy</button>
          {contact.email && (
            <a href={gmailCompose(contact.email, subject, message)} target="_blank" rel="noopener noreferrer" onClick={() => { logged(); onClose() }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink size={15} />Open in Gmail</a>
          )}
          {contact.email && (
            <button type="button" onClick={() => sendIt('me')} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Inbox size={15} />{busy === 'me' ? 'Sending…' : 'Email it to me'}</button>
          )}
          {contact.email && (
            <button type="button" onClick={() => sendIt('send')} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold disabled:opacity-60"><Send size={15} />{busy === 'send' ? 'Sending…' : 'Send'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
