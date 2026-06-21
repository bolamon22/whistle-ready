'use client'
import OrgLogoMark from '@/app/OrgLogoMark'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'
import { useSession } from 'next-auth/react'

interface Tournament {
  id:string; name:string; sport:string; startDate:string; endDate:string
  location:string; scheduleIncrement:number; dates:string; createdAt:string; logoUrl:string
  _count:{ games:number; teamRegistrations:number; registeredTeams:number; playerRegistrations:number }
}

const SPORTS = ['Lacrosse','Flag Football','Soccer','Football','Basketball','Baseball','Softball','Field Hockey','Hockey','Rugby','Volleyball','Other']
const fmtDate = (d: string) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}/${y}` }

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

const EMPTY_FORM = { name:'', sport:'Lacrosse', startDate:'', endDate:'', location:'', scheduleIncrement:'50', numFields:'', dayStart:'08:00', dayEnd:'18:00', regMode:'builtin', teamFee:'1495' }

const ADMIN_LINKS = [
  { label: '👥 User Management',    href: '/admin/users',              desc: 'Add, edit, delete users and assign roles' },
  { label: '🔐 Permissions',        href: '/admin/permissions',        desc: 'Control what each role can access' },
  { label: '📋 Forms',              href: '/dashboard/org/forms',      desc: 'Reusable forms — player waiver, vendor' },
  { label: '📜 Rules library',       href: '/dashboard/org/rules',      desc: 'Reusable rule sets — Sixes, Traditional' },
  { label: '🏒 Club Director View', href: '/dashboard/club-director',  desc: 'Preview the Club Director dashboard' },
  { label: '👤 My Profile',         href: '/profile',                  desc: 'Edit your name, email and password' },
]

export default function HomePage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const orgId = (session?.user as any)?.orgId as string | null
  const [orgs, setOrgs] = useState<{id:string;name:string}[]>([])
  const [viewOrgId, setViewOrgId] = useState(() => {
    if (typeof document === 'undefined') return ''
    const m = document.cookie.match(/(?:^|; )preview-org=([^;]*)/)
    return m ? decodeURIComponent(m[1]) : ''
  })
  const [orgName, setOrgName] = useState('')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [createLogoUrl, setCreateLogoUrl] = useState('')
  const [createLogoUploading, setCreateLogoUploading] = useState(false)
  const [divisions, setDivisions] = useState<string[]>([])
  const [newDivision, setNewDivision] = useState('')
  const [showDivisions, setShowDivisions] = useState(false)

  // Copy state
  const [copySourceId, setCopySourceId] = useState<string | null>(null)
  const [copyName, setCopyName] = useState('')
  const [copyStart, setCopyStart] = useState('')
  const [copyEnd, setCopyEnd] = useState('')
  const [copying, setCopying] = useState(false)

  async function copyTournament() {
    if (!copySourceId || !copyName.trim()) return
    setCopying(true)
    const res = await fetch(`/api/tournaments/${copySourceId}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: copyName.trim(), startDate: copyStart, endDate: copyEnd }),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success(`"${data.name}" created!`)
      setCopySourceId(null)
      const r = await fetch('/api/tournaments')
      setTournaments(await r.json())
    } else {
      toast.error(data.error || 'Failed to copy')
    }
    setCopying(false)
  }

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name:'', sport:'', startDate:'', endDate:'', location:'' })
  const [editSaving, setEditSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [editLogoUrl, setEditLogoUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load(filterOrgId?: string) {
    const filter = filterOrgId !== undefined ? filterOrgId : viewOrgId
    const url = filter ? '/api/tournaments' + '?viewOrgId=' + filter : '/api/tournaments'
    const r = await fetch(url)
    setTournaments(await r.json()); setLoading(false)
  }
  useEffect(() => { load() }, [viewOrgId])
  useEffect(() => {
    if (isAdmin) {
      fetch('/api/admin/orgs').then(r=>r.json()).then((d: any[]) => setOrgs(Array.isArray(d) ? d : []))
    } else if (orgId) {
      fetch('/api/org').then(r=>r.json()).then((d: any) => { if(d && d.name) setOrgName(d.name) })
    }
  }, [isAdmin, orgId])

  function setF(k:string, v:string) { setForm(f => ({ ...f, [k]: v })) }

  function toggleDivision(div: string) {
    setDivisions(d => d.includes(div) ? d.filter(v => v !== div) : [...d, div])
  }

  function addCustomDivision() {
    if (!newDivision.trim()) return
    setDivisions(d => [...d, newDivision.trim()])
    setNewDivision('')
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const r = await fetch('/api/tournaments', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        name: form.name.trim(), sport: form.sport, startDate: form.startDate,
        endDate: form.endDate, location: form.location,
        scheduleIncrement: parseInt(form.scheduleIncrement) || 50,
        registrationDivisions: JSON.stringify(divisions),
      })
    })
    if (r.ok) {
      const created = await r.json().catch(() => null)
      if (created?.id) {
        // Logo + registration fee -> tournament record
        const fee = parseInt(form.teamFee)
        const patch: any = {}
        if (createLogoUrl) patch.logoUrl = createLogoUrl
        if (form.regMode === 'builtin' && fee > 0) patch.registrationPricing = JSON.stringify({ tiers: [{ max: null, price: fee }], flat: null })
        if (Object.keys(patch).length) {
          try { await fetch(`/api/tournaments/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }) } catch { /* non-fatal */ }
        }
        // Fields + per-day time window -> venues (so the schedule grid is ready)
        const n = parseInt(form.numFields)
        const venueName = (form.location.split(',')[0] || '').trim() || 'Main Site'
        const fields = n > 0 ? Array.from({ length: Math.min(n, 30) }, (_, i) => ({ id: Math.random().toString(36).slice(2, 10), name: `Field ${i + 1}`, abbr: `F${i + 1}` })) : []
        const days: string[] = []
        if (form.startDate) {
          const sd = new Date(form.startDate + 'T12:00:00'); const ed = new Date((form.endDate || form.startDate) + 'T12:00:00')
          for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
        }
        const defaultAvailability = (form.dayStart && form.dayEnd) ? days.map(date => ({ date, slots: [{ start: form.dayStart, end: form.dayEnd }] })) : []
        if (fields.length || defaultAvailability.length) {
          try {
            await fetch(`/api/venues/${created.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ venues: fields.length ? [{ id: Math.random().toString(36).slice(2, 10), name: venueName, fields }] : [], defaultAvailability }),
            })
          } catch { /* non-fatal */ }
        }
      }
      toast.success('Tournament created')
      if (form.regMode === 'import' && created?.id) {
        window.location.href = `/tournaments/${created.id}/registrations/import`
        return
      }
      setForm(EMPTY_FORM)
      setCreateLogoUrl('')
      setDivisions([])
      setShowForm(false)
      setShowDivisions(false)
      load()
    } else toast.error('Failed')
    setSaving(false)
  }

  async function del(id:string, n:string) {
    if (!confirm(`Delete "${n}"? This removes all games and assignments.`)) return
    await fetch(`/api/tournaments/${id}`, { method:'DELETE' }); toast.success('Deleted'); load()
  }

  function openEdit(t: Tournament) {
    setEditId(t.id)
    setEditForm({ name:t.name, sport:t.sport, startDate:t.startDate, endDate:t.endDate, location:t.location })
    setEditLogoUrl(t.logoUrl || '')
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload', { method:'POST', body:fd })
      const { url } = await res.json()
      setEditLogoUrl(url)
      toast.success('Logo uploaded!')
    } catch { toast.error('Upload failed') }
    finally { setLogoUploading(false) }
  }

  async function handleCreateLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCreateLogoUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload', { method:'POST', body:fd })
      const { url } = await res.json()
      setCreateLogoUrl(url)
      toast.success('Logo uploaded!')
    } catch { toast.error('Upload failed') }
    finally { setCreateLogoUploading(false) }
  }

  async function moveToOrg(tournamentId: string, orgId: string) {
    await fetch(`/api/admin/tournaments/${tournamentId}/move-org`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    toast.success('Tournament moved!')
    load()
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    setEditSaving(true)
    try {
      await fetch(`/api/tournaments/${editId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...editForm, logoUrl: editLogoUrl }),
      })
      toast.success('Saved!')
      setEditId(null)
      load()
    } catch { toast.error('Failed to save') }
    finally { setEditSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3"><OrgLogoMark /><h1 className="section-title">Tournaments</h1>{!isAdmin && orgName && <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{orgName}</span>}</div>
          <p className="text-sm text-slate-500 mt-1">Manage staff scheduling for each tournament</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/org/site" className="border px-4 py-2 rounded-lg text-sm font-medium bg-white text-slate-700 border-slate-300 hover:bg-slate-50 transition-colors">🌐 Website</Link>
          {isAdmin && orgs.length > 0 && (
            <select value={viewOrgId} onChange={async e => {
                const newOrgId = e.target.value
                setViewOrgId(newOrgId)
                await fetch('/api/admin/preview-org', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orgId: newOrgId || null }),
                })
                window.dispatchEvent(new CustomEvent('preview-org-changed'))
              }} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Orgs</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {isAdmin && (
            <div className="relative">
              <button
                onClick={() => setShowAdminPanel(v => !v)}
                className={`border px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showAdminPanel ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                ⚙ Admin
              </button>
              {showAdminPanel && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAdminPanel(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Admin Tools</p>
                    </div>
                    <div className="p-2">
                      {ADMIN_LINKS.map(link => (
                        <Link key={link.href} href={link.href}
                          onClick={() => setShowAdminPanel(false)}
                          className="flex flex-col px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors group">
                          <span className="text-sm font-semibold text-slate-700 group-hover:text-sky-600">{link.label}</span>
                          <span className="text-xs text-slate-400 mt-0.5">{link.desc}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ New Tournament</button>
        </div>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">New Tournament</h2>
          <form onSubmit={create} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <label className="label">Tournament Name *</label>
                <input className="input" placeholder="e.g. Spring Classic 2026" value={form.name} onChange={e=>setF('name',e.target.value)} required autoFocus/>
              </div>
              <div>
                <label className="label">Sport</label>
                <select className="select" value={form.sport} onChange={e=>setF('sport',e.target.value)}>
                  {SPORTS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label">Start Date</label><input className="input" type="date" value={form.startDate} onChange={e=>setF('startDate',e.target.value)}/></div>
              <div><label className="label">End Date</label><input className="input" type="date" value={form.endDate} onChange={e=>setF('endDate',e.target.value)}/></div>
              <div>
                <label className="label">Schedule Increment (minutes)</label>
                <input className="input" type="number" min="5" max="120" step="5" value={form.scheduleIncrement} onChange={e=>setF('scheduleIncrement',e.target.value)} placeholder="50"/>
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="label">Location</label>
                <input className="input" placeholder="e.g. Village Park, Pleasanton CA" value={form.location} onChange={e=>setF('location',e.target.value)}/>
              </div>
              <div>
                <label className="label">Number of fields</label>
                <input className="input" type="number" min="0" max="30" step="1" value={form.numFields} onChange={e=>setF('numFields',e.target.value)} placeholder="e.g. 6"/>
                <p className="text-[11px] text-gray-400 mt-1">We'll set up Field 1–N so your schedule grid is ready.</p>
              </div>
              <div>
                <label className="label">Daily start time</label>
                <input className="input" type="time" value={form.dayStart} onChange={e=>setF('dayStart',e.target.value)}/>
              </div>
              <div>
                <label className="label">Daily end time</label>
                <input className="input" type="time" value={form.dayEnd} onChange={e=>setF('dayEnd',e.target.value)}/>
              </div>
              <div>
                <label className="label">Team registration</label>
                <select className="input" value={form.regMode} onChange={e=>setF('regMode',e.target.value)}>
                  <option value="builtin">Use built-in registration</option>
                  <option value="import">Import from another platform (CSV)</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">{form.regMode === 'import' ? "You'll upload your CSV right after creating." : 'Teams register & pay through Whistle Ready.'}</p>
              </div>
              {form.regMode === 'builtin' && (
                <div>
                  <label className="label">Team registration fee ($)</label>
                  <input className="input" type="number" min="0" step="any" value={form.teamFee} onChange={e=>setF('teamFee',e.target.value)} placeholder="1495"/>
                  <p className="text-[11px] text-gray-400 mt-1">Suggested base fee. Add volume discounts &amp; 7v7 pricing later in Settings.</p>
                </div>
              )}
              <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 flex-wrap">
                {createLogoUrl
                  ? <img src={createLogoUrl} alt="logo" className="w-12 h-12 rounded-lg object-contain border border-gray-300 bg-white" />
                  : <div className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-400 flex items-center justify-center text-gray-400 text-[10px]">Logo</div>}
                <label className="cursor-pointer text-xs font-medium text-teal-600 hover:text-teal-700 border border-teal-300 hover:border-teal-500 px-3 py-1.5 rounded-lg">
                  {createLogoUploading ? 'Uploading…' : 'Upload tournament logo'}
                  <input type="file" accept="image/*" className="hidden" disabled={createLogoUploading} onChange={handleCreateLogoUpload} />
                </label>
                {createLogoUrl && <button type="button" onClick={()=>setCreateLogoUrl('')} className="text-xs text-red-500 hover:text-red-600">Remove</button>}
              </div>
            </div>

            <p className="text-xs text-gray-400 -mt-1">You can add or change any of this later in Settings — none of it is locked in.</p>

            {/* Divisions section */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setShowDivisions(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">🏅 Divisions</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{divisions.length} selected</span>
                </div>
                <span className="text-gray-400 text-sm">{showDivisions ? '▲' : '▼'}</span>
              </button>

              {showDivisions && (
                <div className="p-4 border-t border-gray-100">
                  <div className="flex gap-2 mb-3">
                    <button type="button" onClick={() => setDivisions([...DEFAULT_DIVISIONS])}
                      className="text-xs text-blue-600 hover:underline">Select all defaults</button>
                    <span className="text-gray-300">·</span>
                    <button type="button" onClick={() => setDivisions([])}
                      className="text-xs text-gray-400 hover:underline">Clear all</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mb-4">
                    {DEFAULT_DIVISIONS.map(div => (
                      <label key={div} className={`flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${divisions.includes(div) ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-transparent hover:bg-gray-100'}`}>
                        <input type="checkbox" checked={divisions.includes(div)} onChange={() => toggleDivision(div)}
                          className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                        <span className={`text-sm truncate ${divisions.includes(div) ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>{div}</span>
                      </label>
                    ))}
                  </div>
                  {/* Custom divisions */}
                  {divisions.filter(d => !DEFAULT_DIVISIONS.includes(d)).map(d => (
                    <div key={d} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-1.5">
                      <input type="checkbox" checked readOnly className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                      <span className="text-sm text-gray-800 font-medium flex-1">{d}</span>
                      <button type="button" onClick={() => setDivisions(divs => divs.filter(v => v !== d))}
                        className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <input className="input flex-1" placeholder="Add custom division…" value={newDivision}
                      onChange={e => setNewDivision(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomDivision() } }} />
                    <button type="button" onClick={addCustomDivision}
                      className="btn-secondary">Add</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary" disabled={saving}>{saving?'Creating…':'Create Tournament'}</button>
              <button type="button" className="btn-secondary" onClick={()=>{setShowForm(false);setShowDivisions(false)}}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit modal */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg z-10">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Tournament</h2>
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className="label">Tournament Name *</label>
                <input required className="input" value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Sport</label>
                  <select className="select" value={editForm.sport} onChange={e=>setEditForm(f=>({...f,sport:e.target.value}))}>
                    {SPORTS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={editForm.startDate} onChange={e=>setEditForm(f=>({...f,startDate:e.target.value}))} />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" className="input" value={editForm.endDate} onChange={e=>setEditForm(f=>({...f,endDate:e.target.value}))} />
                </div>
              </div>
              <div>
                <label className="label">Location</label>
                <input className="input" value={editForm.location} onChange={e=>setEditForm(f=>({...f,location:e.target.value}))} />
              </div>

              {/* Logo upload */}
              <div>
                <label className="label">Tournament Logo</label>
                <div className="flex items-center gap-3">
                  {editLogoUrl && (
                    <img src={editLogoUrl} alt="Logo" className="h-14 w-14 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                  )}
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary btn-sm" disabled={logoUploading}>
                      {logoUploading ? 'Uploading…' : editLogoUrl ? '🔄 Replace Logo' : '📁 Upload Logo'}
                    </button>
                    {editLogoUrl && (
                      <button type="button" onClick={() => setEditLogoUrl('')}
                        className="text-xs text-red-500 hover:text-red-700 text-left">Remove logo</button>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editSaving} className="btn-primary flex-1">{editSaving ? 'Saving…' : 'Save Changes'}</button>
                <button type="button" onClick={() => setEditId(null)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <div className="text-slate-400 text-center py-16">Loading…</div> :
       tournaments.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-5xl mb-4">🏆</div>
          <p className="font-semibold text-slate-700">No tournaments yet</p>
          <p className="text-sm text-slate-400 mt-1">Create your first tournament to get started</p>
        </div>
       ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map(t => {
            const dates: string[] = JSON.parse(t.dates)
            return (
              <div key={t.id} className="card-hover p-5 relative">
                {/* Top controls */}
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    {t.sport && <span className="badge bg-emerald-100 text-emerald-700">{t.sport}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={e=>{e.preventDefault();openEdit(t)}} className="text-xs text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-300 px-2 py-0.5 rounded-md transition-colors">Edit</button>
                    <button onClick={e=>{e.preventDefault();setCopySourceId(t.id);setCopyName(t.name+' (Copy)');setCopyStart('');setCopyEnd('')}} className="text-xs text-slate-400 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 px-2 py-0.5 rounded-md transition-colors">Copy</button>
                    {orgs.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={e => { if (e.target.value) { moveToOrg(t.id, e.target.value); e.target.value = '' } }}
                        onClick={e => e.preventDefault()}
                        className="text-xs text-slate-400 border border-slate-200 px-2 py-0.5 rounded-md bg-white cursor-pointer hover:border-orange-300 hover:text-orange-600 transition-colors">
                        <option value="" disabled>Move to…</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    )}
                    <button onClick={()=>del(t.id,t.name)} className="text-slate-300 hover:text-red-400 transition-colors text-xl leading-none">×</button>
                  </div>
                </div>

                {/* Clickable header */}
                <Link href={`/tournaments/${t.id}/dashboard`} className="block mb-4">
                  {/* Logo centered at top */}
                  {t.logoUrl && (
                    <div className="flex justify-center mb-3">
                      <img src={t.logoUrl} alt="logo" className="h-24 w-24 object-contain rounded-xl" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-lg truncate">{t.name}</h3>
                    {(t.startDate || dates.length > 0) && (
                      <p className="text-sm text-slate-500 mt-0.5">
                        {t.startDate ? (t.endDate && t.endDate !== t.startDate ? `${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}` : fmtDate(t.startDate)) : dates.map(d=>formatDate(d)).join(' & ')}
                      </p>
                    )}
                    {t.location && <p className="text-xs text-slate-400 mt-0.5 truncate">📍 {t.location}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="badge bg-sky-100 text-sky-700">{t._count.games} games</span>
                      {t._count.teamRegistrations > 0 && <>
                        <span className="badge bg-purple-100 text-purple-700">{t._count.teamRegistrations} clubs</span>
                        <span className="badge bg-green-100 text-green-700">{t._count.registeredTeams} teams</span>
                      </>}
                      {t._count.playerRegistrations > 0 && (
                        <span className="badge bg-teal-100 text-teal-700">{t._count.playerRegistrations} players</span>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/tournaments/${t.id}`} className="btn-primary btn-sm">Schedule</Link>
                  <Link href={`/tournaments/${t.id}/roster`} className="btn-secondary btn-sm">Staff</Link>
                  <Link href={`/tournaments/${t.id}/registrations`} className="btn-secondary btn-sm text-purple-600 border-purple-200 hover:bg-purple-50">📋 Registrations</Link>
                  <Link href={`/tournaments/${t.id}/player-registrations`} className="btn-secondary btn-sm text-teal-600 border-teal-200 hover:bg-teal-50">🏃 Players</Link>
                  <Link href={`/tournaments/${t.id}/pay-summary`} className="btn-secondary btn-sm">Pay Report</Link>
                  <Link href={`/tournaments/${t.id}/builder`} className="btn-secondary btn-sm text-blue-600 border-blue-200 hover:bg-blue-50">🏗 Builder</Link>
                </div>
              </div>
            )
          })}
        </div>
       )}

      {/* Copy Tournament Modal */}
      {copySourceId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">📋 Copy Tournament</h2>
              <p className="text-sm text-gray-500 mt-1">Creates a new tournament with the same settings, venues, and staff roster. Games and registrations are not copied.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Tournament Name</label>
                <input className="input w-full" value={copyName} onChange={e=>setCopyName(e.target.value)} placeholder="e.g. Spring Invitational 2027"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="date" className="input w-full" value={copyStart} onChange={e=>setCopyStart(e.target.value)}/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" className="input w-full" value={copyEnd} onChange={e=>setCopyEnd(e.target.value)}/>
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Copies: venues & fields · divisions · pay rates · ref rules · staff roster · registration settings</p>
                <p className="font-semibold text-slate-500">Leaves behind: games · schedule · registrations · assignments · availability</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button className="flex-1 btn-secondary" onClick={()=>setCopySourceId(null)}>Cancel</button>
                <button className="flex-1 btn-primary disabled:opacity-40" onClick={copyTournament} disabled={!copyName.trim()||copying}>
                  {copying?'Copying…':'Create Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
