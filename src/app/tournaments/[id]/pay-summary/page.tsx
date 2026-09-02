'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { certLabel, formatDate, formatTime, PAY_METHODS, WORKER_ROLES, ALL_ROLES } from '@/lib/utils'
import { Users, Calendar, Clock, Wallet, Download, ChevronUp, ChevronDown } from 'lucide-react'
import TournamentNav from '../TournamentNav'

interface GameEntry{gameNumber:string;date:string;startTime:string;division:string;location:string;role:string;pay:number}
interface TERow{date:string;clockIn:string|null;clockOut:string|null;hoursManual:number|null;hours:number;pay:number}
interface WS{worker:{id:string;name:string;certLevel:string;defaultRole:string;hourlyRate:number|null;payMethod:string;payHandle:string|null;photoUrl:string|null};games:GameEntry[];timeEntries:TERow[];totalPay:number}
interface Data{summary:WS[];tournamentName:string;tournamentLogo:string}
interface PayRecord{id:string;workerId:string;amount:number;method:string;paidAt:string;notes:string|null}

const rLabel=(r:string)=>ALL_ROLES.find(x=>x.value===r)?.label??WORKER_ROLES.find(x=>x.value===r)?.label??r
const pmLabel=(p:string)=>PAY_METHODS.find(x=>x.value===p)?.label??p

export default function PaySummaryPage({ params }: { params:{id:string} }) {
  const [data,setData]=useState<Data|null>(null)
  const [loading,setLoading]=useState(true)
  const [expanded,setExpanded]=useState<Set<string>>(new Set())
  const [payRecords,setPayRecords]=useState<PayRecord[]>([])
  const [paying,setPaying]=useState<string|null>(null)
  const [search,setSearch]=useState('')
  const [roleFilter,setRoleFilter]=useState('all')
  const [payNote,setPayNote]=useState('')

  async function load(){
    const [dr,pr]=await Promise.all([
      fetch(`/api/tournaments/${params.id}/pay-summary`).then(r=>r.json()),
      fetch(`/api/payment-records?tournamentId=${params.id}`).then(r=>r.json()),
    ])
    setData(dr);setPayRecords(pr);setLoading(false)
  }
  useEffect(()=>{load()},[params.id])

  const toggle=(id:string)=>setExpanded(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})

  function isPaid(workerId:string):PayRecord|undefined{return payRecords.find(r=>r.workerId===workerId)}

  async function markPaid(ws:WS){
    const method=ws.worker.payMethod||'check'
    const res=await fetch('/api/payment-records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workerId:ws.worker.id,tournamentId:params.id,amount:ws.totalPay,method,notes:payNote||null})})
    if(res.ok){setPayNote('');await load()}
  }

  async function unmarkPaid(recordId:string){
    if(!confirm('Remove payment record?'))return
    await fetch(`/api/payment-records/${recordId}`,{method:'DELETE'})
    await load()
  }

  function exportCSV(){
    if(!data)return
    const rows=[['Worker','Role','Cert','Pay Method','Handle','Type','Game#','Date','Time','Division','Field','Role Detail','Pay','Paid','Paid Date']]
    for(const ws of data.summary){
      const pr=isPaid(ws.worker.id)
      for(const g of ws.games)rows.push([ws.worker.name,ws.worker.defaultRole,certLabel(ws.worker.certLevel),pmLabel(ws.worker.payMethod),ws.worker.payHandle??'','Per-Game',g.gameNumber,g.date,g.startTime,g.division,g.location,rLabel(g.role),g.pay.toFixed(2),pr?'YES':'NO',pr?new Date(pr.paidAt).toLocaleDateString():''])
      for(const t of ws.timeEntries)rows.push([ws.worker.name,ws.worker.defaultRole,'—',pmLabel(ws.worker.payMethod),ws.worker.payHandle??'','Hourly','—',t.date,`${t.hours.toFixed(2)}h`,'—','—','—',t.pay.toFixed(2),pr?'YES':'NO',pr?new Date(pr.paidAt).toLocaleDateString():''])
    }
    const total=data.summary.reduce((s,w)=>s+w.totalPay,0)
    rows.push(['','','','','','','','','','','','TOTAL',total.toFixed(2),'',''])
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`${data?.tournamentName.replace(/\s+/g,'_')}_pay.csv`;a.click()
  }

  if(loading)return<div className="text-slate-400 text-center py-12">Loading…</div>
  if(!data)return<div className="text-red-500">Not found</div>
  const total=data.summary.reduce((s,w)=>s+w.totalPay,0)
  const totalPaid=payRecords.reduce((s,r)=>s+r.amount,0)
  const outstanding=total-totalPaid
  const filtered=data.summary
    .filter(ws=>roleFilter==='all'||ws.worker.defaultRole===roleFilter)
    .filter(ws=>!search||ws.worker.name.toLowerCase().includes(search.toLowerCase()))

  return(
    <div>
      <TournamentNav id={params.id} name={data.tournamentName} logoUrl={data.tournamentLogo} />

      {/* Staff sub-nav */}
      <div className="flex items-center gap-0.5 sm:gap-1 mb-5 sm:mb-6 border-b border-slate-200 overflow-x-auto">
        <Link href={`/tournaments/${params.id}/roster`}
          className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
          <Users size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Staff Roster
        </Link>
        <Link href={`/tournaments/${params.id}/availability`}
          className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
          <Calendar size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Availability
        </Link>
        <Link href={`/tournaments/${params.id}/time-entries`}
          className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
          <Clock size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Time Entries
        </Link>
        <Link href={`/tournaments/${params.id}/pay-summary`}
          className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-teal-600 text-teal-700 transition-colors whitespace-nowrap">
          <Wallet size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Pay Summary
        </Link>
      </div>
      <div className="page-header">
        <div>
          <h1 className="section-title">Pay Summary</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            <span className="text-sm text-slate-500">Total: <strong className="text-slate-900">${total.toFixed(2)}</strong></span>
            <span className="text-sm text-emerald-600">Paid: <strong>${totalPaid.toFixed(2)}</strong></span>
            {outstanding>0&&<span className="text-sm text-amber-600">Outstanding: <strong>${outstanding.toFixed(2)}</strong></span>}
          </div>
        </div>
        <button onClick={exportCSV} className="btn-primary btn-sm" disabled={!data.summary.length}><Download size={14} className="inline align-text-bottom mr-1" />CSV</button>
      </div>

      {data.summary.length===0?<div className="card p-12 text-center text-slate-400"><p className="font-medium">No assignments yet</p></div>:(
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <input className="input text-sm flex-1 min-w-0 sm:flex-none sm:!w-48" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
              <label className="text-sm text-slate-500 hidden sm:inline">Role:</label>
              <select className="select !w-auto text-sm flex-shrink-0" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
                <option value="all">All roles</option>
                {WORKER_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{filtered.length} shown</span>
              {(search||roleFilter!=='all')&&<button className="text-xs text-slate-400 hover:text-slate-600 underline" onClick={()=>{setSearch('');setRoleFilter('all')}}>Clear filters</button>}
            </div>
          </div>

          {filtered.map(ws=>{
            const pr=isPaid(ws.worker.id)
            const isExpanded=expanded.has(ws.worker.id)
            const isPaying=paying===ws.worker.id
            return(
              <div key={ws.worker.id} className={`card overflow-hidden transition-all ${pr?'border-emerald-200':''}`}>
                <div className={`px-3 sm:px-5 py-3 sm:py-4 ${pr?'bg-emerald-50':'hover:bg-slate-50'} transition-colors`}>
                <div className="flex items-center justify-between gap-3">
                  <button className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 text-left" onClick={()=>toggle(ws.worker.id)}>
                    <Link href={`/staff/${ws.worker.id}`} onClick={e=>e.stopPropagation()} className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 hover:opacity-75 transition-opacity">
                      {ws.worker.photoUrl
                        ? <img src={ws.worker.photoUrl} alt={ws.worker.name} className="w-10 h-10 object-cover"/>
                        : <div className={`w-10 h-10 flex items-center justify-center font-bold text-sm ${pr?'bg-emerald-200 text-emerald-800':'bg-teal-100 text-teal-700'}`}>{ws.worker.name[0].toUpperCase()}</div>
                      }
                    </Link>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{ws.worker.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-500">{certLabel(ws.worker.certLevel)}</span>
                        <span className="badge bg-slate-100 text-slate-600">{pmLabel(ws.worker.payMethod)}</span>
                        {ws.worker.payHandle&&<span className="text-xs text-slate-400">{ws.worker.payHandle}</span>}
                        {ws.games.length>0&&<span className="text-xs text-slate-400">{ws.games.length} games</span>}
                        {pr&&<span className="badge bg-emerald-100 text-emerald-700">✓ Paid {new Date(pr.paidAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                    <span className={`text-lg sm:text-xl font-bold ${pr?'text-emerald-600':'text-slate-900'}`}>${ws.totalPay.toFixed(2)}</span>
                    {pr?(
                      <button onClick={()=>unmarkPaid(pr.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Unpay</button>
                    ):(
                      <button onClick={()=>setPaying(p=>p===ws.worker.id?null:ws.worker.id)} className="hidden sm:inline-flex btn-secondary btn-sm text-emerald-600 border-emerald-200 hover:bg-emerald-50">Mark Paid</button>
                    )}
                    <button onClick={()=>toggle(ws.worker.id)} className="text-slate-400 p-1 -mr-1" aria-label="Details">{isExpanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                  </div>
                </div>
                {!pr&&(
                  <button onClick={()=>setPaying(p=>p===ws.worker.id?null:ws.worker.id)} className="sm:hidden btn-secondary btn-sm w-full mt-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50">{isPaying?'Cancel':'Mark Paid'}</button>
                )}
                </div>

                {/* Pay form */}
                {isPaying&&!pr&&(
                  <div className="px-3 sm:px-5 py-3 bg-emerald-50 border-t border-emerald-100 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <span className="text-sm font-semibold text-emerald-800">Confirm payment of ${ws.totalPay.toFixed(2)} via {pmLabel(ws.worker.payMethod)}</span>
                    <input className="input flex-1 py-1 text-sm" placeholder="Notes (optional)" value={payNote} onChange={e=>setPayNote(e.target.value)}/>
                    <div className="flex gap-2">
                      <button onClick={()=>{markPaid(ws);setPaying(null)}} className="btn-primary btn-sm flex-1 sm:flex-none" style={{background:'#059669'}}>✓ Confirm</button>
                      <button onClick={()=>setPaying(null)} className="btn-secondary btn-sm flex-1 sm:flex-none">Cancel</button>
                    </div>
                  </div>
                )}

                {isExpanded&&(
                  <div className="border-t border-slate-100">
                    {ws.games.length>0&&<div className="sm:hidden divide-y divide-slate-50">
                      {ws.games.map((g,i)=>(
                        <div key={i} className="px-3 py-2 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-slate-700"><span className="font-mono text-slate-500">#{g.gameNumber}</span> · {formatDate(g.date)} {formatTime(g.startTime)}</div>
                            <div className="text-xs text-slate-400 truncate">{g.division} · {g.location}</div>
                          </div>
                          <span className="badge bg-teal-100 text-teal-700 text-xs flex-shrink-0">{rLabel(g.role)}</span>
                          <span className="text-sm font-semibold flex-shrink-0">${g.pay.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>}
                    {ws.games.length>0&&<table className="hidden sm:table w-full text-sm">
                      <thead className="bg-slate-50"><tr>
                        <th className="text-left px-5 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Game</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Date/Time</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Division</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Field</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Role</th>
                        <th className="text-right px-5 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Pay</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">{ws.games.map((g,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-5 py-2 font-mono text-xs text-slate-600">#{g.gameNumber}</td><td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">{formatDate(g.date)} {formatTime(g.startTime)}</td><td className="px-4 py-2 text-xs text-slate-600">{g.division}</td><td className="px-4 py-2 text-xs text-slate-600">{g.location}</td><td className="px-4 py-2"><span className="badge bg-teal-100 text-teal-700 text-xs">{rLabel(g.role)}</span></td><td className="px-5 py-2 text-right font-semibold">${g.pay.toFixed(2)}</td></tr>)}</tbody>
                    </table>}
                    {ws.timeEntries.length>0&&<div className="sm:hidden divide-y divide-slate-50 border-t border-amber-100">
                      {ws.timeEntries.map((t,i)=>(
                        <div key={i} className="px-3 py-2 flex items-center gap-3">
                          <div className="min-w-0 flex-1 text-xs text-slate-600">{formatDate(t.date)} · <span className="font-semibold">{t.hoursManual!=null?`${t.hoursManual}h (manual)`:`${t.hours.toFixed(2)}h`}</span></div>
                          <span className="text-sm font-semibold flex-shrink-0">${t.pay.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>}
                    {ws.timeEntries.length>0&&<table className="hidden sm:table w-full text-sm">
                      <thead className="bg-amber-50"><tr><th className="text-left px-5 py-2 text-xs text-amber-700 font-semibold uppercase tracking-wide">Date</th><th className="text-left px-4 py-2 text-xs text-amber-700 font-semibold uppercase tracking-wide">Hours</th><th className="text-right px-5 py-2 text-xs text-amber-700 font-semibold uppercase tracking-wide">Pay</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">{ws.timeEntries.map((t,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-5 py-2 text-xs text-slate-600">{formatDate(t.date)}</td><td className="px-4 py-2 text-xs font-semibold">{t.hoursManual!=null?`${t.hoursManual}h (manual)`:`${t.hours.toFixed(2)}h`}</td><td className="px-5 py-2 text-right font-semibold">${t.pay.toFixed(2)}</td></tr>)}</tbody>
                    </table>}
                    <div className="bg-slate-50 border-t border-slate-100 px-3 sm:px-5 py-3 flex justify-between text-sm font-bold"><span className="text-slate-600">Subtotal</span><span className={pr?'text-emerald-600':'text-slate-900'}>${ws.totalPay.toFixed(2)}</span></div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="card px-4 sm:px-6 py-4 sm:py-5 flex justify-between items-center" style={{background:'#0d9488',borderColor:'#0d9488'}}>
            <div><p className="font-bold text-white text-lg">Total Payout</p>{outstanding>0&&<p className="text-teal-200 text-sm">${outstanding.toFixed(2)} outstanding</p>}</div>
            <span className="text-3xl font-bold text-white">${total.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
