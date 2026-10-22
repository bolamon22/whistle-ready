'use client'
import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'
import { Users, Calendar, Clock, Wallet, Play, Square } from 'lucide-react'
import TournamentNav from '../TournamentNav'
import { eventDayList } from '@/lib/eventDays'
import IfCanOpen from '@/components/IfCanOpen'

interface Worker { id:string;name:string;defaultRole:string;hourlyRate:number|null }
interface TimeEntry { id:string;workerId:string;date:string;clockIn:string|null;clockOut:string|null;hoursManual:number|null;notes:string|null;isManualEdit:boolean;worker:Worker }
interface Tournament { id:string;name:string;dates:string;startDate?:string;endDate?:string;logoUrl:string }

function calcHours(e:TimeEntry):number {
  if(e.hoursManual!=null)return e.hoursManual
  if(e.clockIn&&e.clockOut){const[ih,im]=e.clockIn.split(':').map(Number);const[oh,om]=e.clockOut.split(':').map(Number);return Math.max(0,(oh*60+om-(ih*60+im))/60)}
  return 0
}

function nowTime():string {
  const n=new Date();return`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`
}

// Today on this device, "YYYY-MM-DD": the same day the staff home's punch clock records.
function todayYMD():string {
  const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
}
const ALL='all'

export default function TimeEntriesPage({ params }: { params:{id:string} }) {
  const[tournament,setTournament]=useState<Tournament|null>(null)
  const[workers,setWorkers]=useState<Worker[]>([])
  const[entries,setEntries]=useState<TimeEntry[]>([])
  const[loading,setLoading]=useState(true)
  const[activeDay,setActiveDay]=useState('')
  const[editId,setEditId]=useState<string|null>(null)
  const[editForm,setEditForm]=useState({date:'',clockIn:'',clockOut:'',hoursManual:'',notes:''})
  const[quickWorkerId,setQuickWorkerId]=useState('')
  const[saving,setSaving]=useState(false)
  const[clockedIn,setClockedIn]=useState<Record<string,string>>({}) // workerId -> entryId

  async function load(){
    const[tR,wR,eR]=await Promise.all([fetch(`/api/tournaments/${params.id}`),fetch(`/api/workers?tournamentId=${params.id}`),fetch(`/api/time-entries?tournamentId=${params.id}`)])
    const t=await tR.json();const w=await wR.json();const e=await eR.json()
    setTournament(t);setEntries(e)
    setWorkers(w.filter((x:Worker)=>x.defaultRole==='athletic_trainer'||x.defaultRole==='field_ops'))
    // Opens on today during the event, and on All days otherwise: people clock in on setup
    // days before the event too, and those hours were on no tab (Bo, Oct 22 2026).
    const today=todayYMD();setActiveDay(d=>d||(eventDayList(t).includes(today)?today:ALL))
    // Find currently clocked-in (has clockIn, no clockOut, no manual hours)
    const ci:Record<string,string>={}
    for(const en of e){if(en.clockIn&&!en.clockOut&&en.hoursManual==null)ci[en.workerId]=en.id}
    setClockedIn(ci)
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  // Clocks in now, on today's date whatever day is showing (it used the day tab's date, so
  // a setup-day punch could land on game day), for the person whose button it is (it read
  // the person from state set in the same click, so the first tap did nothing).
  async function clockIn(workerId:string){
    if(!workerId)return;setSaving(true)
    const today=todayYMD()
    const res=await fetch('/api/time-entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workerId,tournamentId:params.id,date:today,clockIn:nowTime(),clockOut:null,hoursManual:null,notes:null,isManualEdit:false})})
    if(res.ok){toast.success('Clocked in!');if(activeDay!==ALL&&activeDay!==today)setActiveDay(today);load()}else toast.error('Failed')
    setSaving(false)
  }

  async function clockOut(entryId:string){
    setSaving(true)
    const res=await fetch(`/api/time-entries/${entryId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({clockOut:nowTime(),isManualEdit:false})})
    if(res.ok){toast.success('Clocked out!');load()}else toast.error('Failed')
    setSaving(false)
  }

  async function saveEdit(e:React.FormEvent){
    e.preventDefault();if(!editId)return;setSaving(true)
    const res=await fetch(`/api/time-entries/${editId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(editForm.date?{date:editForm.date}:{}),clockIn:editForm.clockIn||null,clockOut:editForm.clockOut||null,hoursManual:editForm.hoursManual?parseFloat(editForm.hoursManual):null,notes:editForm.notes||null,isManualEdit:true})})
    if(res.ok){toast.success('Updated');setEditId(null);load()}else toast.error('Failed')
    setSaving(false)
  }

  async function del(id:string){if(!confirm('Delete entry?'))return;await fetch(`/api/time-entries/${id}`,{method:'DELETE'});toast.success('Deleted');load()}

  if(loading)return<div className="text-slate-400 text-center py-12">Loading…</div>
  if(!tournament)return<div className="text-red-500">Not found</div>
  // Days: the event's, every day someone has hours on, and today until the event is over.
  const evDays=eventDayList(tournament)
  const today=todayYMD()
  const lastDay=evDays[evDays.length-1]
  const dates=Array.from(new Set([...evDays,...entries.map(e=>e.date),...(!lastDay||today<=lastDay?[today]:[])])).filter(Boolean).sort()
  const dayKind=(d:string)=>evDays.includes(d)?'':evDays.length&&d<evDays[0]?'before the event':evDays.length?'after the event':''
  const byDay=new Map<string,TimeEntry[]>();for(const e of entries)byDay.set(e.date,[...(byDay.get(e.date)??[]),e])
  const dayEntries=activeDay===ALL?entries:(byDay.get(activeDay)??[])
  const groups:[string,TimeEntry[]][]=activeDay===ALL?dates.filter(d=>byDay.has(d)).map(d=>[d,byDay.get(d)!]):[[activeDay,dayEntries]]
  const dayLine=(d:string,list:TimeEntry[])=>{const h=list.reduce((t,e)=>t+calcHours(e),0);const pay=list.reduce((t,e)=>t+calcHours(e)*(e.worker.hourlyRate??0),0);return`${formatDate(d)}${d===today?' (today)':''}${dayKind(d)?` · ${dayKind(d)}`:''} · ${list.length} entr${list.length===1?'y':'ies'} · ${h.toFixed(2)}h${pay>0?` · $${pay.toFixed(2)}`:''}`}

  return(
    <div>
      <TournamentNav id={params.id} name={tournament.name} logoUrl={tournament.logoUrl} />

      {/* Staff sub-nav. Each tab has the one name the page goes by everywhere (Bo,
          Oct 17 2026): Staff roster and Staff pay, as in the People menu. */}
      <div className="flex items-center gap-0.5 sm:gap-1 mb-5 sm:mb-6 border-b border-slate-200 overflow-x-auto">
        <Link href={`/tournaments/${params.id}/roster`}
          className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
          <Users size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Staff roster
        </Link>
        <Link href={`/tournaments/${params.id}/availability`}
          className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
          <Calendar size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Availability
        </Link>
        <IfCanOpen href={`/tournaments/${params.id}/time-entries`}>
          <Link href={`/tournaments/${params.id}/time-entries`}
            className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-teal-600 text-teal-700 transition-colors whitespace-nowrap">
            <Clock size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Time entries
          </Link>
        </IfCanOpen>
        <IfCanOpen href={`/tournaments/${params.id}/pay-summary`}>
          <Link href={`/tournaments/${params.id}/pay-summary`}
            className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
            <Wallet size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Staff pay
          </Link>
        </IfCanOpen>
      </div>
      <div className="page-header"><div><h1 className="section-title">Time entries</h1><p className="text-sm text-slate-500 mt-1">Athletic trainers and field ops. Hours count on any day, including setup days before the event.</p></div></div>

      <div className="flex gap-1 mb-5 border-b border-slate-200 overflow-x-auto">{[ALL,...dates].map(d=>{const n=d===ALL?entries.length:(byDay.get(d)?.length??0);return<button key={d} onClick={()=>setActiveDay(d)} title={d===ALL?'Every day, including setup days before the event':dayKind(d)?`${formatDate(d)}: ${dayKind(d)}`:undefined} className={`px-3 sm:px-5 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${d===ALL||evDays.includes(d)?'font-semibold':'font-medium'} ${activeDay===d?'border-teal-600 text-teal-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>{d===ALL?'All days':formatDate(d)}{d===today&&<span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-teal-600">Today</span>}{n>0&&<span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{n}</span>}</button>})}</div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Punch clock cards */}
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-700">Quick Punch Clock</h2>
          {workers.length===0?<div className="card p-6 text-center text-slate-400 text-sm">No hourly staff on roster.</div>:workers.map(w=>{
            const isClockedIn=!!clockedIn[w.id]
            return(
              <div key={w.id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div><p className="font-semibold text-slate-900">{w.name}</p><p className="text-xs text-slate-400">{w.defaultRole==='athletic_trainer'?'Athletic Trainer':'Field Ops'}{w.hourlyRate?` · $${w.hourlyRate}/hr`:''}</p></div>
                  <div className={`w-2.5 h-2.5 rounded-full ${isClockedIn?'bg-emerald-500 animate-pulse':'bg-slate-300'}`}/>
                </div>
                {isClockedIn?(
                  <button onClick={()=>clockOut(clockedIn[w.id])} disabled={saving} className="btn-danger w-full btn-sm"><Square size={14} className="inline align-text-bottom mr-1" />Clock Out</button>
                ):(
                  <button onClick={()=>clockIn(w.id)} disabled={saving} className="btn-primary w-full btn-sm" style={{background:'#059669'}}><Play size={14} className="inline align-text-bottom mr-1" />Clock In</button>
                )}
              </div>
            )
          })}
          {/* Manual add */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Manual Entry</p>
            <div className="space-y-2">
              <select className="select text-sm" value={quickWorkerId} onChange={e=>setQuickWorkerId(e.target.value)}><option value="">Select staff…</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
              <button onClick={()=>{if(!quickWorkerId){toast.error('Select a staff member');return};setEditId('new');setEditForm({date:activeDay===ALL?todayYMD():activeDay,clockIn:'',clockOut:'',hoursManual:'',notes:''})}} className="btn-secondary w-full btn-sm">+ Manual Entry</button>
            </div>
          </div>
        </div>

        {/* Entries table */}
        <div className="lg:col-span-2">
          {/* New entry form */}
          {editId==='new'&&(
            <div className="card p-5 mb-4">
              <h3 className="font-semibold text-slate-800 mb-3">Add Manual Entry</h3>
              <form onSubmit={async e=>{e.preventDefault();setSaving(true);const res=await fetch('/api/time-entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workerId:quickWorkerId,tournamentId:params.id,date:editForm.date||todayYMD(),clockIn:editForm.clockIn||null,clockOut:editForm.clockOut||null,hoursManual:editForm.hoursManual?parseFloat(editForm.hoursManual):null,notes:editForm.notes||null,isManualEdit:true})});if(res.ok){toast.success('Added');setEditId(null);if(activeDay!==ALL&&activeDay!==editForm.date)setActiveDay(editForm.date);load()}else toast.error('Failed');setSaving(false)}} className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label">Date</label><input className="input" type="date" required value={editForm.date} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))}/></div>
                <div><label className="label">Clock In</label><input className="input" type="time" value={editForm.clockIn} onChange={e=>setEditForm(f=>({...f,clockIn:e.target.value}))}/></div>
                <div><label className="label">Clock Out</label><input className="input" type="time" value={editForm.clockOut} onChange={e=>setEditForm(f=>({...f,clockOut:e.target.value}))}/></div>
                <div><label className="label">Manual Hours</label><input className="input" type="number" min="0" step="0.25" value={editForm.hoursManual} onChange={e=>setEditForm(f=>({...f,hoursManual:e.target.value}))} placeholder="Override if needed"/></div>
                <div><label className="label">Notes</label><input className="input" value={editForm.notes} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}/></div>
                <div className="col-span-2 flex gap-2"><button type="submit" className="btn-primary btn-sm" disabled={saving}>Save</button><button type="button" className="btn-secondary btn-sm" onClick={()=>setEditId(null)}>Cancel</button></div>
              </form>
            </div>
          )}

          {dayEntries.length===0?<div className="card p-10 text-center text-slate-400">{activeDay===ALL?'No time entries yet.':'No time entries for this day.'}</div>:(<>
            {/* Phones: one card per entry */}
            <div className="sm:hidden space-y-2">
              {groups.map(([gd,list])=><Fragment key={gd}>{activeDay===ALL&&<div className="pt-2 text-xs font-semibold text-slate-500">{dayLine(gd,list)}</div>}{list.map(e=>{
                const hrs=calcHours(e);const pay=hrs*(e.worker.hourlyRate??0);const active=!!clockedIn[e.workerId]&&clockedIn[e.workerId]===e.id
                if(editId===e.id)return(
                  <div key={e.id} className="card p-3 bg-teal-50 border-teal-200">
                    <div className="font-semibold text-slate-900 mb-2">{e.worker.name}</div>
                    <form onSubmit={saveEdit} className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><label className="label">Date</label><input className="input py-1" type="date" value={editForm.date} onChange={ev=>setEditForm(f=>({...f,date:ev.target.value}))}/></div>
                      <div><label className="label">In</label><input className="input py-1" type="time" value={editForm.clockIn} onChange={ev=>setEditForm(f=>({...f,clockIn:ev.target.value}))}/></div>
                      <div><label className="label">Out</label><input className="input py-1" type="time" value={editForm.clockOut} onChange={ev=>setEditForm(f=>({...f,clockOut:ev.target.value}))}/></div>
                      <div><label className="label">Manual hrs</label><input className="input py-1" type="number" step="0.25" value={editForm.hoursManual} onChange={ev=>setEditForm(f=>({...f,hoursManual:ev.target.value}))}/></div>
                      <div><label className="label">Notes</label><input className="input py-1" value={editForm.notes} onChange={ev=>setEditForm(f=>({...f,notes:ev.target.value}))}/></div>
                      <div className="col-span-2 flex gap-2"><button type="submit" className="btn-primary btn-sm flex-1" disabled={saving}>Save</button><button type="button" className="btn-secondary btn-sm flex-1" onClick={()=>setEditId(null)}>Cancel</button></div>
                    </form>
                  </div>
                )
                return(
                  <div key={e.id} className={`card p-3 ${active?'bg-emerald-50 border-emerald-200':''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{e.worker.name}{active&&<span className="ml-2 badge bg-emerald-100 text-emerald-700 animate-pulse">● LIVE</span>}{e.isManualEdit&&<span className="ml-2 text-[10px] text-amber-500">edited</span>}</div>
                        <div className="text-sm text-slate-600 mt-0.5">{e.clockIn??'—'} → {e.clockOut??<span className="text-emerald-500 font-medium">running…</span>}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-semibold text-slate-900">{e.hoursManual!=null?<>{e.hoursManual}h <span className="text-xs text-amber-500">(manual)</span></>:hrs>0?`${hrs.toFixed(2)}h`:'—'}</div>
                        <div className="text-sm font-semibold text-emerald-600">{pay>0?`$${pay.toFixed(2)}`:'—'}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-4 mt-2 text-xs">
                      {active&&<button onClick={()=>clockOut(e.id)} disabled={saving} className="btn-danger btn-sm"><Square size={13} className="inline align-text-bottom mr-1" />Out</button>}
                      <button onClick={()=>{setEditId(e.id);setEditForm({date:e.date,clockIn:e.clockIn??'',clockOut:e.clockOut??'',hoursManual:e.hoursManual!=null?String(e.hoursManual):'',notes:e.notes??''})}} className="text-teal-600 font-medium">Edit</button>
                      <button onClick={()=>del(e.id)} className="text-red-400 font-medium">Del</button>
                    </div>
                  </div>
                )
              })}</Fragment>)}
            </div>

            <div className="hidden sm:block card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200"><tr>
                  <th className="text-left px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Staff</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">In</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Out</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Hours</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Pay</th>
                  <th className="px-4 py-3"/>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {groups.map(([gd,list])=><Fragment key={gd}>{activeDay===ALL&&<tr className="bg-slate-50"><td colSpan={6} className="px-5 py-2 text-xs font-semibold text-slate-600">{dayLine(gd,list)}</td></tr>}{list.map(e=>{
                    const hrs=calcHours(e);const pay=hrs*(e.worker.hourlyRate??0);const active=!!clockedIn[e.workerId]&&clockedIn[e.workerId]===e.id
                    if(editId===e.id)return(
                      <tr key={e.id} className="bg-teal-50">
                        <td className="px-5 py-3 font-semibold">{e.worker.name}</td>
                        <td colSpan={4} className="px-4 py-3">
                          <form onSubmit={saveEdit} className="flex gap-2 items-end flex-wrap">
                            <div><label className="label">Date</label><input className="input w-36 py-1" type="date" value={editForm.date} onChange={ev=>setEditForm(f=>({...f,date:ev.target.value}))}/></div>
                            <div><label className="label">In</label><input className="input w-28 py-1" type="time" value={editForm.clockIn} onChange={ev=>setEditForm(f=>({...f,clockIn:ev.target.value}))}/></div>
                            <div><label className="label">Out</label><input className="input w-28 py-1" type="time" value={editForm.clockOut} onChange={ev=>setEditForm(f=>({...f,clockOut:ev.target.value}))}/></div>
                            <div><label className="label">Manual hrs</label><input className="input w-20 py-1" type="number" step="0.25" value={editForm.hoursManual} onChange={ev=>setEditForm(f=>({...f,hoursManual:ev.target.value}))}/></div>
                            <div><label className="label">Notes</label><input className="input w-36 py-1" value={editForm.notes} onChange={ev=>setEditForm(f=>({...f,notes:ev.target.value}))}/></div>
                            <div className="flex gap-2"><button type="submit" className="btn-primary btn-sm" disabled={saving}>Save</button><button type="button" className="btn-secondary btn-sm" onClick={()=>setEditId(null)}>Cancel</button></div>
                          </form>
                        </td>
                        <td/>
                      </tr>
                    )
                    return(
                      <tr key={e.id} className={`hover:bg-slate-50 ${active?'bg-emerald-50':''}`}>
                        <td className="px-5 py-3 font-semibold text-slate-900">{e.worker.name}{active&&<span className="ml-2 badge bg-emerald-100 text-emerald-700 animate-pulse">● LIVE</span>}{e.isManualEdit&&<span className="ml-2 text-[10px] text-amber-500">edited</span>}</td>
                        <td className="px-4 py-3 text-slate-600">{e.clockIn??'—'}</td>
                        <td className="px-4 py-3 text-slate-600">{e.clockOut??<span className="text-emerald-500 font-medium">running…</span>}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{e.hoursManual!=null?<>{e.hoursManual}h <span className="text-xs text-amber-500">(manual)</span></>:hrs>0?`${hrs.toFixed(2)}h`:'—'}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-600">{pay>0?`$${pay.toFixed(2)}`:'—'}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {active&&<button onClick={()=>clockOut(e.id)} disabled={saving} className="btn-danger btn-sm mr-2"><Square size={13} className="inline align-text-bottom mr-1" />Out</button>}
                          <button onClick={()=>{setEditId(e.id);setEditForm({date:e.date,clockIn:e.clockIn??'',clockOut:e.clockOut??'',hoursManual:e.hoursManual!=null?String(e.hoursManual):'',notes:e.notes??''})}} className="text-teal-600 hover:text-teal-800 text-xs font-medium mr-2">Edit</button>
                          <button onClick={()=>del(e.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Del</button>
                        </td>
                      </tr>
                    )
                  })}</Fragment>)}
                </tbody>
              </table>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}
