'use client'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { certLabel, CERT_LEVELS, WORKER_ROLES, PAY_METHODS, isHourlyRole } from '@/lib/utils'

interface Worker { id:string;name:string;email:string|null;phone:string|null;certLevel:string;defaultRole:string;roles:string;isAssigner:boolean;gender:string;payRateOverride:number|null;hourlyRate:number|null;payMethod:string;payHandle:string|null;notes:string|null;photoUrl:string|null }

const GENDERS=[{value:'both',label:'Boys & Girls'},{value:'boys',label:'Boys only'},{value:'girls',label:'Girls only'}]
const EMPTY_FORM={name:'',email:'',phone:'',certLevel:'youth',defaultRole:'ref',roles:['ref'],isAssigner:false,gender:'both',payRateOverride:'',hourlyRate:'',payMethod:'check',payHandle:'',notes:''}

type SortKey = 'name'|'defaultRole'|'certLevel'|'gender'
type SortDir = 'asc'|'desc'
type ExpandMode = 'profile'|'edit'

// ── Inline edit form (defined OUTSIDE component to prevent remount on render) ──
function StaffEditForm({
  form, setForm, onSubmit, onCancel, saving, submitLabel
}:{
  form:Record<string,unknown>
  setForm:(fn:(f:Record<string,unknown>)=>Record<string,unknown>)=>void
  onSubmit:(e:React.FormEvent)=>void
  onCancel:()=>void
  saving:boolean
  submitLabel:string
}) {
  const roles = (form.roles as string[]) ?? ['ref']
  const toggleRole = (r:string) => setForm(f=>{
    const cur = (f.roles as string[]) ?? []
    const next = cur.includes(r) ? cur.filter(x=>x!==r) : [...cur,r]
    // keep defaultRole in sync with first role
    return {...f, roles:next.length?next:cur, defaultRole:next[0]??cur[0]}
  })
  const needsHandle=(m:string)=>m==='venmo'||m==='zelle'
  const hasRef=roles.includes('ref')
  const hasHourly=roles.some(r=>isHourlyRole(r))

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div><label className="label">Name *</label><input className="input" value={String(form.name)} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required autoFocus/></div>
      <div><label className="label">Email</label><input className="input" type="email" value={String(form.email??'')} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
      <div><label className="label">Phone</label><input className="input" type="tel" value={String(form.phone??'')} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>

      {/* Multi-role checkboxes */}
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
        {roles.length>1&&<p className="text-xs text-slate-400 mt-1">Primary role: <strong>{WORKER_ROLES.find(r=>r.value===String(form.defaultRole))?.label}</strong></p>}
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
        <textarea
          className="input w-full min-h-[72px] resize-y text-sm"
          value={String(form.notes??'')}
          onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
          placeholder="Certifications, preferences, restrictions, emergency contact…"
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving?'Saving…':submitLabel}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export default function StaffPage() {
  const [workers,setWorkers]=useState<Worker[]>([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [tab,setTab]=useState<'roster'|'import'>('roster')
  const [importType,setImportType]=useState<'refs'|'staff'>('refs')
  const [importData,setImportData]=useState<{headers:string[];rows:Record<string,unknown>[]}|null>(null)
  const [mapping,setMapping]=useState<Record<string,string>>({})
  const [importLoading,setImportLoading]=useState(false)
  const fileRef=useRef<HTMLInputElement>(null)
  const photoRef=useRef<HTMLInputElement>(null)
  const [photoUploading,setPhotoUploading]=useState(false)

  const [sortKey,setSortKey]=useState<SortKey>('name')
  const [sortDir,setSortDir]=useState<SortDir>('asc')
  const [roleFilter,setRoleFilter]=useState('all')
  const [search,setSearch]=useState('')

  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [bulkField,setBulkField]=useState('')
  const [bulkValue,setBulkValue]=useState('')
  const [bulkSaving,setBulkSaving]=useState(false)

  const [expandedId,setExpandedId]=useState<string|null>(null)
  const [expandMode,setExpandMode]=useState<ExpandMode>('profile')
  const [editForm,setEditForm]=useState<Record<string,unknown>>(EMPTY_FORM)

  const load=async()=>{setWorkers(await (await fetch('/api/workers')).json());setLoading(false)}
  useEffect(()=>{load()},[])

  function parseRoles(w:Worker):string[]{try{const r=JSON.parse(w.roles||'[]');return Array.isArray(r)&&r.length?r:[w.defaultRole]}catch{return[w.defaultRole]}}

  function toggleSort(k:SortKey){if(sortKey===k)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortKey(k);setSortDir('asc')}}
  const sortArrow=(k:SortKey)=>sortKey===k?(sortDir==='asc'?'↑':'↓'):'↕'

  const filtered=workers
    .filter(w=>roleFilter==='all'||parseRoles(w).includes(roleFilter))
    .filter(w=>!search||w.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      const av=String(a[sortKey as keyof Worker]??''),bv=String(b[sortKey as keyof Worker]??'')
      return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av)
    })

  function expand(w:Worker,mode:ExpandMode){
    if(expandedId===w.id&&expandMode===mode){setExpandedId(null);return}
    setExpandedId(w.id);setExpandMode(mode)
    if(mode==='edit'){
      setEditForm({name:w.name,email:w.email??'',phone:w.phone??'',certLevel:w.certLevel,defaultRole:w.defaultRole,roles:parseRoles(w),isAssigner:w.isAssigner,gender:w.gender,payRateOverride:w.payRateOverride??'',hourlyRate:w.hourlyRate??'',payMethod:w.payMethod,payHandle:w.payHandle??'',notes:w.notes??''})
    }
  }

  async function saveEdit(e:React.FormEvent,workerId:string){
    e.preventDefault();setSaving(true)
    const payload={...editForm,name:String(editForm.name).trim(),email:editForm.email||null,phone:editForm.phone||null,payRateOverride:editForm.payRateOverride!==''?Number(editForm.payRateOverride):null,hourlyRate:editForm.hourlyRate!==''?Number(editForm.hourlyRate):null,payHandle:editForm.payHandle||null,notes:editForm.notes||null,roles:editForm.roles}
    const res=await fetch(`/api/workers/${workerId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    if(res.ok){toast.success('Updated');setExpandedId(null);load()}else toast.error('Failed')
    setSaving(false)
  }

  async function handlePhotoUpload(e:React.ChangeEvent<HTMLInputElement>,workerId:string){
    const file=e.target.files?.[0]; if(!file)return
    setPhotoUploading(true)
    try{
      const fd=new FormData(); fd.append('file',file)
      const res=await fetch('/api/upload',{method:'POST',body:fd})
      const {url}=await res.json()
      await fetch(`/api/workers/${workerId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({photoUrl:url})})
      toast.success('Photo updated!'); load()
    }catch{toast.error('Upload failed')}
    finally{setPhotoUploading(false)}
  }

  async function removePhoto(workerId:string){
    await fetch(`/api/workers/${workerId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({photoUrl:null})})
    toast.success('Photo removed'); load()
  }

  async function addNew(e:React.FormEvent){
    e.preventDefault();setSaving(true)
    const payload={...editForm,name:String(editForm.name).trim(),email:editForm.email||null,phone:editForm.phone||null,payRateOverride:editForm.payRateOverride!==''?Number(editForm.payRateOverride):null,hourlyRate:editForm.hourlyRate!==''?Number(editForm.hourlyRate):null,payHandle:editForm.payHandle||null,notes:editForm.notes||null,roles:editForm.roles}
    const res=await fetch('/api/workers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    if(res.ok){toast.success('Added');setExpandedId(null);setEditForm(EMPTY_FORM);load()}else toast.error('Failed')
    setSaving(false)
  }

  async function del(id:string,name:string){
    if(!confirm(`Remove ${name}?`))return
    await fetch(`/api/workers/${id}`,{method:'DELETE'});toast.success('Removed')
    if(expandedId===id)setExpandedId(null);load()
  }

  function toggleSelect(id:string){setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})}
  function toggleAll(){setSelected(s=>s.size===filtered.length&&filtered.length>0?new Set():new Set(filtered.map(w=>w.id)))}

  async function applyBulk(){
    if(!bulkField||!selected.size)return;setBulkSaving(true)
    const updates=Array.from(selected).map(id=>{
      const payload:Record<string,unknown>={}
      if(bulkField==='payRateOverride'||bulkField==='hourlyRate')payload[bulkField]=bulkValue?parseFloat(bulkValue):null
      else if(bulkField==='isAssigner')payload[bulkField]=bulkValue==='true'
      else payload[bulkField]=bulkValue
      return fetch(`/api/workers/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    })
    await Promise.all(updates)
    toast.success(`Updated ${selected.size} staff`);setSelected(new Set());setBulkField('');setBulkValue('');setBulkSaving(false);load()
  }

  async function handleFile(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return;setImportLoading(true)
    const fd=new FormData();fd.append('file',file);fd.append('type',importType)
    const res=await fetch('/api/staff/import',{method:'POST',body:fd});const data=await res.json()
    if(res.ok){
      setImportData({headers:data.headers,rows:data.rows})
      const h=data.headers as string[]
      const find=(...keys:string[])=>h.find((x:string)=>keys.some(k=>x.toLowerCase().replace(/\s/g,'')===k.toLowerCase().replace(/\s/g,'')))??''
      setMapping({name:find('name','fullname'),email:find('email','emailaddress'),phone:find('phone','cell','mobile'),certLevel:find('certlevel','cert','level'),gender:find('gender','boys/girls'),payRateOverride:find('payrate','rate','pay'),defaultRole:find('role','position','title'),hourlyRate:find('hourlyrate','rate','hourly')})
    } else toast.error(data.error||'Parse failed')
    setImportLoading(false);if(fileRef.current)fileRef.current.value=''
  }

  function getVal(row:Record<string,unknown>,col:string){return col?String(row[col]??''):''}

  function buildPreview(){
    if(!importData)return[]
    return importData.rows.filter(r=>getVal(r,mapping.name)).map(r=>{
      if(importType==='refs'){
        const cert=getVal(r,mapping.certLevel).toLowerCase()
        const gr=getVal(r,mapping.gender).toLowerCase()
        const gender=gr.includes('boy')?'boys':gr.includes('girl')?'girls':'both'
        const rate=getVal(r,mapping.payRateOverride)
        return{name:getVal(r,mapping.name),email:getVal(r,mapping.email)||null,phone:getVal(r,mapping.phone)||null,certLevel:cert||'youth',defaultRole:'ref',roles:['ref'],gender,payRateOverride:rate?parseFloat(rate)||null:null,isAssigner:false,hourlyRate:null,payMethod:'check',payHandle:null}
      }else{
        const role=getVal(r,mapping.defaultRole).toLowerCase()
        const defaultRole=role.includes('train')?'athletic_trainer':role.includes('field')?'field_ops':role.includes('score')?'scorekeeper':'field_ops'
        const rate=getVal(r,mapping.hourlyRate)
        return{name:getVal(r,mapping.name),email:getVal(r,mapping.email)||null,phone:getVal(r,mapping.phone)||null,certLevel:'none',defaultRole,roles:[defaultRole],gender:'both',payRateOverride:null,isAssigner:false,hourlyRate:rate?parseFloat(rate)||null:null,payMethod:'check',payHandle:null}
      }
    })
  }

  async function confirmImport(){
    const preview=buildPreview();if(!preview.length)return;setSaving(true)
    const res=await fetch('/api/workers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bulk:preview})});const data=await res.json()
    if(res.ok){toast.success(`Imported ${data.created} staff`);setImportData(null);setMapping({});load();setTab('roster')}else toast.error('Import failed')
    setSaving(false)
  }

  function downloadTemplate(){
    const isRef=importType==='refs'
    const rows=isRef?[['Name','Email','Phone','CertLevel','Gender','PayRate'],['Jane Smith','jane@email.com','555-1234','hs','both','']]:[ ['Name','Email','Phone','Role','HourlyRate'],['John Doe','john@email.com','555-5678','athletic_trainer','20']]
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));a.download=`${importType}_template.csv`;a.click()
  }

  const rLabel=(r:string)=>WORKER_ROLES.find(x=>x.value===r)?.label??r
  const gLabel=(g:string)=>GENDERS.find(x=>x.value===g)?.label??g
  const pmLabel=(p:string)=>PAY_METHODS.find(x=>x.value===p)?.label??p

  const BULK_FIELDS=[{value:'defaultRole',label:'Role'},{value:'certLevel',label:'Cert Level'},{value:'gender',label:'Can Ref'},{value:'payMethod',label:'Pay Method'},{value:'payRateOverride',label:'Pay Rate Override ($/game)'},{value:'hourlyRate',label:'Hourly Rate ($/hr)'},{value:'isAssigner',label:'Is Assigner'}]
  const preview=importData?buildPreview():[]

  return(
    <div>
      <div className="page-header">
        <div>
          <h1 className="section-title">Staff Pool</h1>
          <p className="text-sm text-slate-500 mt-1">Global staff database · {workers.length} total</p>
        </div>
        <div className="flex gap-2">
          <button className={`btn-sm ${tab==='import'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab(t=>t==='import'?'roster':'import')}>{tab==='import'?'← Pool':'↑ Bulk Import'}</button>
          {tab==='roster'&&<button className="btn-primary" onClick={()=>{setExpandedId('__new__');setExpandMode('edit');setEditForm(EMPTY_FORM)}}>+ Add Staff</button>}
        </div>
      </div>

      {/* ── IMPORT ── */}
      {tab==='import'&&(
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-4">Bulk Import Staff</h2>
          <div className="flex gap-2 mb-4">
            <button onClick={()=>{setImportType('refs');setImportData(null)}} className={`btn-sm ${importType==='refs'?'btn-primary':'btn-secondary'}`}>Refs</button>
            <button onClick={()=>{setImportType('staff');setImportData(null)}} className={`btn-sm ${importType==='staff'?'btn-primary':'btn-secondary'}`}>Other Staff</button>
          </div>
          {!importData&&(
            <div className="flex gap-2">
              <button onClick={downloadTemplate} className="btn-secondary btn-sm">↓ Download Template</button>
              <label className={`btn-primary btn-sm cursor-pointer ${importLoading?'opacity-50':''}`}>{importLoading?'Parsing…':'↑ Upload File'}<input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} disabled={importLoading}/></label>
            </div>
          )}
          {importData&&(
            <div>
              <p className="text-sm font-semibold mb-3">Map your columns — {importData.rows.length} rows detected</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                {[{key:'name',label:'Name *'},{key:'email',label:'Email'},{key:'phone',label:'Phone'},...(importType==='refs'?[{key:'certLevel',label:'Cert Level'},{key:'gender',label:'Boys/Girls'},{key:'payRateOverride',label:'Pay Rate ($/game)'}]:[{key:'defaultRole',label:'Role'},{key:'hourlyRate',label:'Hourly Rate ($/hr)'}])].map(f=>(
                  <div key={f.key}><label className="label">{f.label}</label><select className="select" value={mapping[f.key]??''} onChange={e=>setMapping(m=>({...m,[f.key]:e.target.value}))}><option value="">— not mapped —</option>{importData.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
                ))}
              </div>
              <p className="text-sm font-medium mb-2">Preview — {preview.length} staff</p>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg text-xs mb-4">
                <table className="w-full"><thead className="bg-slate-50 sticky top-0"><tr><th className="text-left px-3 py-1.5">Name</th><th className="text-left px-3 py-1.5">Role</th><th className="px-3 py-1.5 text-left">{importType==='refs'?'Cert / Gender':'$/hr'}</th><th className="text-left px-3 py-1.5">Contact</th></tr></thead><tbody className="divide-y divide-slate-100">{preview.slice(0,20).map((s,i)=><tr key={i}><td className="px-3 py-1.5 font-medium">{String(s.name)}</td><td className="px-3 py-1.5">{rLabel(String(s.defaultRole))}</td><td className="px-3 py-1.5">{importType==='refs'?`${certLabel(String(s.certLevel))} · ${gLabel(String(s.gender))}`:s.hourlyRate?`$${s.hourlyRate}/hr`:'—'}</td><td className="px-3 py-1.5 text-slate-400">{String(s.phone||s.email||'—')}</td></tr>)}</tbody></table>
              </div>
              <div className="flex gap-2">
                <button onClick={confirmImport} className="btn-primary btn-sm" disabled={saving||!preview.length}>{saving?'Importing…':`Import ${preview.length} Staff`}</button>
                <button onClick={()=>{setImportData(null);setMapping({})}} className="btn-secondary btn-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ADD NEW ── */}
      {tab==='roster'&&expandedId==='__new__'&&(
        <div className="card p-6 mb-4 border-sky-200 border">
          <h2 className="font-semibold text-slate-800 mb-4">Add Staff</h2>
          <StaffEditForm form={editForm} setForm={setEditForm} onSubmit={addNew} onCancel={()=>setExpandedId(null)} saving={saving} submitLabel="Add Staff"/>
        </div>
      )}

      {/* ── ROSTER ── */}
      {tab==='roster'&&(loading?<div className="text-slate-400 text-center py-12">Loading…</div>:workers.length===0&&expandedId!=='__new__'?<div className="card p-12 text-center text-slate-400"><div className="text-4xl mb-2">👥</div><p>No staff yet</p></div>:(
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <input className="input !w-48 text-sm" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <label className="text-sm text-slate-500">Role:</label>
            <select className="select !w-auto text-sm" value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setSelected(new Set())}}>
              <option value="all">All roles</option>
              {WORKER_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="text-xs text-slate-400">{filtered.length} shown</span>
            {(search||roleFilter!=='all')&&<button className="text-xs text-slate-400 hover:text-slate-600" onClick={()=>{setSearch('');setRoleFilter('all')}}>Clear filters</button>}
          </div>

          {selected.size>0&&(
            <div className="flex items-center gap-3 mb-3 p-3 bg-sky-50 border border-sky-200 rounded-lg flex-wrap">
              <span className="text-sm font-medium text-sky-700">{selected.size} selected</span>
              <select className="select !w-auto text-sm" value={bulkField} onChange={e=>{setBulkField(e.target.value);setBulkValue('')}}><option value="">— choose field to edit —</option>{BULK_FIELDS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select>
              {bulkField&&<>
                {bulkField==='defaultRole'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option>{WORKER_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select>}
                {bulkField==='certLevel'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option>{CERT_LEVELS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select>}
                {bulkField==='gender'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option>{GENDERS.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}</select>}
                {bulkField==='payMethod'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option>{PAY_METHODS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select>}
                {bulkField==='isAssigner'&&<select className="select !w-auto text-sm" value={bulkValue} onChange={e=>setBulkValue(e.target.value)}><option value="">Pick…</option><option value="true">Yes</option><option value="false">No</option></select>}
                {(bulkField==='payRateOverride'||bulkField==='hourlyRate')&&<input className="input !w-28 text-sm" type="number" min="0" step="0.01" value={bulkValue} onChange={e=>setBulkValue(e.target.value)} placeholder="Amount"/>}
                <button onClick={applyBulk} className="btn-primary btn-sm" disabled={bulkSaving||!bulkValue}>{bulkSaving?'Saving…':'Apply to Selected'}</button>
              </>}
              <button onClick={()=>setSelected(new Set())} className="btn-secondary btn-sm ml-auto">Clear</button>
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-8"><input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleAll}/></th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={()=>toggleSort('name')}>Name {sortArrow('name')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={()=>toggleSort('defaultRole')}>Roles {sortArrow('defaultRole')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={()=>toggleSort('certLevel')}>Cert {sortArrow('certLevel')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={()=>toggleSort('gender')}>Can Ref {sortArrow('gender')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Pay Method</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Rate</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Contact</th>
                  <th className="px-4 py-3"/>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w=>{
                  const wRoles=parseRoles(w)
                  const isExpanded=expandedId===w.id
                  return(
                  <>
                    <tr key={w.id} className={`border-b border-slate-100 ${selected.has(w.id)?'bg-sky-50':isExpanded?'bg-slate-50 border-b-0':'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3"><input type="checkbox" checked={selected.has(w.id)} onChange={()=>toggleSelect(w.id)}/></td>
                      <td className="px-4 py-3 font-semibold text-slate-900 cursor-pointer hover:text-sky-600 transition-colors" onClick={()=>expand(w,'profile')}>{w.name}{w.isAssigner&&<span className="ml-2 badge bg-amber-100 text-amber-700">Assigner</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {wRoles.map(r=><span key={r} className="badge bg-slate-100 text-slate-600">{rLabel(r)}</span>)}
                        </div>
                      </td>
                      <td className="px-4 py-3">{wRoles.includes('ref')?<span className={`badge ${w.certLevel==='college'?'bg-purple-100 text-purple-700':w.certLevel==='hs'?'bg-sky-100 text-sky-700':'bg-slate-100 text-slate-600'}`}>{certLabel(w.certLevel)}</span>:<span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{wRoles.includes('ref')?gLabel(w.gender):'—'}</td>
                      <td className="px-4 py-3"><span className="badge bg-slate-100 text-slate-700">{pmLabel(w.payMethod)}</span>{w.payHandle&&<div className="text-xs text-slate-400 mt-0.5">{w.payHandle}</div>}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{wRoles.some(r=>isHourlyRole(r))?(w.hourlyRate?`$${w.hourlyRate}/hr`:'—'):(w.payRateOverride?`$${w.payRateOverride}/game`:'Default')}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{w.phone&&<div>{w.phone}</div>}{w.email&&<div>{w.email}</div>}{!w.phone&&!w.email&&'—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={()=>expand(w,'profile')} className={`text-xs mr-2 font-medium transition-colors ${isExpanded&&expandMode==='profile'?'text-slate-800 underline':'text-slate-400 hover:text-slate-700'}`}>Profile</button>
                        <button onClick={()=>expand(w,'edit')} className={`text-xs mr-3 font-medium transition-colors ${isExpanded&&expandMode==='edit'?'text-sky-800 underline':'text-sky-600 hover:text-sky-800'}`}>Edit</button>
                        <button onClick={()=>del(w.id,w.name)} className="text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                      </td>
                    </tr>

                    {/* Profile panel */}
                    {isExpanded&&expandMode==='profile'&&(
                      <tr key={`${w.id}-p`}>
                        <td colSpan={9} className="p-0 border-b border-slate-200">
                          <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white px-4 sm:px-6 py-4 sm:py-5">
                            <div className="flex items-start gap-5">
                              {/* Avatar */}
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
                                  {w.phone&&<div><p className="text-slate-400 text-xs mb-0.5">Phone</p><p className="text-white">{w.phone}</p></div>}
                                  {w.email&&<div><p className="text-slate-400 text-xs mb-0.5">Email</p><p className="text-white truncate">{w.email}</p></div>}
                                  {wRoles.includes('ref')&&<>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Cert Level</p><p className="text-white">{certLabel(w.certLevel)}</p></div>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Can Ref</p><p className="text-white">{gLabel(w.gender)}</p></div>
                                  </>}
                                  <div><p className="text-slate-400 text-xs mb-0.5">Pay Method</p><p className="text-white">{pmLabel(w.payMethod)}{w.payHandle?` · ${w.payHandle}`:''}</p></div>
                                  {w.payRateOverride&&<div><p className="text-slate-400 text-xs mb-0.5">Rate Override</p><p className="text-white">${w.payRateOverride}/game</p></div>}
                                  {w.hourlyRate&&<div><p className="text-slate-400 text-xs mb-0.5">Hourly Rate</p><p className="text-white">${w.hourlyRate}/hr</p></div>}
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
                        <td colSpan={9} className="px-4 sm:px-6 py-4 sm:py-5 bg-sky-50/40 border-b border-slate-200">
                          {/* Photo upload */}
                          <div className="flex items-center gap-4 mb-5 pb-5 border-b border-slate-200">
                            <div className="relative group flex-shrink-0">
                              {w.photoUrl
                                ? <img src={w.photoUrl} alt={w.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-200"/>
                                : <div className="w-16 h-16 rounded-2xl bg-sky-500 flex items-center justify-center font-bold text-2xl text-white border-2 border-transparent">{w.name[0].toUpperCase()}</div>
                              }
                              <button type="button" onClick={()=>photoRef.current?.click()} disabled={photoUploading}
                                className="absolute inset-0 rounded-2xl bg-black/50 text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                {photoUploading?'…':'📷'}
                              </button>
                            </div>
                            <div className="flex flex-col gap-1">
                              <p className="text-sm font-medium text-slate-700">Profile Photo</p>
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={()=>photoRef.current?.click()} disabled={photoUploading}
                                  className="text-xs text-sky-600 hover:text-sky-800 font-medium border border-sky-200 hover:border-sky-400 px-3 py-1.5 rounded-lg">
                                  {photoUploading?'Uploading…':w.photoUrl?'Replace photo':'+ Upload photo'}
                                </button>
                                {w.photoUrl&&<button type="button" onClick={()=>removePhoto(w.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Remove</button>}
                              </div>
                            </div>
                            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e=>handlePhotoUpload(e,w.id)}/>
                          </div>
                          <StaffEditForm form={editForm} setForm={setEditForm} onSubmit={e=>saveEdit(e,w.id)} onCancel={()=>setExpandedId(null)} saving={saving} submitLabel="Save"/>
                        </td>
                      </tr>
                    )}
                  </>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
