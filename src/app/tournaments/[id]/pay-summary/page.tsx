'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { certLabel, formatDate, formatTime, PAY_METHODS, WORKER_ROLES, ALL_ROLES } from '@/lib/utils'

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
      <div className="breadcrumb"><Link href="/" className="hover:text-sky-600">Tournaments</Link><span>/</span><Link href={`/tournaments/${params.id}`} className="hover:text-sky-600">{data.tournamentName}</Link><span>/</span><span className="text-slate-700">Pay Report</span></div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          {data.tournamentLogo && <img src={data.tournamentLogo} alt="logo" className="h-12 w-12 object-contain rounded-xl border border-slate-200 bg-slate-50 flex-shrink-0" />}
          <div>
          <h1 className="section-title">Pay Summary</h1>
          <div className="flex gap-4 mt-2">
            <span className="text-sm text-slate-500">Total: <strong className="text-slate-900">${total.toFixed(2)}</strong></span>
            <span className="text-sm text-emerald-600">Paid: <strong>${totalPaid.toFixed(2)}</strong></span>
            {outstanding>0&&<span className="text-sm text-amber-600">Outstanding: <strong>${outstanding.toFixed(2)}</strong></span>}
          </div>
          </div>
        </div>
        <div className="flex gap-2"><Link href={`/tournaments/${params.id}`} className="btn-secondary btn-sm">← Grid</Link><button onClick={exportCSV} className="btn-primary btn-sm" disabled={!data.summary.length}>↓ CSV</button></div>
      </div>

      {data.summary.length===0?<div className="card p-12 text-center text-slate-400"><p className="font-medium">No assignments yet</p></div>:(
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <input className="input !w-48 text-sm" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <label className="text-sm text-slate-500">Role:</label>
            <select className="select !w-auto text-sm" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              {WORKER_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="text-xs text-slate-400">{filtered.length} shown</span>
            {(search||roleFilter!=='all')&&<button className="text-xs text-slate-400 hover:text-slate-600" onClick={()=>{setSearch('');setRoleFilter('all')}}>Clear filters</button>}
          </div>

          {filtered.map(ws=>{
            const pr=isPaid(ws.worker.id)
            const isExpanded=expanded.has(ws.worker.id)
            const isPaying=paying===ws.worker.id
            return(
              <div key={ws.worker.id} className={`card overflow-hidden transition-all ${pr?'border-emerald-200':''}`}>
                <div className={`flex items-center justify-between px-5 py-4 ${pr?'bg-emerald-50':'hover:bg-slate-50'} transition-colors`}>
                  <button className="flex items-center gap-4 flex-1 text-left" onClick={()=>toggle(ws.worker.id)}>
                    <Link href={`/staff/${ws.worker.id}`} onClick={e=>e.stopPropagation()} className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 hover:opacity-75 transition-opacity">
                      {ws.worker.photoUrl
                        ? <img src={ws.worker.photoUrl} alt={ws.worker.name} className="w-10 h-10 object-cover"/>
                        : <div className={`w-10 h-10 flex items-center justify-center font-bold text-sm ${pr?'bg-emerald-200 text-emerald-800':'bg-sky-100 text-sky-700'}`}>{ws.worker.name[0].toUpperCase()}</div>
                      }
                    </Link>
                    <div>
                      <p className="font-bold text-slate-900">{ws.worker.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{certLabel(ws.worker.certLevel)}</span>
                        <span className="badge bg-slate-100 text-slate-600">{pmLabel(ws.worker.payMethod)}</span>
                        {ws.worker.payHandle&&<span className="text-xs text-slate-400">{ws.worker.payHandle}</span>}
                        {ws.games.length>0&&<span className="text-xs text-slate-400">{ws.games.length} games</span>}
                        {pr&&<span className="badge bg-emerald-100 text-emerald-700">✓ Paid {new Date(pr.paidAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-4">
                    <span className={`text-xl font-bold ${pr?'text-emerald-600':'text-slate-900'}`}>${ws.totalPay.toFixed(2)}</span>
                    {pr?(
                      <button onClick={()=>unmarkPaid(pr.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Unpay</button>
                    ):(
                      <button onClick={()=>setPaying(p=>p===ws.worker.id?null:ws.worker.id)} className="btn-secondary btn-sm text-emerald-600 border-emerald-200 hover:bg-emerald-50">Mark Paid</button>
                    )}
                    <span className="text-slate-400">{isExpanded?'▲':'▼'}</span>
                  </div>
                </div>

                {/* Pay form */}
                {isPaying&&!pr&&(
                  <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-100 flex items-center gap-3">
                    <span className="text-sm font-semibold text-emerald-800">Confirm payment of ${ws.totalPay.toFixed(2)} via {pmLabel(ws.worker.payMethod)}</span>
                    <input className="input flex-1 py-1 text-sm" placeholder="Notes (optional)" value={payNote} onChange={e=>setPayNote(e.target.value)}/>
                    <button onClick={()=>{markPaid(ws);setPaying(null)}} className="btn-primary btn-sm" style={{background:'#059669'}}>✓ Confirm</button>
                    <button onClick={()=>setPaying(null)} className="btn-secondary btn-sm">Cancel</button>
                  </div>
                )}

                {isExpanded&&(
                  <div className="border-t border-slate-100">
                    {ws.games.length>0&&<table className="w-full text-sm">
                      <thead className="bg-slate-50"><tr>
                        <th className="text-left px-5 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Game</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Date/Time</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Division</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Field</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Role</th>
                        <th className="text-right px-5 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide">Pay</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">{ws.games.map((g,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-5 py-2 font-mono text-xs text-slate-600">#{g.gameNumber}</td><td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">{formatDate(g.date)} {formatTime(g.startTime)}</td><td className="px-4 py-2 text-xs text-slate-600">{g.division}</td><td className="px-4 py-2 text-xs text-slate-600">{g.location}</td><td className="px-4 py-2"><span className="badge bg-sky-100 text-sky-700 text-xs">{rLabel(g.role)}</span></td><td className="px-5 py-2 text-right font-semibold">${g.pay.toFixed(2)}</td></tr>)}</tbody>
                    </table>}
                    {ws.timeEntries.length>0&&<table className="w-full text-sm">
                      <thead className="bg-orange-50"><tr><th className="text-left px-5 py-2 text-xs text-orange-600 font-semibold uppercase tracking-wide">Date</th><th className="text-left px-4 py-2 text-xs text-orange-600 font-semibold uppercase tracking-wide">Hours</th><th className="text-right px-5 py-2 text-xs text-orange-600 font-semibold uppercase tracking-wide">Pay</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">{ws.timeEntries.map((t,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-5 py-2 text-xs text-slate-600">{formatDate(t.date)}</td><td className="px-4 py-2 text-xs font-semibold">{t.hoursManual!=null?`${t.hoursManual}h (manual)`:`${t.hours.toFixed(2)}h`}</td><td className="px-5 py-2 text-right font-semibold">${t.pay.toFixed(2)}</td></tr>)}</tbody>
                    </table>}
                    <div className="bg-slate-50 border-t border-slate-100 px-5 py-3 flex justify-between text-sm font-bold"><span className="text-slate-600">Subtotal</span><span className={pr?'text-emerald-600':'text-slate-900'}>${ws.totalPay.toFixed(2)}</span></div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="card px-6 py-5 flex justify-between items-center" style={{background:'linear-gradient(135deg,#0ea5e9,#0284c7)',borderColor:'#0284c7'}}>
            <div><p className="font-bold text-white text-lg">Total Payout</p>{outstanding>0&&<p className="text-sky-200 text-sm">${outstanding.toFixed(2)} outstanding</p>}</div>
            <span className="text-3xl font-bold text-white">${total.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
