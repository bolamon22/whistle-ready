'use client'
// Org Club Database — every club that has registered for the org's tournaments,
// deduped, with per-event/year history (teams brought, $ paid, divisions) and
// win-back flags. Search/filter, expand a club to see its full record, and draft
// a personalized re-invite email in one click. Import from Cognito exports (or
// any yearly registration spreadsheets) parses in-browser and rebuilds the DB.
import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, ChevronDown, ChevronRight, Users, Upload, Search, Mail, Star, Trophy, Download, Archive } from 'lucide-react'

interface Hist { event:string; year:number; teams:number; paid:number; divisions:string[] }
interface Club {
  club:string; contact:string; email:string; phone:string; city:string; website:string
  eventsAttended:number; years:number[]; firstYear:number; lastYear:number
  totalTeams:number; totalPaid:number; divisions:string[]; history:Hist[]
  returning:boolean; winBack:boolean
  note?:string; archived?:boolean   // manual, staff-editable; preserved across re-imports
}

const money = (n:number)=> '$'+Math.round(n||0).toLocaleString()

// ---- In-browser importer: parse Cognito-style exports (main + TeamInformation
// tabs), dedupe, and aggregate — the same pipeline that built the master file. ----
// Best-effort event + year from a filename — tolerant of naming variations
// (spaces, missing "TeamRegistration", missing year). Year can be filled from
// the sheet's own dates later if the name has none.
function eventFromName(fn:string){
  const base=fn.replace(/\.[a-z]+$/i,'')
  const yrM=base.match(/20\d{2}/); const yr=yrM?+yrM[0]:null
  let ev=''
  if(/monster\s*mash/i.test(base)) ev='Monster Mash'
  else if(/summer\s*kick\s*off/i.test(base)) ev='Summer Kick Off'
  else if(/fall\s*classic/i.test(base)) ev='Fall Classic'
  else if(/jingle\s*brawl/i.test(base)) ev='Jingle Brawl'
  else ev=base.replace(/^_?20\d{2}/,'').replace(/team\s*registration/i,'').replace(/[_\-()]+/g,' ').replace(/\s+/g,' ').trim()||'Event'
  return {ev,yr}
}
const num=(v:any)=>{ const n=parseFloat(String(v??'').replace(/[$,]/g,'')); return isNaN(n)?0:n }
// Cognito dates come as Excel serials (e.g. 45588.42) or ISO strings; pull the year.
function yearOf(v:any):number|null{
  if(v==null||v==='') return null
  if(typeof v==='number'&&v>20000&&v<80000){ const d=new Date(Date.UTC(1899,11,30)+v*86400000); return d.getUTCFullYear() }
  const m=String(v).match(/20\d{2}/); return m?+m[0]:null
}
function canon(name:string){
  let s=(name||'').toLowerCase().replace(/[^a-z0-9]/g,'')
  for(const suf of ['lacrosseclub','lacrosse','laxclub','lax','lc','club']){ if(s.endsWith(suf)&&s.length>suf.length+2){ s=s.slice(0,-suf.length); break } }
  return s||(name||'').toLowerCase().trim()
}
async function buildFromFiles(files:FileList):Promise<{clubs:Club[];skipped:string[]}>{
  // load SheetJS on demand
  if(!(window as any).XLSX){ await new Promise<void>((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=()=>res(); s.onerror=rej; document.head.appendChild(s) }) }
  const XLSX=(window as any).XLSX
  const regs:any[]=[]; const teams:any[]=[]; const skipped:string[]=[]
  const pick=(o:any,...ks:string[])=>{ for(const k of ks){ const h=Object.keys(o).find(x=>x.toLowerCase()===k.toLowerCase()); if(h&&o[h]!=='')return o[h] } return '' }
  for(const f of Array.from(files)){
    let wb:any; try{ wb=XLSX.read(await f.arrayBuffer(),{type:'array'}) }catch{ skipped.push(f.name+' (not a spreadsheet)'); continue }
    // Find the sheet that has a Club Name column (usually the first). If none, skip.
    let mainSheet=wb.SheetNames.find((n:string)=>{ const r=XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:''}); return r.length && Object.keys(r[0]).some(k=>/^club\s*name$/i.test(k.replace(/([a-z])([A-Z])/g,'$1 $2'))) })
    if(!mainSheet) mainSheet=wb.SheetNames[0]
    const main=XLSX.utils.sheet_to_json(wb.Sheets[mainSheet],{defval:''})
    const hasClub=main.length && Object.keys(main[0]).some(k=>/club\s*name/i.test(k.replace(/([a-z])([A-Z])/g,'$1 $2')))
    if(!hasClub){ skipped.push(f.name+' (no Club Name column)'); continue }
    const ef=eventFromName(f.name)
    // Year from filename, else from the sheet's submission dates.
    let year=ef.yr
    if(!year){ for(const o of main){ const y=yearOf(pick(o,'Entry_DateSubmitted')||pick(o,'Entry_DateCreated')||pick(o,'Order_Date')); if(y){ year=y; break } } }
    const ey={ ev:ef.ev, yr:year||new Date().getFullYear() }
    const idKey=Object.keys(main[0]||{})[0]
    for(const o of main){ const club=String(pick(o,'ClubName')||'').trim(); if(!club) continue
      regs.push({ event:ey.ev, year:ey.yr, id:String(o[idKey]),
        club, contact:String(pick(o,'ClubContact')||pick(o,'Order_BillingName_FirstAndLast')||'').trim(),
        email:String(pick(o,'ClubContactEmail')||pick(o,'Order_EmailAddress')||'').trim().toLowerCase(),
        phone:String(pick(o,'ClubContactMobilePhone')||pick(o,'Order_PhoneNumber')||'').trim(),
        city:String(pick(o,'ClubBasedIn')||pick(o,'Order_BillingAddress_CityStatePostalCode')||'').trim(),
        website:String(pick(o,'ClubWebsite')||'').trim(),
        teamsClaimed:String(pick(o,'HowManyTeamsAreYouRegistering')||'').trim(),
        paid:num(pick(o,'Order_AmountPaid'))||num(pick(o,'PaymentAmount2'))||num(pick(o,'PaymentAmount')) })
    }
    if(wb.SheetNames.includes('TeamInformation')){
      const ti=XLSX.utils.sheet_to_json(wb.Sheets['TeamInformation'],{defval:''})
      const tIdKey=Object.keys(ti[0]||{})[0]
      for(const o of ti){ const club=String(pick(o,'ClubName')||'').trim(); if(!club) continue
        const div=pick(o,'BoysDivision')||pick(o,'GirlsDivision')||pick(o,'DivisionType')||''
        teams.push({ event:ey.ev, year:ey.yr, regid:String(o[tIdKey]), division:String(div).trim() }) }
    }
  }
  // team counts + divisions per registration
  const tc:Record<string,number>={}; const td:Record<string,Set<string>>={}
  for(const t of teams){ const k=t.event+'|'+t.year+'|'+t.regid; tc[k]=(tc[k]||0)+1; if(t.division){ (td[k]=td[k]||new Set()).add(t.division) } }
  // group by canonical, then union by shared email
  const groups:Record<string,any[]>={}; for(const r of regs){ (groups[canon(r.club)]=groups[canon(r.club)]||[]).push(r) }
  const parent:Record<string,string>={}; Object.keys(groups).forEach(c=>parent[c]=c)
  const find=(x:string):string=>{ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x] } return x }
  const byEmail:Record<string,Set<string>>={}
  for(const c in groups) for(const r of groups[c]) if(r.email&&r.email.includes('@')) (byEmail[r.email]=byEmail[r.email]||new Set()).add(c)
  for(const e in byEmail){ const cs=[...byEmail[e]]; for(let i=1;i<cs.length;i++){ const a=find(cs[0]),b=find(cs[i]); if(a!==b)parent[a]=b } }
  const merged:Record<string,any[]>={}; for(const c in groups){ const r=find(c); (merged[r]=merged[r]||[]).push(...groups[c]) }
  const clubs:Club[]=[]
  for(const root in merged){
    const rs=merged[root].sort((a,b)=>a.year-b.year||a.event.localeCompare(b.event))
    const best=(f:string)=>{ for(let i=rs.length-1;i>=0;i--) if(rs[i][f]) return rs[i][f]; return '' }
    const per:Record<string,Hist>={}; const years=new Set<number>(); const divs=new Set<string>(); let tt=0, tp=0
    for(const r of rs){ const k=r.event+'|'+r.year+'|'+r.id; const n=tc[k]|| (parseInt(String(r.teamsClaimed).replace(/\D/g,''))||0)
      years.add(r.year); tt+=n; tp+=r.paid; (td[k]||new Set()).forEach((d:string)=>divs.add(d))
      const pk=r.event+'|'+r.year; if(!per[pk]) per[pk]={event:r.event,year:r.year,teams:0,paid:0,divisions:[]}
      per[pk].teams+=n; per[pk].paid+=r.paid; (td[k]||new Set()).forEach((d:string)=>{ if(!per[pk].divisions.includes(d))per[pk].divisions.push(d) }) }
    const hist=Object.values(per).sort((a,b)=>a.year-b.year||a.event.localeCompare(b.event))
    const yrs=[...years].sort()
    const e25=new Set(hist.filter(h=>h.year===2025).map(h=>h.event)); const e24=new Set(hist.filter(h=>h.year===2024).map(h=>h.event))
    const winBack=[...e24].some(ev=>!e25.has(ev))
    clubs.push({ club:best('club'), contact:best('contact'), email:best('email'), phone:best('phone'), city:best('city'), website:best('website'),
      eventsAttended:hist.length, years:yrs, firstYear:yrs[0], lastYear:yrs[yrs.length-1],
      totalTeams:tt, totalPaid:Math.round(tp), divisions:[...divs].sort(), history:hist, returning:yrs.length>=2, winBack })
  }
  clubs.sort((a,b)=>b.totalTeams-a.totalTeams||a.club.localeCompare(b.club))
  return clubs
}

// Merge freshly-imported clubs INTO the existing database instead of replacing
// it — so adding files one at a time accumulates, and re-importing a file just
// refreshes that event's numbers (idempotent, keyed by canonical name + email).
function mergeClubs(existing:Club[], incoming:Club[]):Club[]{
  const idx:Record<string,Club>={}; const emailIdx:Record<string,string>={}
  for(const c of existing){ idx[canon(c.club)]=c; if(c.email) emailIdx[c.email]=canon(c.club) }
  for(const nc of incoming){
    let key=canon(nc.club)
    if(!idx[key]&&nc.email&&emailIdx[nc.email]) key=emailIdx[nc.email]
    const cur=idx[key]
    if(!cur){ idx[key]=nc; if(nc.email) emailIdx[nc.email]=key; continue }
    const ncKeys=new Set(nc.history.map(h=>h.event+'|'+h.year))
    const hist=cur.history.filter(h=>!ncKeys.has(h.event+'|'+h.year)).concat(nc.history).sort((a,b)=>a.year-b.year||a.event.localeCompare(b.event))
    const years=[...new Set(hist.map(h=>h.year))].sort((a,b)=>a-b)
    const totalTeams=hist.reduce((s,h)=>s+h.teams,0)
    const totalPaid=Math.round(hist.reduce((s,h)=>s+h.paid,0))
    const divisions=[...new Set([...(cur.divisions||[]),...(nc.divisions||[])])].sort()
    const newer=nc.lastYear>=cur.lastYear?nc:cur; const older=newer===nc?cur:nc
    const f=(k:keyof Club)=> (newer as any)[k]||(older as any)[k]||''
    const e25=new Set(hist.filter(h=>h.year===2025).map(h=>h.event)); const e24=new Set(hist.filter(h=>h.year===2024).map(h=>h.event))
    idx[key]={ club:cur.club||nc.club, contact:f('contact') as string, email:f('email') as string, phone:f('phone') as string,
      city:f('city') as string, website:f('website') as string, eventsAttended:hist.length, years,
      firstYear:years[0], lastYear:years[years.length-1], totalTeams, totalPaid, divisions, history:hist,
      returning:years.length>=2, winBack:[...e24].some(ev=>!e25.has(ev)),
      note:cur.note||nc.note, archived:cur.archived??nc.archived }  // keep manual note/archive on re-import
    if(idx[key].email) emailIdx[idx[key].email]=key
  }
  return Object.values(idx).sort((a,b)=>b.totalTeams-a.totalTeams||a.club.localeCompare(b.club))
}

function draftInvite(c:Club){
  const last=c.history[c.history.length-1]
  const brought = last ? `${last.teams} team${last.teams===1?'':'s'} to ${last.event} ${last.year}` : 'teams to our events'
  const subject=`Come back to Sunshine Events Group — 2026 registration is open`
  const body=`Hi ${c.contact||'there'},\n\nWe'd love to have ${c.club} back this season! You brought ${brought}${c.eventsAttended>1?`, and have joined us ${c.eventsAttended} times over the years`:''} — thank you for being part of it.\n\nRegistration for our 2026 events is open now. We'd be glad to save your spot again.\n\nLet me know if you have any questions.\n\nBest,\nSunshine Events Group\ninfo@sunshinelax.com`
  return `mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function ClubsInner(){
  const { data:session, status } = useSession()
  const router=useRouter(); const params=useSearchParams()
  const role=(session?.user as any)?.role
  const orgParam=params.get('org')
  const q = orgParam ? `?org=${orgParam}` : ''
  const [clubs,setClubs]=useState<Club[]>([])
  const [loading,setLoading]=useState(true)
  const [importing,setImporting]=useState(false)
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState<'all'|'returning'|'winback'>('all')
  const [eventFilter,setEventFilter]=useState('')
  const [showArchived,setShowArchived]=useState(false)
  const [expanded,setExpanded]=useState<string|null>(null)
  const [updatedAt,setUpdatedAt]=useState<string|null>(null)

  useEffect(()=>{ if(status==='unauthenticated') router.replace('/login') },[status,router])
  useEffect(()=>{ fetch(`/api/org-clubs${q}`).then(r=>r.json()).then(d=>{ setClubs(d.clubs||[]); setUpdatedAt(d.updatedAt||null); setLoading(false) }).catch(()=>setLoading(false)) },[q])

  async function onImport(files:FileList|null){
    if(!files||!files.length) return
    setImporting(true)
    try{
      const { clubs:built, skipped }=await buildFromFiles(files)
      if(!built.length){
        toast.error(skipped.length ? `Couldn't read: ${skipped.join('; ')}. Expected a registration export with a Club Name column.` : 'No club data found in those files.')
        setImporting(false); return
      }
      // Merge into whatever is already saved so imports add up (and refresh, not wipe).
      const merged=mergeClubs(clubs,built)
      const res=await fetch(`/api/org-clubs${q}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clubs:merged})})
      if(!res.ok){ const e=await res.json().catch(()=>({})); toast.error(e.error||'Save failed'); setImporting(false); return }
      const addedNames=new Set(clubs.map(c=>canon(c.club)))
      const newCount=built.filter(b=>!addedNames.has(canon(b.club))).length
      setClubs(merged); setUpdatedAt(new Date().toISOString())
      toast.success(`Imported ${built.length} club${built.length===1?'':'s'} · ${newCount} new, ${merged.length} total`+(skipped.length?` (skipped ${skipped.length})`:''))
    }catch(e:any){ toast.error('Import failed: '+(e?.message||'')) }
    setImporting(false)
  }

  // Apply a manual edit (note / archived) to one club and persist the whole set.
  async function patchClub(clubName:string, patch:Partial<Club>){
    const next=clubs.map(c=>c.club===clubName?{...c,...patch}:c)
    setClubs(next)
    try{ await fetch(`/api/org-clubs${q}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clubs:next})}) }
    catch{ toast.error('Could not save — check your connection') }
  }

  // Distinct tournaments across all clubs' histories, most-recently-run first.
  const eventNames=useMemo(()=>{
    const latest:Record<string,number>={}
    for(const c of clubs) for(const h of c.history) latest[h.event]=Math.max(latest[h.event]||0,h.year)
    return Object.keys(latest).sort((a,b)=>latest[b]-latest[a]||a.localeCompare(b))
  },[clubs])
  const latestYear=useMemo(()=>Math.max(2000,...clubs.flatMap(c=>c.years)),[clubs])

  const filtered=useMemo(()=>{
    const s=search.trim().toLowerCase()
    return clubs.filter(c=>{
      if(!!c.archived !== showArchived) return false  // archived view is separate from active
      if(eventFilter && !c.history.some(h=>h.event===eventFilter)) return false
      if(filter==='returning'&&!c.returning) return false
      // Win-back respects the event filter: if an event is chosen, "win-back" =
      // attended that event before but not in the most recent year it ran.
      if(filter==='winback'){
        if(eventFilter){
          const evYears=c.history.filter(h=>h.event===eventFilter).map(h=>h.year)
          const evLatest=Math.max(0,...clubs.flatMap(cc=>cc.history.filter(h=>h.event===eventFilter).map(h=>h.year)))
          if(!(evYears.length && !evYears.includes(evLatest))) return false
        } else if(!c.winBack) return false
      }
      if(s && !(`${c.club} ${c.contact} ${c.email} ${c.city} ${c.note||''}`.toLowerCase().includes(s))) return false
      return true
    })
  },[clubs,search,filter,eventFilter,showArchived])
  const archivedCount=useMemo(()=>clubs.filter(c=>c.archived).length,[clubs])

  const stats=useMemo(()=>{
    let base = clubs.filter(c=>!!c.archived===showArchived)
    if(eventFilter) base = base.filter(c=>c.history.some(h=>h.event===eventFilter))
    const teams = eventFilter
      ? base.reduce((s,c)=>s+c.history.filter(h=>h.event===eventFilter).reduce((t,h)=>t+h.teams,0),0)
      : base.reduce((s,c)=>s+c.totalTeams,0)
    return { total:base.length, returning:base.filter(c=>c.returning).length, winback:filtered.length&&filter==='winback'?filtered.length:base.filter(c=>c.winBack).length, teams }
  },[clubs,eventFilter,filtered,filter])

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-slate-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster/>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15}/> Home</Link>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Users size={22} className="text-teal-600"/> Club database</h1>
          <div className="flex items-center gap-2">
            {clubs.length>0 && (
              <button onClick={async()=>{ if(!confirm('Clear the whole club database? You can rebuild it by importing again.')) return; await fetch(`/api/org-clubs${q}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clubs:[]})}); setClubs([]); setUpdatedAt(new Date().toISOString()); toast.success('Database cleared') }}
                className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50">Clear</button>
            )}
            <label className={`cursor-pointer inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg px-4 py-2 ${importing?'opacity-50 pointer-events-none':''}`}>
              <Upload size={15}/>{importing?'Importing…':clubs.length?'Import more':'Import registration exports'}
              <input type="file" multiple accept=".xlsx" className="hidden" disabled={importing} onChange={e=>{ onImport(e.target.files); e.currentTarget.value='' }}/>
            </label>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-4">Every club that has registered, with their full history. Import your registration spreadsheets — you can select several at once, or add them one at a time and they <b>add up</b> (re-importing a file just refreshes that event){updatedAt?` · last updated ${new Date(updatedAt).toLocaleDateString()}`:''}.</p>

        {clubs.length===0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <Users size={36} className="mx-auto text-slate-300 mb-3"/>
            <p className="text-slate-600 font-medium">No clubs yet</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Click <b>Import registration exports</b> and select your Cognito (or other) registration spreadsheets. They parse right here — nothing leaves your browser until you save.</p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[['Clubs',stats.total],['Returning',stats.returning],['Win-back',stats.winback],['Teams all-time',stats.teams]].map(([l,v])=>(
                <div key={String(l)} className="bg-white border border-slate-200 rounded-xl px-4 py-3"><div className="text-2xl font-bold text-slate-800">{v as number}</div><div className="text-xs text-slate-500">{l}</div></div>
              ))}
            </div>
            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search club, contact, city…" className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              </div>
              {eventNames.length>1 && (
                <select value={eventFilter} onChange={e=>setEventFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="">All tournaments</option>
                  {eventNames.map(ev=><option key={ev} value={ev}>{ev}</option>)}
                </select>
              )}
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {([['all','All'],['returning','Returning'],['winback','Win-back']] as const).map(([k,l])=>(
                  <button key={k} onClick={()=>setFilter(k)} className={`text-xs px-3 py-1.5 rounded-md transition-colors ${filter===k?'bg-white shadow text-teal-700 font-medium':'text-slate-500 hover:text-slate-700'}`}>{l}</button>
                ))}
              </div>
              {(archivedCount>0||showArchived) && (
                <button onClick={()=>setShowArchived(v=>!v)} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showArchived?'bg-slate-700 text-white border-slate-700':'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                  {showArchived?`← Active clubs`:`Archived (${archivedCount})`}
                </button>
              )}
            </div>
            {eventFilter && <p className="text-xs text-slate-400 -mt-1 mb-3">Showing clubs that attended <b className="text-slate-600">{eventFilter}</b>. Team &amp; win-back counts are for this tournament{filter==='winback'?' (attended before, but not its most recent year)':''}.</p>}
            {/* List */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {filtered.map(c=>{
                const open=expanded===c.club
                return (
                  <div key={c.club} className="border-b border-slate-100 last:border-b-0">
                    <button onClick={()=>setExpanded(open?null:c.club)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50">
                      {open?<ChevronDown size={16} className="text-slate-400 shrink-0"/>:<ChevronRight size={16} className="text-slate-400 shrink-0"/>}
                      <div className="min-w-0 flex-1">
                        <div className={`font-semibold truncate flex items-center gap-1.5 ${c.archived?'text-slate-400':'text-slate-800'}`}>{c.club}
                          {c.archived&&<span className="text-[10px] font-bold uppercase bg-slate-200 text-slate-500 rounded px-1.5 py-0.5">Archived</span>}
                          {!c.archived&&c.returning&&<span className="text-[10px] font-bold uppercase bg-teal-100 text-teal-700 rounded px-1.5 py-0.5">Returning</span>}
                          {!c.archived&&c.winBack&&<span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Win-back</span>}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{c.note?<span className="text-slate-500 italic">{c.note}</span>:`${c.contact}${c.email?` · ${c.email}`:''}${c.city?` · ${c.city}`:''}`}</div>
                      </div>
                      <div className="text-right shrink-0 hidden sm:block">
                        <div className="text-sm font-semibold text-slate-700">{c.totalTeams} teams · {money(c.totalPaid)}</div>
                        <div className="text-[11px] text-slate-400">{c.years.join(', ')}</div>
                      </div>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pt-1 bg-slate-50/50">
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          {c.email && <a href={draftInvite(c)} className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg px-3 py-1.5"><Mail size={13}/> Draft win-back email</a>}
                          {c.phone && <a href={`tel:${c.phone}`} className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white">{c.phone}</a>}
                          {c.website && <a href={c.website.startsWith('http')?c.website:`https://${c.website}`} target="_blank" rel="noreferrer" className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white">Website</a>}
                          <button onClick={()=>patchClub(c.club,{archived:!c.archived})} className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 text-slate-500 hover:bg-white ml-auto inline-flex items-center gap-1.5">
                            <Archive size={13}/>{c.archived?'Unarchive':'Archive'}
                          </button>
                        </div>
                        {/* Manual note — folded, renamed, contact changed, etc. Survives re-imports. */}
                        <div className="mb-3">
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Note</label>
                          <textarea defaultValue={c.note||''} onBlur={e=>{ const v=e.target.value.trim(); if(v!==(c.note||'')) patchClub(c.club,{note:v}) }}
                            placeholder="e.g. folded 2025 · rebranded to Coastal Elite · new contact is…"
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" rows={2}/>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-1.5 pr-4">Event</th><th className="py-1.5 pr-4">Teams</th><th className="py-1.5 pr-4">Paid</th><th className="py-1.5">Divisions</th></tr></thead>
                            <tbody>
                              {c.history.map((h,i)=>(
                                <tr key={i} className="border-t border-slate-100">
                                  <td className="py-1.5 pr-4 text-slate-700 whitespace-nowrap">{h.event} {h.year}{c.history.length>1&&h===c.history[c.history.length-1]&&<Star size={11} className="inline ml-1 text-amber-400" fill="currentColor"/>}</td>
                                  <td className="py-1.5 pr-4 font-medium">{h.teams}</td>
                                  <td className="py-1.5 pr-4">{money(h.paid)}</td>
                                  <td className="py-1.5 text-slate-500 text-xs">{h.divisions.join(', ')}</td>
                                </tr>
                              ))}
                              <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
                                <td className="py-1.5 pr-4">Total</td><td className="py-1.5 pr-4">{c.totalTeams}</td><td className="py-1.5 pr-4">{money(c.totalPaid)}</td><td></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {filtered.length===0 && <div className="px-4 py-8 text-center text-slate-400 text-sm">No clubs match.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ClubsPage(){
  return <Suspense fallback={<div className="min-h-screen bg-gray-50"/>}><ClubsInner/></Suspense>
}
