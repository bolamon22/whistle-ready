'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { certLabel, PAY_METHODS, WORKER_ROLES, formatDate } from '@/lib/utils'

interface Worker { id:string;name:string;email:string|null;phone:string|null;certLevel:string;defaultRole:string;gender:string;payMethod:string;payHandle:string|null;isAssigner:boolean;hourlyRate:number|null;payRateOverride:number|null;notes:string|null;photoUrl:string|null }
interface PayRecord { id:string;amount:number;method:string;paidAt:string;notes:string|null;tournament:{id:string;name:string} }

const pmLabel=(p:string)=>PAY_METHODS.find(x=>x.value===p)?.label??p
const rLabel=(r:string)=>WORKER_ROLES.find(x=>x.value===r)?.label??r
const GENDERS=[{value:'both',label:'Boys & Girls'},{value:'boys',label:'Boys only'},{value:'girls',label:'Girls only'}]
const gLabel=(g:string)=>GENDERS.find(x=>x.value===g)?.label??g

export default function StaffProfilePage({ params }: { params:{id:string} }) {
  const [worker,setWorker]=useState<Worker|null>(null)
  const [payments,setPayments]=useState<PayRecord[]>([])
  const [loading,setLoading]=useState(true)
  const [notes,setNotes]=useState('')
  const [notesSaving,setNotesSaving]=useState(false)
  const [notesEditing,setNotesEditing]=useState(false)
  const [photoUploading,setPhotoUploading]=useState(false)
  const fileInputRef=useRef<HTMLInputElement>(null)

  useEffect(()=>{
    Promise.all([
      fetch(`/api/workers/${params.id}`).then(r=>r.json()),
      fetch(`/api/payment-records?workerId=${params.id}`).then(r=>r.json()),
    ]).then(([w,p])=>{setWorker(w);setNotes(w.notes??'');setPayments(p);setLoading(false)})
  },[params.id])

  async function saveNotes(){
    setNotesSaving(true)
    await fetch(`/api/workers/${params.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes:notes||null})})
    toast.success('Notes saved')
    setNotesSaving(false);setNotesEditing(false)
    if(worker)setWorker({...worker,notes:notes||null})
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]
    if(!file)return
    setPhotoUploading(true)
    try{
      const fd=new FormData();fd.append('file',file)
      const res=await fetch('/api/upload',{method:'POST',body:fd})
      const {url}=await res.json()
      await fetch(`/api/workers/${params.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({photoUrl:url})})
      if(worker)setWorker({...worker,photoUrl:url})
      toast.success('Photo updated!')
    }catch{toast.error('Upload failed')}
    finally{setPhotoUploading(false)}
  }

  async function removePhoto(){
    await fetch(`/api/workers/${params.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({photoUrl:null})})
    if(worker)setWorker({...worker,photoUrl:null})
    toast.success('Photo removed')
  }

  if(loading)return<div className="text-slate-400 text-center py-12">Loading…</div>
  if(!worker)return<div className="text-red-500">Not found</div>

  const totalEarned=payments.reduce((s,p)=>s+p.amount,0)

  return(
    <div className="max-w-2xl">
      <div className="breadcrumb"><Link href="/staff" className="hover:text-sky-600">Staff Pool</Link><span>/</span><span className="text-slate-700">{worker.name}</span></div>

      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* Avatar / photo */}
            <div className="relative group flex-shrink-0">
              {worker.photoUrl ? (
                <img src={worker.photoUrl} alt={worker.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-200"/>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-2xl border-2 border-transparent">
                  {worker.name[0].toUpperCase()}
                </div>
              )}
              <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={photoUploading}
                className="absolute inset-0 rounded-2xl bg-black/50 text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {photoUploading ? '…' : '📷'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload}/>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-900">{worker.name}</h1>
              <p className="text-slate-500">{rLabel(worker.defaultRole)}{worker.defaultRole==='ref'?` · ${certLabel(worker.certLevel)}`:''}</p>
              {worker.isAssigner&&<span className="badge bg-amber-100 text-amber-700 mt-1">Assigner</span>}
              <div className="flex items-center gap-2 mt-1">
                <button onClick={()=>fileInputRef.current?.click()} disabled={photoUploading}
                  className="text-xs text-sky-600 hover:text-sky-800 font-medium">
                  {photoUploading?'Uploading…':worker.photoUrl?'Replace photo':'+ Upload photo'}
                </button>
                {worker.photoUrl&&<>
                  <span className="text-slate-300">·</span>
                  <button onClick={removePhoto} className="text-xs text-red-400 hover:text-red-600 font-medium">Remove</button>
                </>}
              </div>
            </div>
          </div>
          <Link href="/staff" className="btn-secondary btn-sm">← Staff Pool</Link>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {worker.phone&&<div><p className="label">Phone</p><p className="text-slate-800">{worker.phone}</p></div>}
          {worker.email&&<div><p className="label">Email</p><p className="text-slate-800">{worker.email}</p></div>}
          {worker.defaultRole==='ref'&&<div><p className="label">Can Ref</p><p className="text-slate-800">{gLabel(worker.gender)}</p></div>}
          <div><p className="label">Pay Method</p><p className="text-slate-800">{pmLabel(worker.payMethod)}{worker.payHandle?` · ${worker.payHandle}`:''}</p></div>
          {worker.payRateOverride&&<div><p className="label">Pay Rate</p><p className="text-slate-800">${worker.payRateOverride}/game</p></div>}
          {worker.hourlyRate&&<div><p className="label">Hourly Rate</p><p className="text-slate-800">${worker.hourlyRate}/hr</p></div>}
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="label mb-0">Notes</p>
            {!notesEditing&&<button onClick={()=>setNotesEditing(true)} className="text-xs text-sky-600 hover:text-sky-800 font-medium">{worker.notes?'Edit':'+ Add note'}</button>}
          </div>
          {notesEditing?(
            <div>
              <textarea className="input w-full min-h-[80px] resize-y text-sm" value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="Any notes about this staff member…" autoFocus/>
              <div className="flex gap-2 mt-2">
                <button onClick={saveNotes} className="btn-primary btn-sm" disabled={notesSaving}>{notesSaving?'Saving…':'Save'}</button>
                <button onClick={()=>{setNotesEditing(false);setNotes(worker.notes??'')}} className="btn-secondary btn-sm">Cancel</button>
              </div>
            </div>
          ):(
            worker.notes
              ?<p className="text-sm text-slate-700 whitespace-pre-wrap">{worker.notes}</p>
              :<p className="text-sm text-slate-400 italic">No notes</p>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Payment History</h2>
          <div className="text-right">
            <p className="text-sm text-slate-500">All-time paid</p>
            <p className="text-xl font-bold text-emerald-600">${totalEarned.toFixed(2)}</p>
          </div>
        </div>
        {payments.length===0?(
          <div className="p-8 text-center text-slate-400 text-sm">No payments recorded yet</div>
        ):(
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100"><tr>
              <th className="text-left px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Tournament</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Date Paid</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Method</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Notes</th>
              <th className="text-right px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map(p=>(
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{p.tournament.name}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(p.paidAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><span className="badge bg-slate-100 text-slate-600">{pmLabel(p.method)}</span></td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{p.notes||'—'}</td>
                  <td className="px-5 py-3 text-right font-bold text-emerald-600">${p.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-emerald-50 border-t border-emerald-100">
              <tr><td colSpan={4} className="px-5 py-3 font-bold text-emerald-800">Total</td><td className="px-5 py-3 text-right font-bold text-emerald-700 text-lg">${totalEarned.toFixed(2)}</td></tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
