'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import TournamentNav from '../TournamentNav'
import RegPricingEditor from '@/components/RegPricingEditor'
import RegistrationTypesEditor from '@/components/RegistrationTypesEditor'
import TournamentInfoEditor, { loadInfoSections, saveInfoSections, type InfoSection } from '@/components/TournamentInfoEditor'
import BroadcastRolesEditor, { loadBroadcastRoles, saveBroadcastRoles } from '@/components/BroadcastRolesEditor'
import { parseRegistrationTypes, registrationTypesPayload, DEFAULT_REGISTRATION_TYPES, type RegistrationTypes } from '@/lib/registrationTypes'
import RegConfirmationEditor from '@/components/RegConfirmationEditor'
import StaffPayEditor from '@/components/StaffPayEditor'
import EventContentSection, { useEventContent, type EventSectionKey } from '@/components/EventContentEditor'
import {
  parseStaffPay, serializeStaffPay, officialsRulesToDivisionRules,
  DEFAULT_ROLES, DEFAULT_OFFICIALS_CONFIG,
  type StaffRole, type OfficialsConfig,
} from '@/lib/staffPay'
import GalleryPicker from '@/components/GalleryPicker'
import { parsePricing, serializePricing, baseFee, DEFAULT_REG_PRICING, type RegPricing } from '@/lib/regPricing'
import { resolveRegConfirmation, DEFAULT_REG_CONFIRMATION, type RegConfirmation } from '@/lib/regConfirmation'
import { Trophy, Award, MapPin, DollarSign, Banknote, Clock, X, Calendar, ChevronUp, ChevronDown, Check, Circle, ArrowRight, ClipboardList, FileText, Hotel, BookOpen, Users, Image as ImageIcon, LayoutGrid, Info, Megaphone } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface TimeSlot { start: string; end: string }
interface DayAvailability { date: string; slots: TimeSlot[] }
interface Field { id: string; name: string; abbr: string; availStart?: string; availEnd?: string; divRestrictions?: string[] }
// A venue is both an operational thing (fields the scheduler assigns games to) and a
// public thing (where parents drive to). address/mapUrl/fieldMapUrl are OPTIONAL and
// additive — the scheduler only reads `name` and `fields`, so it is unaffected.
// These replace the separate "Location" list that used to live on the Event page,
// where the same venue had to be typed a second time and could drift out of sync.
interface Venue {
  id: string
  name: string
  fields: Field[]
  address?: string
  mapUrl?: string
  fieldMapUrl?: string
}

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

interface DivisionItem { def: string; display: string; abbr: string; checked: boolean }
function toDivItems(stored: string[]): DivisionItem[] {
  return DEFAULT_DIVISIONS.map(def => {
    const match = stored.find(s => s === def)
    return { def, display: def, abbr: divAbbr(def), checked: !!match }
  })
}
function isLegacyDivision(s: string): boolean {
  // Filter out old year-based divisions like "Boys 2030", "HS Boys JV", etc.
  return /\b20\d{2}\b/.test(s) || /^HS (Boys|Girls)/.test(s)
}
function fromDivItems(items: DivisionItem[], customs: string[]): string[] {
  return [...items.filter(i => i.checked).map(i => i.display), ...customs]
}


// StaffRole / OfficialsConfig / defaults / parse + serialize now live in
// @/lib/staffPay (imported above) so the Setup wizard and Settings share ONE
// model. They previously each owned a copy and drifted — wizard-set pay rates
// were silently discarded by payroll.

// Sections are grouped by theme so the sidebar stays scannable as sections are
// consolidated here from the old separate Settings page.
//   BASICS — what the tournament IS      MONEY  — what it costs / what you pay out
//   PLAY   — how games run               PUBLIC — what teams and parents see
const SECTIONS = [
  { id: 'general',      label: 'General info',           icon: Trophy,        group: 'BASICS' },
  { id: 'divisions',    label: 'Divisions',              icon: Award,         group: 'BASICS' },
  { id: 'venues',       label: 'Venues & fields',        icon: MapPin,        group: 'BASICS' },
  { id: 'registration', label: 'Team fees',              icon: DollarSign,    group: 'MONEY'  },
  { id: 'regtypes',     label: 'Registration types',     icon: ClipboardList, group: 'MONEY'  },
  { id: 'staffpay',     label: 'Staff pay rates',        icon: Banknote,      group: 'MONEY'  },
  { id: 'schedule',     label: 'Game Timing & Format',   icon: Clock,         group: 'PLAY'   },
  { id: 'tiebreakers',  label: 'Standings tiebreakers',  icon: ClipboardList, group: 'PLAY'   },
  { id: 'overview',     label: 'Overview',               icon: FileText,      group: 'PUBLIC' },
  { id: 'hotels',       label: 'Hotels & travel',        icon: Hotel,         group: 'PUBLIC' },
  { id: 'rules',        label: 'Rules',                  icon: BookOpen,      group: 'PUBLIC' },
  { id: 'contacts',     label: 'Contacts',               icon: Users,         group: 'PUBLIC' },
  { id: 'hero',         label: 'Hero banner',            icon: ImageIcon,     group: 'PUBLIC' },
  { id: 'pagebuilder',  label: 'Page builder',           icon: LayoutGrid,    group: 'PUBLIC' },
  { id: 'info',         label: 'Tournament info',        icon: Info,          group: 'PUBLIC' },
  { id: 'broadcast',    label: 'Broadcast permissions',  icon: Megaphone,     group: 'PUBLIC' },
]
// Sidebar render order for the group headers.
const SECTION_GROUPS = ['BASICS', 'MONEY', 'PLAY', 'PUBLIC'] as const

// Sections whose content lives in the public event-page store, not the Tournament row.
const PUBLIC_SECTIONS: EventSectionKey[] = ['overview', 'hotels', 'rules', 'contacts', 'hero', 'pagebuilder']
const TB_OPTS = [
  { v:'record', l:'Record' }, { v:'win_pct', l:'Winning Percentage' },
  { v:'head_to_head', l:'Head to Head' }, { v:'h2h_two', l:'Head to Head Two Teams Only' },
  { v:'h2h_gd', l:'Head to Head Goal Diff' }, { v:'goal_diff', l:'Goal Diff' },
  { v:'goals_for', l:'Goals Scored' }, { v:'goals_against', l:'Goals Allowed' },
]
const DEFAULT_TB = ['record','goal_diff','goals_for']
const pad6 = (a:string[]) => { const n=[...a]; while(n.length<6) n.push(''); return n.slice(0,6) }

function uid() { return Math.random().toString(36).slice(2, 10) }

function fieldAbbr(name: string): string {
  // "Field 1" → "F1", "Field 2A" → "F2A", "North" → "N", "Stadium" → "STD"
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function BuilderPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeSection, setActiveSection] = useState('general')
  // Allow deep-linking to a section, e.g. the dashboard's registration badge links to
  // ?section=regtypes. Read from location rather than useSearchParams to avoid needing
  // a Suspense boundary. Ignores unknown values so a bad link just opens General info.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('section')
    if (want && SECTIONS.some(x => x.id === want)) setActiveSection(want)
  }, [])
  const [saving, setSaving] = useState(false)
  // Public event-page content (lives in AppSetting tournamentSite:{id}, saved separately)
  const { content: eventContent, setContent: setEventContent, ruleSets, saveEventContent } = useEventContent(params.id)
  const [regTypes, setRegTypes] = useState<RegistrationTypes>(DEFAULT_REGISTRATION_TYPES)
  // These two live behind their own endpoints, loaded/saved alongside the main row.
  const [infoSections, setInfoSections] = useState<InfoSection[]>([])
  const [broadcastRoles, setBroadcastRoles] = useState<string[]>(['assigner'])
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
  const [periodFormat, setPeriodFormat] = useState('halves')
  const [periodBreak, setPeriodBreak]   = useState('10')

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
  const [pricing, setPricing]         = useState<RegPricing>(DEFAULT_REG_PRICING)

  // Staff & Pay
  const [staffRoles, setStaffRoles]       = useState<StaffRole[]>([...DEFAULT_ROLES])
  const [officialsConfig, setOfficialsConfig] = useState<OfficialsConfig>({ ...DEFAULT_OFFICIALS_CONFIG })
  const [newRoleName, setNewRoleName]     = useState('')
  const [newRoleRate, setNewRoleRate]     = useState('')
  const [newRoleType, setNewRoleType]     = useState<'per_game' | 'hourly'>('per_game')
  const [newKeyword, setNewKeyword]       = useState('')
  const [newCount, setNewCount]           = useState('1')
  const [showSaveGlobal, setShowSaveGlobal] = useState(false)
  const [poolTb, setPoolTb] = useState<string[]>(pad6(DEFAULT_TB))
  const [divTb, setDivTb] = useState<string[]>(pad6(DEFAULT_TB))
  const [savingDefault, setSavingDefault] = useState(false)
  const [regConf, setRegConf] = useState<Partial<RegConfirmation>>({})
  const [orgRegDefault, setOrgRegDefault] = useState<RegConfirmation>(DEFAULT_REG_CONFIRMATION)

  // ─── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/org-forms').then(r => r.ok ? r.json() : {}).then(d => setOrgRegDefault(resolveRegConfirmation(d.registration, null))).catch(() => {})
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setName(t.name); setSport(t.sport || 'Lacrosse')
      setStartDate(t.startDate || ''); setEndDate(t.endDate || '')
      setLocation(t.location || ''); setLogoUrl(t.logoUrl || '')
      setScheduleIncrement(String(t.scheduleIncrement || 50))
      try { const obj = JSON.parse(t.tiebreakers || '{}'); const pool = Array.isArray(obj)?obj:(obj.pool||[]); const division = Array.isArray(obj)?obj:(obj.division||[]); setPoolTb(pad6(pool.length?pool:DEFAULT_TB)); setDivTb(pad6(division.length?division:DEFAULT_TB)) } catch {}
      const staffParsed = parseStaffPay(t.payRates)
      setStaffRoles(staffParsed.roles)
      // Load officials config — prefer v2 format, fall back to old divisionRules
      let loadedRules = staffParsed.officialsConfig.rules
      try {
        const dr = JSON.parse(t.divisionRules || '{}')
        if (typeof dr === 'object' && !Array.isArray(dr) && Object.keys(dr).length > 0) {
          loadedRules = Object.entries(dr).map(([keyword, count]) => ({ keyword, count: count as number }))
        }
      } catch {}
      setOfficialsConfig({ ...DEFAULT_OFFICIALS_CONFIG, ...staffParsed.officialsConfig, rules: loadedRules })
      setPricing(parsePricing(t.registrationPricing))
      setRegTypes(parseRegistrationTypes(t))
      loadInfoSections(params.id).then(setInfoSections)
      loadBroadcastRoles(params.id).then(setBroadcastRoles)
      try { const oc = JSON.parse(t.regConfirmationOverride || '{}'); if (oc && typeof oc === 'object') setRegConf(oc) } catch {}
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
    fetch(`/api/tournaments/${params.id}/rules`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        if (d.periodFormat) setPeriodFormat(d.periodFormat)
        if (d.periodBreakMin != null) setPeriodBreak(String(d.periodBreakMin))
      }
    }).catch(() => {})
  }, [params.id])

  // ─── Save ──────────────────────────────────────────────────────────────────
  async function saveAsDefault() {
    setSavingDefault(true)
    try {
      const res = await fetch('/api/tiebreaker-default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pool: poolTb.filter(Boolean), division: divTb.filter(Boolean) }) })
      if (!res.ok) throw new Error()
      toast.success('Saved as default for new tournaments')
    } catch { toast.error('Failed to save default') }
    finally { setSavingDefault(false) }
  }
  async function save() {
    setSaving(true)
    // Two separate stores: the Tournament row (+venues/rules) and the public
    // event-page content (AppSetting). Report per-store so a partial failure
    // is never announced as "Saved!".
    const [core, eventOk, infoOk, broadcastOk] = await Promise.all([
      Promise.all([
      fetch(`/api/tournaments/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, sport, startDate, endDate, location, logoUrl,
          scheduleIncrement: parseInt(scheduleIncrement) || 50,
          payRates: serializeStaffPay({ roles: staffRoles, officialsConfig }),
          divisionRules: JSON.stringify(officialsRulesToDivisionRules(officialsConfig)),
          registrationPricing: serializePricing(pricing),
          ...registrationTypesPayload(regTypes),
          registrationDivisions: JSON.stringify(fromDivItems(divItems, customDivisions)),
          tiebreakers: { pool: poolTb.filter(Boolean), division: divTb.filter(Boolean) },
          regConfirmationOverride: JSON.stringify(regConf),
        }),
      }),
      fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venues, defaultAvailability }),
      }),
      fetch(`/api/tournaments/${params.id}/rules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodFormat, periodBreakMin: parseInt(periodBreak) || 0 }),
      }),
      ]).then(rs => rs.every(r => r.ok)).catch(() => false),
      // Own endpoints, but part of the same Save Changes so there's one save button.
      saveInfoSections(params.id, infoSections),
      saveBroadcastRoles(params.id, broadcastRoles),
      saveEventContent().catch(() => false),
    ])

    if (core && eventOk && infoOk && broadcastOk) toast.success('Saved!')
    else if (core && eventOk && (!infoOk || !broadcastOk)) toast.error(`Saved, but ${[!infoOk && 'tournament info', !broadcastOk && 'broadcast permissions'].filter(Boolean).join(' and ')} did NOT save. Try again.`)
    else if (core && !eventOk) toast.error('Tournament settings saved, but the public event page content did NOT save. Try again.')
    else if (!core && eventOk) toast.error('Event page content saved, but the tournament settings did NOT save. Try again.')
    else toast.error('Save failed — nothing was saved. Check your connection and try again.')
    setSaving(false)
  }

  // ─── Logo upload ───────────────────────────────────────────────────────────
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setLogoUploading(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const d = await res.json().catch(() => ({} as any))
    // The upload API can now fail rather than silently inlining a large image.
    if (!res.ok || !d.url) {
      toast.error(d.error || 'Logo upload failed — please try again')
      setLogoUploading(false)
      return
    }
    setLogoUrl(d.url); toast.success('Logo uploaded!')
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

  // ─── Completion indicators ─────────────────────────────────────────────────
  function isComplete(id: string) {
    if (id === 'general')      return !!(name && startDate && location)
    if (id === 'divisions')    return divItems.some(i => i.checked) || customDivisions.length > 0
    if (id === 'venues')       return venues.length > 0
    if (id === 'registration') return baseFee(pricing) > 0
    if (id === 'regtypes')     return regTypes.teamEnabled || regTypes.individualEnabled
    if (id === 'info')         return infoSections.length > 0
    if (id === 'broadcast')    return true   // a valid choice can be 'director only'
    if (id === 'staffpay')     return staffRoles.length > 0
    if (id === 'schedule')     return !!(scheduleIncrement)
    if (id === 'tiebreakers')  return true
    // Public event-page content — checked when the section has something to show.
    if (id === 'overview')     return !!eventContent.overview.trim()
    if (id === 'hotels')       return !!(eventContent.hotels.trim() || eventContent.hotelsUrl.trim())
    // Rules can come from the org-wide library, so a selected source counts too.
    if (id === 'rules')        return !!(eventContent.rules.trim() || eventContent.rulesSourceId)
    if (id === 'contacts')     return eventContent.contacts.length > 0
    if (id === 'hero')         return !!eventContent.heroImage
    if (id === 'pagebuilder')  return true   // always has a default block list
    return false
  }

  if (loading) return <div className="p-10 text-center text-slate-400">Loading…</div>

  // ─── Section panels ────────────────────────────────────────────────────────
  function renderSection() {
    // ── Standings tiebreakers ──
    if (activeSection === 'tiebreakers') return (
      <div className="space-y-5">
        <p className="text-sm text-slate-500">Set how teams that are level on points are ranked. Tie breaker #1 is applied first, then #2, and so on. Head-to-head currently compares two tied teams directly.</p>
        {[{ t:'Tie breakers within pools', d:'Applied when breaking ties within a pool.', arr: poolTb, set: setPoolTb },
          { t:'Tie breakers within divisions', d:'Applied when ranking teams across pools in a division (for seeding).', arr: divTb, set: setDivTb }].map(sec => (
          <div key={sec.t}>
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
        <button type="button" onClick={saveAsDefault} disabled={savingDefault}
          className="text-xs font-semibold text-teal-700 border border-teal-200 hover:bg-teal-50 rounded-lg px-3 py-2 disabled:opacity-40">
          {savingDefault ? 'Saving…' : 'Save as default for new tournaments'}
        </button>
      </div>
    )
    // ── General Info ──
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
              <img src={logoUrl} alt="logo" className="h-20 w-20 object-contain rounded-xl border border-slate-200" />
            ) : (
              <div className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300"><Trophy className="w-8 h-8" /></div>
            )}
            <div className="space-y-2">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="btn-secondary btn-sm" disabled={logoUploading}>
                {logoUploading ? 'Uploading…' : logoUrl ? '🔄 Replace Logo' : '📁 Upload Logo'}
              </button>
              <GalleryPicker accept="image" label="Use from library" triggerClassName="btn-secondary btn-sm inline-flex items-center justify-center gap-1" onPick={(url) => setLogoUrl(url)} />
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
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
          <label className="label">Age &amp; eligibility chart link</label>
          <input className="input" value={eventContent.ageChartUrl}
            onChange={e => setEventContent(v => ({ ...v, ageChartUrl: e.target.value }))}
            placeholder="https://…" />
          <p className="text-xs text-slate-400 mt-1">Optional. Shown as a link under Divisions on the public event page.</p>
        </div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500">Check the divisions for this tournament. Click a checked division name to rename it.</p>
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
              className="text-xs border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 text-slate-600 whitespace-nowrap">
              Load my defaults
            </button>
            <button type="button"
              onClick={() => {
                localStorage.setItem('gameday_div_prefs', JSON.stringify({ items: divItems, customs: customDivisions }))
                toast.success('Preferences saved!')
              }}
              className="text-xs border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 text-teal-600 whitespace-nowrap">
              Save as my defaults
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-5">
          {divItems.map((item, idx) => (
            <div key={item.def} className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${item.checked ? 'bg-teal-50 border border-teal-100' : 'bg-slate-50 border border-transparent'}`}>
              <input type="checkbox" checked={item.checked} className="w-4 h-4 accent-teal-600 flex-shrink-0"
                onChange={e => setDivItems(prev => prev.map((d, i) => i === idx ? { ...d, checked: e.target.checked } : d))} />
              {item.checked
                ? <input
                    className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-800 focus:outline-none border-b border-transparent focus:border-teal-400 px-0.5"
                    value={item.display}
                    onChange={e => setDivItems(prev => prev.map((d, i) => i === idx ? { ...d, display: e.target.value } : d))} />
                : <span className="text-sm text-slate-400 flex-1 truncate">{item.def}</span>
              }
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-500 mb-2">Custom divisions</p>
          {customDivisions.map((d, i) => (
            <div key={i} className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2 mb-1.5">
              <input type="checkbox" checked readOnly className="w-4 h-4 accent-teal-600 flex-shrink-0" />
              <input className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-800 focus:outline-none border-b border-transparent focus:border-teal-400"
                value={d} onChange={e => setCustomDivisions(prev => prev.map((v, j) => j === i ? e.target.value : v))} />
              <button type="button" onClick={() => setCustomDivisions(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs"><X size={13} /></button>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input className="input flex-1" placeholder="e.g. Boys U9 (7v7)" value={newDivision}
              onChange={e => setNewDivision(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newDivision.trim()) { setCustomDivisions(p => [...p, newDivision.trim()]); setNewDivision('') } } }} />
            <button type="button" className="btn-secondary"
              onClick={() => { if (newDivision.trim()) { setCustomDivisions(p => [...p, newDivision.trim()]); setNewDivision('') } }}>Add</button>
            <p className="text-xs text-slate-400 mt-2">Custom division abbreviations can be edited after adding.</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
          <span className="text-xs text-slate-400">{divItems.filter(i => i.checked).length + customDivisions.length} divisions selected</span>
          <button type="button" onClick={() => { setDivItems(prev => prev.map(d => ({ ...d, checked: false, display: d.def }))); setCustomDivisions([]) }}
            className="text-xs text-slate-400 hover:text-slate-600 underline">Clear all</button>
        </div>
      </div>
    )

    // ── Venues & Fields ──
    if (activeSection === 'venues') return (
      <div>
        {/* Default availability */}
        {tournamentDates.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-slate-700 mb-1"><Calendar size={14} className="inline mr-1 align-text-bottom" /> Default field availability</p>
            <p className="text-xs text-slate-400 mb-3">Default hours for all fields. Override per-field using the Availability toggle on each field below.</p>
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
                        <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">{fmtDate(dateStr)}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            {slots.map((slot, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input type="time" className="border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" value={slot.start} onChange={e => updateSlot(i, 'start', e.target.value)} />
                                <span className="text-slate-400 text-xs">to</span>
                                <input type="time" className="border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" value={slot.end} onChange={e => updateSlot(i, 'end', e.target.value)} />
                                <button type="button" onClick={() => removeSlot(i)} className="text-red-300 hover:text-red-500 text-xs"><X size={13} /></button>
                              </div>
                            ))}
                            <button type="button" onClick={addSlot} className="text-xs text-teal-500 hover:text-teal-700 hover:underline">+ Add time slot</button>
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

        {venues.length === 0 && <p className="text-sm text-slate-400 italic mb-4">No venues yet. Add one below.</p>}

        <div className="space-y-4 mb-4">
          {venues.map(venue => (
            <div key={venue.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <span className="text-slate-400 text-sm"><MapPin size={14} /></span>
                <input className="flex-1 bg-transparent text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-400 rounded px-1"
                  value={venue.name} onChange={e => updateVenueName(venue.id, e.target.value)} />
                <button type="button" onClick={() => removeVenue(venue.id)} className="text-red-400 hover:text-red-600 text-sm"><X size={13} /></button>
              </div>

              {/* Public-facing venue details. Shown in the Location section of the
                  public event page — entered here so the venue is defined once. */}
              <div className="px-4 py-3 bg-white border-b border-slate-100 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Shown to teams &amp; parents</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  <input className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-400"
                    value={venue.address || ''}
                    onChange={e => setVenues(vs => vs.map(v => v.id === venue.id ? { ...v, address: e.target.value } : v))}
                    placeholder="Street address (e.g. 123 Main St, Stuart, FL)" />
                  <input className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-400"
                    value={venue.mapUrl || ''}
                    onChange={e => setVenues(vs => vs.map(v => v.id === venue.id ? { ...v, mapUrl: e.target.value } : v))}
                    placeholder="Google Maps link (optional)" />
                </div>
                <div className="flex items-center gap-2">
                  {venue.fieldMapUrl
                    ? <img src={venue.fieldMapUrl} alt="" className="h-10 w-14 object-cover rounded-lg border border-slate-200" />
                    : <div className="h-10 w-14 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-slate-300"><MapPin size={13} /></div>}
                  <input className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-400"
                    value={venue.fieldMapUrl || ''}
                    onChange={e => setVenues(vs => vs.map(v => v.id === venue.id ? { ...v, fieldMapUrl: e.target.value } : v))}
                    placeholder="Field map image URL (optional)" />
                </div>
                <p className="text-[11px] text-slate-400">A Google map embeds automatically from the address. Leave blank to hide this venue from the public page.</p>
              </div>

              <div className="divide-y divide-slate-100">
                {venue.fields.map((field, idx) => (
                  <div key={field.id}>
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <span className="text-xs text-slate-400 w-5 text-right">{idx + 1}</span>
                      <input className="flex-1 min-w-0 text-sm text-slate-700 border border-transparent focus:border-slate-300 focus:outline-none rounded px-2 py-1 focus:ring-1 focus:ring-teal-400"
                        value={field.name} onChange={e => updateFieldName(venue.id, field.id, e.target.value)} placeholder="Field name" />
                      <input
                        className="w-16 text-xs text-center font-mono text-teal-700 bg-teal-50 border border-teal-100 focus:border-teal-400 focus:outline-none rounded-lg px-1 py-1"
                        value={field.abbr || ''}
                        onChange={e => updateField(venue.id, field.id, { abbr: e.target.value.toUpperCase().slice(0, 6) })}
                        placeholder="Abbr"
                        title="Field abbreviation"
                      />
                      <button type="button" onClick={() => setExpandedFields(e => ({ ...e, [field.id]: !e[field.id] }))}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors whitespace-nowrap ${expandedFields[field.id] ? 'bg-teal-50 border-teal-200 text-teal-600' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>
                        {expandedFields[field.id] ? <><ChevronUp size={12} className="inline" /> Availability</> : <><ChevronDown size={12} className="inline" /> Availability</>}
                      </button>
                      <button type="button" onClick={() => removeField(venue.id, field.id)} className="text-red-300 hover:text-red-500 text-sm"><X size={13} /></button>
                    </div>
                    {expandedFields[field.id] && (
                      <div className="bg-teal-50 border-t border-teal-100 px-6 py-4 space-y-4">
                        <div>
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">⏰ Available Hours</p>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-500">From</label>
                              <input type="time" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                value={field.availStart || ''} onChange={e => updateField(venue.id, field.id, { availStart: e.target.value })} />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-500">To</label>
                              <input type="time" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                value={field.availEnd || ''} onChange={e => updateField(venue.id, field.id, { availEnd: e.target.value })} />
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide"><Award size={12} className="inline mr-1 align-text-bottom" /> Division restrictions</p>
                            <span className="text-xs text-slate-400">{(field.divRestrictions?.length || 0) === 0 ? 'All divisions' : `${field.divRestrictions!.length} restricted`}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {fromDivItems(divItems, customDivisions).map(div => {
                              const checked = (field.divRestrictions || []).includes(div)
                              return (
                                <label key={div} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors ${checked ? 'bg-white border border-teal-200 font-medium text-slate-800' : 'text-slate-500 hover:bg-white/60'}`}>
                                  <input type="checkbox" checked={checked} className="w-3.5 h-3.5 accent-teal-600 flex-shrink-0"
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
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 whitespace-nowrap">How many fields?</span>
                  <input type="number" min="1" max="50" className="w-20 text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-center"
                    placeholder="e.g. 7" value={bulkFieldCounts[venue.id] || ''}
                    onChange={e => setBulkFieldCounts(f => ({ ...f, [venue.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bulkAddFields(venue.id) } }} />
                  <button type="button" onClick={() => bulkAddFields(venue.id)} disabled={!bulkFieldCounts[venue.id]}
                    className="text-xs font-medium text-teal-600 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                    Generate Fields
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">Or add one:</span>
                  <input className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Field name (e.g. 2A, North)" value={newFieldNames[venue.id] || ''}
                    onChange={e => setNewFieldNames(f => ({ ...f, [venue.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addField(venue.id) } }} />
                  <button type="button" onClick={() => addField(venue.id)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
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
        <p className="text-sm text-slate-500 mb-5">Per-team pricing tiers shown on the public registration form.</p>
        <RegPricingEditor value={pricing} onChange={setPricing} />
        <button type="button" onClick={() => setPricing(DEFAULT_REG_PRICING)} className="text-xs text-slate-400 hover:text-slate-600 underline mt-4 block">Reset to defaults</button>
        <div className="mt-8 pt-6 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Confirmation letter</h3>
          <p className="text-sm text-slate-500 mb-3">What teams see after registering and the email they receive. Leave blank to use your <a href="/dashboard/org/forms" className="text-teal-700 hover:underline">org default</a>.</p>
          <RegConfirmationEditor mode="tournament" value={regConf} inherit={orgRegDefault} onChange={patch => setRegConf(c => ({ ...c, ...patch }))} />
        </div>
      </div>
    )

    // ── Staff & Pay ──
    if (activeSection === 'info') return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Public info for parents and coaches — medical, parking, lost &amp; found and so on. Shown under the Info button on the public page.</p>
        <TournamentInfoEditor value={infoSections} onChange={setInfoSections} />
      </div>
    )

    if (activeSection === 'broadcast') return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Which staff roles may post announcements to the public page. You, as director, always can.</p>
        <BroadcastRolesEditor value={broadcastRoles} onChange={setBroadcastRoles} />
      </div>
    )

    if (activeSection === 'regtypes') return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Choose which registration forms this tournament offers. Turning team registration off hides the Register button on the public page.</p>
        <RegistrationTypesEditor value={regTypes} onChange={setRegTypes} tournamentId={params.id} />
      </div>
    )

    if (activeSection === 'staffpay') return (
      <StaffPayEditor
        value={{ roles: staffRoles, officialsConfig }}
        onChange={next => { setStaffRoles(next.roles); setOfficialsConfig(next.officialsConfig) }}
      />
    )

    // ── Schedule Rules ──
    if (activeSection === 'schedule') return (
      <div className="space-y-5">
        <p className="text-sm text-slate-500">Configure default scheduling parameters used when building or auto-assigning the game schedule.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Schedule Increment (min)</label>
            <input className="input" type="number" min="5" max="120" step="5" value={scheduleIncrement} onChange={e => setScheduleIncrement(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">Time between game start slots</p>
          </div>
          <div>
            <label className="label">Game Length (min)</label>
            <input className="input" type="number" min="10" max="120" step="5" value={gameLength} onChange={e => setGameLength(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">Actual play time per game</p>
          </div>
          <div>
            <label className="label">Break Between Games (min)</label>
            <input className="input" type="number" min="0" max="60" step="5" value={breakLength} onChange={e => setBreakLength(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">Buffer between consecutive games</p>
          </div>
        </div>
        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Game format</h3>
          <p className="text-xs text-slate-400 mb-3">Used by the live scorekeeper app for period labels and the break shown between periods.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Period format</label>
              <select className="input" value={periodFormat} onChange={e => setPeriodFormat(e.target.value)}>
                <option value="halves">Halves</option>
                <option value="quarters">Quarters</option>
                <option value="periods">Periods</option>
                <option value="running">Running clock</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">How the game is divided</p>
            </div>
            {periodFormat !== 'running' && (
              <div>
                <label className="label">Time between {periodFormat === 'quarters' ? 'quarters' : periodFormat === 'periods' ? 'periods' : 'halves'} (min)</label>
                <input className="input" type="number" min="0" max="60" step="1" value={periodBreak} onChange={e => setPeriodBreak(e.target.value)} />
                <p className="text-xs text-slate-400 mt-1">Halftime / break length shown on the scorer</p>
              </div>
            )}
          </div>
        </div>
        <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 text-sm text-teal-700">
          More scheduling rules (pool play, blackout times, field constraints) coming soon.
        </div>
      </div>
    )

    // ── Public event page content ──
    if (PUBLIC_SECTIONS.includes(activeSection as EventSectionKey)) return (
      <EventContentSection
        section={activeSection as EventSectionKey}
        id={params.id}
        content={eventContent}
        setContent={setEventContent}
        ruleSets={ruleSets}
      />
    )

    return null
  }

  // ─── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <Toaster />

      <TournamentNav id={params.id} name={name || 'Tournament Builder'} logoUrl={logoUrl || undefined} />

      <div className="max-w-6xl mx-auto px-4 pt-0 pb-2 flex justify-end">
        <button onClick={save} disabled={saving}
          className="bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
          {saving ? 'Saving…' : '💾 Save Changes'}
        </button>
      </div>

      <div className="flex max-w-6xl mx-auto py-4 px-4 gap-6">

        {/* Sidebar */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Setup</p>
            </div>
            <nav className="p-2">
              {SECTION_GROUPS.map(group => {
                const items = SECTIONS.filter(s => s.group === group)
                if (items.length === 0) return null   // group not populated yet
                return (
                  <div key={group} className="mb-1.5 last:mb-0">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">{group}</p>
                    <div className="space-y-0.5">
                      {items.map(s => {
                        const done = isComplete(s.id)
                        const active = activeSection === s.id
                        return (
                          <button key={s.id} onClick={() => setActiveSection(s.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${active ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <s.icon size={16} className="flex-shrink-0" />
                            <span className={`flex-1 text-sm font-medium ${active ? 'text-teal-700' : ''}`}>{s.label}</span>
                            <span className={`text-xs ${done ? 'text-emerald-500' : 'text-slate-200'}`}>{done ? <Check size={14} /> : <Circle size={14} />}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </nav>
          </div>

          {/* Game Scheduler link */}
          <div className="mt-4">
            <a href={`/tournaments/${params.id}/scheduler`}
              className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:bg-teal-50 hover:border-teal-200 transition-colors group">
              <Calendar className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-slate-700 group-hover:text-teal-700">Game Scheduler</p>
                <p className="text-xs text-slate-400">Drag &amp; drop games to fields</p>
              </div>
              <ArrowRight size={14} className="ml-auto text-slate-300 group-hover:text-teal-400" />
            </a>
          </div>


          {/* Quick stats */}
          <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Summary</p>
            <div className="text-xs text-slate-500 space-y-1">
              <div className="flex justify-between"><span>Divisions</span><span className="font-semibold text-slate-700">{divItems.filter(i => i.checked).length + customDivisions.length}</span></div>
              <div className="flex justify-between"><span>Venues</span><span className="font-semibold text-slate-700">{venues.length}</span></div>
              <div className="flex justify-between"><span>Total fields</span><span className="font-semibold text-slate-700">{venues.reduce((s, v) => s + v.fields.length, 0)}</span></div>
              <div className="flex justify-between"><span>Sections done</span><span className="font-semibold text-slate-700">{SECTIONS.filter(s => isComplete(s.id)).length}/{SECTIONS.length}</span></div>
            </div>
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  {(() => { const Icon = SECTIONS.find(s => s.id === activeSection)?.icon; return Icon ? <Icon size={18} className="text-slate-400" /> : null })()}
                  {SECTIONS.find(s => s.id === activeSection)?.label}
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
