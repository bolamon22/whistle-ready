'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { DEFAULT_PAY_RATES, PayRates } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────
interface TimeSlot { start: string; end: string }
interface DayAvailability { date: string; slots: TimeSlot[] }
interface Field { id: string; name: string; availStart?: string; availEnd?: string; divRestrictions?: string[] }
interface Venue { id: string; name: string; fields: Field[] }

// ─── Constants ───────────────────────────────────────────────────────────────
const SPORTS = ['Lacrosse','Flag Football','Soccer','Football','Basketball','Baseball','Softball','Field Hockey','Hockey','Rugby','Volleyball','Other']

const DEFAULT_DIVISIONS = [
  'Boys U8',
  'Boys U10',
  'Boys U12',
  'Boys U14',
  'Boys High School B',
  'Boys High School A',
  'Girls Lower School',
  'Girls Middle School B',
  'Girls Middle School A',
  'Girls High School B',
  'Girls High School A',
]

interface DivisionItem { def: string; display: string; checked: boolean }
function toDivItems(stored: string[]): DivisionItem[] {
  return DEFAULT_DIVISIONS.map(def => {
    const match = stored.find(s => s === def) ?? stored.find(s => s.toLowerCase().startsWith(def.toLowerCase().slice(0, 8)))
    return { def, display: match ?? def, checked: !!match }
  })
}
function fromDivItems(items: DivisionItem[], customs: string[]): string[] {
  return [...items.filter(i => i.checked).map(i => i.display), ...customs]
}

const DEFAULT_PRICING = { tier1: 1495, tier1Max: 3, tier2: 1450, tier2Max: 6, tier3: 1395, sevenVSeven: 1095 }

const RATE_FIELDS = [
  { key: 'youth',            label: 'Referee – Youth Cert' },
  { key: 'hs',               label: 'Referee – HS Cert' },
  { key: 'college',          label: 'Referee – College Cert' },
  { key: 'scorekeeper',      label: 'Scorekeeper' },
  { key: 'athletic_trainer', label: 'Athletic Trainer (hourly)' },
  { key: 'field_ops',        label: 'Field Ops (hourly)' },
  { key: 'assigner',         label: 'Assigner Bonus' },
]

const SECTIONS = [
  { id: 'general',      label: 'General Info',       icon: '🏆' },
  { id: 'divisions',    label: 'Divisions',           icon: '🏅' },
  { id: 'venues',       label: 'Venues & Fields',     icon: '🏟️' },
  { id: 'registration', label: 'Registration',        icon: '📋' },
  { id: 'staffpay',     label: 'Staff & Pay Rates',   icon: '💵' },
  { id: 'schedule',     label: 'Schedule Rules',      icon: '⏱' },
]

function uid() { return Math.random().toString(36).slice(2, 10) }
function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric' })
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BuilderPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeSection, setActiveSection] = useState('general')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // General
  const [name, setName]               = useState('')
  const [sport, setSport]             = useState('Lacrosse')
  const [startDate, setStartDate]     = useState('')
  const [endDate, setEndDate]         = useState('')
  const [location, setLocation]       = useState('')
  const [logoUrl, setLogoUrl]         = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [scheduleIncrement, setScheduleIncrement] = useState('50')
  const [gameLength, setGameLength]   = useState('50')
  const [breakLength, setBreakLength] = useState('10')

  // Divisions
  const [divItems, setDivItems]         = useState<DivisionItem[]>(DEFAULT_DIVISIONS.map(d => ({ def: d, display: d, checked: false })))
  const [customDivisions, setCustomDivisions] = useState<string[]>([])
  const [newDivision, setNewDivision]  = useState('')

  // Venues
  const [venues, setVenues]           = useState<Venue[]>([])
  const [newVenueName, setNewVenueName] = useState('')
  const [newFieldNames, setNewFieldNames] = useState<Record<string, string>>({})
  const [bulkFieldCounts, setBulkFieldCounts] = useState<Record<string, string>>({})
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({})
  const [defaultAvailability, setDefaultAvailability] = useState<DayAvailability[]>([])
  const [tournamentDates, setTournamentDates] = useState<string[]>([])

  // Registration
  const [pricing, setPricing]         = useState(DEFAULT_PRICING)

  // Staff & Pay
  const [rates, setRates]             = useState<PayRates>(DEFAULT_PAY_RATES)
  const [divRules, setDivRules]       = useState<Record<string, number>>({})
  const [newKeyword, setNewKeyword]   = useState('')
  const [newCount, setNewCount]       = useState('1')

  // ─── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setName(t.name); setSport(t.sport || 'Lacrosse')
      setStartDate(t.startDate || ''); setEndDate(t.endDate || '')
      setLocation(t.location || ''); setLogoUrl(t.logoUrl || '')
      setScheduleIncrement(String(t.scheduleIncrement || 50))
      setRates({ ...DEFAULT_PAY_RATES, ...JSON.parse(t.payRates || '{}') })
      setDivRules(JSON.parse(t.divisionRules || '{}'))
      try { const p = JSON.parse(t.registrationPricing || '{}'); if (p.tier1) setPricing(p) } catch {}
      try {
        const d = JSON.parse(t.registrationDivisions || '[]')
        if (d.length) {
          setDivItems(toDivItems(d))
          setCustomDivisions(d.filter((s: string) => !DEFAULT_DIVISIONS.some(def => def === s || s.toLowerCase().startsWith(def.toLowerCase().slice(0, 8)))))
        }
      } catch {}
      // Build date list
      if (t.startDate && t.endDate) {
        const dates: string[] = []
        const cur = new Date(t.startDate + 'T12:00:00')
        const end = new Date(t.endDate + 'T12:00:00')
        while (cur <= end) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1) }
        setTournamentDates(dates)
      }
      setLoading(false)
    })
    fetch(`/api/venues/${params.id}`).then(r => r.json()).then(data => {
      if (Array.isArray(data)) { setVenues(data) }
      else { if (data.venues) setVenues(data.venues); if (data.defaultAvailability) setDefaultAvailability(data.defaultAvailability) }
    }).catch(() => {})
  }, [params.id])

  // ─── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true)
    await Promise.all([
      fetch(`/api/tournaments/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, sport, startDate, endDate, location, logoUrl,
          scheduleIncrement: parseInt(scheduleIncrement) || 50,
          payRates: rates, divisionRules: divRules,
          registrationPricing: JSON.stringify(pricing),
          registrationDivisions: JSON.stringify(fromDivItems(divItems, customDivisions)),
        }),
      }),
      fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venues, defaultAvailability }),
      }),
    ])
    toast.success('Saved!')
    setSaving(false)
  }

  // ─── Logo upload ───────────────────────────────────────────────────────────
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setLogoUploading(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const { url } = await res.json()
    setLogoUrl(url); toast.success('Logo uploaded!')
    setLogoUploading(false)
  }

  // ─── Venue helpers ─────────────────────────────────────────────────────────
  function addVenue() {
    if (!newVenueName.trim()) return
    setVenues(v => [...v, { id: uid(), name: newVenueName.trim(), fields: [] }])
    setNewVenueName('')
  }
  function updateVenueName(id: string, n: string) { setVenues(v => v.map(x => x.id === id ? { ...x, name: n } : x)) }
  function removeVenue(id: string) { setVenues(v => v.filter(x => x.id !== id)) }
  function addField(venueId: string) {
    const n = (newFieldNames[venueId] || '').trim(); if (!n) return
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: [...x.fields, { id: uid(), name: n }] } : x))
    setNewFieldNames(f => ({ ...f, [venueId]: '' }))
  }
  function bulkAddFields(venueId: string) {
    const count = parseInt(bulkFieldCounts[venueId] || '0')
    if (!count || count < 1 || count > 50) return
    const existing = venues.find(v => v.id === venueId)?.fields.length || 0
    const newFields = Array.from({ length: count }, (_, i) => ({ id: uid(), name: String(existing + i + 1) }))
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: [...x.fields, ...newFields] } : x))
    setBulkFieldCounts(f => ({ ...f, [venueId]: '' }))
  }
  function removeField(venueId: string, fieldId: string) {
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: x.fields.filter(f => f.id !== fieldId) } : x))
  }
  function updateFieldName(venueId: string, fieldId: string, name: string) {
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: x.fields.map(f => f.id === fieldId ? { ...f, name } : f) } : x))
  }
  function updateField(venueId: string, fieldId: string, patch: Partial<Field>) {
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: x.fields.map(f => f.id === fieldId ? { ...f, ...patch } : f) } : x))
  }

  // ─── Completion indicators ─────────────────────────────────────────────────
  function isComplete(id: string) {
    if (id === 'general')      return !!(name && startDate && location)
    if (id === 'divisions')    return divItems.some(i => i.checked) || customDivisions.length > 0
    if (id === 'venues')       return venues.length > 0
    if (id === 'registration') return pricing.tier1 > 0
    if (id === 'staffpay')     return Object.values(rates).some(v => v > 0)
    if (id === 'schedule')     return !!(scheduleIncrement)
    return false
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  // ─── Section panels ────────────────────────────────────────────────────────
  function renderSection() {
    // ── General Info ──
    if (activeSection === 'general') return (
      <div className="space-y-5">
        <div>
          <label className="label">Tournament Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spring Classic 2026" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Sport</label>
            <select className="select" value={sport} onChange={e => setSport(e.target.value)}>
              {SPORTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Village Park, Pleasanton CA" />
          </div>
          <div>
            <label className="label">Start Date</label>
            <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Tournament Logo</label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-20 w-20 object-contain rounded-xl border border-gray-200" />
            ) : (
              <div className="h-20 w-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-3xl">🏆</div>
            )}
            <div className="space-y-2">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="btn-secondary btn-sm" disabled={logoUploading}>
                {logoUploading ? 'Uploading…' : logoUrl ? '🔄 Replace Logo' : '📁 Upload Logo'}
              </button>
              {logoUrl && <button type="button" onClick={() => setLogoUrl('')} className="block text-xs text-red-400 hover:text-red-600">Remove</button>}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </div>
      </div>
    )

    // ── Divisions ──
    if (activeSection === 'divisions') return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">Check the divisions for this tournament. Click a checked division name to rename it.</p>
          <div className="flex gap-2 flex-shrink-0 ml-4">
            <button type="button"
              onClick={() => {
                const saved = localStorage.getItem('gameday_div_prefs')
                if (saved) {
                  const { items, customs } = JSON.parse(saved)
                  setDivItems(items); setCustomDivisions(customs)
                  toast.success('Loaded your saved preferences')
                } else toast.error('No saved preferences found')
              }}
              className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap">
              Load my defaults
            </button>
            <button type="button"
              onClick={() => {
                localStorage.setItem('gameday_div_prefs', JSON.stringify({ items: divItems, customs: customDivisions }))
                toast.success('Preferences saved!')
              }}
              className="text-xs border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-blue-600 whitespace-nowrap">
              Save as my defaults
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-5">
          {divItems.map((item, idx) => (
            <div key={item.def} className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${item.checked ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-transparent'}`}>
              <input type="checkbox" checked={item.checked} className="w-4 h-4 accent-blue-600 flex-shrink-0"
                onChange={e => setDivItems(prev => prev.map((d, i) => i === idx ? { ...d, checked: e.target.checked } : d))} />
              {item.checked
                ? <input
                    className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-800 focus:outline-none border-b border-transparent focus:border-blue-400 px-0.5"
                    value={item.display}
                    onChange={e => setDivItems(prev => prev.map((d, i) => i === idx ? { ...d, display: e.target.value } : d))} />
                : <span className="text-sm text-gray-400 flex-1 truncate">{item.def}</span>
              }
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Custom divisions</p>
          {customDivisions.map((d, i) => (
            <div key={i} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-1.5">
              <input type="checkbox" checked readOnly className="w-4 h-4 accent-blue-600 flex-shrink-0" />
              <input className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-800 focus:outline-none border-b border-transparent focus:border-blue-400"
                value={d} onChange={e => setCustomDivisions(prev => prev.map((v, j) => j === i ? e.target.value : v))} />
              <button type="button" onClick={() => setCustomDivisions(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input className="input flex-1" placeholder="e.g. Boys U9 (7v7)" value={newDivision}
              onChange={e => setNewDivision(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newDivision.trim()) { setCustomDivisions(p => [...p, newDivision.trim()]); setNewDivision('') } } }} />
            <button type="button" className="btn-secondary"
              onClick={() => { if (newDivision.trim()) { setCustomDivisions(p => [...p, newDivision.trim()]); setNewDivision('') } }}>Add</button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
          <span className="text-xs text-gray-400">{divItems.filter(i => i.checked).length + customDivisions.length} divisions selected</span>
          <button type="button" onClick={() => { setDivItems(prev => prev.map(d => ({ ...d, checked: false, display: d.def }))); setCustomDivisions([]) }}
            className="text-xs text-gray-400 hover:text-gray-600 underline">Clear all</button>
        </div>
      </div>
    )

    // ── Venues & Fields ──
    if (activeSection === 'venues') return (
      <div>
        {/* Default availability */}
        {tournamentDates.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-1">📅 Default Field Availability</p>
            <p className="text-xs text-gray-400 mb-3">Default hours for all fields. Override per-field using the Availability toggle on each field below.</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 w-36">Date</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Time Slots</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tournamentDates.map(dateStr => {
                    const dayAvail = defaultAvailability.find(d => d.date === dateStr)
                    const slots: TimeSlot[] = dayAvail?.slots || []
                    const updateSlot = (i: number, field: 'start' | 'end', val: string) => {
                      setDefaultAvailability(prev => {
                        const next = prev.filter(x => x.date !== dateStr)
                        return [...next, { date: dateStr, slots: slots.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }].sort((a,b) => a.date < b.date ? -1 : 1)
                      })
                    }
                    const addSlot = () => setDefaultAvailability(prev => [...prev.filter(x => x.date !== dateStr), { date: dateStr, slots: [...slots, { start: '', end: '' }] }].sort((a,b) => a.date < b.date ? -1 : 1))
                    const removeSlot = (i: number) => {
                      const updated = slots.filter((_, idx) => idx !== i)
                      setDefaultAvailability(prev => updated.length === 0 ? prev.filter(x => x.date !== dateStr) : [...prev.filter(x => x.date !== dateStr), { date: dateStr, slots: updated }].sort((a,b) => a.date < b.date ? -1 : 1))
                    }
                    return (
                      <tr key={dateStr} className="align-top">
                        <td className="px-4 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">{fmtDate(dateStr)}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            {slots.map((slot, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input type="time" className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" value={slot.start} onChange={e => updateSlot(i, 'start', e.target.value)} />
                                <span className="text-gray-400 text-xs">to</span>
                                <input type="time" className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" value={slot.end} onChange={e => updateSlot(i, 'end', e.target.value)} />
                                <button type="button" onClick={() => removeSlot(i)} className="text-red-300 hover:text-red-500 text-xs">✕</button>
                              </div>
                            ))}
                            <button type="button" onClick={addSlot} className="text-xs text-blue-500 hover:text-blue-700 hover:underline">+ Add time slot</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {venues.length === 0 && <p className="text-sm text-gray-400 italic mb-4">No venues yet. Add one below.</p>}

        <div className="space-y-4 mb-4">
          {venues.map(venue => (
            <div key={venue.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-gray-400 text-sm">🏟</span>
                <input className="flex-1 bg-transparent text-sm font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
                  value={venue.name} onChange={e => updateVenueName(venue.id, e.target.value)} />
                <button type="button" onClick={() => removeVenue(venue.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
              <div className="divide-y divide-gray-100">
                {venue.fields.map((field, idx) => (
                  <div key={field.id}>
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}</span>
                      <input className="flex-1 text-sm text-gray-700 border border-transparent focus:border-gray-300 focus:outline-none rounded px-2 py-1 focus:ring-1 focus:ring-blue-400"
                        value={field.name} onChange={e => updateFieldName(venue.id, field.id, e.target.value)} />
                      <button type="button" onClick={() => setExpandedFields(e => ({ ...e, [field.id]: !e[field.id] }))}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors whitespace-nowrap ${expandedFields[field.id] ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}>
                        {expandedFields[field.id] ? '▲ Availability' : '▼ Availability'}
                      </button>
                      <button type="button" onClick={() => removeField(venue.id, field.id)} className="text-red-300 hover:text-red-500 text-sm">✕</button>
                    </div>
                    {expandedFields[field.id] && (
                      <div className="bg-blue-50 border-t border-blue-100 px-6 py-4 space-y-4">
                        <div>
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">⏰ Available Hours</p>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-500">From</label>
                              <input type="time" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={field.availStart || ''} onChange={e => updateField(venue.id, field.id, { availStart: e.target.value })} />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-500">To</label>
                              <input type="time" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={field.availEnd || ''} onChange={e => updateField(venue.id, field.id, { availEnd: e.target.value })} />
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🏅 Division Restrictions</p>
                            <span className="text-xs text-gray-400">{(field.divRestrictions?.length || 0) === 0 ? 'All divisions' : `${field.divRestrictions!.length} restricted`}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {fromDivItems(divItems, customDivisions).map(div => {
                              const checked = (field.divRestrictions || []).includes(div)
                              return (
                                <label key={div} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors ${checked ? 'bg-white border border-blue-200 font-medium text-gray-800' : 'text-gray-500 hover:bg-white/60'}`}>
                                  <input type="checkbox" checked={checked} className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0"
                                    onChange={e => {
                                      const cur = field.divRestrictions || []
                                      updateField(venue.id, field.id, { divRestrictions: e.target.checked ? [...cur, div] : cur.filter(d => d !== div) })
                                    }} />
                                  <span className="truncate">{div}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 whitespace-nowrap">How many fields?</span>
                  <input type="number" min="1" max="50" className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                    placeholder="e.g. 7" value={bulkFieldCounts[venue.id] || ''}
                    onChange={e => setBulkFieldCounts(f => ({ ...f, [venue.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bulkAddFields(venue.id) } }} />
                  <button type="button" onClick={() => bulkAddFields(venue.id)} disabled={!bulkFieldCounts[venue.id]}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                    Generate Fields
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 whitespace-nowrap">Or add one:</span>
                  <input className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Field name (e.g. 2A, North)" value={newFieldNames[venue.id] || ''}
                    onChange={e => setNewFieldNames(f => ({ ...f, [venue.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addField(venue.id) } }} />
                  <button type="button" onClick={() => addField(venue.id)}
                    className="text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                    + Add
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Venue / complex name (e.g. Tamarac Sports Complex)"
            value={newVenueName} onChange={e => setNewVenueName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVenue() } }} />
          <button type="button" onClick={addVenue} className="btn-secondary whitespace-nowrap">+ Add Venue</button>
        </div>
      </div>
    )

    // ── Registration ──
    if (activeSection === 'registration') return (
      <div>
        <p className="text-sm text-gray-500 mb-5">Per-team pricing tiers shown on the public registration form.</p>
        <div className="space-y-3">
          {[
            { label: <>1–<input type="number" min="1" max="10" className="border border-gray-300 rounded px-1.5 py-0.5 w-12 text-center text-sm mx-1 focus:outline-none focus:ring-1 focus:ring-blue-500" value={pricing.tier1Max} onChange={e => setPricing(p => ({ ...p, tier1Max: parseInt(e.target.value) || 3 }))} /> teams</>, price: pricing.tier1, setPrice: (v: number) => setPricing(p => ({ ...p, tier1: v })) },
            { label: <>{pricing.tier1Max + 1}–<input type="number" min="1" max="20" className="border border-gray-300 rounded px-1.5 py-0.5 w-12 text-center text-sm mx-1 focus:outline-none focus:ring-1 focus:ring-blue-500" value={pricing.tier2Max} onChange={e => setPricing(p => ({ ...p, tier2Max: parseInt(e.target.value) || 6 }))} /> teams</>, price: pricing.tier2, setPrice: (v: number) => setPricing(p => ({ ...p, tier2: v })) },
            { label: <>{pricing.tier2Max + 1}+ teams</>,                  price: pricing.tier3,       setPrice: (v: number) => setPricing(p => ({ ...p, tier3: v })) },
            { label: <>7v7 teams</>,                                       price: pricing.sevenVSeven, setPrice: (v: number) => setPricing(p => ({ ...p, sevenVSeven: v })) },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
              <p className="text-sm font-medium text-gray-700 flex items-center">{row.label}<span className="text-gray-400 text-xs ml-2">per team</span></p>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 text-sm">$</span>
                <input type="number" min="0" step="1" className="border border-gray-300 rounded-lg px-3 py-1.5 w-28 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={row.price} onChange={e => row.setPrice(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setPricing(DEFAULT_PRICING)} className="text-xs text-gray-400 hover:text-gray-600 underline mt-4 block">Reset to defaults</button>
      </div>
    )

    // ── Staff & Pay ──
    if (activeSection === 'staffpay') return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Pay Rates</h3>
          <div className="space-y-2">
            {RATE_FIELDS.map(f => (
              <div key={f.key} className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
                <p className="text-sm font-medium text-gray-700">{f.label}</p>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="0.01" className="border border-gray-300 rounded-lg px-3 py-1.5 w-24 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={rates[f.key] ?? 0} onChange={e => setRates(r => ({ ...r, [f.key]: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Ref Count Rules</h3>
          <p className="text-xs text-gray-400 mb-3">Auto-assign number of refs per division keyword.</p>
          <div className="space-y-2 mb-4">
            {Object.entries(divRules).length === 0 && <p className="text-sm text-gray-400 italic">No rules yet.</p>}
            {Object.entries(divRules).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-sm text-gray-700">Contains <strong>"{k}"</strong> → <strong>{v} ref{v !== 1 ? 's' : ''}</strong></span>
                <button type="button" onClick={() => setDivRules(r => { const n = { ...r }; delete n[k]; return n })} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Division keyword</label>
              <input className="input" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="e.g. 7v7, U8" />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1">Ref count</label>
              <select className="select" value={newCount} onChange={e => setNewCount(e.target.value)}>
                <option value="1">1 ref</option>
                <option value="2">2 refs</option>
                <option value="3">3 refs</option>
              </select>
            </div>
            <button type="button" onClick={() => { if (!newKeyword.trim()) return; setDivRules(r => ({ ...r, [newKeyword.trim()]: parseInt(newCount) || 1 })); setNewKeyword(''); setNewCount('1') }}
              className="btn-secondary mb-0.5">Add</button>
          </div>
        </div>
      </div>
    )

    // ── Schedule Rules ──
    if (activeSection === 'schedule') return (
      <div className="space-y-5">
        <p className="text-sm text-gray-500">Configure default scheduling parameters used when building or auto-assigning the game schedule.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Schedule Increment (min)</label>
            <input className="input" type="number" min="5" max="120" step="5" value={scheduleIncrement} onChange={e => setScheduleIncrement(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Time between game start slots</p>
          </div>
          <div>
            <label className="label">Game Length (min)</label>
            <input className="input" type="number" min="10" max="120" step="5" value={gameLength} onChange={e => setGameLength(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Actual play time per game</p>
          </div>
          <div>
            <label className="label">Break Between Games (min)</label>
            <input className="input" type="number" min="0" max="60" step="5" value={breakLength} onChange={e => setBreakLength(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Buffer between consecutive games</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
          More scheduling rules (pool play, blackout times, field constraints) coming soon.
        </div>
      </div>
    )

    return null
  }

  // ─── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/tournaments/${params.id}/dashboard`} className="text-sm text-gray-400 hover:text-gray-600">← Back to tournament</Link>
          <span className="text-gray-200">|</span>
          <span className="text-sm font-semibold text-gray-700">Tournament Builder</span>
          {name && <span className="text-sm text-gray-400">— {name}</span>}
        </div>
        <button onClick={save} disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
          {saving ? 'Saving…' : '💾 Save Changes'}
        </button>
      </div>

      <div className="flex max-w-6xl mx-auto py-8 px-4 gap-6">

        {/* Sidebar */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Setup</p>
            </div>
            <nav className="p-2 space-y-0.5">
              {SECTIONS.map(s => {
                const done = isComplete(s.id)
                const active = activeSection === s.id
                return (
                  <button key={s.id} onClick={() => setActiveSection(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <span className="text-base">{s.icon}</span>
                    <span className={`flex-1 text-sm font-medium ${active ? 'text-blue-700' : ''}`}>{s.label}</span>
                    <span className={`text-xs ${done ? 'text-emerald-500' : 'text-gray-200'}`}>{done ? '✓' : '○'}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Quick stats */}
          <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-4 space-y-2 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Summary</p>
            <div className="text-xs text-gray-500 space-y-1">
              <div className="flex justify-between"><span>Divisions</span><span className="font-semibold text-gray-700">{divisions.length}</span></div>
              <div className="flex justify-between"><span>Venues</span><span className="font-semibold text-gray-700">{venues.length}</span></div>
              <div className="flex justify-between"><span>Total fields</span><span className="font-semibold text-gray-700">{venues.reduce((s, v) => s + v.fields.length, 0)}</span></div>
              <div className="flex justify-between"><span>Sections done</span><span className="font-semibold text-gray-700">{SECTIONS.filter(s => isComplete(s.id)).length}/{SECTIONS.length}</span></div>
            </div>
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800">
                  {SECTIONS.find(s => s.id === activeSection)?.icon} {SECTIONS.find(s => s.id === activeSection)?.label}
                </h2>
              </div>
              <div className="flex gap-2">
                {SECTIONS.findIndex(s => s.id === activeSection) > 0 && (
                  <button onClick={() => setActiveSection(SECTIONS[SECTIONS.findIndex(s => s.id === activeSection) - 1].id)}
                    className="btn-secondary btn-sm">← Prev</button>
                )}
                {SECTIONS.findIndex(s => s.id === activeSection) < SECTIONS.length - 1 && (
                  <button onClick={() => setActiveSection(SECTIONS[SECTIONS.findIndex(s => s.id === activeSection) + 1].id)}
                    className="btn-primary btn-sm">Next →</button>
                )}
              </div>
            </div>
            <div className="px-6 py-6">
              {renderSection()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
