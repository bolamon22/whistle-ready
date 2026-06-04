'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { certLabel, WORKER_ROLES, isHourlyRole, PAY_METHODS, CERT_LEVELS } from '@/lib/utils'

interface Worker { id:string;name:string;certLevel:string;defaultRole:string;roles:string;gender:string;payMethod:string;payHandle:string|null;phone:string|null;email:string|null;isAssigner:boolean;payRateOverride:number|null;hourlyRate:number|null;notes:string|null;photoUrl:string|null }
interface RosterEntry { id:string;workerId:string;gameTarget:number;notes:string|null }
interface Tournament { id:string;name:string;logoUrl:string }

const GENDERS = [{ value:'both',label:'Boys & Girls' },{ value:'boys',label:'Boys only' },{ value:'girls',label:'Girls only' }]

type SortKey = 'name'|'defaultRole'|'certLevel'|'gender'
type SortDir = 'asc'|'desc'
type ExpandMode = 'profile'|'edit'

const BULK_FIELDS = [
  {value:'defaultRole',label:'Role'},
  {value:'certLevel',label:'Cert Level'},
  {value:'gender',label:'Can Ref'},
  {value:'payMethod',label:'Pay Method'},
]

// ── Edit form (outside component to prevent remount) ──
function EditForm({ form, setForm, onSubmit, onCancel, saving }: {
  form: Record<string,unknown>
  setForm: (fn:(f:Record<string,unknown>)=>Record<string,unknown>)=>void
  onSubmit: (e:React.FormEvent)=>void
  onCancel: ()=>void
  saving: boolean
}) {
  const roles = (form.roles as string[]) ?? [String(form.defaultRole??'ref')]
  const toggleRole = (r:string) => setForm(f => {
    const cur = (f.roles as string[]) ?? []
    const next = cur.includes(r) ? cur.filter(x=>x!==r) : [...cur,r]
    return {...f, roles: next.length ? next : cur, defaultRole: next[0]??cur[0]}
  })
  const needsHandle = (m:string) => m==='venmo'||m==='zelle'
  const hasRef = roles.includes('ref')
  const hasHourly = roles.some(r=>isHourlyRole(r))

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div><label className="label">Name *</label><input className="input" value={String(form.name??'')} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required autoFocus/></div>
      <div><label className="label">Email</label><input className="input" type="email" value={String(form.email??'')} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
      <div><label className="label">Phone</label><input className="input" type="tel" value={String(form.phone??'')} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>

      <div className="sm:col-span-2 lg:col-span-3">
        <label className="label">Roles (select all that apply)</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {WORKER_ROLES.map(r=>(
            <label key={r.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${roles.includes(r.value)?'bg-sky-50 border-sky-300 text-sky-800':'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              <input type="checkbox" className="accent-sky-600" checked={roles.includes(r.value)} onChange={()=>toggleRole(r.value)}/>
              {r.label}
            </label>
          ))}
        </div>
      </div>

      {hasRef&&<>
        <div><label className="label">Cert Level</label><select className="select" value={String(form.certLevel??'youth')} onChange={e=>setForm(f=>({...f,certLevel:e.target.value}))}>{CERT_LEVELS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
        <div><label className="label">Can Ref</label><select className="select" value={String(form.gender??'both')} onChange={e=>setForm(f=>({...f,gender:e.target.value}))}>{GENDERS.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
        <div><label className="label">Pay Rate Override ($/game)</label><input className="input" type="number" min="0" step="0.01" value={String(form.payRateOverride??'')} onChange={e=>setForm(f=>({...f,payRateOverride:e.target.value}))} placeholder="Leave blank = default"/></div>
      </>}
      {hasHourly&&<div><label className="label">Hourly Rate ($/hr)</label><input className="input" type="number" min="0" step="0.01" value={String(form.hourlyRate??'')} onChange={e=>setForm(f=>({...f,hourlyRate:e.target.value}))}/></div>}
      <div><label className="label">Pay Method</label><select className="select" value={String(form.payMethod??'check')} onChange={e=>setForm(f=>({...f,payMethod:e.target.value}))}>{PAY_METHODS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
      {needsHandle(String(form.payMethod??''))&&<div><label className="label">{String(form.payMethod)==='venmo'?'Venmo':'Zelle'} Handle</label><input className="input" value={String(form.payHandle??'')} onChange={e=>setForm(f=>({...f,payHandle:e.target.value}))} placeholder={String(form.payMethod)==='venmo'?'@username':'phone or email'}/></div>}
      <div className="flex items-end"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={Boolean(form.isAssigner)} onChange={e=>setForm(f=>({...f,isAssigner:e.target.checked}))}/>Also serves as Assigner</label></div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="label">Notes</label>
        <textarea className="input w-full min-h-[72px] resize-y text-sm" value={String(form.notes??'')} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Certifications, preferences, restrictions…"/>
      </div>
      <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving?'Saving…':'Save'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export default function RosterPage({ params }: { params:{id:string} }) {
  const [tournament, setTournament] = useState<Tournament|null>(null)
  const [allWorkers, setAllWorkers] = useState<Worker[]>([])
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string|null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [targets, setTargets] = useState<Record<string,string>>({})

  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkField, setBulkField] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [expandMode, setExpandMode] = useState<ExpandMode>('profile')
  const [editForm, setEditForm] = useState<Record<string,unknown>>({})

  async function load() {
    const [tR,wR,rR] = await Promise.all([
      fetch(`/api/tournaments/${params.id}`),
      fetch('/api/workers'),
      fetch(`/api/tournaments/${params.id}/roster`),
    ])
    const t=await tR.json(); const w=await wR.json(); const r=await rR.json()
    setTournament(t); setAllWorkers(w); setRoster(r)
    const t2:Record<string,string>={}
    for (const e of r) t2[e.workerId]=String(e.gameTarget)
    setTargets(t2)
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  function parseRoles(w:Worker):string[]{try{const r=JSON.parse(w.roles||'[]');return Array.isArray(r)&&r.length?r:[w.defaultRole]}catch{return[w.defaultRole]}}

  function isOnRoster(workerId:string) { return roster.some(r=>r.workerId===workerId) }

  async function toggleRoster(workerId:string) {
    setSaving(workerId)
    if (isOnRoster(workerId)) {
      await fetch(`/api/tournaments/${params.id}/roster?workerId=${workerId}`,{method:'DELETE'})
      toast.success('Removed from roster')
    } else {
      await fetch(`/api/tournaments/${params.id}/roster`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workerId,gameTarget:0})})
      toast.success('Added to roster')
    }
    await load(); setSaving(null)
  }

  async function updateTarget(workerId:string, val:string) {
    setTargets(t=>({...t,[workerId]:val}))
    await fetch(`/api/tournaments/${params.id}/roster`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workerId,gameTarget:parseInt(val)||0})})
  }

  function toggleSort(k:SortKey) { if(sortKey===k)setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortKey(k);setSortDir('asc')} }
  const sortArrow=(k:SortKey)=>sortKey===k?(sortDir==='asc'?'↑':'↓'):'↕'

  function expand(w:Worker, mode:ExpandMode) {
    if(expandedId===w.id&&expandMode===mode){setExpandedId(null);return}
    setExpandedId(w.id); setExpandMode(mode)
    if(mode==='edit'){
      setEditForm({name:w.name,email:w.email??'',phone:w.phone??'',certLevel:w.certLevel,defaultRole:w.defaultRole,roles:parseRoles(w),isAssigner:w.isAssigner,gender:w.gender,payRateOverride:w.payRateOverride??'',hourlyRate:w.hourlyRate??'',payMethod:w.payMethod,payHandle:w.payHandle??'',notes:w.notes??''})
    }
  }

  async function saveEdit(e:React.FormEvent, workerId:string) {
    e.preventDefault(); setEditSaving(true)
    const payload={...editForm,name:String(editForm.name).trim(),email:editForm.email||null,phone:editForm.phone||null,payRateOverride:editForm.payRateOverride!==''?Number(editForm.payRateOverride):null,hourlyRate:editForm.hourlyRate!==''?Number(editForm.hourlyRate):null,payHandle:editForm.payHandle||null,notes:editForm.notes||null,roles:editForm.roles}
    const res=await fetch(`/api/workers/${workerId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    if(res.ok){toast.success('Updated');setExpandedId(null);load()}else toast.error('Failed')
    setEditSaving(false)
  }

  function toggleSelect(id:string) { setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n}) }
  function toggleAll() { setSelected(s=>s.size===filteredOnRoster.length&&filteredOnRoster.length>0?new Set():new Set(filteredOnRoster.map(w=>w.id))) }

  async function applyBulk() {
    if(!bulkField||!selected.size) return
    setBulkSaving(true)
    await Promise.all(Array.from(selected).map(id=>
      fetch(`/api/workers/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({[bulkField]:bulkValue})})
    ))
    toast.success(`Updated ${selected.size} staff`)
    setSelected(new Set());setBulkField('');setBulkValue('');setBulkSaving(false);load()
  }

  const rLabel=(r:string)=>WORKER_ROLES.find(x=>x.value===r)?.label??r
  const gLabel=(g:string)=>GENDERS.find(x=>x.value===g)?.label??g
  const pmLabel=(p:string)=>PAY_METHODS.find(x=>x.value===p)?.label??p

  const onRoster = allWorkers.filter(w=>isOnRoster(w.id))
  const notOnRoster = allWorkers.filter(w=>!isOnRoster(w.id))

  const filteredOnRoster = onRoster
    .filter(w=>roleFilter==='all'||parseRoles(w).includes(roleFilter))
    .filter(w=>!search||w.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      const av=String(a[sortKey as keyof Worker]??''), bv=String(b[sortKey as keyof Worker]??'')
      return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av)
    })

  if (loading) return <div className="text-slate-400 text-center py-12">Loading…</div>
  if (!tournament) return <div className="text-red-500">Not found</div>

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/" className="hover:text-sky-600">Tournaments</Link><span>/</span>
        <Link href={`/tournaments/${params.id}`} className="hover:text-sky-600">{tournament.name}</Link><span>/</span>
        <span className="text-slate-700">Staff</span>
      </div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          {tournament.logoUrl && <img src={tournament.logoUrl} alt="logo" className="h-12 w-12 object-contain rounded-xl border border-slate-200 bg-slate-50 flex-shrink-0" />}
          <div>
          <h1 className="section-title">{tournament.name} Staff</h1>
          <p className="text-sm text-slate-500 mt-1">Confirm who's working this tournament · {onRoster.length} confirmed</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/tournaments/${params.id}/availability`} className="btn-secondary btn-sm">Availability →</Link>
          <Link href={`/tournaments/${params.id}`} className="btn-secondary btn-sm">← Grid</Link>
        </div>
      </div>

      {/* ── On Roster ── */}
      {onRoster.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"/>
              <span className="font-semibold text-emerald-800 text-sm">Confirmed ({onRoster.length})</span>
            </div>
            <input className="input !w-48 text-sm ml-4" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <label className="text-sm text-slate-500">Role:</label>
            <select className="select !w-auto text-sm" value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setSelected(new Set())}}>
              <option value="all">All roles</option>
              {WORKER_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="text-xs text-slate-400">{filteredOnRoster.length} shown</span>
            {(search||roleFilter!=='all')&&<button className="text-xs text-slate-400 hover:text-slate-600" onClick={()=>{setSearch('');setRoleFilter('all')}}>Clear filters</button>}
          </div>

          {selected.size>0&&(
            <div className="flex items-center gap-3 mb-3 p-3 bg-sky-50 border border-sky-200 rounded-lg flex-wrap">
              <span className="text-sm font-medium text-sky-700">{selected.size} selected</span>
              <select className="select !w-auto text-sm" value={bulkField} onChange={e=>{setBulkField(e.target.value);setBulkValue('')}}>
                <option value="">— choose field to edit —</option>
                {BULK_FIELDS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              {bulkField&&<>
                {bulkField==='defaultRole'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option>{WORKER_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select>}
                {bulkField==='certLevel'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option>{CERT_LEVELS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select>}
                {bulkField==='gender'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option>{GENDERS.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}</select>}
                {bulkField==='payMethod'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option>{PAY_METHODS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select>}
                <button onClick={applyBulk} className="btn-primary btn-sm" disabled={bulkSaving||!bulkValue}>{bulkSaving?'Saving…':'Apply to Selected'}</button>
              </>}
              <button onClick={()=>setSelected(new Set())} className="btn-secondary btn-sm ml-auto">Clear</button>
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-8"><input type="checkbox" checked={selected.size===filteredOnRoster.length&&filteredOnRoster.length>0} onChange={toggleAll}/></th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={()=>toggleSort('name')}>Name {sortArrow('name')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={()=>toggleSort('defaultRole')}>Roles {sortArrow('defaultRole')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={()=>toggleSort('certLevel')}>Cert {sortArrow('certLevel')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Pay Method</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Game Target</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Contact</th>
                  <th className="px-4 py-3"/>
                </tr>
              </thead>
              <tbody>
                {filteredOnRoster.map(w=>{
                  const wRoles=parseRoles(w)
                  const isExpanded=expandedId===w.id
                  return(
                  <>
                    <tr key={w.id} className={`border-b border-slate-100 ${selected.has(w.id)?'bg-sky-50':isExpanded?'bg-slate-50 border-b-0':'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3"><input type="checkbox" checked={selected.has(w.id)} onChange={()=>toggleSelect(w.id)}/></td>
                      <td className="px-4 py-3 font-semibold text-slate-900 cursor-pointer hover:text-sky-600 transition-colors" onClick={()=>expand(w,'profile')}>
                        {w.name}{w.isAssigner&&<span className="ml-2 badge bg-amber-100 text-amber-700">Assigner</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {wRoles.map(r=><span key={r} className="badge bg-slate-100 text-slate-600">{rLabel(r)}</span>)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {wRoles.includes('ref')
                          ? <div className="flex flex-col gap-0.5">
                              <span className={`badge w-fit ${w.certLevel==='college'?'bg-purple-100 text-purple-700':w.certLevel==='hs'?'bg-sky-100 text-sky-700':'bg-slate-100 text-slate-600'}`}>{certLabel(w.certLevel)}</span>
                              <span className="text-xs text-slate-400">{gLabel(w.gender)}</span>
                            </div>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge bg-slate-100 text-slate-600">{pmLabel(w.payMethod)}</span>
                        {w.payHandle && <div className="text-xs text-slate-400 mt-0.5">{w.payHandle}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {!wRoles.every(r=>isHourlyRole(r)) ? (
                          <input type="number" min="0" max="20"
                            className="input w-16 text-center py-1"
                            value={targets[w.id]??'0'}
                            onChange={e=>updateTarget(w.id,e.target.value)}
                          />
                        ) : <span className="text-slate-400 text-xs">Hourly</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {w.phone&&<div>{w.phone}</div>}
                        {w.email&&<div>{w.email}</div>}
                        {!w.phone&&!w.email&&'—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={()=>expand(w,'profile')} className={`text-xs mr-2 font-medium transition-colors ${isExpanded&&expandMode==='profile'?'text-slate-800 underline':'text-slate-400 hover:text-slate-700'}`}>Profile</button>
                        <button onClick={()=>expand(w,'edit')} className={`text-xs mr-3 font-medium transition-colors ${isExpanded&&expandMode==='edit'?'text-sky-800 underline':'text-sky-600 hover:text-sky-800'}`}>Edit</button>
                        <button onClick={()=>toggleRoster(w.id)} disabled={saving===w.id} className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                      </td>
                    </tr>

                    {/* Profile panel */}
                    {isExpanded&&expandMode==='profile'&&(
                      <tr key={`${w.id}-p`}>
                        <td colSpan={8} className="p-0 border-b border-slate-200">
                          <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white px-6 py-5">
                            <div className="flex items-start gap-5">
                              <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 shadow-lg">
                                {w.photoUrl
                                  ? <img src={w.photoUrl} alt={w.name} className="w-14 h-14 object-cover"/>
                                  : <div className="w-14 h-14 bg-sky-500 flex items-center justify-center font-bold text-2xl text-white">{w.name[0].toUpperCase()}</div>
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <h3 className="text-lg font-bold">{w.name}</h3>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      {wRoles.map(r=>(
                                        <span key={r} className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${r==='ref'?'bg-sky-500/30 text-sky-200':r==='scorekeeper'?'bg-emerald-500/30 text-emerald-200':'bg-slate-500/40 text-slate-300'}`}>{rLabel(r)}</span>
                                      ))}
                                      {w.isAssigner&&<span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/30 text-amber-200">Assigner</span>}
                                    </div>
                                  </div>
                                  <button onClick={()=>expand(w,'edit')} className="text-xs text-sky-300 hover:text-white border border-sky-400/40 hover:border-sky-300 px-3 py-1.5 rounded-lg transition-colors shrink-0">Edit →</button>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mt-4 text-sm">
                                  {w.phone&&<div><p className="text-slate-400 text-xs mb-0.5">Phone</p><p>{w.phone}</p></div>}
                                  {w.email&&<div><p className="text-slate-400 text-xs mb-0.5">Email</p><p className="truncate">{w.email}</p></div>}
                                  {wRoles.includes('ref')&&<>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Cert Level</p><p>{certLabel(w.certLevel)}</p></div>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Can Ref</p><p>{gLabel(w.gender)}</p></div>
                                  </>}
                                  <div><p className="text-slate-400 text-xs mb-0.5">Pay Method</p><p>{pmLabel(w.payMethod)}{w.payHandle?` · ${w.payHandle}`:''}</p></div>
                                  {w.payRateOverride&&<div><p className="text-slate-400 text-xs mb-0.5">Rate Override</p><p>${w.payRateOverride}/game</p></div>}
                                  {w.hourlyRate&&<div><p className="text-slate-400 text-xs mb-0.5">Hourly Rate</p><p>${w.hourlyRate}/hr</p></div>}
                                  {!wRoles.every(r=>isHourlyRole(r))&&<div><p className="text-slate-400 text-xs mb-0.5">Game Target</p><p>{targets[w.id]??'0'} games</p></div>}
                                </div>
                                {w.notes&&(
                                  <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10">
                                    <p className="text-slate-400 text-xs mb-1">Notes</p>
                                    <p className="text-slate-200 text-sm whitespace-pre-wrap">{w.notes}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Edit panel */}
                    {isExpanded&&expandMode==='edit'&&(
                      <tr key={`${w.id}-e`}>
                        <td colSpan={8} className="px-6 py-5 bg-sky-50/40 border-b border-slate-200">
                          <EditForm form={editForm} setForm={setEditForm} onSubmit={e=>saveEdit(e,w.id)} onCancel={()=>setExpandedId(null)} saving={editSaving}/>
                        </td>
                      </tr>
                    )}
                  </>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Not on roster ── */}
      {notOnRoster.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-300"/>
            <span className="font-semibold text-slate-600 text-sm">Available to Add ({notOnRoster.length})</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {notOnRoster.map(w=>{
                const wRoles=parseRoles(w)
                return(
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-700">{w.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">{wRoles.map(r=><span key={r} className="badge bg-slate-100 text-slate-600">{rLabel(r)}</span>)}</div>
                  </td>
                  <td className="px-4 py-3">{wRoles.includes('ref')?<span className={`badge ${w.certLevel==='college'?'bg-purple-100 text-purple-700':w.certLevel==='hs'?'bg-sky-100 text-sky-700':'bg-slate-100 text-slate-600'}`}>{certLabel(w.certLevel)}</span>:<span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{w.phone||w.email||'—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={()=>toggleRoster(w.id)} disabled={saving===w.id} className="btn-primary btn-sm">+ Add</button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {allWorkers.length===0 && (
        <div className="card p-12 text-center text-slate-400">
          <p className="font-medium">No staff in the database yet.</p>
          <Link href="/staff" className="text-sky-600 hover:underline text-sm mt-1 block">Add staff first →</Link>
        </div>
      )}
    </div>
  )
}
