'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'

interface Tournament {
  id:string; name:string; sport:string; startDate:string; endDate:string
  location:string; scheduleIncrement:number; dates:string; createdAt:string; logoUrl:string
  _count:{ games:number; teamRegistrations:number; registeredTeams:number; playerRegistrations:number }
}

const SPORTS = ['Lacrosse','Soccer','Football','Basketball','Baseball','Softball','Field Hockey','Hockey','Rugby','Volleyball','Other']
const EMPTY_FORM = { name:'', sport:'Lacrosse', startDate:'', endDate:'', location:'', scheduleIncrement:'50' }

export default function HomePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name:'', sport:'', startDate:'', endDate:'', location:'' })
  const [editSaving, setEditSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [editLogoUrl, setEditLogoUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const r = await fetch('/api/tournaments')
    setTournaments(await r.json()); setLoading(false)
  }
  useEffect(() => { load() }, [])

  function setF(k:string, v:string) { setForm(f => ({ ...f, [k]: v })) }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const r = await fetch('/api/tournaments', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name:form.name.trim(), sport:form.sport, startDate:form.startDate, endDate:form.endDate, location:form.location, scheduleIncrement:parseInt(form.scheduleIncrement)||50 })
    })
    if (r.ok) { toast.success('Tournament created'); setForm(EMPTY_FORM); setShowForm(false); load() }
    else toast.error('Failed')
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
          <h1 className="section-title">Tournaments</h1>
          <p className="text-sm text-slate-500 mt-1">Manage staff scheduling for each tournament</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ New Tournament</button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">New Tournament</h2>
          <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="label">Location</label>
              <input className="input" placeholder="e.g. Village Park, Pleasanton CA" value={form.location} onChange={e=>setF('location',e.target.value)}/>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-2 pt-1">
              <button type="submit" className="btn-primary" disabled={saving}>{saving?'Creating…':'Create Tournament'}</button>
              <button type="button" className="btn-secondary" onClick={()=>setShowForm(false)}>Cancel</button>
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
                        {t.startDate ? (t.endDate && t.endDate !== t.startDate ? `${t.startDate} – ${t.endDate}` : t.startDate) : dates.map(d=>formatDate(d)).join(' & ')}
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
                </div>
              </div>
            )
          })}
        </div>
       )}
    </div>
  )
}
