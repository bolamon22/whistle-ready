'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'
import TournamentNav from '../TournamentNav'

interface Worker { id:string;name:string;defaultRole:string;hourlyRate:number|null }
interface TimeEntry { id:string;workerId:string;date:string;clockIn:string|null;clockOut:string|null;hoursManual:number|null;notes:string|null;isManualEdit:boolean;worker:Worker }
interface Tournament { id:string;name:string;dates:string }

function calcHours(e:TimeEntry):number {
  if(e.hoursManual!=null)return e.hoursManual
  if(e.clockIn&&e.clockOut){const[ih,im]=e.clockIn.split(':').map(Number);const[oh,om]=e.clockOut.split(':').map(Number);return Math.max(0,(oh*60+om-(ih*60+im))/60)}
  return 0
}

function nowTime():string {
  const n=new Date();return`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`
}

export default function TimeEntriesPage({ params }: { params:{id:string} }) {
  const[tournament,setTournament]=useState<Tournament|null>(null)
  const[workers,setWorkers]=useState<Worker[]>([])
  const[entries,setEntries]=useState<TimeEntry[]>([])
  const[loading,setLoading]=useState(true)
  const[activeDay,setActiveDay]=useState('')
  const[editId,setEditId]=useState<string|null>(null)
  const[editForm,setEditForm]=useState({clockIn:'',clockOut:'',hoursManual:'',notes:''})
  const[quickWorkerId,setQuickWorkerId]=useState('')
  const[saving,setSaving]=useState(false)
  const[clockedIn,setClockedIn]=useState<Record<string,string>>({}) // workerId -> entryId

  async function load(){
    const[tR,wR,eR]=await Promise.all([fetch(`/api/tournaments/${params.id}`),fetch('/api/workers'),fetch(`/api/time-entries?tournamentId=${params.id}`)])
    const t=await tR.json();const w=await wR.json();const e=await eR.json()
    setTournament(t);setEntries(e)
    setWorkers(w.filter((x:Worker)=>x.defaultRole==='athletic_trainer'||x.defaultRole==='field_ops'))
    const dates:string[]=JSON.parse(t.dates||'[]');if(dates.length>0)setActiveDay(d=>d||dates[0])
    // Find currently clocked-in (has clockIn, no clockOut, no manual hours)
    const ci:Record<string,string>={}
    for(const en of e){if(en.clockIn&&!en.clockOut&&en.hoursManual==null)ci[en.workerId]=en.id}
    setClockedIn(ci)
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  async function clockIn(){
    if(!quickWorkerId)return;setSaving(true)
    const res=await fetch('/api/time-entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workerId:quickWorkerId,tournamentId:params.id,date:activeDay,clockIn:nowTime(),clockOut:null,hoursManual:null,notes:null,isManualEdit:false})})
    if(res.ok){toast.success('Clocked in!');load()}else toast.error('Failed')
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
    const res=await fetch(`/api/time-entries/${editId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({clockIn:editForm.clockIn||null,clockOut:editForm.clockOut||null,hoursManual:editForm.hoursManual?parseFloat(editForm.hoursManual):null,notes:editForm.notes||null,isManualEdit:true})})
    if(res.ok){toast.success('Updated');setEditId(null);load()}else toast.error('Failed')
    setSaving(false)
  }

  async function del(id:string){if(!confirm('Delete entry?'))return;await fetch(`/api/time-entries/${id}`,{method:'DELETE'});toast.success('Deleted');load()}

  if(loading)return<div className="text-slate-400 text-center py-12">Loading…</div>
  if(!tournament)return<div className="text-red-500">Not found</div>
  const dates:string[]=JSON.parse(tournament.dates||'[]')
  const dayEntries=entries.filter(e=>e.date===activeDay)

  return(
    <div>
      <TournamentNav id={params.id} name={tournament.name} logoUrl={tournament.logoUrl} />
      <div className="page-header"><div><h1 className="section-title">Hourly Staff Time</h1><p className="text-sm text-slate-500 mt-1">Athletic Trainers &amp; Field Ops — tap Start/Stop to track hours</p></div></div>

      {dates.length>0&&<div className="flex gap-1 mb-5 border-b border-slate-200">{dates.map(d=><button key={d} onClick={()=>setActiveDay(d)} className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeDay===d?'border-sky-600 text-sky-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>{formatDate(d)}</button>)}</div>}

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
                  <button onClick={()=>clockOut(clockedIn[w.id])} disabled={saving} className="btn-danger w-full btn-sm">⏹ Clock Out</button>
                ):(
                  <button onClick={()=>{setQuickWorkerId(w.id);setTimeout(()=>{setQuickWorkerId(w.id);clockIn()},0)}} disabled={saving} className="btn-primary w-full btn-sm" style={{background:'#059669'}}>▶ Clock In</button>
                )}
              </div>
            )
          })}
          {/* Manual add */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Manual Entry</p>
            <div className="space-y-2">
              <select className="select text-sm" value={quickWorkerId} onChange={e=>setQuickWorkerId(e.target.value)}><option value="">Select staff…</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
              <button onClick={()=>{if(!quickWorkerId){toast.error('Select a staff member');return};setEditId('new');setEditForm({clockIn:'',clockOut:'',hoursManual:'',notes:''})}} className="btn-secondary w-full btn-sm">+ Manual Entry</button>
            </div>
          </div>
        </div>

        {/* Entries table */}
        <div className="lg:col-span-2">
          {/* New entry form */}
          {editId==='new'&&(
            <div className="card p-5 mb-4">
              <h3 className="font-semibold text-slate-800 mb-3">Add Manual Entry</h3>
              <form onSubmit={async e=>{e.preventDefault();setSaving(true);const res=await fetch('/api/time-entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workerId:quickWorkerId,tournamentId:params.id,date:activeDay,clockIn:editForm.clockIn||null,clockOut:editForm.clockOut||null,hoursManual:editForm.hoursManual?parseFloat(editForm.hoursManual):null,notes:editForm.notes||null,isManualEdit:true})});if(res.ok){toast.success('Added');setEditId(null);load()}else toast.error('Failed');setSaving(false)}} className="grid grid-cols-2 gap-3">
                <div><label className="label">Clock In</label><input className="input" type="time" value={editForm.clockIn} onChange={e=>setEditForm(f=>({...f,clockIn:e.target.value}))}/></div>
                <div><label className="label">Clock Out</label><input className="input" type="time" value={editForm.clockOut} onChange={e=>setEditForm(f=>({...f,clockOut:e.target.value}))}/></div>
                <div><label className="label">Manual Hours</label><input className="input" type="number" min="0" step="0.25" value={editForm.hoursManual} onChange={e=>setEditForm(f=>({...f,hoursManual:e.target.value}))} placeholder="Override if needed"/></div>
                <div><label className="label">Notes</label><input className="input" value={editForm.notes} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}/></div>
                <div className="col-span-2 flex gap-2"><button type="submit" className="btn-primary btn-sm" disabled={saving}>Save</button><button type="button" className="btn-secondary btn-sm" onClick={()=>setEditId(null)}>Cancel</button></div>
              </form>
            </div>
          )}

          {dayEntries.length===0?<div className="card p-10 text-center text-slate-400">No time entries for this day.</div>:(
            <div className="card overflow-hidden">
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
                  {dayEntries.map(e=>{
                    const hrs=calcHours(e);const pay=hrs*(e.worker.hourlyRate??0);const active=!!clockedIn[e.workerId]&&clockedIn[e.workerId]===e.id
                    if(editId===e.id)return(
                      <tr key={e.id} className="bg-sky-50">
                        <td className="px-5 py-3 font-semibold">{e.worker.name}</td>
                        <td colSpan={4} className="px-4 py-3">
                          <form onSubmit={saveEdit} className="flex gap-2 items-end flex-wrap">
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
                          {active&&<button onClick={()=>clockOut(e.id)} disabled={saving} className="btn-danger btn-sm mr-2">⏹ Out</button>}
                          <button onClick={()=>{setEditId(e.id);setEditForm({clockIn:e.clockIn??'',clockOut:e.clockOut??'',hoursManual:e.hoursManual!=null?String(e.hoursManual):'',notes:e.notes??''})}} className="text-sky-600 hover:text-sky-800 text-xs font-medium mr-2">Edit</button>
                          <button onClick={()=>del(e.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Del</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
