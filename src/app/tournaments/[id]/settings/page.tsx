'use client'
import { useEffect, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { DEFAULT_PAY_RATES, PayRates } from '@/lib/utils'
import TournamentNav from '../TournamentNav'

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

const DEFAULT_DIVISIONS = [
  'Boys High School A', 'Boys High School B', 'Boys High School B2',
  'Boys U14 A and B', 'Boys U12 A and B',
  'Boys U10 A and B (7v7)', 'Boys U10 A and B (10v10)', 'Boys U8 (7v7)',
  'Girls High School A', 'Girls High School B', 'Girls High School B2',
  'Girls Middle School A', 'Girls Middle School B (No 2030s)',
  'Girls Lower School A (7v7)', 'Girls Lower School B (7v7 - No 2033s)',
]

interface Field { id: string; name: string }
interface Venue { id: string; name: string; fields: Field[] }

function uid() { return Math.random().toString(36).slice(2, 10) }

type Section = 'general' | 'fees' | 'divisions' | 'payrates' | 'refrules' | 'venues'

function SectionCard({ title, description, icon, open, onToggle, children, badge }: {
  title: string; description: string; icon: string; open: boolean
  onToggle: () => void; children: React.ReactNode; badge?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-left">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg flex-shrink-0">{icon}</div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-800 text-sm">{title}</p>
              {badge && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{badge}</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          </div>
        </div>
        <span className="text-gray-400 text-lg ml-4">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-6 py-5">
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
  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const [divisions, setDivisions] = useState<string[]>(DEFAULT_DIVISIONS)
  const [newDivision, setNewDivision] = useState('')
  const [venues, setVenues] = useState<Venue[]>([])
  const [newVenueName, setNewVenueName] = useState('')
  const [newFieldNames, setNewFieldNames] = useState<Record<string, string>>({})
  const [tName, setTName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const [newCount, setNewCount] = useState('1')
  const [open, setOpen] = useState<Section>('general')

  const toggle = (s: Section) => setOpen(o => o === s ? ('' as any) : s)

  useEffect(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setName(t.name); setTName(t.name)
      setRates({ ...DEFAULT_PAY_RATES, ...JSON.parse(t.payRates) })
      setDivRules(JSON.parse(t.divisionRules || '{}'))
      try { const p = JSON.parse(t.registrationPricing || '{}'); if (p.tier1) setPricing(p) } catch {}
      try { const d = JSON.parse(t.registrationDivisions || '[]'); if (d.length > 0) setDivisions(d) } catch {}
      try { const v = JSON.parse(t.venues || '[]'); setVenues(v) } catch {}
      setLoading(false)
    })
  }, [params.id])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const res = await fetch(`/api/tournaments/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, payRates: rates, divisionRules: divRules,
        registrationPricing: JSON.stringify(pricing),
        registrationDivisions: JSON.stringify(divisions),
        venues: JSON.stringify(venues),
      })
    })
    if (res.ok) { toast.success('Settings saved!'); setTName(name) } else toast.error('Failed to save')
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

  function removeField(venueId: string, fieldId: string) {
    setVenues(v => v.map(x => x.id === venueId ? { ...x, fields: x.fields.filter(f => f.id !== fieldId) } : x))
  }

  function updateFieldName(venueId: string, fieldId: string, name: string) {
    setVenues(v => v.map(x => x.id === venueId
      ? { ...x, fields: x.fields.map(f => f.id === fieldId ? { ...f, name } : f) }
      : x))
  }

  function addRule() { if (!newKeyword.trim()) return; setDivRules(r => ({ ...r, [newKeyword.trim()]: parseInt(newCount) || 1 })); setNewKeyword(''); setNewCount('1') }
  function removeRule(k: string) { setDivRules(r => { const n = { ...r }; delete n[k]; return n }) }

  if (loading) return <div className="text-slate-400 text-center py-12">Loading…</div>

  const totalFields = venues.reduce((s, v) => s + v.fields.length, 0)
  const checkedCount = divisions.filter(d => DEFAULT_DIVISIONS.includes(d)).length + divisions.filter(d => !DEFAULT_DIVISIONS.includes(d)).length

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Toaster />
      <TournamentNav id={params.id} name={tName} />
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">{tName}</p>
          </div>
          <button onClick={save} disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        <form onSubmit={save} className="space-y-3">

          <SectionCard title="General" description="Tournament name and basic info" icon="🏆" open={open === 'general'} onToggle={() => toggle('general')}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tournament Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={name} onChange={e => setName(e.target.value)} required />
            </div>
          </SectionCard>

          {/* Venues & Fields */}
          <SectionCard title="Venues & Fields" description="Complexes and fields where games are played" icon="🏟️"
            open={open === 'venues'} onToggle={() => toggle('venues')}
            badge={venues.length > 0 ? `${venues.length} venue${venues.length !== 1 ? 's' : ''}, ${totalFields} field${totalFields !== 1 ? 's' : ''}` : undefined}>

            {venues.length === 0 && (
              <p className="text-sm text-gray-400 italic mb-4">No venues added yet.</p>
            )}

            <div className="space-y-4">
              {venues.map(venue => (
                <div key={venue.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Venue header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <span className="text-gray-400 text-sm">🏟</span>
                    <input
                      className="flex-1 bg-transparent text-sm font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
                      value={venue.name}
                      onChange={e => updateVenueName(venue.id, e.target.value)}
                      placeholder="Venue name"
                    />
                    <button type="button" onClick={() => removeVenue(venue.id)}
                      className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
                  </div>

                  {/* Fields list */}
                  <div className="divide-y divide-gray-100">
                    {venue.fields.map((field, idx) => (
                      <div key={field.id} className="flex items-center gap-2 px-4 py-2.5">
                        <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}</span>
                        <input
                          className="flex-1 text-sm text-gray-700 border border-transparent focus:border-gray-300 focus:outline-none rounded px-2 py-1 focus:ring-1 focus:ring-blue-400"
                          value={field.name}
                          onChange={e => updateFieldName(venue.id, field.id, e.target.value)}
                          placeholder={`Field ${idx + 1}`}
                        />
                        <button type="button" onClick={() => removeField(venue.id, field.id)}
                          className="text-red-300 hover:text-red-500 text-sm px-1">✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Add field row */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                    <span className="text-xs text-gray-400 w-5" />
                    <input
                      className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Field name (e.g. 01, North, Stadium)"
                      value={newFieldNames[venue.id] || ''}
                      onChange={e => setNewFieldNames(f => ({ ...f, [venue.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addField(venue.id) } }}
                    />
                    <button type="button" onClick={() => addField(venue.id)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                      + Add Field
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add venue */}
            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
              <input
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Venue / complex name (e.g. Tamarac Sports Complex)"
                value={newVenueName}
                onChange={e => setNewVenueName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVenue() } }}
              />
              <button type="button" onClick={addVenue}
                className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                + Add Venue
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Registration Fees" description="Per-team pricing tiers for the public registration form" icon="💰"
            open={open === 'fees'} onToggle={() => toggle('fees')}
            badge={`$${pricing.tier1.toLocaleString()} base`}>
            <div className="space-y-4">
              {[
                { label: `1 – `, fieldMax: 'tier1Max', fieldPrice: 'tier1', suffix: ' teams' },
                { label: ``, fieldMax: 'tier2Max', fieldPrice: 'tier2', prefix: true },
                { label: `${pricing.tier2Max + 1}+ teams`, fieldMax: null, fieldPrice: 'tier3' },
                { label: '7v7 teams', fieldMax: null, fieldPrice: 'sevenVSeven' },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    {i === 0 && <>1–<input type="number" min="1" max="10" className="border border-gray-300 rounded px-1.5 py-0.5 w-12 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={pricing.tier1Max} onChange={e => setPricing(p => ({ ...p, tier1Max: parseInt(e.target.value) || 3 }))} /> teams</>}
                    {i === 1 && <>{pricing.tier1Max + 1}–<input type="number" min="1" max="20" className="border border-gray-300 rounded px-1.5 py-0.5 w-12 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={pricing.tier2Max} onChange={e => setPricing(p => ({ ...p, tier2Max: parseInt(e.target.value) || 6 }))} /> teams</>}
                    {i === 2 && <>{pricing.tier2Max + 1}+ teams</>}
                    {i === 3 && <>7v7 teams</>}
                    <span className="text-gray-400 font-normal text-xs ml-1">per team</span>
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">$</span>
                    <input type="number" min="0" step="1"
                      className="border border-gray-300 rounded-lg px-3 py-1.5 w-24 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={i === 0 ? pricing.tier1 : i === 1 ? pricing.tier2 : i === 2 ? pricing.tier3 : pricing.sevenVSeven}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0
                        if (i === 0) setPricing(p => ({ ...p, tier1: v }))
                        else if (i === 1) setPricing(p => ({ ...p, tier2: v }))
                        else if (i === 2) setPricing(p => ({ ...p, tier3: v }))
                        else setPricing(p => ({ ...p, sevenVSeven: v }))
                      }} />
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setPricing(DEFAULT_PRICING)}
                className="text-xs text-gray-400 hover:text-gray-600 underline">Reset to defaults</button>
            </div>
          </SectionCard>

          <SectionCard title="Divisions" description="Select and name the divisions offered in this tournament" icon="🏅"
            open={open === 'divisions'} onToggle={() => toggle('divisions')}
            badge={`${checkedCount} active`}>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {DEFAULT_DIVISIONS.map((defaultDiv, i) => {
                const checkedForReal = divisions.includes(defaultDiv)
                return (
                  <div key={i} className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${checkedForReal ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                    <input type="checkbox" checked={checkedForReal}
                      onChange={e => {
                        if (e.target.checked) setDivisions(d => [...d, defaultDiv])
                        else setDivisions(d => d.filter(v => v !== defaultDiv))
                      }}
                      className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                    {checkedForReal ? (
                      <input
                        className="flex-1 min-w-0 bg-transparent border-0 text-sm text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
                        value={divisions.find(d => d === defaultDiv) || defaultDiv}
                        onChange={e => setDivisions(d => d.map(v => v === defaultDiv ? e.target.value : v))}
                      />
                    ) : (
                      <span className="text-sm text-gray-400 flex-1 truncate">{defaultDiv}</span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Custom division</p>
              <div className="flex gap-2">
                <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Boys U9 (7v7)" value={newDivision}
                  onChange={e => setNewDivision(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newDivision.trim()) { setDivisions(d => [...d, newDivision.trim()]); setNewDivision('') } } }} />
                <button type="button"
                  className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
                  onClick={() => { if (newDivision.trim()) { setDivisions(d => [...d, newDivision.trim()]); setNewDivision('') } }}>Add</button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {divisions.filter(d => !DEFAULT_DIVISIONS.includes(d)).map((d, i) => (
                  <div key={i} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    <input type="checkbox" checked readOnly className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                    <input className="flex-1 min-w-0 bg-transparent border-0 text-sm text-gray-800 font-medium focus:outline-none" value={d}
                      onChange={e => setDivisions(divs => divs.map(v => v === d ? e.target.value : v))} />
                    <button type="button" onClick={() => setDivisions(divs => divs.filter(v => v !== d))}
                      className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setDivisions(DEFAULT_DIVISIONS)}
              className="text-xs text-gray-400 hover:text-gray-600 underline mt-3 block">Reset to defaults</button>
          </SectionCard>

          <SectionCard title="Staff Pay Rates" description="Default pay per game for each staff role" icon="💵"
            open={open === 'payrates'} onToggle={() => toggle('payrates')}>
            <div className="space-y-3">
              {RATE_FIELDS.map(f => (
                <div key={f.key} className="flex items-center justify-between gap-4 py-1.5 border-b border-gray-100 last:border-0">
                  <p className="text-sm font-medium text-gray-700">{f.label}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">$</span>
                    <input type="number" min="0" step="0.01"
                      className="border border-gray-300 rounded-lg px-3 py-1.5 w-24 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={rates[f.key] ?? 0}
                      onChange={e => setRates(r => ({ ...r, [f.key]: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Ref Count Rules" description="Auto-assign number of refs per division keyword" icon="🦺"
            open={open === 'refrules'} onToggle={() => toggle('refrules')}
            badge={`${Object.keys(divRules).length} rules`}>
            <div className="space-y-2 mb-4">
              {Object.entries(divRules).length === 0 && (
                <p className="text-sm text-gray-400 italic">No rules yet.</p>
              )}
              {Object.entries(divRules).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-sm text-gray-700">Division contains <strong>"{k}"</strong> → <strong>{v} ref{v !== 1 ? 's' : ''}</strong></span>
                  <button type="button" onClick={() => removeRule(k)} className="text-red-400 hover:text-red-600 text-xs ml-4">Remove</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-end border-t border-gray-100 pt-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Division keyword</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="e.g. 7v7, U8, Lower School" />
              </div>
              <div className="w-28">
                <label className="block text-xs font-medium text-gray-600 mb-1">Ref count</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCount} onChange={e => setNewCount(e.target.value)}>
                  <option value="1">1 ref</option>
                  <option value="2">2 refs</option>
                  <option value="3">3 refs</option>
                </select>
              </div>
              <button type="button" onClick={addRule}
                className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium mb-0.5">Add</button>
            </div>
          </SectionCard>

        </form>
      </div>
    </div>
  )
}
