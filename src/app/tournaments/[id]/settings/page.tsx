'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { DEFAULT_PAY_RATES, PayRates } from '@/lib/utils'
import TournamentNav from '../TournamentNav'
import { Trophy, MapPin, DollarSign, Award, Banknote, Users, ClipboardList, ChevronUp, ChevronDown, Copy, Calendar, X, Clock, Lightbulb, Check, Info, Megaphone, Plus, type LucideIcon } from 'lucide-react'

const RATE_FIELDS = [
  { key: 'youth', label: 'Referee – Youth Cert' },
  { key: 'hs', label: 'Referee – HS Cert' },
  { key: 'college', label: 'Referee – College Cert' },
  { key: 'scorekeeper', label: 'Scorekeeper' },
  { key: 'athletic_trainer', label: 'Athletic Trainer (hourly)' },
  { key: 'field_ops', label: 'Field Ops (hourly)' },
  { key: 'assigner', label: 'Assigner Bonus' },
]

const DEFAULT_PRICING = { tier1: 1495, tier1Max: 3, tier2: 1450, tier2Max: 6, tier3: 1395, sevenVSeven: 1095 }

const INFO_ICON_OPTIONS = ['info', 'heart-pulse', 'shirt', 'square-parking', 'scroll-text', 'utensils', 'phone', 'cloud-lightning']

const BROADCAST_ROLE_OPTIONS = [
  { key: 'scheduler', label: 'Schedulers' },
  { key: 'assigner', label: 'Assigners' },
  { key: 'staff', label: 'Staff (field ops, medical, etc.)' },
  { key: 'scorekeeper', label: 'Scorekeepers' },
  { key: 'ref', label: 'Referees' },
]

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

interface TimeSlot { start: string; end: string }
interface DayAvailability { date: string; slots: TimeSlot[] }
interface Field { id: string; name: string; availStart?: string; availEnd?: string; divRestrictions?: string[] }
interface Venue { id: string; name: string; fields: Field[] }

function uid() { return Math.random().toString(36).slice(2, 10) }

type Section = 'general' | 'fees' | 'divisions' | 'payrates' | 'refrules' | 'venues' | 'registration' | 'tiebreakers' | 'info' | 'broadcast'
const TB_OPTS = [
  { v:'record', l:'Record' }, { v:'win_pct', l:'Winning Percentage' },
  { v:'head_to_head', l:'Head to Head' }, { v:'h2h_two', l:'Head to Head Two Teams Only' },
  { v:'h2h_gd', l:'Head to Head Goal Diff' }, { v:'goal_diff', l:'Goal Diff' },
  { v:'goals_for', l:'Goals Scored' }, { v:'goals_against', l:'Goals Allowed' },
]
const DEFAULT_TB = ['record','goal_diff','goals_for']
const pad6 = (a:string[]) => { const n=[...a]; while(n.length<6) n.push(''); return n.slice(0,6) }

function SectionCard({ title, description, icon: Icon, open, onToggle, children, badge }: {
  title: string; description: string; icon: LucideIcon; open: boolean
  onToggle: () => void; children: React.ReactNode; badge?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors text-left">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0"><Icon size={18} className="text-teal-600" /></div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-800 text-sm">{title}</p>
              {badge && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{badge}</span>}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{description}</p>
          </div>
        </div>
        <span className="text-slate-400 ml-4">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-6 py-5">
          {children}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage({ params }: { params: { id: string } }) {
  const [name, setName] = useState('')
  const [rates, setRates] = useState<PayRates>(DEFAULT_PAY_RATES)
  const [divRules, setDivRules] = useState<Record<string, number>>({})
  const [poolTb, setPoolTb] = useState<string[]>(pad6(DEFAULT_TB))
  const [divTb, setDivTb] = useState<string[]>(pad6(DEFAULT_TB))
  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const [divisions, setDivisions] = useState<string[]>([])
  const [newDivision, setNewDivision] = useState('')
  const [venues, setVenues] = useState<Venue[]>([])
  const [newVenueName, setNewVenueName] = useState('')
  const [newFieldNames, setNewFieldNames] = useState<Record<string, string>>({})
  const [bulkFieldCounts, setBulkFieldCounts] = useState<Record<string, string>>({})
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({})
  const [defaultAvailability, setDefaultAvailability] = useState<DayAvailability[]>([]) 
  const [tournamentDates, setTournamentDates] = useState<string[]>([])
  const [tName, setTName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDefault, setSavingDefault] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const [newCount, setNewCount] = useState('1')
  // Registration types
  const [teamRegEnabled, setTeamRegEnabled] = useState(true)
  const [indivRegEnabled, setIndivRegEnabled] = useState(false)
  const [indivRegDesc, setIndivRegDesc] = useState('')
  const [indivRegTiers, setIndivRegTiers] = useState<{id:string;name:string;price:number;description:string}[]>([])
  const [newTierName, setNewTierName] = useState('')
  const [newTierPrice, setNewTierPrice] = useState('')
  const [newTierDesc, setNewTierDesc] = useState('')
  const [indivRegPositions, setIndivRegPositions] = useState<string[]>(['Attack','Midfield','Defense','Goalie','Utility/Other'])
  const [indivRegSizes, setIndivRegSizes] = useState<string[]>(['YS','YM','YL','S','M','L','XL','XXL'])
  const [newPosition, setNewPosition] = useState('')
  const [newSize, setNewSize] = useState('')
  const [open, setOpen] = useState<Section>('general')
  const [infoSections, setInfoSections] = useState<{ icon: string; title: string; body: string }[]>([])
  const [savingInfo, setSavingInfo] = useState(false)
  const [broadcastRoles, setBroadcastRoles] = useState<string[]>(['assigner'])
  const [savingBroadcastRoles, setSavingBroadcastRoles] = useState(false)

  const toggle = (s: Section) => setOpen(o => o === s ? ('' as any) : s)

  // Copy tournament state
  const router = useRouter()
  const [showCopy, setShowCopy] = useState(false)
  const [copyName, setCopyName] = useState('')
  const [copyStart, setCopyStart] = useState('')
  const [copyEnd, setCopyEnd] = useState('')
  const [copying, setCopying] = useState(false)

  async function copyTournament() {
    if (!copyName.trim()) return
    setCopying(true)
    const res = await fetch(`/api/tournaments/${params.id}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: copyName.trim(), startDate: copyStart, endDate: copyEnd }),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success(`"${data.name}" created!`)
      setShowCopy(false)
      router.push(`/tournaments/${data.id}/settings`)
    } else {
      toast.error(data.error || 'Failed to copy')
    }
    setCopying(false)
  }

  useEffect(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setName(t.name); setTName(t.name)
      // Build list of tournament dates
      if (t.startDate && t.endDate) {
        const dates: string[] = []
        const cur = new Date(t.startDate + 'T12:00:00')
        const end = new Date(t.endDate + 'T12:00:00')
        while (cur <= end) {
          dates.push(cur.toISOString().slice(0, 10))
          cur.setDate(cur.getDate() + 1)
        }
        setTournamentDates(dates)
      }
      setRates({ ...DEFAULT_PAY_RATES, ...JSON.parse(t.payRates) })
      setDivRules(JSON.parse(t.divisionRules || '{}'))
      try { const obj = JSON.parse(t.tiebreakers || '{}'); const pool = Array.isArray(obj)?obj:(obj.pool||[]); const division = Array.isArray(obj)?obj:(obj.division||[]); setPoolTb(pad6(pool.length?pool:DEFAULT_TB)); setDivTb(pad6(division.length?division:DEFAULT_TB)) } catch {}
      try { const p = JSON.parse(t.registrationPricing || '{}'); if (p.tier1) setPricing(p) } catch {}
      try { const d = JSON.parse(t.registrationDivisions || '[]'); if (d.length > 0) setDivisions(d) } catch {}
      try { const v = JSON.parse(t.venues || '[]'); setVenues(v) } catch {}
      setTeamRegEnabled(t.teamRegEnabled !== false)
    setIndivRegEnabled(Boolean(t.individualRegEnabled))
    setIndivRegDesc(t.individualRegDescription || '')
    try { setIndivRegTiers(JSON.parse(t.individualRegTiers || '[]')) } catch {}
    try { const p = JSON.parse(t.individualRegPositions || '[]'); if(p.length > 0) setIndivRegPositions(p) } catch {}
    try { const s = JSON.parse(t.individualRegSizes || '[]'); if(s.length > 0) setIndivRegSizes(s) } catch {}
    setLoading(false)
    })
    fetch(`/api/venues/${params.id}`).then(r => r.json()).then(data => {
      if (Array.isArray(data)) { setVenues(data) } // legacy
      else {
        if (data.venues) setVenues(data.venues)
        if (data.defaultAvailability) setDefaultAvailability(data.defaultAvailability)
      }
    }).catch(() => {})
    fetch(`/api/tournaments/${params.id}/info`).then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.sections)) setInfoSections(d.sections) }).catch(() => {})
    fetch(`/api/tournaments/${params.id}/broadcast-roles`).then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.roles)) setBroadcastRoles(d.roles.filter((r: string) => r !== 'director')) }).catch(() => {})
  }, [params.id])

  async function saveInfo() {
    setSavingInfo(true)
    try {
      const res = await fetch(`/api/tournaments/${params.id}/info`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: infoSections.filter(s => s.title || s.body) }),
      })
      if (res.ok) toast.success('Tournament info saved!'); else toast.error('Failed to save info')
    } catch { toast.error('Failed to save info') } finally { setSavingInfo(false) }
  }

  async function saveBroadcastRoles() {
    setSavingBroadcastRoles(true)
    try {
      const res = await fetch(`/api/tournaments/${params.id}/broadcast-roles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: broadcastRoles }),
      })
      if (res.ok) toast.success('Broadcast permissions saved!'); else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Failed to save') }
    } catch { toast.error('Failed to save') } finally { setSavingBroadcastRoles(false) }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const [res, venueRes] = await Promise.all([
      fetch(`/api/tournaments/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, payRates: rates, divisionRules: divRules, tiebreakers: { pool: poolTb.filter(Boolean), division: divTb.filter(Boolean) },
          registrationPricing: JSON.stringify(pricing),
          registrationDivisions: JSON.stringify(divisions),
          teamRegEnabled,
          individualRegEnabled: indivRegEnabled,
          individualRegDescription: indivRegDesc,
          individualRegTiers: JSON.stringify(indivRegTiers),
          individualRegPositions: JSON.stringify(indivRegPositions),
          individualRegSizes: JSON.stringify(indivRegSizes),
        })
      }),
      fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venues, defaultAvailability }),
      }),
    ])
    if (res.ok && venueRes.ok) { toast.success('Settings saved!'); setTName(name) } else toast.error('Failed to save')
    setSaving(false)
  }

  // Venues helpers
  function addVenue() {
    if (!newVenueName.trim()) return
    setVenues(v => [...v, { id: uid(), name: newVenueName.trim(), fields: [] }])
    setNewVenueName('')
  }

  function removeVenue(venueId: string) {
    setVenues(v => v.filter(x => x.id !== venueId))
  }

  function updateVenueName(venueId: string, name: string) {
    setVenues(v => v.map(x => x.id === venueId ? { ...x, name } : x))
  }

  function addField(venueId: string) {
    const name = (newFieldNames[venueId] || '').trim()
    if (!name) return
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: [...x.fields, { id: uid(), name }] } : x))
    setNewFieldNames(f => ({ ...f, [venueId]: '' }))
  }

  function updateField(venueId: string, fieldId: string, patch: Partial<Field>) {
    setVenues(v => v.map(x => x.id === venueId
      ? { ...x, fields: x.fields.map(f => f.id === fieldId ? { ...f, ...patch } : f) }
      : x))
  }

  function toggleFieldExpanded(fieldId: string) {
    setExpandedFields(e => ({ ...e, [fieldId]: !e[fieldId] }))
  }

  function bulkAddFields(venueId: string) {
    const count = parseInt(bulkFieldCounts[venueId] || '0')
    if (!count || count < 1 || count > 50) return
    const venue = venues.find(v => v.id === venueId)
    const existing = venue?.fields.length || 0
    const newFields = Array.from({ length: count }, (_, i) => ({
      id: uid(),
      name: String(existing + i + 1),
    }))
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: [...x.fields, ...newFields] } : x))
    setBulkFieldCounts(f => ({ ...f, [venueId]: '' }))
  }

  function removeField(venueId: string, fieldId: string) {
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: x.fields.filter(f => f.id !== fieldId) } : x))
  }

  function updateFieldName(venueId: string, fieldId: string, name: string) {
    setVenues(v => v.map(x => x.id === venueId
      ? { ...x, fields: x.fields.map(f => f.id === fieldId ? { ...f, name } : f) }
      : x))
  }

  async function saveAsDefault() {
    setSavingDefault(true)
    try {
      const res = await fetch('/api/tiebreaker-default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pool: poolTb.filter(Boolean), division: divTb.filter(Boolean) }) })
      if (!res.ok) throw new Error()
      toast.success('Saved as default for new tournaments')
    } catch { toast.error('Failed to save default') }
    finally { setSavingDefault(false) }
  }
  function addRule() { if (!newKeyword.trim()) return; setDivRules(r => ({ ...r, [newKeyword.trim()]: parseInt(newCount) || 1 })); setNewKeyword(''); setNewCount('1') }
  function removeRule(k: string) { setDivRules(r => { const n = { ...r }; delete n[k]; return n }) }

  if (loading) return <div className="text-slate-400 text-center py-12">Loading…</div>

  const totalFields = venues.reduce((s, v) => s + v.fields.length, 0)
  const checkedCount = divisions.filter(d => DEFAULT_DIVISIONS.includes(d)).length + divisions.filter(d => !DEFAULT_DIVISIONS.includes(d)).length

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 pb-16">
      <Toaster />
      <div className="max-w-2xl mx-auto">
      <TournamentNav id={params.id} name={tName} />
      <div className="pt-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
            <p className="text-sm text-slate-500 mt-0.5">{tName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setCopyName(tName + ' (Copy)'); setCopyStart(''); setCopyEnd(''); setShowCopy(true) }}
              className="inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-100 text-slate-600 font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              <Copy size={15} /> Copy tournament
            </button>
            <button onClick={save} disabled={saving}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        <form onSubmit={save} className="space-y-3">

          <SectionCard title="General" description="Tournament name and basic info" icon={Trophy} open={open === 'general'} onToggle={() => toggle('general')}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tournament Name</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={name} onChange={e => setName(e.target.value)} required />
            </div>
          </SectionCard>

          {/* Venues & Fields */}
          <SectionCard title="Venues & Fields" description="Complexes and fields where games are played" icon={MapPin}
            open={open === 'venues'} onToggle={() => toggle('venues')}
            badge={venues.length > 0 ? `${venues.length} venue${venues.length !== 1 ? 's' : ''}, ${totalFields} field${totalFields !== 1 ? 's' : ''}` : undefined}>

            {/* Default Availability */}
            {tournamentDates.length > 0 && (
              <div className="mb-6">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1"><Calendar size={14} /> Default field availability</p>
                <p className="text-xs text-slate-400 mb-3">
                  Default hours for all fields. Override per field using the Availability toggle on each field below.
                </p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 w-36">Date</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Time Slots</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tournamentDates.map(dateStr => {
                        const dayAvail = defaultAvailability.find(d => d.date === dateStr)
                        const slots: TimeSlot[] = dayAvail?.slots || []
                        const d = new Date(dateStr + 'T12:00:00')
                        const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric' })
                        const updateSlot = (i: number, field: 'start' | 'end', val: string) => {
                          setDefaultAvailability(prev => {
                            const next = prev.filter(x => x.date !== dateStr)
                            const updated = slots.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
                            return [...next, { date: dateStr, slots: updated }].sort((a,b) => a.date < b.date ? -1 : 1)
                          })
                        }
                        const addSlot = () => {
                          setDefaultAvailability(prev => {
                            const next = prev.filter(x => x.date !== dateStr)
                            return [...next, { date: dateStr, slots: [...slots, { start: '', end: '' }] }].sort((a,b) => a.date < b.date ? -1 : 1)
                          })
                        }
                        const removeSlot = (i: number) => {
                          setDefaultAvailability(prev => {
                            const next = prev.filter(x => x.date !== dateStr)
                            const updated = slots.filter((_, idx) => idx !== i)
                            if (updated.length === 0) return next
                            return [...next, { date: dateStr, slots: updated }].sort((a,b) => a.date < b.date ? -1 : 1)
                          })
                        }
                        return (
                          <tr key={dateStr} className="align-top">
                            <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">{label}</td>
                            <td className="px-4 py-3">
                              <div className="space-y-1.5">
                                {slots.length === 0 && (
                                  <span className="text-xs text-slate-400 italic">No times set</span>
                                )}
                                {slots.map((slot, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <input type="time"
                                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                                      value={slot.start}
                                      onChange={e => updateSlot(i, 'start', e.target.value)}
                                    />
                                    <span className="text-slate-400 text-xs">to</span>
                                    <input type="time"
                                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                                      value={slot.end}
                                      onChange={e => updateSlot(i, 'end', e.target.value)}
                                    />
                                    <button type="button" onClick={() => removeSlot(i)}
                                      className="text-red-300 hover:text-red-500 text-xs"><X size={13} /></button>
                                  </div>
                                ))}
                                <button type="button" onClick={addSlot}
                                  className="text-xs text-teal-500 hover:text-teal-700 hover:underline">+ Add time slot</button>
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

            {venues.length === 0 && (
              <p className="text-sm text-slate-400 italic mb-4">No venues added yet.</p>
            )}

            <div className="space-y-4">
              {venues.map(venue => (
                <div key={venue.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  {/* Venue header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                    <input
                      className="flex-1 bg-transparent text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-400 rounded px-1"
                      value={venue.name}
                      onChange={e => updateVenueName(venue.id, e.target.value)}
                      placeholder="Venue name"
                    />
                    <button type="button" onClick={() => removeVenue(venue.id)}
                      className="text-red-400 hover:text-red-600 text-sm px-1"><X size={13} /></button>
                  </div>

                  {/* Fields list */}
                  <div className="divide-y divide-slate-100">
                    {venue.fields.map((field, idx) => (
                      <div key={field.id}>
                        {/* Field header row */}
                        <div className="flex items-center gap-2 px-4 py-2.5">
                          <span className="text-xs text-slate-400 w-5 text-right">{idx + 1}</span>
                          <input
                            className="flex-1 text-sm text-slate-700 border border-transparent focus:border-slate-300 focus:outline-none rounded px-2 py-1 focus:ring-1 focus:ring-teal-400"
                            value={field.name}
                            onChange={e => updateFieldName(venue.id, field.id, e.target.value)}
                            placeholder={`Field ${idx + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => toggleFieldExpanded(field.id)}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors whitespace-nowrap ${expandedFields[field.id] ? 'bg-teal-50 border-teal-200 text-teal-600' : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}
                            title="Set availability & division restrictions">
                            {expandedFields[field.id] ? <><ChevronUp size={13} /> Availability</> : <><ChevronDown size={13} /> Availability</>}
                          </button>
                          <button type="button" onClick={() => removeField(venue.id, field.id)}
                            className="text-red-300 hover:text-red-500 text-sm px-1"><X size={13} /></button>
                        </div>
                        {/* Expanded availability panel */}
                        {expandedFields[field.id] && (
                          <div className="bg-teal-50 border-t border-teal-100 px-6 py-4 space-y-4">
                            {/* Time availability */}
                            <div>
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2"><Clock size={12} /> Available hours</p>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-slate-500">From</label>
                                  <input type="time"
                                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    value={field.availStart || ''}
                                    onChange={e => updateField(venue.id, field.id, { availStart: e.target.value })}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-slate-500">To</label>
                                  <input type="time"
                                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    value={field.availEnd || ''}
                                    onChange={e => updateField(venue.id, field.id, { availEnd: e.target.value })}
                                  />
                                </div>
                                {(field.availStart || field.availEnd) && (
                                  <button type="button"
                                    onClick={() => updateField(venue.id, field.id, { availStart: '', availEnd: '' })}
                                    className="text-xs text-slate-400 hover:text-red-500">Clear</button>
                                )}
                              </div>
                            </div>
                            {/* Division restrictions */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide"><Award size={12} /> Division restrictions</p>
                                <span className="text-xs text-slate-400">{(field.divRestrictions?.length || 0) === 0 ? 'All divisions allowed' : `${field.divRestrictions!.length} division${field.divRestrictions!.length !== 1 ? 's' : ''} allowed`}</span>
                              </div>
                              <p className="text-xs text-slate-400 mb-2">Leave all unchecked to allow any division. Check specific divisions to restrict this field.</p>
                              <div className="grid grid-cols-2 gap-1">
                                {divisions.map(div => {
                                  const checked = (field.divRestrictions || []).includes(div)
                                  return (
                                    <label key={div} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors ${checked ? 'bg-white border border-teal-200 text-slate-800 font-medium' : 'text-slate-500 hover:bg-white/60'}`}>
                                      <input type="checkbox" checked={checked}
                                        className="w-3.5 h-3.5 accent-teal-600 flex-shrink-0"
                                        onChange={e => {
                                          const current = field.divRestrictions || []
                                          updateField(venue.id, field.id, {
                                            divRestrictions: e.target.checked
                                              ? [...current, div]
                                              : current.filter(d => d !== div)
                                          })
                                        }}
                                      />
                                      <span className="truncate">{div}</span>
                                    </label>
                                  )
                                })}
                              </div>
                              {(field.divRestrictions?.length || 0) > 0 && (
                                <button type="button"
                                  onClick={() => updateField(venue.id, field.id, { divRestrictions: [] })}
                                  className="text-xs text-slate-400 hover:text-red-500 mt-2">Clear all restrictions</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add field row */}
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
                    {/* Quick bulk add */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 whitespace-nowrap">How many fields?</span>
                      <input
                        type="number" min="1" max="50"
                        className="w-20 text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-center"
                        placeholder="e.g. 7"
                        value={bulkFieldCounts[venue.id] || ''}
                        onChange={e => setBulkFieldCounts(f => ({ ...f, [venue.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bulkAddFields(venue.id) } }}
                      />
                      <button type="button" onClick={() => bulkAddFields(venue.id)}
                        disabled={!bulkFieldCounts[venue.id]}
                        className="text-xs font-medium text-teal-600 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                        Generate Fields
                      </button>
                      <span className="text-slate-300 text-xs">·</span>
                      <span className="text-xs text-slate-400">names editable after</span>
                    </div>
                    {/* Manual single add */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 whitespace-nowrap">Or add one:</span>
                      <input
                        className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="Field name (e.g. 2A, North, Stadium)"
                        value={newFieldNames[venue.id] || ''}
                        onChange={e => setNewFieldNames(f => ({ ...f, [venue.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addField(venue.id) } }}
                      />
                      <button type="button" onClick={() => addField(venue.id)}
                        className="text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                        + Add Field
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add venue */}
            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
              <input
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Venue / complex name (e.g. Tamarac Sports Complex)"
                value={newVenueName}
                onChange={e => setNewVenueName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVenue() } }}
              />
              <button type="button" onClick={addVenue}
                className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                + Add Venue
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Registration Fees" description="Per-team pricing tiers for the public registration form" icon={DollarSign}
            open={open === 'fees'} onToggle={() => toggle('fees')}
            badge={`$${pricing.tier1.toLocaleString()} base`}>
            <div className="space-y-4">
              {[
                { label: `1 – `, fieldMax: 'tier1Max', fieldPrice: 'tier1', suffix: ' teams' },
                { label: ``, fieldMax: 'tier2Max', fieldPrice: 'tier2', prefix: true },
                { label: `${pricing.tier2Max + 1}+ teams`, fieldMax: null, fieldPrice: 'tier3' },
                ...(pricing.sevenVSeven != null ? [{ label: '7v7 teams', fieldMax: null, fieldPrice: 'sevenVSeven' }] : []),
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1">
                    {i === 0 && <>1–<input type="number" min="1" max="10" className="border border-slate-300 rounded px-1.5 py-0.5 w-12 text-center text-sm focus:outline-none focus:ring-1 focus:ring-teal-500" value={pricing.tier1Max} onChange={e => setPricing(p => ({ ...p, tier1Max: parseInt(e.target.value) || 3 }))} /> teams</>}
                    {i === 1 && <>{pricing.tier1Max + 1}–<input type="number" min="1" max="20" className="border border-slate-300 rounded px-1.5 py-0.5 w-12 text-center text-sm focus:outline-none focus:ring-1 focus:ring-teal-500" value={pricing.tier2Max} onChange={e => setPricing(p => ({ ...p, tier2Max: parseInt(e.target.value) || 6 }))} /> teams</>}
                    {i === 2 && <>{pricing.tier2Max + 1}+ teams</>}
                    {i === 3 && <>7v7 teams</>}
                    <span className="text-slate-400 font-normal text-xs ml-1">per team</span>
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-sm">$</span>
                    <input type="number" min="0" step="1"
                      className="border border-slate-300 rounded-lg px-3 py-1.5 w-24 text-right text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={i === 0 ? pricing.tier1 : i === 1 ? pricing.tier2 : i === 2 ? pricing.tier3 : pricing.sevenVSeven}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0
                        if (i === 0) setPricing(p => ({ ...p, tier1: v }))
                        else if (i === 1) setPricing(p => ({ ...p, tier2: v }))
                        else if (i === 2) setPricing(p => ({ ...p, tier3: v }))
                        else setPricing(p => ({ ...p, sevenVSeven: v }))
                      }} />
                    {row.fieldPrice === 'sevenVSeven' && <button type="button" title="Remove tier" onClick={() => setPricing(p => ({ ...p, sevenVSeven: null as any }))} className="text-slate-300 hover:text-red-500 ml-1"><X size={15} /></button>}
                  </div>
                </div>
              ))}
              {pricing.sevenVSeven == null && (
                <button type="button" onClick={() => setPricing(p => ({ ...p, sevenVSeven: 1095 as any }))}
                  className="text-sm text-teal-700 hover:text-teal-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> Add 7v7 tier</button>
              )}
              <button type="button" onClick={() => setPricing(DEFAULT_PRICING)}
                className="text-xs text-slate-400 hover:text-slate-600 underline block">Reset to defaults</button>
            </div>
          </SectionCard>

          <SectionCard title="Divisions" description="Select and name the divisions offered in this tournament" icon={Award}
            open={open === 'divisions'} onToggle={() => toggle('divisions')}
            badge={`${checkedCount} active`}>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {DEFAULT_DIVISIONS.map((defaultDiv, i) => {
                const checkedForReal = divisions.includes(defaultDiv)
                return (
                  <div key={i} className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${checkedForReal ? 'bg-teal-50 border border-teal-100' : 'bg-slate-50'}`}>
                    <input type="checkbox" checked={checkedForReal}
                      onChange={e => {
                        if (e.target.checked) setDivisions(d => [...d, defaultDiv])
                        else setDivisions(d => d.filter(v => v !== defaultDiv))
                      }}
                      className="w-4 h-4 accent-teal-600 flex-shrink-0" />
                    {checkedForReal ? (
                      <input
                        className="flex-1 min-w-0 bg-transparent border-0 text-sm text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-teal-400 rounded px-1"
                        value={divisions.find(d => d === defaultDiv) || defaultDiv}
                        onChange={e => setDivisions(d => d.map(v => v === defaultDiv ? e.target.value : v))}
                      />
                    ) : (
                      <span className="text-sm text-slate-400 flex-1 truncate">{defaultDiv}</span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500 font-medium mb-2">Custom division</p>
              <div className="flex gap-2">
                <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. Boys U9 (7v7)" value={newDivision}
                  onChange={e => setNewDivision(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newDivision.trim()) { setDivisions(d => [...d, newDivision.trim()]); setNewDivision('') } } }} />
                <button type="button"
                  className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium"
                  onClick={() => { if (newDivision.trim()) { setDivisions(d => [...d, newDivision.trim()]); setNewDivision('') } }}>Add</button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {divisions.filter(d => !DEFAULT_DIVISIONS.includes(d)).map((d, i) => (
                  <div key={i} className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
                    <input type="checkbox" checked readOnly className="w-4 h-4 accent-teal-600 flex-shrink-0" />
                    <input className="flex-1 min-w-0 bg-transparent border-0 text-sm text-slate-800 font-medium focus:outline-none" value={d}
                      onChange={e => setDivisions(divs => divs.map(v => v === d ? e.target.value : v))} />
                    <button type="button" onClick={() => setDivisions(divs => divs.filter(v => v !== d))}
                      className="text-red-400 hover:text-red-600 text-xs flex-shrink-0"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setDivisions(DEFAULT_DIVISIONS)}
              className="text-xs text-slate-400 hover:text-slate-600 underline mt-3 block">Reset to defaults</button>
          </SectionCard>

          <SectionCard title="Tournament Info" description="Public info for parents & coaches (medical, parking, lost & found, etc.) — shown under the Info button on the public page" icon={Info}
            open={open === 'info'} onToggle={() => toggle('info')} badge={`${infoSections.length} sections`}>
            <div className="space-y-3">
              {infoSections.map((s, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <select value={s.icon} onChange={e => setInfoSections(arr => arr.map((x, xi) => xi === i ? { ...x, icon: e.target.value } : x))}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                      {INFO_ICON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input value={s.title} onChange={e => setInfoSections(arr => arr.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x))}
                      placeholder="Section title" className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    <button type="button" onClick={() => setInfoSections(arr => arr.filter((_, xi) => xi !== i))}
                      className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={15} /></button>
                  </div>
                  <textarea value={s.body} onChange={e => setInfoSections(arr => arr.map((x, xi) => xi === i ? { ...x, body: e.target.value } : x))}
                    rows={2} placeholder="Details…" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              ))}
              {infoSections.length === 0 && <p className="text-sm text-slate-400">No info sections yet. Add one below — until you save any, the public page shows sensible defaults.</p>}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => setInfoSections(arr => [...arr, { icon: 'info', title: '', body: '' }])}
                className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium">+ Add section</button>
              <button type="button" onClick={saveInfo} disabled={savingInfo}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold">{savingInfo ? 'Saving…' : 'Save info'}</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">This content appears on the public page under the “Info” button. The icon dropdown matches the public display.</p>
          </SectionCard>

          <SectionCard title="Broadcast permissions" description="Which staff roles may post broadcasts to the public page (you, the director, always can)" icon={Megaphone}
            open={open === 'broadcast'} onToggle={() => toggle('broadcast')} badge={`${broadcastRoles.length + 1} roles`}>
            <div className="space-y-2 max-w-md">
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-teal-500/10 border border-teal-500/40">
                <input type="checkbox" checked readOnly className="w-4 h-4 accent-teal-600" />
                <span className="text-sm font-medium text-slate-800">Tournament Director</span>
                <span className="text-[11px] text-slate-400 ml-auto">Always allowed</span>
              </div>
              {BROADCAST_ROLE_OPTIONS.map(o => {
                const on = broadcastRoles.includes(o.key)
                return (
                  <label key={o.key} className={`flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer border ${on ? 'bg-teal-500/10 border-teal-500/40' : 'bg-slate-50 border-transparent'}`}>
                    <input type="checkbox" checked={on}
                      onChange={e => setBroadcastRoles(rs => e.target.checked ? Array.from(new Set([...rs, o.key])) : rs.filter(r => r !== o.key))}
                      className="w-4 h-4 accent-teal-600" />
                    <span className="text-sm text-slate-700">{o.label}</span>
                  </label>
                )
              })}
            </div>
            <button type="button" onClick={saveBroadcastRoles} disabled={savingBroadcastRoles}
              className="mt-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold">{savingBroadcastRoles ? 'Saving…' : 'Save permissions'}</button>
            <p className="text-[11px] text-slate-400 mt-2">Allowed staff get a Broadcast page (/broadcast) to post to the public announcement banner. You can remove any post.</p>
          </SectionCard>

          <SectionCard title="Standings tiebreakers" description="How teams level on points are ranked" icon={ClipboardList}
            open={open === 'tiebreakers'} onToggle={() => toggle('tiebreakers')}>
            {[{ t:'Tie breakers within pools', d:'Applied when breaking ties within a pool.', arr: poolTb, set: setPoolTb },
              { t:'Tie breakers within divisions', d:'Applied when ranking teams across pools in a division (for seeding).', arr: divTb, set: setDivTb }].map(sec => (
              <div key={sec.t} className="mb-5 last:mb-0">
                <p className="text-sm font-semibold text-slate-700">{sec.t}</p>
                <p className="text-xs text-slate-400 mb-2.5">{sec.d}</p>
                <div className="space-y-2 max-w-lg">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-500 w-24 flex-shrink-0">Tie breaker #{i + 1}</span>
                      <select value={sec.arr[i] || ''} onChange={e => { const n = pad6(sec.arr); n[i] = e.target.value; sec.set(n) }}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                        <option value="">—</option>
                        {TB_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-slate-400 mt-3">Ranked by tie breaker #1 first, then #2, and so on. Head-to-head currently compares two tied teams directly.</p>
            <button type="button" onClick={saveAsDefault} disabled={savingDefault}
              className="mt-3 text-xs font-semibold text-teal-700 border border-teal-200 hover:bg-teal-50 rounded-lg px-3 py-2 disabled:opacity-40">
              {savingDefault ? 'Saving…' : 'Save as default for new tournaments'}
            </button>
            <p className="text-[11px] text-slate-400 mt-1.5">New tournaments will start with these tiebreakers. (The Save button above saves them to this tournament only.)</p>
          </SectionCard>

          <SectionCard title="Staff Pay Rates" description="Default pay per game for each staff role" icon={Banknote}
            open={open === 'payrates'} onToggle={() => toggle('payrates')}>
            <div className="space-y-3">
              {RATE_FIELDS.map(f => (
                <div key={f.key} className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
                  <p className="text-sm font-medium text-slate-700">{f.label}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-sm">$</span>
                    <input type="number" min="0" step="0.01"
                      className="border border-slate-300 rounded-lg px-3 py-1.5 w-24 text-right text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={rates[f.key] ?? 0}
                      onChange={e => setRates(r => ({ ...r, [f.key]: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Registration Types */}
          <SectionCard title="Registration Types" description="Choose which registration forms to offer" icon={ClipboardList}
            open={open === 'registration'} onToggle={() => toggle('registration')} badge={[teamRegEnabled && 'Teams', indivRegEnabled && 'Individual'].filter(Boolean).join(' + ') || undefined}>
            <div className="space-y-5">
              {/* Team Registration */}
              <div className={`p-4 rounded-xl border ${teamRegEnabled ? 'border-teal-300 bg-teal-50' : 'border-slate-200'}`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={teamRegEnabled} onChange={e => setTeamRegEnabled(e.target.checked)} className="accent-teal-500 w-4 h-4 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Team Registration</p>
                    <p className="text-xs text-slate-500 mt-0.5">Clubs register and pay for entire teams. Use for standard team tournaments.</p>
                    {teamRegEnabled && (
                      <p className="text-xs text-teal-600 mt-1 font-medium">Link: /tournaments/{params.id}/register</p>
                    )}
                  </div>
                </label>
              </div>

              {/* Individual Registration */}
              <div className={`p-4 rounded-xl border ${indivRegEnabled ? 'border-teal-300 bg-teal-50' : 'border-slate-200'}`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={indivRegEnabled} onChange={e => setIndivRegEnabled(e.target.checked)} className="accent-teal-500 w-4 h-4 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Individual Player Registration</p>
                    <p className="text-xs text-slate-500 mt-0.5">Players register and pay individually. Great for free agents or hybrid tournaments.</p>
                    {indivRegEnabled && (
                      <p className="text-xs text-teal-600 mt-1 font-medium">Link: /tournaments/{params.id}/individual-register</p>
                    )}
                  </div>
                </label>
              </div>

              <div className="flex items-start gap-1.5 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-700">
                <Lightbulb size={14} className="flex-shrink-0 mt-0.5" /> You can enable both — teams register their players and free agents register individually.
              </div>

            {indivRegEnabled && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Registration Description</label>
                    <textarea className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" rows={3}
                      value={indivRegDesc} onChange={e => setIndivRegDesc(e.target.value)}
                      placeholder="Describe what's included (e.g. uniforms, housing, tourney fees...)" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Fee Tiers</label>
                    <div className="space-y-2 mb-3">
                      {indivRegTiers.map((tier, i) => (
                        <div key={tier.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
                          <div className="flex-1">
                            <span className="text-sm font-medium text-slate-800">{tier.name}</span>
                            {tier.description && <span className="text-xs text-slate-500 ml-2">{tier.description}</span>}
                          </div>
                          <span className="text-sm font-bold text-teal-700">${tier.price.toFixed(2)}</span>
                          <button type="button" onClick={() => setIndivRegTiers(t => t.filter((_, j) => j !== i))}
                            className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                        </div>
                      ))}
                      {indivRegTiers.length === 0 && <p className="text-xs text-slate-400">No tiers yet. Add one below.</p>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Tier name" value={newTierName} onChange={e => setNewTierName(e.target.value)} />
                      <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Price (e.g. 400)" type="number" value={newTierPrice} onChange={e => setNewTierPrice(e.target.value)} />
                      <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Description (optional)" value={newTierDesc} onChange={e => setNewTierDesc(e.target.value)} />
                    </div>
                    <button type="button" onClick={() => {
                      if (!newTierName.trim() || !newTierPrice) return
                      setIndivRegTiers(t => [...t, { id: Date.now().toString(), name: newTierName.trim(), price: parseFloat(newTierPrice), description: newTierDesc.trim() }])
                      setNewTierName(''); setNewTierPrice(''); setNewTierDesc('')
                    }} className="mt-2 text-sm text-teal-600 hover:text-teal-700 font-medium">+ Add Tier</button>
                  </div>
                  <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-700">
                    Share this link with players: <strong>{typeof window !== 'undefined' ? window.location.origin : ''}/tournaments/{params.id}/individual-register</strong>
                  </div>
                  {/* Positions */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Positions</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {indivRegPositions.map((pos, i) => (
                        <span key={i} className="flex items-center gap-1 bg-slate-100 rounded-lg px-3 py-1 text-sm text-slate-700">
                          {pos}
                          <button type="button" onClick={() => setIndivRegPositions(p => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 text-xs ml-1"><X size={13} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Attack" value={newPosition} onChange={e => setNewPosition(e.target.value)} onKeyDown={e => { if(e.key==='Enter'){e.preventDefault(); if(newPosition.trim()){setIndivRegPositions(p=>[...p,newPosition.trim()]);setNewPosition('')}} }} />
                      <button type="button" onClick={() => { if(newPosition.trim()){setIndivRegPositions(p=>[...p,newPosition.trim()]);setNewPosition('')} }} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">+ Add</button>
                    </div>
                  </div>
                  {/* Sizes */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Jersey / Shorts Sizes</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {indivRegSizes.map((sz, i) => (
                        <span key={i} className="flex items-center gap-1 bg-slate-100 rounded-lg px-3 py-1 text-sm text-slate-700">
                          {sz}
                          <button type="button" onClick={() => setIndivRegSizes(s => s.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 text-xs ml-1"><X size={13} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. XL" value={newSize} onChange={e => setNewSize(e.target.value)} onKeyDown={e => { if(e.key==='Enter'){e.preventDefault(); if(newSize.trim()){setIndivRegSizes(s=>[...s,newSize.trim()]);setNewSize('')}} }} />
                      <button type="button" onClick={() => { if(newSize.trim()){setIndivRegSizes(s=>[...s,newSize.trim()]);setNewSize('')} }} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">+ Add</button>
                    </div>
                  </div>
                </>
            )}
            </div>
          </SectionCard>

        </form>
      </div>
      </div>

      {/* Copy Tournament Modal */}
      {showCopy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><Copy size={16} /> Copy tournament</h2>
              <p className="text-sm text-slate-500 mt-1">Creates a new tournament with the same settings, venues, and staff roster. Games and registrations are not copied.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Tournament Name</label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={copyName} onChange={e => setCopyName(e.target.value)} placeholder="e.g. Spring Invitational 2027" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    value={copyStart} onChange={e => setCopyStart(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    value={copyEnd} onChange={e => setCopyEnd(e.target.value)} />
                </div>
              </div>
              <div className="bg-teal-50 rounded-xl px-4 py-3 text-xs text-teal-700 space-y-1">
                <p className="font-semibold">What gets copied:</p>
                <p className="flex items-start gap-1.5"><Check size={13} className="flex-shrink-0 mt-0.5" /> Venues & fields · Divisions · Pay rates · Ref rules · Staff roster · Registration settings</p>
                <p className="font-semibold mt-1">What stays behind:</p>
                <p className="flex items-start gap-1.5"><X size={13} className="flex-shrink-0 mt-0.5" /> Games & schedule · Team registrations · Assignments · Availability</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                  onClick={() => setShowCopy(false)}>Cancel</button>
                <button type="button"
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                  onClick={copyTournament}
                  disabled={!copyName.trim() || copying}>
                  {copying ? 'Copying…' : 'Create Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
