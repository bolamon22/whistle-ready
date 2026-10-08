// Ready-made emails to an event vendor (tents, golf carts, dumpsters, food...):
// ask for a quote, approve it, confirm delivery, ask for the invoice.
//
// Pure -- no database import -- so the Write an email dialog drafts in the
// browser. Nothing here sends: the dialog opens the draft in Bo's Gmail (or
// copies it) and he sends it himself.
//
// Bo, Oct 5 2026: "Can we have prebuilt emails ready to go for the tent
// company?" The quote request lists last time's order, item by item, from the
// vendor's cost history, so asking for "same as last year" is one click.

import type { ContactView } from '@/lib/contactTypes'
import type { TaskTournament } from '@/lib/taskTemplate'
import { costTotal, money, type CostView } from '@/lib/costTypes'
import { eventDates, greeting } from '@/lib/contactSend'

export type VendorEmailKind = 'quote' | 'book' | 'confirm' | 'invoice'
export const VENDOR_EMAILS: { key: VendorEmailKind; label: string; when: string }[] = [
  { key: 'quote', label: 'Ask for a quote', when: '6–8 weeks out' },
  { key: 'book', label: 'Approve the quote', when: 'when the quote comes in' },
  { key: 'confirm', label: 'Confirm delivery', when: 'the week of' },
  { key: 'invoice', label: 'Ask for the invoice', when: 'after the event' },
]

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shift(ymd: string, days: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days))
}
/** "Friday, Oct 23" */
export function dayLabel(ymd: string, days = 0): string {
  const d = shift(ymd, days)
  return d ? `${DAY[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}` : ''
}

/** Lines on a quote that are charges, not things we order (delivery, setup, fees). */
export const isFeeLine = (item: string) => /\b(deliver|delivery|set ?up|setup|pick ?up|fee|tax|surcharge|waiting|damage)\b/i.test(item)

/** "10 10x10 tents on grass" -- quantities without trailing .00, the item in plain case. */
function orderLine(i: { item: string; qty: number }): string {
  const name = i.item === i.item.toUpperCase() ? i.item.toLowerCase().replace(/['’]s\b/g, 's') : i.item
  return `- ${i.qty} ${name}`
}

/** Rentals are delivered the day before and picked up after the last game or the next day. */
function deliveryLines(ev: Pick<TaskTournament, 'firstDay' | 'lastDay'> | null): { drop: string; pick: string } | null {
  if (!ev?.firstDay) return null
  const last = ev.lastDay || ev.firstDay
  return { drop: dayLabel(ev.firstDay, -1).replace(',', ' morning,'), pick: `${dayLabel(last)} after 4pm or ${dayLabel(last, 1)}` }
}

export function vendorEmail(o: {
  kind: VendorEmailKind
  contact: Pick<ContactView, 'name' | 'company' | 'category'>
  event: Pick<TaskTournament, 'name' | 'firstDay' | 'lastDay' | 'location'> | null
  /** Where things are delivered: the event's venue address, else the event's location. */
  address: string
  /** This event's cost line with this vendor, if there is one (its quote # and total). */
  cost: Pick<CostView, 'quoteRef' | 'items' | 'tax' | 'budget' | 'status'> | null
  /** The vendor's last real order, for "same as last time". */
  last: (Pick<CostView, 'items' | 'eventDate' | 'eventLabel'> & { label: string }) | null
  signer: string
}): { subject: string; message: string } {
  const ev = o.event
  const name = ev?.name.trim() || 'our event'
  const when = ev ? eventDates(ev) : ''
  const hi = greeting([{ name: o.contact.name }])
  const sign = `Thanks,\n${(o.signer || '').trim().split(/\s+/)[0] || ''}`.trim()
  const where = o.address || ev?.location || ''
  const delivers = o.contact.category === 'rentals' ? deliveryLines(ev) : null
  const ref = o.cost?.quoteRef ? `#${o.cost.quoteRef}` : ''
  const total = o.cost && o.cost.items.length ? costTotal(o.cost) : 0
  const about = `${name}${when ? ` (${when})` : ''}`

  if (o.kind === 'quote') {
    const items = (o.last?.items || []).filter(i => i.item.trim() && i.qty > 0 && !isFeeLine(i.item))
    const list = items.length ? items.map(orderLine).join('\n') : '- '
    const same = o.last && items.length ? `Same as last time (${o.last.label}):\n` : ''
    return {
      subject: `Quote request – ${name}${when ? `, ${when}` : ''}`,
      message: [
        hi, '',
        `Can you send me a quote for ${about}${where ? ` at ${where}` : ''}?`, '',
        `${same}${list}`,
        ...(delivers ? ['', `Delivery ${delivers.drop}, pickup ${delivers.pick}.`] : []),
        '', sign,
      ].join('\n'),
    }
  }
  if (o.kind === 'book') {
    return {
      subject: `Approved${ref ? `: quote ${ref}` : ''} – ${name}`,
      message: [
        hi, '',
        `${ref ? `Quote ${ref}` : 'The quote'}${total ? ` (${money(total)})` : ''} looks good. Please go ahead and book it for ${about}${where ? ` at ${where}` : ''}.`,
        ...(delivers ? ['', `Delivery ${delivers.drop} and pickup ${delivers.pick} works.`] : []),
        '', 'Let me know what you need from me to lock it in.',
        '', sign,
      ].join('\n'),
    }
  }
  if (o.kind === 'confirm') {
    return {
      subject: `Confirming ${delivers ? 'delivery' : 'details'} – ${name}${when ? `, ${when}` : ''}`,
      message: [
        hi, '',
        `Checking in ahead of ${about}${ref ? `, quote ${ref}` : ''}.`,
        ...(delivers
          ? ['', `Confirming delivery ${delivers.drop}${where ? ` to ${where}` : ''} and pickup ${delivers.pick}.`]
          : where ? ['', `We're at ${where}.`] : []),
        '', 'Call me if anything changes.',
        '', sign,
      ].join('\n'),
    }
  }
  return {
    subject: `Final invoice${ref ? ` ${ref}` : ''} – ${name}`,
    message: [
      hi, '',
      `Thanks for your help with ${name}. Can you send the final invoice${ref ? ` for quote ${ref}` : ''}${o.cost?.status === 'paid' ? ', marked paid,' : ''} so I can close out our books?`,
      '', sign,
    ].join('\n'),
  }
}

/** Gmail's compose window, filled in. Bo reviews and sends it from his own inbox. */
export function gmailCompose(to: string, subject: string, body: string): string {
  const q = (s: string) => encodeURIComponent(s)
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}&su=${q(subject)}&body=${q(body)}`
}

// ── A contact's usual email ───────────────────────────────────────────────────
// Bo, Oct 8 2026: "I normally respond with an email, and it's typically the
// same exact email every year." Saved on the contact with this year's facts
// swapped for {tokens}; next year the tokens are filled from that event.

export type TemplateVars = { event: string; dates: string; year: string; teams: string; place: string; first: string; me: string }

export const TEMPLATE_TOKENS: { key: keyof TemplateVars; label: string }[] = [
  { key: 'event', label: 'event name' }, { key: 'dates', label: 'dates' }, { key: 'year', label: 'year' },
  { key: 'teams', label: 'team count' }, { key: 'place', label: 'location' }, { key: 'first', label: 'their first name' }, { key: 'me', label: 'your first name' },
]

export function templateVars(o: {
  event: Pick<TaskTournament, 'name' | 'firstDay' | 'lastDay' | 'location'> | null
  teams: number | null
  contactName: string
  signer: string
}): TemplateVars {
  const first = greeting([{ name: o.contactName }]).replace(/^Hi\s*/, '').replace(/,$/, '').replace(/^all$/, '')
  return {
    event: o.event?.name.trim() || '',
    dates: o.event ? eventDates(o.event) : '',
    year: (o.event?.firstDay || '').slice(0, 4),
    teams: o.teams === null ? '' : String(o.teams),
    place: o.event?.location || '',
    first,
    me: (o.signer || '').trim().split(/\s+/)[0] || '',
  }
}

/** "{event} on {dates}" -> "Monster Mash Lax Clash on Oct 24–25, 2026". Unknown values stay as [token]. */
export function fillTemplate(text: string, v: TemplateVars): string {
  return text.replace(/\{(event|dates|year|teams|place|first|me)\}/g, (_, k: keyof TemplateVars) => v[k] || `[${k}]`)
}

/** This year's facts in a written email turned back into {tokens}, longest first so "Oct 24–25, 2026" wins over "2026". */
export function toTemplate(text: string, v: TemplateVars): string {
  const pairs = (Object.entries(v) as [keyof TemplateVars, string][])
    .filter(([k, val]) => val && val.length >= (k === 'teams' ? 2 : 3) && k !== 'first' && k !== 'me')
    .sort((a, b) => b[1].length - a[1].length)
  let out = text
  for (const [k, val] of pairs) {
    const esc = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Numbers only as whole words: "97" must not eat "1997".
    const re = k === 'teams' || k === 'year' ? new RegExp(`(?<![\\d])${esc}(?![\\d])`, 'g') : new RegExp(esc, 'g')
    out = out.replace(re, `{${k}}`)
  }
  return out
}
