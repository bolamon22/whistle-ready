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
import { ChevronLeft, ChevronDown, ChevronRight, Users, Upload, Search, Mail, Star, Trophy, Download } from 'lucide-react'

interface Hist { event:string; year:number; teams:number; paid:number; divisions:string[] }
interface Club {
  club:string; contact:string; email:string; phone:string; city:string; website:string
  eventsAttended:number; years:number[]; firstYear:number; lastYear:number
  totalTeams:number; totalPaid:number; divisions:string[]; history:Hist[]
  returning:boolean; winBack:boolean
}

const money = (n:number)=> '$'+Math.round(n||0).toLocaleString()

// ---- In-browser importer: parse Cognito-style exports (main + TeamInformation
// tabs), dedupe, and aggregate — the same pipeline that built the master file. ----
function eventYearFromName(fn:string){
  const m=fn.match(/_?(\d{4})(.+?)TeamRegistration/i); if(!m) return null
  const yr=+m[1]; const r=m[2]
  const ev=/MonsterMash/i.test(r)?'Monster Mash':/SummerKickOff/i.test(r)?'Summer Kick Off':/FallClassic/i.test(r)?'Fall Classic':/JingleBrawl/i.test(r)?'Jingle Brawl':r
  return {ev,yr}
}
const num=(v:any)=>{ const n=parseFloat(String(v??'').replace(/[$,]/g,'')); return isNaN(n)?0:n }
function canon(name:string){
  let s=(name||'').toLowerCase().replace(/[^a-z0-9]/g,'')
  for(const suf of ['lacrosseclub','lacrosse','laxclub','lax','lc','club']){ if(s.endsWith(suf)&&s.length>suf.length+2){ s=s.slice(0,-suf.length); break } }
  return s||(name||'').toLowerCase().trim()
}
async function buildFromFiles(files:FileList):Promise<Club[]>{
  // load SheetJS on demand
  if(!(window as any).XLSX){ await new Promise<void>((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=()=>res(); s.onerror=rej; document.head.appendChild(s) }) }
  const XLSX=(window as any).XLSX
  const regs:any[]=[]; const teams:any[]=[]
  for(const f of Array.from(files)){
    const ey=eventYearFromName(f.name); if(!ey) continue
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'})
    const main=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''})
    const pick=(o:any,...ks:string[])=>{ for(const k of ks){ const h=Object.keys(o).find(x=>x.toLowerCase()===k.toLowerCase()); if(h&&o[h]!=='')return o[h] } return '' }
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
  const [expanded,setExpanded]=useState<string|null>(null)
  const [updatedAt,setUpdatedAt]=useState<string|null>(null)

  useEffect(()=>{ if(status==='unauthenticated') router.replace('/login') },[status,router])
  useEffect(()=>{ fetch(`/api/org-clubs${q}`).then(r=>r.json()).then(d=>{ setClubs(d.clubs||[]); setUpdatedAt(d.updatedAt||null); setLoading(false) }).catch(()=>setLoading(false)) },[q])

  async function onImport(files:FileList|null){
    if(!files||!files.length) return
    setImporting(true)
    try{
      const built=await buildFromFiles(files)
      if(!built.length){ toast.error('No registration data found in those files'); setImporting(false); return }
      const res=await fetch(`/api/org-clubs${q}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clubs:built})})
      if(!res.ok){ const e=await res.json().catch(()=>({})); toast.error(e.error||'Save failed'); setImporting(false); return }
      setClubs(built); setUpdatedAt(new Date().toISOString()); toast.success(`Imported ${built.length} clubs`)
    }catch(e:any){ toast.error('Import failed: '+(e?.message||'')) }
    setImporting(false)
  }

  const filtered=useMemo(()=>{
    const s=search.trim().toLowerCase()
    return clubs.filter(c=>{
      if(filter==='returning'&&!c.returning) return false
      if(filter==='winback'&&!c.winBack) return false
      if(s && !(`${c.club} ${c.contact} ${c.email} ${c.city}`.toLowerCase().includes(s))) return false
      return true
    })
  },[clubs,search,filter])

  const stats=useMemo(()=>({ total:clubs.length, returning:clubs.filter(c=>c.returning).length, winback:clubs.filter(c=>c.winBack).length, teams:clubs.reduce((s,c)=>s+c.totalTeams,0) }),[clubs])

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-slate-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster/>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15}/> Home</Link>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Users size={22} className="text-teal-600"/> Club database</h1>
          <label className={`cursor-pointer inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg px-4 py-2 ${importing?'opacity-50 pointer-events-none':''}`}>
            <Upload size={15}/>{importing?'Importing…':'Import registration exports'}
            <input type="file" multiple accept=".xlsx" className="hidden" disabled={importing} onChange={e=>{ onImport(e.target.files); e.currentTarget.value='' }}/>
          </label>
        </div>
        <p className="text-sm text-slate-500 mb-4">Every club that has registered, with their full history. Import your yearly registration spreadsheets to build or refresh it{updatedAt?` · last updated ${new Date(updatedAt).toLocaleDateString()}`:''}.</p>

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
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {([['all','All'],['returning','Returning'],['winback','Win-back']] as const).map(([k,l])=>(
                  <button key={k} onClick={()=>setFilter(k)} className={`text-xs px-3 py-1.5 rounded-md transition-colors ${filter===k?'bg-white shadow text-teal-700 font-medium':'text-slate-500 hover:text-slate-700'}`}>{l}</button>
                ))}
              </div>
            </div>
            {/* List */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {filtered.map(c=>{
                const open=expanded===c.club
                return (
                  <div key={c.club} className="border-b border-slate-100 last:border-b-0">
                    <button onClick={()=>setExpanded(open?null:c.club)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50">
                      {open?<ChevronDown size={16} className="text-slate-400 shrink-0"/>:<ChevronRight size={16} className="text-slate-400 shrink-0"/>}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5">{c.club}
                          {c.returning&&<span className="text-[10px] font-bold uppercase bg-teal-100 text-teal-700 rounded px-1.5 py-0.5">Returning</span>}
                          {c.winBack&&<span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Win-back</span>}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{c.contact}{c.email?` · ${c.email}`:''}{c.city?` · ${c.city}`:''}</div>
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
