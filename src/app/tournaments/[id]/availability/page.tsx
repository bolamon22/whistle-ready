'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDate, formatTime } from '@/lib/utils'
import TournamentNav from '../TournamentNav'

interface Worker { id:string;name:string;defaultRole:string }
interface Avail { workerId:string;date:string;timeSlots:string }
interface Tournament { id:string;name:string;dates:string }

export default function AvailabilityPage({ params }: { params:{id:string} }) {
  const [tournament,setTournament]=useState<Tournament|null>(null)
  const [workers,setWorkers]=useState<Worker[]>([])
  const [avails,setAvails]=useState<Avail[]>([])
  const [times,setTimes]=useState<string[]>([])
  const [activeDay,setActiveDay]=useState('')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState<string|null>(null)

  async function load(){
    const[tR,wR,aR,gR,rR]=await Promise.all([
      fetch(`/api/tournaments/${params.id}`),
      fetch('/api/workers'),
      fetch(`/api/availability?tournamentId=${params.id}`),
      fetch(`/api/tournaments/${params.id}/games`),
      fetch(`/api/tournaments/${params.id}/roster`),
    ])
    const t=await tR.json();const w=await wR.json();const a=await aR.json();const g=await gR.json();const r=await rR.json()
    setTournament(t);setAvails(a)
    const rIds=new Set(r.map((x:{workerId:string})=>x.workerId))
    setWorkers(w.filter((x:Worker)=>rIds.has(x.id)))
    const dates:string[]=JSON.parse(t.dates||'[]');const day=dates[0]||''
    setActiveDay(d=>d||day)
    setTimes([...new Set((g as{date:string;startTime:string}[]).filter(x=>x.date===(activeDay||day)).map(x=>x.startTime))].sort())
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  // Get the unavailability record for a worker on a date
  // Returns: undefined = available all day (no record)
  //          [] = unavailable ALL day
  //          ['08:00','09:00'] = unavailable at those specific times
  function getUnavail(wid:string,date:string):string[]|undefined {
    const rec=avails.find(a=>a.workerId===wid&&a.date===date)
    if(!rec)return undefined
    return JSON.parse(rec.timeSlots)
  }

  async function saveUnavail(wid:string,date:string,slots:string[]|null){
    // null = delete the record (back to fully available)
    if(slots===null){
      await fetch(`/api/availability?workerId=${wid}&tournamentId=${params.id}&date=${date}`,{method:'DELETE'})
    } else {
      await fetch('/api/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workerId:wid,tournamentId:params.id,date,timeSlots:slots})})
    }
    await load()
  }

  // Toggle all-day unavailability
  async function toggleAllDay(wid:string,date:string){
    setSaving(`${wid}-${date}`)
    const current=getUnavail(wid,date)
    if(current===undefined||current.length>0){
      // Currently available (no record) or partially unavailable → mark unavailable all day
      await saveUnavail(wid,date,[])
    } else {
      // Currently unavailable all day (empty array) → restore to available
      await saveUnavail(wid,date,null)
    }
    setSaving(null)
  }

  // Toggle a specific time slot as unavailable
  async function toggleSlot(wid:string,date:string,time:string){
    setSaving(`${wid}-${date}-${time}`)
    const current=getUnavail(wid,date)
    let blocked:string[]=current??[]
    if(blocked.includes(time)){
      // Remove from blocked list
      blocked=blocked.filter(s=>s!==time)
      // If no more blocked slots, delete the record (fully available again)
      await saveUnavail(wid,date,blocked.length>0?blocked:null)
    } else {
      // Add to blocked list
      blocked=[...blocked,time].sort()
      await saveUnavail(wid,date,blocked)
    }
    setSaving(null)
  }

  if(loading)return<div className="text-slate-400 text-center py-12">Loading…</div>
  if(!tournament)return<div className="text-red-500">Not found</div>
  const dates:string[]=JSON.parse(tournament.dates||'[]')

  return(
    <div>
      <TournamentNav id={params.id} name={tournament.name} logoUrl={tournament.logoUrl} />
      <div className="page-header">
        <div>
          <h1 className="section-title">Unavailability</h1>
          <p className="text-sm text-slate-500 mt-1">All rostered staff are <span className="text-emerald-600 font-medium">available by default</span>. Mark anyone who can't work.</p>
        </div>
      </div>

      {dates.length>0&&(
        <div className="flex gap-1 mb-5 border-b border-slate-200">
          {dates.map(d=><button key={d} onClick={()=>setActiveDay(d)} className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeDay===d?'border-sky-600 text-sky-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>{formatDate(d)}</button>)}
        </div>
      )}

      {workers.length===0?(
        <div className="card p-8 text-center text-slate-400">No rostered staff. <Link href={`/tournaments/${params.id}/roster`} className="text-sky-600">Add to roster first →</Link></div>
      ):dates.length===0?(
        <div className="card p-8 text-center text-slate-400">Import games first to see time slots.</div>
      ):(
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide sticky left-0 bg-slate-50 min-w-[180px]">Staff</th>
                <th className="text-center px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">All Day Out</th>
                {times.map(t=><th key={t} className="text-center px-2 py-3 font-semibold text-slate-500 text-xs whitespace-nowrap">{formatTime(t)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workers.map(w=>{
                const unavail=getUnavail(w.id,activeDay)
                // unavail===undefined → available all day (default)
                // unavail===[] → unavailable ALL day
                // unavail=[...] → unavailable at those specific times
                const isAllDayOut=unavail!==undefined&&unavail.length===0
                const isPartial=unavail!==undefined&&unavail.length>0

                return(
                  <tr key={w.id} className={`${isAllDayOut?'bg-red-50':isPartial?'bg-amber-50/40':'hover:bg-slate-50'}`}>
                    <td className={`px-5 py-3 sticky left-0 font-semibold ${isAllDayOut?'bg-red-50 text-red-700':isPartial?'bg-amber-50/40 text-slate-800':'bg-white text-slate-800'}`}>
                      {w.name}
                      <span className="ml-2 text-xs font-normal text-slate-400">{w.defaultRole}</span>
                      {isAllDayOut&&<span className="ml-2 badge bg-red-100 text-red-600">Out</span>}
                      {isPartial&&<span className="ml-2 badge bg-amber-100 text-amber-700">Partial</span>}
                      {unavail===undefined&&<span className="ml-2 text-xs text-emerald-500">✓ Available</span>}
                    </td>

                    {/* All-day unavailable toggle */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={()=>toggleAllDay(w.id,activeDay)}
                        disabled={saving===`${w.id}-${activeDay}`}
                        title={isAllDayOut?'Click to restore availability':'Click to mark unavailable all day'}
                        className={`w-9 h-9 rounded-full text-sm font-bold transition-all shadow-sm ${isAllDayOut?'bg-red-500 text-white hover:bg-red-600':'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}
                      >{isAllDayOut?'✗':'—'}</button>
                    </td>

                    {/* Per-slot toggles */}
                    {times.map(time=>{
                      const isBlocked=unavail!==undefined&&(unavail.length===0||unavail.includes(time))
                      const isExplicit=unavail!==undefined&&unavail.includes(time)
                      return(
                        <td key={time} className="px-2 py-3 text-center">
                          {isAllDayOut?(
                            <span className="text-red-300 text-lg">✗</span>
                          ):(
                            <button
                              onClick={()=>toggleSlot(w.id,activeDay,time)}
                              disabled={!!saving}
                              title={isExplicit?`Mark available at ${formatTime(time)}`:`Mark unavailable at ${formatTime(time)}`}
                              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${isExplicit?'bg-red-400 text-white hover:bg-red-500 shadow-sm':'bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500'}`}
                            >{isExplicit?'✗':''}</button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex gap-6">
            <span><span className="text-emerald-500 font-semibold">✓ Available</span> = default for all rostered staff</span>
            <span><span className="text-red-500 font-semibold">✗ All Day Out</span> = unavailable the entire day</span>
            <span><span className="text-amber-600 font-semibold">Partial</span> = unavailable at specific time slots only</span>
          </div>
        </div>
      )}
    </div>
  )
}
