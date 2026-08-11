'use client'
// Tournament documents — the paperwork vault. Every tournament collects a
// different stack (grant applications, COIs, county permits, venue contracts,
// W9s, post-event reports); this keeps them attached to the tournament instead
// of scattered across email and desktops. Staff-only; files stored as DB blobs.
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileText, Upload, Trash2, Download, FolderOpen } from 'lucide-react'

interface Doc { id:string; name:string; category:string; mime:string; size:number; uploadedBy:string|null; createdAt:string }

const CATEGORIES = ['Grant', 'Insurance', 'Permit', 'Venue', 'Contract', 'Financial', 'Other']

const fmtSize=(n:number)=> n>1024*1024 ? (n/1024/1024).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB'
const fmtDate=(s:string)=>{ const d=new Date(s.includes('T')?s:s.replace(' ','T')+'Z'); return isNaN(d.getTime())?s:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) }

export default function DocumentsPage(){
  const params=useParams(); const id=String(params.id||'')
  const [docs,setDocs]=useState<Doc[]>([])
  const [loading,setLoading]=useState(true)
  const [uploading,setUploading]=useState(false)
  const [category,setCategory]=useState('Grant')
  const [error,setError]=useState('')

  const load=()=>fetch(`/api/tournaments/${id}/documents`).then(r=>r.ok?r.json():[]).then(d=>{setDocs(Array.isArray(d)?d:[]);setLoading(false)}).catch(()=>setLoading(false))
  useEffect(()=>{ if(id) load() },[id])

  const upload=async(file:File)=>{
    setUploading(true); setError('')
    const fd=new FormData(); fd.append('file',file); fd.append('category',category); fd.append('name',file.name)
    const res=await fetch(`/api/tournaments/${id}/documents`,{method:'POST',body:fd})
    if(!res.ok){ const d=await res.json().catch(()=>({})); setError(d.error||'Upload failed') }
    setUploading(false); load()
  }
  const remove=async(doc:Doc)=>{
    if(!confirm(`Delete "${doc.name}"? This can't be undone.`)) return
    await fetch(`/api/tournaments/${id}/documents/${doc.id}`,{method:'DELETE'})
    load()
  }

  const byCat=CATEGORIES.map(c=>({cat:c,items:docs.filter(d=>d.category===c)})).filter(g=>g.items.length>0)
  const uncategorized=docs.filter(d=>!CATEGORIES.includes(d.category))

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2"><FolderOpen size={20} className="text-teal-600"/>Documents</h1>
          <p className="text-sm text-slate-500 mt-1">Tournament paperwork in one place — grant applications, insurance certificates, permits, venue contracts. Staff only.</p>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={category} onChange={e=>setCategory(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
            {CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </select>
          <label className={`cursor-pointer inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg px-4 py-2 ${uploading?'opacity-50 pointer-events-none':''}`}>
            <Upload size={15}/>{uploading?'Uploading…':'Upload file'}
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" disabled={uploading}
              onChange={e=>{ const f=e.target.files?.[0]; if(f) upload(f); e.currentTarget.value='' }}/>
          </label>
          <span className="text-xs text-slate-400">PDF, Word, Excel or image · 10 MB max</span>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {/* List */}
      {loading ? <p className="text-slate-400 text-sm">Loading…</p>
        : docs.length===0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <FileText size={36} className="mx-auto text-slate-300 mb-3"/>
            <p className="text-slate-500 text-sm">No documents yet. Upload the grant application, COI, or permits above — they stay with this tournament.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {[...byCat, ...(uncategorized.length?[{cat:'Uncategorized',items:uncategorized}]:[])].map(g=>(
              <div key={g.cat} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.cat} <span className="text-slate-300 normal-case tracking-normal">· {g.items.length}</span></div>
                {g.items.map(d=>(
                  <div key={d.id} className="px-4 py-3 flex items-center gap-3 border-b border-slate-50 last:border-b-0">
                    <FileText size={18} className="text-slate-300 flex-shrink-0"/>
                    <div className="min-w-0 flex-1">
                      <a href={`/api/tournaments/${id}/documents/${d.id}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-800 hover:text-teal-700 hover:underline truncate block">{d.name}</a>
                      <div className="text-[11px] text-slate-400">{fmtSize(d.size)} · {fmtDate(d.createdAt)}{d.uploadedBy?` · ${d.uploadedBy}`:''}</div>
                    </div>
                    <a href={`/api/tournaments/${id}/documents/${d.id}`} download className="text-slate-400 hover:text-teal-600 flex-shrink-0" title="Download"><Download size={16}/></a>
                    <button onClick={()=>remove(d)} className="text-slate-300 hover:text-red-500 flex-shrink-0" title="Delete"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
