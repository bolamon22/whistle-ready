'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import TournamentNav from '../TournamentNav'

// âââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
interface TimeSlot { start: string; end: string }
interface DayAvailability { date: string; slots: TimeSlot[] }
interface Field { id: string; name: string; abbr: string; availStart?: string; availEnd?: string; divRestrictions?: string[] }
interface Venue { id: string; name: string; fields: Field[] }

// âââ Constants âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

interface DivisionItem { def: string; display: string; abbr: string; checked: boolean }
function toDivItems(stored: string[]): DivisionItem[] {
  return DEFAULT_DIVISIONS.map(def => {
    const match = stored.find(s => s === def)
    return { def, display: def, abbr: divAbbr(def), checked: !!match }
  })
}
function isLegacyDivision(s: string): boolean {
  // Filter out old year-based divisions like "Boys 2030", "HS Boys JV", etc.
  return /20\d{2}/.test(s) || /^HS (Boys|Girls)/.test(s)
}
function fromDivItems(items: DivisionItem[], customs: string[]): string[] {
  return [...items.filter(i => i.checked).map(i => i.display), ...customs]
}

const DEFAULT_PRICING = { tier1: 1495, tier1Max: 3, tier2: 1450, tier2Max: 6, tier3: 1395, sevenVSeven: 1095 }

interface StaffRole {
  id: string
  name: string
  rate: number
  rateType: 'per_game' | 'hourly'
}

interface OfficialsConfig {
  roleLabel: string
  standardCount: number
  rules: { keyword: string; count: number }[]
  championshipEnabled: boolean
  championshipCount: number
}

const DEFAULT_ROLES: StaffRole[] = [
  { id: 'off_youth',   name: 'Official â Youth Cert',   rate: 50, rateType: 'per_game' },
  { id: 'off_hs',      name: 'Official â HS Cert',      rate: 60, rateType: 'per_game' },
  { id: 'off_college', name: 'Official â College Cert', rate: 70, rateType: 'per_game' },
  { id: 'scorekeeper', name: 'Scorekeeper',             rate: 15, rateType: 'per_game' },
  { id: 'atc',         name: 'Athletic Trainer',        rate: 25, rateType: 'hourly'   },
  { id: 'field_ops',   name: 'Field Ops',               rate: 20, rateType: 'hourly'   },
  { id: 'assigner',    name: 'Assigner Bonus',          rate: 10, rateType: 'per_game' },
]

const DEFAULT_OFFICIALS_CONFIG: OfficialsConfig = {
  roleLabel: 'Official',
  standardCount: 2,
  rules: [],
  championshipEnabled: false,
  championshipCount: 2,
}

function parseStaffConfig(raw: string): { roles: StaffRole[]; officialsConfig: OfficialsConfig } {
  try {
    const parsed = JSON.parse(raw || '{}')
    if (parsed._v === 2) return { roles: parsed.roles, officialsConfig: parsed.officialsConfig }
    // Migrate v1 format
    const v1: Record<string, number> = parsed
    return {
      roles: DEFAULT_ROLES.map(r => {
        const keyMap: Record<string, string> = { off_youth: 'youth', off_hs: 'hs', off_college: 'college', scorekeeper: 'scorekeeper', atc: 'athletic_trainer', field_ops: 'field_ops', assigner: 'assigner' }
        return { ...r, rate: v1[keyMap[r.id]] ?? r.rate }
      }),
      officialsConfig: DEFAULT_OFFICIALS_CONFIG,
    }
  } catch {
    return { roles: [...DEFAULT_ROLES], officialsConfig: { ...DEFAULT_OFFICIALS_CONFIG } }
  }
}

function serializeStaffConfig(roles: StaffRole[], officialsConfig: OfficialsConfig): string {
  return JSON.stringify({ _v: 2, roles, officialsConfig })
}

const SECTIONS = [
  { id: 'general',      label: 'General Info',       icon: 'ð' },
  { id: 'divisions',    label: 'Divisions',           icon: 'ð' },
  { id: 'venues',       label: 'Venues & Fields',     icon: 'ðï¸' },
  { id: 'registration', label: 'Team Fees',           icon: 'ð' },
  { id: 'staffpay',     label: 'Staff Pay Rates',   icon: 'ðµ' },
  { id: 'schedule',     label: 'Schedule Rules',      icon: 'â±' },
]

function uid() { return Math.random().toString(36).slice(2, 10) }

function fieldAbbr(name: string): string {
  // "Field 1" â "F1", "Field 2A" â "F2A", "North" â "N", "Stadium" â "STD"
  const stripped = name.replace(/^field\s+/i, 'F').replace(/\s+/g, '')
  if (stripped.length <= 4) return stripped.toUpperCase()
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 5)
}

function divAbbr(name: string): string {
  return name
    .replace(/Boys/gi, 'B').replace(/Girls/gi, 'G')
    .replace(/High School/gi, 'HS').replace(/Middle School/gi, 'MS')
    .replace(/Lower School/gi, 'LS')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 6)
}
function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric' })
}

// âââ Main component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
  const [divItems, setDivItems]         = useState<DivisionItem[]>(DEFAULT_DIVISIONS.map(d => ({ def: d, display: d, abbr: divAbbr(d), checked: false })))
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
  const [staffRoles, setStaffRoles]       = useState<StaffRole[]>([...DEFAULT_ROLES])
  const [officialsConfig, setOfficialsConfig] = useState<OfficialsConfig>({ ...DEFAULT_OFFICIALS_CONFIG })
  const [newRoleName, setNewRoleName]     = useState('')
  const [newRoleRate, setNewRoleRate]     = useState('')
  const [newRoleType, setNewRoleType]     = useState<'per_game' | 'hourly'>('per_game')
  const [newKeyword, setNewKeyword]       = useState('')
  const [newCount, setNewCount]           = useState('1')
  const [showSaveGlobal, setShowSaveGlobal] = useState(false)

  // âââ Load ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  useEffect(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setName(t.name); setSport(t.sport || 'Lacrosse')
      setStartDate(t.startDate || ''); setEndDate(t.endDate || '')
      setLocation(t.location || ''); setLogoUrl(t.logoUrl || '')
      setScheduleIncrement(String(t.scheduleIncrement || 50))
      const staffParsed = parseStaffConfig(t.payRates || '{}')
      setStaffRoles(staffParsed.roles)
      // Load officials config â prefer v2 format, fall back to old divisionRules
      let loadedRules = staffParsed.officialsConfig.rules
      try {
        const dr = JSON.parse(t.divisionRules || '{}')
        if (typeof dr === 'object' && !Array.isArray(dr) && Object.keys(dr).length > 0) {
          loadedRules = Object.entries(dr).map(([keyword, count]) => ({ keyword, count: count as number }))
        }
      } catch {}
      setOfficialsConfig({ ...DEFAULT_OFFICIALS_CONFIG, ...staffParsed.officialsConfig, rules: loadedRules })
      try { const p = JSON.parse(t.registrationPricing || '{}'); if (p.tier1) setPricing(p) } catch {}
      try {
        const d: string[] = JSON.parse(t.registrationDivisions || '[]')
        if (d.length) {
          setDivItems(toDivItems(d))
          // Only carry over custom divisions that aren't old legacy year-based ones
          const customs = d.filter(s => !DEFAULT_DIVISIONS.includes(s) && !isLegacyDivision(s))
          setCustomDivisions(customs)
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
      const normalizeFields = (v: Venue[]): Venue[] =>
        v.map(venue => ({
          ...venue,
          fields: venue.fields.map(f => {
            const name = /^\d+$/.test(f.name) ? `Field ${f.name}` : f.name
            return { ...f, name, abbr: f.abbr || fieldAbbr(name) }
          })
        }))
      if (Array.isArray(data)) { setVenues(normalizeFields(data)) }
      else {
        if (data.venues) setVenues(normalizeFields(data.venues))
        if (data.defaultAvailability) setDefaultAvailability(data.defaultAvailability)
      }
    }).catch(() => {})
  }, [params.id])

  // âââ Save ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  async function save() {
    setSaving(true)
    await Promise.all([
      fetch(`/api/tournaments/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, sport, startDate, endDate, location, logoUrl,
          scheduleIncrement: parseInt(scheduleIncrement) || 50,
          payRates: serializeStaffConfig(staffRoles, officialsConfig),
          divisionRules: JSON.stringify(Object.fromEntries(officialsConfig.rules.map(r => [r.keyword, r.count]))),
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

  // âââ Logo upload âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setLogoUploading(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const { url } = await res.json()
    setLogoUrl(url); toast.success('Logo uploaded!')
    setLogoUploading(false)
  }

  // âââ Venue helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function addVenue() {
    if (!newVenueName.trim()) return
    setVenues(v => [...v, { id: uid(), name: newVenueName.trim(), fields: [] }])
    setNewVenueName('')
  }
  function updateVenueName(id: string, n: string) { setVenues(v => v.map(x => x.id === id ? { ...x, name: n } : x)) }
  function removeVenue(id: string) { setVenues(v => v.filter(x => x.id !== id)) }
  function addField(venueId: string) {
    const n = (newFieldNames[venueId] || '').trim(); if (!n) return
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: [...x.fields, { id: uid(), name: n, abbr: fieldAbbr(n) }] } : x))
    setNewFieldNames(f => ({ ...f, [venueId]: '' }))
  }
  function bulkAddFields(venueId: string) {
    const count = parseInt(bulkFieldCounts[venueId] || '0')
    if (!count || count < 1 || count > 50) return
    const existing = venues.find(v => v.id === venueId)?.fields.length || 0
    const newFields = Array.from({ length: count }, (_, i) => { const n = `Field ${existing + i + 1}`; return { id: uid(), name: n, abbr: fieldAbbr(n) } })
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

  // âââ Completion indicators âââââââââââââââââââââââââââââââââââââââââââââââââ
  function isComplete(id: string) {
    if (id === 'general')      return !!(name && startDate && location)
    if (id === 'divisions')    return divItems.some(i => i.checked) || customDivisions.length > 0
    if (id === 'venues')       return venues.length > 0
    if (id === 'registration') return pricing.tier1 > 0
    if (id === 'staffpay')     return staffRoles.length > 0
    if (id === 'schedule')     return !!(scheduleIncrement)
    return false
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Loadingâ¦</div>

  // âââ Section panels ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderSection() {
    // ââ General Info ââ
    if (activeSection === 'general') return (
      <div className="space-y-5">
        <div>
          <label className="label">Tournament Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spring Classic 2026" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="h-20 w-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-3xl">ð</div>
            )}
            <div className="space-y-2">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="btn-secondary btn-sm" disabled={logoUploading}>
                {logoUploading ? 'Uploadingâ¦' : logoUrl ? 'ð Replace Logo' : 'ð Upload Logo'}
              </button>
              {logoUrl && <button type="button" onClick={() => setLogoUrl('')} className="block text-xs text-red-400 hover:text-red-600">Remove</button>}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </div>
      </div>
    )

    // ââ Divisions ââ
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-5">
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
              <button type="button" onClick={() => setCustomDivisions(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">â</button>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input className="input flex-1" placeholder="e.g. Boys U9 (7v7)" value={newDivision}
              onChange={e => setNewDivision(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newDivision.trim()) { setCustomDivisions(p => [...p, newDivision.trim()]); setNewDivision('') } } }} />
            <button type="button" className="btn-secondary"
              onClick={() => { if (newDivision.trim()) { setCustomDivisions(p => [...p, newDivision.trim()]); setNewDivision('') } }}>Add</button>
            <p className="text-xs text-gray-400 mt-2">Custom division abbreviations can be edited after adding.</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
          <span className="text-xs text-gray-400">{divItems.filter(i => i.checked).length + customDivisions.length} divisions selected</span>
          <button type="button" onClick={() => { setDivItems(prev => prev.map(d => ({ ...d, checked: false, display: d.def }))); setCustomDivisions([]) }}
            className="text-xs text-gray-400 hover:text-gray-600 underline">Clear all</button>
        </div>
      </div>
    )

    // ââ Venues & Fields ââ
    if (activeSection === 'venues') return (
      <div>
        {/* Default availability */}
        {tournamentDates.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-1">ð Default Field Availability</p>
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
                                <button type="button" onClick={() => removeSlot(i)} className="text-red-300 hover:text-red-500 text-xs">â</button>
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
                <span className="text-gray-400 text-sm">ð</span>
                <input className="flex-1 bg-transparent text-sm font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
                  value={venue.name} onChange={e => updateVenueName(venue.id, e.target.value)} />
                <button type="button" onClick={() => removeVenue(venue.id)} className="text-red-400 hover:text-red-600 text-sm">â</button>
              </div>
              <div className="divide-y divide-gray-100">
                {venue.fields.map((field, idx) => (
                  <div key={field.id}>
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}</span>
                      <input className="flex-1 min-w-0 text-sm text-gray-700 border border-transparent focus:border-gray-300 focus:outline-none rounded px-2 py-1 focus:ring-1 focus:ring-blue-400"
                        value={field.name} onChange={e => updateFieldName(venue.id, field.id, e.target.value)} placeholder="Field name" />
                      <input
                        className="w-16 text-xs text-center font-mono text-blue-700 bg-blue-50 border border-blue-100 focus:border-blue-400 focus:outline-none rounded-lg px-1 py-1"
                        value={field.abbr || ''}
                        onChange={e => updateField(venue.id, field.id, { abbr: e.target.value.toUpperCase().slice(0, 6) })}
                        placeholder="Abbr"
                        title="Field abbreviation"
                      />
                      <button type="button" onClick={() => setExpandedFields(e => ({ ...e, [field.id]: !e[field.id] }))}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors whitespace-nowrap ${expandedFields[field.id] ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}>
                        {expandedFields[field.id] ? 'â² Availability' : 'â¼ Availability'}
                      </button>
                      <button type="button" onClick={() => removeField(venue.id, field.id)} className="text-red-300 hover:text-red-500 text-sm">â</button>
                    </div>
                    {expandedFields[field.id] && (
                      <div className="bg-blue-50 border-t border-blue-100 px-6 py-4 space-y-4">
                        <div>
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">â° Available Hours</p>
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
                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">ð Division Restrictions</p>
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

    // ââ Registration ââ
    if (activeSection === 'registration') return (
      <div>
        <p className="text-sm text-gray-500 mb-5">Per-team pricing tiers shown on the public registration form.</p>
        <div className="space-y-3">
          {[
            { label: <>1â<input type="number" min="1" max="10" className="border border-gray-300 rounded px-1.5 py-0.5 w-12 text-center text-sm mx-1 focus:outline-none focus:ring-1 focus:ring-blue-500" value={pricing.tier1Max} onChange={e => setPricing(p => ({ ...p, tier1Max: parseInt(e.target.value) || 3 }))} /> teams</>, price: pricing.tier1, setPrice: (v: number) => setPricing(p => ({ ...p, tier1: v })) },
            { label: <>{pricing.tier1Max + 1}â<input type="number" min="1" max="20" className="border border-gray-300 rounded px-1.5 py-0.5 w-12 text-center text-sm mx-1 focus:outline-none focus:ring-1 focus:ring-blue-500" value={pricing.tier2Max} onChange={e => setPricing(p => ({ ...p, tier2Max: parseInt(e.target.value) || 6 }))} /> teams</>, price: pricing.tier2, setPrice: (v: number) => setPricing(p => ({ ...p, tier2: v })) },
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

    // ââ Staff & Pay ââ
    if (activeSection === 'staffpay') return (
      <div className="space-y-8">

        {/* Global save prompt */}
        {showSaveGlobal && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">Save these roles and rates as your default for future tournaments?</p>
            <div className="flex gap-2 flex-shrink-0">
              <button type="button" onClick={() => { localStorage.setItem('gameday_staff_prefs', JSON.stringify({ roles: staffRoles, officialsConfig })); toast.success('Saved as global defaults'); setShowSaveGlobal(false) }}
                className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg">Yes, save globally</button>
              <button type="button" onClick={() => setShowSaveGlobal(false)} className="text-xs text-amber-600 hover:text-amber-800 px-2">Dismiss</button>
            </div>
          </div>
        )}

        {/* Staff Roles & Pay */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Staff Roles & Pay Rates</h3>
              <p className="text-xs text-gray-400 mt-0.5">Set a pay rate for each role. Mark as per game or hourly.</p>
            </div>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => { const s = localStorage.getItem('gameday_staff_prefs'); if (s) { const p = JSON.parse(s); setStaffRoles(p.roles); setOfficialsConfig(p.officialsConfig); toast.success('Loaded your global defaults') } else toast.error('No global defaults saved yet') }}
                className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap">
                Load my defaults
              </button>
              <button type="button" onClick={() => setShowSaveGlobal(true)}
                className="text-xs border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-blue-600 whitespace-nowrap">
                Save as global defaults
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-5">Role</div>
              <div className="col-span-3 text-right">Rate</div>
              <div className="col-span-3">Type</div>
              <div className="col-span-1"></div>
            </div>
            {staffRoles.map((role, idx) => (
              <div key={role.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-gray-50 last:border-0 items-center hover:bg-gray-50/50">
                <div className="col-span-5">
                  <input className="w-full bg-transparent text-sm text-gray-800 focus:outline-none border-b border-transparent focus:border-blue-400 px-0.5"
                    value={role.name}
                    onChange={e => setStaffRoles(r => r.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-1">
                  <span className="text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="0.50" className="w-20 text-right text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={role.rate}
                    onChange={e => setStaffRoles(r => r.map((x, i) => i === idx ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} />
                </div>
                <div className="col-span-3">
                  <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    value={role.rateType}
                    onChange={e => setStaffRoles(r => r.map((x, i) => i === idx ? { ...x, rateType: e.target.value as 'per_game' | 'hourly' } : x))}>
                    <option value="per_game">Per game</option>
                    <option value="hourly">Per hour</option>
                  </select>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button type="button" onClick={() => setStaffRoles(r => r.filter((_, i) => i !== idx))}
                    className="text-red-300 hover:text-red-500 text-sm">â</button>
                </div>
              </div>
            ))}
            {/* Add new role row */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-t border-gray-100 items-center">
              <div className="col-span-5">
                <input className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="New role nameâ¦" value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newRoleName.trim()) { setStaffRoles(r => [...r, { id: uid(), name: newRoleName.trim(), rate: parseFloat(newRoleRate) || 0, rateType: newRoleType }]); setNewRoleName(''); setNewRoleRate('') } } }} />
              </div>
              <div className="col-span-3 flex items-center justify-end gap-1">
                <span className="text-gray-400 text-sm">$</span>
                <input type="number" min="0" step="0.50" className="w-20 text-right text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="0" value={newRoleRate} onChange={e => setNewRoleRate(e.target.value)} />
              </div>
              <div className="col-span-3">
                <select className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none bg-white"
                  value={newRoleType} onChange={e => setNewRoleType(e.target.value as 'per_game' | 'hourly')}>
                  <option value="per_game">Per game</option>
                  <option value="hourly">Per hour</option>
                </select>
              </div>
              <div className="col-span-1 flex justify-end">
                <button type="button"
                  onClick={() => { if (!newRoleName.trim()) return; setStaffRoles(r => [...r, { id: uid(), name: newRoleName.trim(), rate: parseFloat(newRoleRate) || 0, rateType: newRoleType }]); setNewRoleName(''); setNewRoleRate('') }}
                  className="text-blue-500 hover:text-blue-700 text-lg font-bold leading-none">+</button>
              </div>
            </div>
          </div>
        </div>

        {/* Officials Per Game */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-0.5">Officials Per Game</h3>
          <p className="text-xs text-gray-400 mb-4">The standard is <strong>2 officials per game</strong>. Add exceptions below for divisions that use a different number â for example, 1 official for small-field or youth play, or 3 for varsity games.</p>

          {/* Role label + standard count */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title for officials at this tournament</label>
              <input className="input" value={officialsConfig.roleLabel}
                onChange={e => setOfficialsConfig(c => ({ ...c, roleLabel: e.target.value }))}
                placeholder="e.g. Official, Referee, Umpire" />
              <p className="text-xs text-gray-400 mt-1">Used on schedules, assignments, and notifications.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Standard officials per game</label>
              <div className="flex items-center gap-3">
                {[1, 2, 3].map(n => (
                  <button key={n} type="button"
                    onClick={() => setOfficialsConfig(c => ({ ...c, standardCount: n }))}
                    className={`w-10 h-10 rounded-xl text-sm font-semibold border transition-colors ${officialsConfig.standardCount === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Exceptions */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Exceptions</p>
            {officialsConfig.rules.length === 0
              ? <p className="text-sm text-gray-400 italic mb-3">No exceptions set â all games use the standard count above.</p>
              : (
                <div className="space-y-2 mb-3">
                  {officialsConfig.rules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-gray-700 flex-1">
                        Divisions containing <strong>"{rule.keyword}"</strong> â <strong>{rule.count} {officialsConfig.roleLabel || 'official'}{rule.count !== 1 ? 's' : ''}</strong>
                      </span>
                      <button type="button" onClick={() => setOfficialsConfig(c => ({ ...c, rules: c.rules.filter((_, j) => j !== i) }))}
                        className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                    </div>
                  ))}
                </div>
              )
            }
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">If division name containsâ¦</label>
                <input className="input" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="e.g. 7v7, U8, Lower School" />
              </div>
              <div className="w-36">
                <label className="block text-xs font-medium text-gray-600 mb-1">â¦use this many officials</label>
                <select className="select" value={newCount} onChange={e => setNewCount(e.target.value)}>
                  <option value="1">1 official</option>
                  <option value="2">2 officials</option>
                  <option value="3">3 officials</option>
                </select>
              </div>
              <button type="button"
                onClick={() => { if (!newKeyword.trim()) return; setOfficialsConfig(c => ({ ...c, rules: [...c.rules, { keyword: newKeyword.trim(), count: parseInt(newCount) }] })); setNewKeyword(''); setNewCount('1') }}
                className="btn-secondary mb-0.5">Add Exception</button>
            </div>
          </div>

          {/* Championship */}
          <div className="border border-gray-200 rounded-xl px-4 py-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={officialsConfig.championshipEnabled}
                onChange={e => setOfficialsConfig(c => ({ ...c, championshipEnabled: e.target.checked }))}
                className="w-4 h-4 accent-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">Championship games use a different number of officials</p>
                <p className="text-xs text-gray-400 mt-0.5">Games marked as championship will override the standard count.</p>
              </div>
            </label>
            {officialsConfig.championshipEnabled && (
              <div className="mt-3 ml-7 flex items-center gap-3">
                <span className="text-sm text-gray-600">Officials per championship game:</span>
                {[1, 2, 3, 4].map(n => (
                  <button key={n} type="button"
                    onClick={() => setOfficialsConfig(c => ({ ...c, championshipCount: n }))}
                    className={`w-9 h-9 rounded-xl text-sm font-semibold border transition-colors ${officialsConfig.championshipCount === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )

    // ââ Schedule Rules ââ
    if (activeSection === 'schedule') return (
      <div className="space-y-5">
        <p className="text-sm text-gray-500">Configure default scheduling parameters used when building or auto-assigning the game schedule.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

  // âââ Layout ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <Toaster />

      <TournamentNav id={params.id} name={name || 'Tournament Builder'} logoUrl={logoUrl || undefined} />

      <div className="max-w-6xl mx-auto px-4 pt-0 pb-2 flex justify-end">
        <button onClick={save} disabled={saving}
          className="bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
          {saving ? 'Savingâ¦' : 'ð¾ Save Changes'}
        </button>
      </div>

      <div className="flex max-w-6xl mx-auto py-4 px-4 gap-6">

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
                    <span className={`text-xs ${done ? 'text-emerald-500' : 'text-gray-200'}`}>{done ? 'â' : 'â'}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Game Scheduler link */}
          <div className="mt-4">
            <a href={`/tournaments/${params.id}/scheduler`}
              className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-2xl shadow-sm hover:bg-blue-50 hover:border-blue-200 transition-colors group">
              <span className="text-xl">📅</span>
              <div>
                <p className="text-sm font-semibold text-gray-700 group-hover:text-blue-700">Game Scheduler</p>
                <p className="text-xs text-gray-400">Drag &amp; drop games to fields</p>
              </div>
              <span className="ml-auto text-gray-300 group-hover:text-blue-400">→</span>
            </a>
          </div>

          {/* Quick stats */}
          <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-4 space-y-2 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Summary</p>
            <div className="text-xs text-gray-500 space-y-1">
              <div className="flex justify-between"><span>Divisions</span><span className="font-semibold text-gray-700">{divItems.filter(i => i.checked).length + customDivisions.length}</span></div>
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
                    className="btn-secondary btn-sm">â Prev</button>
                )}
                {SECTIONS.findIndex(s => s.id === activeSection) < SECTIONS.length - 1 && (
                  <button onClick={() => setActiveSection(SECTIONS[SECTIONS.findIndex(s => s.id === activeSection) + 1].id)}
                    className="btn-primary btn-sm">Next â</button>
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
