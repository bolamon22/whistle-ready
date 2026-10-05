'use client'
// Prospects — the other half of the Club database: clubs that have NOT
// registered with us yet. Research lands here (import), outreach progress is
// tracked here (per-prospect status + note), and anything that overlaps a real
// customer is flagged rather than silently duplicated.
//
// Kept in its own AppSetting key (orgProspects) so cold names never inflate the
// club counts and a club-database re-import can never wipe outreach progress.
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronRight, Search, Upload, Mail, Copy, Compass } from 'lucide-react'
import { canon } from '@/lib/clubCanon'

export interface Prospect {
  club:string; contact:string; email:string; phone:string; city:string; website:string
  region:string                      // rough travel distance band from our venues
  rel:string                         // relationship to accounts we already have
  fit:string                         // does this program travel, or is it rec only
  why:string                         // why it is classified that way
  note:string                        // research note
  status:string                      // outreach state, set by staff here
  staffNote?:string                  // staff's own note, never overwritten by import
}

const REL:Record<string,string> = {
  new:'Brand new', linked:'Linked to an account', arm:'Another arm of a club',
  aug:'Already emailed', peer:'Runs their own event', dead:'Dead end',
}
const REL_STYLE:Record<string,string> = {
  new:'bg-teal-100 text-teal-700', linked:'bg-amber-100 text-amber-700',
  arm:'bg-sky-100 text-sky-700', aug:'bg-slate-200 text-slate-600',
  peer:'bg-purple-100 text-purple-700', dead:'bg-rose-100 text-rose-700',
}
const FIT:Record<string,string> = { travel:'Travel teams', both:'Rec + travel', rec:'Rec only', unknown:'' }
const STATUS:[string,string][] = [
  ['','— set status —'], ['to-contact','To contact'], ['emailed','Emailed'],
  ['replied','They replied'], ['registered','Registered'], ['not-a-fit','Not a fit'],
]
const STATUS_LABEL:Record<string,string> = Object.fromEntries(STATUS)
const DONE = new Set(['registered','not-a-fit'])

// Import: a spreadsheet or CSV, one row per prospect. Headers are matched
// case-insensitively and loosely so an export from anywhere reasonable works.
async function parseFile(file:File):Promise<Prospect[]>{
  if(!(window as any).XLSX){
    await new Promise<void>((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=()=>res(); s.onerror=rej; document.head.appendChild(s) })
  }
  const XLSX=(window as any).XLSX
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array'})
  const sheet=wb.Sheets?.[wb.SheetNames?.[0]]
  if(!sheet) return []
  const rows:any[]=XLSX.utils.sheet_to_json(sheet,{defval:''})
  const pick=(o:any,...keys:string[])=>{
    for(const k of keys){ const h=Object.keys(o).find(x=>x.toLowerCase().replace(/[^a-z]/g,'')===k); if(h&&o[h]!=='') return String(o[h]).trim() }
    return ''
  }
  const out:Prospect[]=[]
  for(const r of rows){
    const club=pick(r,'club','clubname','name','program')
    if(!club) continue
    out.push({
      club,
      contact:pick(r,'contact','director','contactname'),
      email:pick(r,'email','emails','contactemail').toLowerCase(),
      phone:pick(r,'phone','telephone'),
      city:pick(r,'city','town','location'),
      website:pick(r,'website','site','url'),
      region:pick(r,'region','band','area'),
      rel:(pick(r,'relationship','rel','who')||'new').toLowerCase(),
      fit:(pick(r,'program','fit','type')||'unknown').toLowerCase(),
      why:pick(r,'why','reason'),
      note:pick(r,'note','notes','detail'),
      status:(pick(r,'status')||'').toLowerCase(),
    })
  }
  return out
}

// Re-importing refreshes the research fields but never touches what staff typed
// here: status and staffNote always win, keyed on the canonical club name.
function mergeProspects(existing:Prospect[], incoming:Prospect[]):Prospect[]{
  const idx:Record<string,Prospect>={}
  for(const p of existing) idx[canon(p.club)]=p
  for(const np of incoming){
    const k=canon(np.club); const cur=idx[k]
    idx[k]= cur ? { ...np, status:cur.status||np.status, staffNote:cur.staffNote } : np
  }
  return Object.values(idx).sort((a,b)=>a.club.localeCompare(b.club))
}

export default function ProspectsPanel({ q, clubNames, clubEmails }:{ q:string; clubNames:Set<string>; clubEmails:Set<string> }){
  const [prospects,setProspects]=useState<Prospect[]>([])
  const [loading,setLoading]=useState(true)
  const [importing,setImporting]=useState(false)
  const [search,setSearch]=useState('')
  const [rel,setRel]=useState<string>('')
  const [fit,setFit]=useState<string>('')
  const [region,setRegion]=useState('')
  const [onlyEmail,setOnlyEmail]=useState(false)
  const [hideDone,setHideDone]=useState(false)
  const [expanded,setExpanded]=useState<string|null>(null)
  const [updatedAt,setUpdatedAt]=useState<string|null>(null)

  useEffect(()=>{ fetch(`/api/org-prospects${q}`).then(r=>r.json()).then(d=>{ setProspects(d.prospects||[]); setUpdatedAt(d.updatedAt||null); setLoading(false) }).catch(()=>setLoading(false)) },[q])

  async function save(next:Prospect[]){
    setProspects(next)
    try{
      const res=await fetch(`/api/org-prospects${q}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prospects:next})})
      if(!res.ok){ const e=await res.json().catch(()=>({})); toast.error(e.error||'Could not save') ; return false }
      setUpdatedAt(new Date().toISOString()); return true
    }catch{ toast.error('Could not save — check your connection'); return false }
  }
  const patch=(club:string,p:Partial<Prospect>)=> save(prospects.map(x=>x.club===club?{...x,...p}:x))

  async function onImport(files:FileList|null){
    if(!files||!files.length) return
    setImporting(true)
    try{
      let built:Prospect[]=[]
      for(const f of Array.from(files)) built=built.concat(await parseFile(f))
      if(!built.length){ toast.error('No rows found. Expected a sheet with a Club column.'); setImporting(false); return }
      const merged=mergeProspects(prospects,built)
      const known=new Set(prospects.map(p=>canon(p.club)))
      const added=built.filter(b=>!known.has(canon(b.club))).length
      if(await save(merged)) toast.success(`Imported ${built.length} · ${added} new, ${merged.length} total`)
    }catch(e:any){ toast.error('Import failed: '+(e?.message||'')) }
    setImporting(false)
  }

  // A prospect that matches a club we already have is research catching up with
  // reality — flag it rather than letting it sit in the cold list.
  const isCustomer=(p:Prospect)=> clubNames.has(canon(p.club)) || (!!p.email && p.email.split(/[,;·]/).some(e=>clubEmails.has(e.trim())))

  const regions=useMemo(()=>[...new Set(prospects.map(p=>p.region).filter(Boolean))].sort(),[prospects])
  const filtered=useMemo(()=>{
    const s=search.trim().toLowerCase()
    return prospects.filter(p=>{
      if(rel && p.rel!==rel) return false
      if(fit && p.fit!==fit) return false
      if(region && p.region!==region) return false
      if(onlyEmail && !p.email) return false
      if(hideDone && DONE.has(p.status)) return false
      if(s && !`${p.club} ${p.contact} ${p.email} ${p.city} ${p.note} ${p.why} ${p.staffNote||''}`.toLowerCase().includes(s)) return false
      return true
    })
  },[prospects,search,rel,fit,region,onlyEmail,hideDone])

  const stats=useMemo(()=>({
    total:prospects.length,
    fresh:prospects.filter(p=>p.rel==='new').length,
    withEmail:prospects.filter(p=>p.email).length,
    working:prospects.filter(p=>p.status&&!DONE.has(p.status)).length,
  }),[prospects])

  async function copyShown(){
    const list=[...new Set(filtered.flatMap(p=>p.email.split(/[,;·]/).map(e=>e.trim()).filter(Boolean)))]
    if(!list.length){ toast.error('No emails in the current filter'); return }
    try{ await navigator.clipboard.writeText(list.join(', ')); toast.success(`Copied ${list.length} address${list.length===1?'':'es'}`) }
    catch{ toast.error('Your browser blocked the copy — select the addresses manually') }
  }

  if(loading) return <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>

  if(!prospects.length) return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
      <Compass size={36} className="mx-auto text-slate-300 mb-3"/>
      <p className="text-slate-600 font-medium">No prospects yet</p>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Import a spreadsheet of clubs you want to invite but haven&apos;t registered yet. One row per club, with a <b>Club</b> column — Contact, Email, Phone, City, Website, Region, Relationship, Program, Why and Note are picked up when present.</p>
      <label className={`mt-4 cursor-pointer inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg px-4 py-2 ${importing?'opacity-50 pointer-events-none':''}`}>
        <Upload size={15}/>{importing?'Importing…':'Import prospects'}
        <input type="file" multiple accept=".xlsx,.csv" className="hidden" disabled={importing} onChange={e=>{ onImport(e.target.files); e.currentTarget.value='' }}/>
      </label>
    </div>
  )

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-slate-500 max-w-2xl">Clubs we want but don&apos;t have yet. Set a status as you work the list — it saves here, so the next person sees where you got to{updatedAt?` · last updated ${new Date(updatedAt).toLocaleDateString()}`:''}.</p>
        <label className={`cursor-pointer inline-flex items-center gap-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg px-3 py-2 ${importing?'opacity-50 pointer-events-none':''}`}>
          <Upload size={15}/>{importing?'Importing…':'Import more'}
          <input type="file" multiple accept=".xlsx,.csv" className="hidden" disabled={importing} onChange={e=>{ onImport(e.target.files); e.currentTarget.value='' }}/>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[['Prospects',stats.total],['Brand new',stats.fresh],['Have an email',stats.withEmail],['In progress',stats.working]].map(([l,v])=>(
          <div key={String(l)} className="bg-white border border-slate-200 rounded-xl px-4 py-3"><div className="text-2xl font-bold text-slate-800">{v as number}</div><div className="text-xs text-slate-500">{l}</div></div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search club, contact, city, note…" className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
        </div>
        <select value={rel} onChange={e=>setRel(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
          <option value="">Anyone</option>
          {Object.entries(REL).map(([k,l])=><option key={k} value={k}>{l}</option>)}
        </select>
        <select value={fit} onChange={e=>setFit(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
          <option value="">Any program</option>
          <option value="travel">Travel teams</option>
          <option value="both">Rec + travel</option>
          <option value="rec">Rec only</option>
          <option value="unknown">Unconfirmed</option>
        </select>
        {regions.length>1 && (
          <select value={region} onChange={e=>setRegion(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
            <option value="">Anywhere</option>
            {regions.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <button onClick={()=>setOnlyEmail(v=>!v)} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${onlyEmail?'bg-teal-600 text-white border-teal-600':'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>Has an email</button>
        <button onClick={()=>setHideDone(v=>!v)} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${hideDone?'bg-slate-700 text-white border-slate-700':'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>Hide finished</button>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="text-xs text-slate-400">Showing {filtered.length} of {prospects.length}</span>
        <button onClick={copyShown} className="text-xs inline-flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white"><Copy size={13}/> Copy emails shown</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.map(p=>{
          const open=expanded===p.club
          const finished=DONE.has(p.status)
          const dupe=isCustomer(p)
          return (
            <div key={p.club} className="border-b border-slate-100 last:border-b-0">
              <button onClick={()=>setExpanded(open?null:p.club)} className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 ${finished?'opacity-55':''}`}>
                {open?<ChevronDown size={16} className="text-slate-400 shrink-0"/>:<ChevronRight size={16} className="text-slate-400 shrink-0"/>}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5 flex-wrap">{p.club}
                    {REL[p.rel] && <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${REL_STYLE[p.rel]||'bg-slate-100 text-slate-600'}`}>{REL[p.rel]}</span>}
                    {FIT[p.fit] && <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{FIT[p.fit]}</span>}
                    {dupe && <span className="text-[10px] font-bold uppercase bg-teal-100 text-teal-700 rounded px-1.5 py-0.5">In club database</span>}
                  </div>
                  <div className="text-xs text-slate-400 truncate">{p.staffNote?<span className="text-slate-500 italic">{p.staffNote}</span>:`${p.contact||'No contact named'}${p.email?` · ${p.email}`:''}${p.city?` · ${p.city}`:''}`}</div>
                </div>
                {p.status && <span className="text-[11px] font-medium text-slate-500 shrink-0 hidden sm:block">{STATUS_LABEL[p.status]}</span>}
              </button>
              {open && (
                <div className="px-4 pb-4 pt-1 bg-slate-50/50">
                  {p.why && <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 mb-2">{p.why}</p>}
                  {p.note && <p className="text-sm text-slate-500 mb-3">{p.note}</p>}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {p.email && <a href={`mailto:${p.email.split(/[,;·]/)[0].trim()}`} className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg px-3 py-1.5"><Mail size={13}/> Email</a>}
                    {p.phone && <a href={`tel:${p.phone}`} className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white">{p.phone}</a>}
                    {p.website && <a href={p.website.startsWith('http')?p.website:`https://${p.website}`} target="_blank" rel="noreferrer" className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white">Website</a>}
                    {p.region && <span className="text-xs text-slate-400 px-1">{p.region}</span>}
                  </div>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Status</label>
                      <select value={p.status} onChange={e=>patch(p.club,{status:e.target.value})} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                        {STATUS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Your note</label>
                      <input defaultValue={p.staffNote||''} onBlur={e=>{ const v=e.target.value.trim(); if(v!==(p.staffNote||'')) patch(p.club,{staffNote:v}) }}
                        placeholder="e.g. called Oct 5, wants pricing for two teams"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length===0 && <div className="px-4 py-8 text-center text-slate-400 text-sm">No prospects match.</div>}
      </div>
    </>
  )
}
