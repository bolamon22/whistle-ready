'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Copy, ExternalLink, Mail, X } from 'lucide-react'
import type { TaskTournament } from '@/lib/taskTemplate'
import type { ContactRow, ContactView } from '@/lib/contactTypes'
import { lastOrder } from '@/lib/costTypes'
import { VENDOR_EMAILS, gmailCompose, vendorEmail, type VendorEmailKind } from '@/lib/vendorEmails'
import { costLabel, useCosts } from '@/components/costs/useCosts'

// Write an email to a vendor from a ready-made one: ask for a quote (last
// time's order filled in), approve it, confirm delivery, ask for the invoice.
// It opens in Bo's Gmail to send, or copies -- Whistle Ready sends nothing.

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
  const [kind, setKind] = useState<VendorEmailKind | null>(null)
  const k = kind || suggested

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
    const d = vendorEmail({
      kind: k, contact, event, address, cost, signer: myName,
      last: last ? { ...last, label: costLabel(last, data?.tournaments || []) } : null,
    })
    setSubject(d.subject); setMessage(d.message)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, eventId, cost?.id, cost?.status, last?.id, address, myName, edited])

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
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={logIt} onChange={e => setLogIt(e.target.checked)} className="w-4 h-4 accent-teal-700" />Log today as last contact{k === 'quote' || k === 'invoice' ? ' and mark “Waiting on them”' : ''}</label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Copy size={15} />Copy</button>
          {contact.email && (
            <a href={gmailCompose(contact.email, subject, message)} target="_blank" rel="noopener noreferrer" onClick={() => { logged(); onClose() }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"><ExternalLink size={15} />Open in Gmail</a>
          )}
        </div>
      </div>
    </div>
  )
}
