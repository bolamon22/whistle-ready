'use client'

// Sponsors & partners on the Website page (Oct 14 2026 redesign, Bo approved the
// "Sponsors Section Cleanup" canvas). One line per sponsor; the editor opens for the
// one being changed. Before this every card was always open and listed all 53
// tournaments Sunshine has ever run, so six sponsors scrolled past 318 event buttons.
//
// Where a sponsor shows is picked per EVENT (Monster Mash, Fall Classic...), by date
// or for every year. Every year is matched by name on the public pages
// (lib/sponsors sponsorsForEvent), so next season's copy of the tournament credits
// the partner the day it's created. The rows and the summary come from
// lib/sponsorPicker, which has no database import: this is a client component.

import { useState } from 'react'
import { ChevronUp, ChevronDown, GripVertical, Plus } from 'lucide-react'
import GalleryPicker from '@/components/GalleryPicker'
import { sponsorList, sponsorsForEvent, splitSponsors } from '@/lib/sponsors'
import { pickerRows, whereSummary, isUpcoming, eventWhen, OTHER_EVENTS } from '@/lib/sponsorPicker'

export type SiteSponsor = { name: string; logoUrl: string; url: string; role?: string; tier?: string; blurb?: string; eventIds?: string[]; series?: string[] }

const BLANK: SiteSponsor = { name: '', logoUrl: '', url: '', role: '', tier: 'official', blurb: '', eventIds: [], series: [] }

const initials = (name: string) => name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 3).map(w => w[0]!.toUpperCase()).join('') || '+'

function Logo({ s, big }: { s: SiteSponsor; big?: boolean }) {
  const box = big ? 'h-14 w-14' : 'h-11 w-11'
  return s.logoUrl
    ? <img src={s.logoUrl} alt="" className={`${box} object-contain rounded-lg border border-slate-200 bg-white flex-shrink-0`} />
    : <span aria-hidden="true" className={`${box} rounded-lg border border-slate-200 bg-slate-50 flex-shrink-0 inline-flex items-center justify-center text-[11px] font-bold text-slate-500`}>{initials(s.name)}</span>
}

/** "A", "A and B", "A, B and C". */
const andList = (xs: string[]) => xs.length < 2 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** Where an index lands after the item at `from` moves to `to`. */
function shifted(idx: number, from: number, to: number): number {
  if (idx === from) return to
  if (from < idx && idx <= to) return idx - 1
  if (to <= idx && idx < from) return idx + 1
  return idx
}

export default function SponsorsEditor({ sponsors, onChange, tournaments, uploadImage }: {
  sponsors: SiteSponsor[]
  onChange: (fn: (list: SiteSponsor[]) => SiteSponsor[]) => void
  tournaments: any[]
  uploadImage: (f: File) => Promise<string | null>
}) {
  const [open, setOpen] = useState<number | null>(null)
  const [older, setOlder] = useState<Record<number, boolean>>({})
  // "Only some events" chosen while nothing is picked yet. Nothing picked still means
  // every event, so the choice lives here until the first date or event is ticked.
  const [some, setSome] = useState<Record<number, boolean>>({})
  // Drag for a mouse, arrows for everything else: HTML5 drag events don't fire on iOS
  // and this page gets used from an iPad. Armed only while the grip is held, or a
  // draggable row swallows text selection in the inputs inside it.
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [armed, setArmed] = useState(false)
  const [wallId, setWallId] = useState('')
  const [uploadErr, setUploadErr] = useState<number | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const update = (i: number, patch: Partial<SiteSponsor>) => onChange(list => list.map((x, j) => j === i ? { ...x, ...patch } : x))
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= sponsors.length) return
    onChange(list => { const a = [...list]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a })
    setOpen(o => o === null ? null : shifted(o, from, to))
    setOlder({}); setSome({})
  }
  const remove = (i: number) => {
    const name = sponsors[i]?.name?.trim() || 'this sponsor'
    if (!window.confirm(`Remove ${name}? It comes off the site when you click Save.`)) return
    onChange(list => list.filter((_, j) => j !== i))
    setOpen(null); setOlder({}); setSome({})
  }
  const add = () => { onChange(list => [...list, { ...BLANK }]); setOpen(sponsors.length) }
  const upload = async (i: number, f?: File | null) => {
    if (!f) return
    const u = await uploadImage(f)
    if (u) { update(i, { logoUrl: u }); setUploadErr(null) } else setUploadErr(i)
  }

  const presenting = sponsors.map((_, i) => i).filter(i => sponsors[i].tier === 'presenting')
  const partners = sponsors.map((_, i) => i).filter(i => sponsors[i].tier !== 'presenting')

  // The logo wall check: the same filter the event page runs, on the edits not yet saved.
  const byStart = (a: any, b: any) => String(a.startDate || '').localeCompare(String(b.startDate || ''))
  const upcoming = tournaments.filter(t => isUpcoming(t, today)).sort(byStart)
  const wallChoices = upcoming.length ? upcoming : [...tournaments].sort(byStart).reverse().slice(0, 5)
  const wallT = wallChoices.find(t => String(t.id) === wallId) || wallChoices[0]
  const wall = wallT ? splitSponsors(sponsorsForEvent(sponsorList(sponsors), String(wallT.id), String(wallT.name || ''))) : null
  const wallCount = wall ? wall.presenting.length + wall.official.length : 0
  const wallLine = !wall ? '' : wallCount === 0 ? 'No logos on this event’s page yet.'
    : `${wallCount} logo${wallCount === 1 ? '' : 's'}: ` + [
        wall.presenting.length ? `${andList(wall.presenting.map(s => s.name || 'Unnamed'))} on top` : '',
        wall.official.length ? `${wall.presenting.length ? 'then ' : ''}${andList(wall.official.map(s => s.name || 'Unnamed'))}` : '',
      ].filter(Boolean).join(', ') + '.'

  const row = (i: number, group: number[]) => {
    const s = sponsors[i]
    const pos = group.indexOf(i)
    const prev = group[pos - 1], next = group[pos + 1]
    const isOpen = open === i
    const sum = whereSummary(tournaments, s, today)
    const tag = (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${sum.everyEvent ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-700'}`}>{sum.text}</span>
        {sum.noUpcoming && <span className="text-xs text-amber-700">Not on any upcoming event</span>}
      </span>
    )
    return (
      <div key={i}
        draggable={armed}
        onDragStart={e => { setDrag(i); e.dataTransfer.effectAllowed = 'move' }}
        onDragOver={e => { if (drag !== null && group.includes(drag)) { e.preventDefault(); setOver(i) } }}
        onDrop={() => { if (drag !== null && group.includes(drag)) move(drag, i); setDrag(null); setOver(null); setArmed(false) }}
        onDragEnd={() => { setDrag(null); setOver(null); setArmed(false) }}
        className={`border-t border-slate-200 first:border-t-0 transition-colors ${drag === i ? 'opacity-40' : ''} ${over === i && drag !== null && drag !== i ? 'bg-teal-50' : ''} ${isOpen ? 'bg-slate-50/60' : 'bg-white'}`}>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex flex-col items-center shrink-0">
            <span onPointerDown={() => setArmed(true)} onPointerUp={() => setArmed(false)}
              className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none" title="Drag to reorder">
              <GripVertical size={16} />
            </span>
            <button type="button" onClick={() => move(i, prev)} disabled={prev === undefined} aria-label={`Move ${s.name || 'sponsor'} up`}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-30 p-0.5"><ChevronUp size={14} /></button>
            <button type="button" onClick={() => move(i, next)} disabled={next === undefined} aria-label={`Move ${s.name || 'sponsor'} down`}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-30 p-0.5"><ChevronDown size={14} /></button>
          </div>
          <Logo s={s} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 truncate">{s.name || 'New sponsor'}</div>
            <div className="text-xs text-slate-500 truncate">{s.role || 'No role yet'}</div>
            <div className="sm:hidden mt-1.5">{tag}</div>
          </div>
          <div className="hidden sm:block max-w-[45%] text-right">{tag}</div>
          <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}
            className="shrink-0 text-sm font-semibold rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">
            {isOpen ? 'Done' : 'Edit'}
          </button>
        </div>
        {isOpen && editor(i)}
      </div>
    )
  }

  const editor = (i: number) => {
    const s = sponsors[i]
    const everyEvent = !(s.eventIds?.length) && !(s.series?.length)
    const someMode = !everyEvent || !!some[i]
    const { rows, hiddenOlder } = pickerRows(tournaments, s, today, !!older[i])
    const toggleDate = (id: string) => {
      const cur = s.eventIds || []
      update(i, { eventIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] })
    }
    const toggleYear = (label: string) => {
      const cur = s.series || []
      update(i, { series: cur.includes(label) ? cur.filter(x => x !== label) : [...cur, label] })
    }
    const chipCls = (on: boolean) => `text-xs font-semibold rounded-full px-3 py-1.5 border transition-colors ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`
    return (
      <div className="px-3 pb-4 pt-3 border-t border-slate-200 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-600">Name
            <input className="input mt-1" value={s.name} onChange={e => update(i, { name: e.target.value })} placeholder="Sponsor name" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">Link
            <input className="input mt-1" value={s.url} onChange={e => update(i, { url: e.target.value })} placeholder="https://…" />
          </label>
          {/* The role is what makes a logo legible: several marks have their name baked in
              at a size nobody can read on a phone. */}
          <label className="block text-xs font-semibold text-slate-600">Role under the logo
            <input className="input mt-1" value={s.role || ''} onChange={e => update(i, { role: e.target.value })} placeholder="e.g. Official apparel, Host venue" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">Placement
            <select className="select mt-1" value={s.tier || 'official'} onChange={e => update(i, { tier: e.target.value })}>
              <option value="official">Partner in the grid</option>
              <option value="presenting">Presenting: featured row above the grid</option>
            </select>
          </label>
        </div>
        {/* Only the presenting row has space for a sentence, so only ask for one there. */}
        {s.tier === 'presenting' && (
          <label className="block text-xs font-semibold text-slate-600">One line about them (featured row only)
            <input className="input mt-1" value={s.blurb || ''} onChange={e => update(i, { blurb: e.target.value })} placeholder="What they do for the event" />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Logo s={s} big />
          <label className="text-sm font-semibold rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 cursor-pointer">
            Upload logo<input type="file" accept="image/*" className="hidden" onChange={e => upload(i, e.target.files?.[0])} />
          </label>
          <GalleryPicker label="From library" onPick={url => update(i, { logoUrl: url })}
            triggerClassName="text-sm font-semibold rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5" />
          {uploadErr === i && <span className="text-xs text-red-600">That upload didn&rsquo;t work. Try again.</span>}
        </div>

        <fieldset className="border border-slate-200 rounded-xl p-3 space-y-3 bg-white">
          <legend className="px-1.5 text-xs font-semibold text-slate-600">Shows at</legend>
          <div className="inline-flex rounded-full bg-slate-100 p-1" role="group" aria-label="Where this sponsor shows">
            <button type="button" aria-pressed={!someMode}
              onClick={() => { update(i, { eventIds: [], series: [] }); setSome(m => ({ ...m, [i]: false })) }}
              className={`text-sm font-semibold rounded-full px-4 py-1.5 ${!someMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>Every event</button>
            <button type="button" aria-pressed={someMode}
              onClick={() => setSome(m => ({ ...m, [i]: true }))}
              className={`text-sm font-semibold rounded-full px-4 py-1.5 ${someMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>Only some events</button>
          </div>
          {someMode && (
            <>
              {everyEvent && <p className="text-xs text-slate-500">Nothing picked yet, so this sponsor still shows at every event.</p>}
              {rows.length === 0 && <p className="text-xs text-slate-500">No events to pick from yet.</p>}
              <div className="space-y-2.5">
                {rows.map(r => (
                  <div key={r.label} className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3">
                    <span className="text-sm font-semibold text-slate-700 sm:w-44 sm:pt-1 shrink-0">{r.label}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {r.chips.map(ch => {
                        const text = r.label === OTHER_EVENTS ? `${ch.name}${ch.when ? ` · ${ch.when}` : ''}` : (ch.when || ch.name)
                        return (
                          <button key={ch.id} type="button" aria-pressed={ch.on} disabled={ch.byYear}
                            title={ch.byYear ? `${ch.name}: on because of Every year` : ch.name}
                            onClick={() => toggleDate(ch.id)}
                            className={`${chipCls(ch.on)} ${ch.byYear ? 'cursor-default opacity-90' : ''}`}>
                            {text}
                          </button>
                        )
                      })}
                      {r.recurring && (
                        <button type="button" aria-pressed={r.everyYear} onClick={() => toggleYear(r.label)}
                          title={`Show at every ${r.label}, including ones you haven't created yet`}
                          className={chipCls(r.everyYear)}>
                          Every year
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {(hiddenOlder > 0 || older[i]) && (
                <button type="button" aria-expanded={!!older[i]} onClick={() => setOlder(o => ({ ...o, [i]: !o[i] }))}
                  className="text-sm font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2 py-1">
                  {older[i] ? 'Hide older events' : `Show ${hiddenOlder} older event${hiddenOlder === 1 ? '' : 's'}`}
                </button>
              )}
              <p className="text-xs text-slate-500">Every year keeps the sponsor on that event&rsquo;s next tournament as soon as you create it.</p>
            </>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => remove(i)}
            className="text-sm font-semibold rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:border-red-300 hover:text-red-700">Remove sponsor</button>
          <button type="button" onClick={() => setOpen(null)}
            className="ml-auto text-sm font-semibold rounded-full bg-teal-600 px-4 py-2 text-white hover:bg-teal-700">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <p className="text-xs text-slate-500 flex-1 min-w-[220px]">
          Every sponsor shows on your home page. An event&rsquo;s page shows the sponsors set to
          <strong className="font-semibold text-slate-600"> Every event</strong>, plus the ones picked for it.
        </p>
        <button type="button" onClick={add}
          className="text-sm font-semibold rounded-full bg-teal-600 px-4 py-2 text-white hover:bg-teal-700 inline-flex items-center gap-1"><Plus size={15} /> Add sponsor</button>
      </div>

      {sponsors.length > 0 && wallT && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">See an event&rsquo;s logo wall
            <select className="select !w-auto max-w-full text-sm font-normal" value={String(wallT.id)} onChange={e => setWallId(e.target.value)}>
              {wallChoices.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.name || 'Event').trim()}{eventWhen(t.startDate, t.endDate) ? ` · ${eventWhen(t.startDate, t.endDate)}` : ''}</option>)}
            </select>
          </label>
          <p className="text-sm text-slate-600" aria-live="polite">{wallLine}</p>
        </div>
      )}

      {sponsors.length === 0 && <p className="text-sm text-slate-500">No sponsors yet. Click Add sponsor.</p>}

      {presenting.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Presenting &middot; featured row above the grid</div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">{presenting.map(i => row(i, presenting))}</div>
        </div>
      )}
      {partners.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Partners &middot; in the grid, in this order</div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">{partners.map(i => row(i, partners))}</div>
        </div>
      )}
    </div>
  )
}
