'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { DEFAULT_PAY_RATES, PayRates } from '@/lib/utils'

const RATE_FIELDS=[{key:'youth',label:'Referee – Youth Cert'},{key:'hs',label:'Referee – HS Cert'},{key:'college',label:'Referee – College Cert'},{key:'scorekeeper',label:'Scorekeeper'},{key:'athletic_trainer',label:'Athletic Trainer (hourly base)'},{key:'field_ops',label:'Field Ops (hourly base)'},{key:'assigner',label:'Assigner bonus'}]

export default function SettingsPage({ params }: { params:{id:string} }) {
  const [name,setName]=useState('');const [rates,setRates]=useState<PayRates>(DEFAULT_PAY_RATES);const [divRules,setDivRules]=useState<Record<string,number>>({});const [tName,setTName]=useState('');const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [newKeyword,setNewKeyword]=useState('');const [newCount,setNewCount]=useState('1')
  useEffect(()=>{fetch(`/api/tournaments/${params.id}`).then(r=>r.json()).then(t=>{setName(t.name);setTName(t.name);setRates({...DEFAULT_PAY_RATES,...JSON.parse(t.payRates)});setDivRules(JSON.parse(t.divisionRules||'{}'));setLoading(false)})},[params.id])
  async function save(e:React.FormEvent){e.preventDefault();setSaving(true);const res=await fetch(`/api/tournaments/${params.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,payRates:rates,divisionRules:divRules})});if(res.ok){toast.success('Saved');setTName(name)}else toast.error('Failed');setSaving(false)}
  function addRule(){if(!newKeyword.trim())return;setDivRules(r=>({...r,[newKeyword.trim()]:parseInt(newCount)||1}));setNewKeyword('');setNewCount('1')}
  function removeRule(k:string){setDivRules(r=>{const n={...r};delete n[k];return n})}
  if(loading)return<div className="text-slate-400 text-center py-12">Loading…</div>
  return(
    <div className="max-w-xl">
      <div className="breadcrumb"><Link href="/" className="hover:text-sky-600">Tournaments</Link><span>/</span><Link href={`/tournaments/${params.id}`} className="hover:text-sky-600">{tName}</Link><span>/</span><span className="text-slate-700">Settings</span></div>
      <div className="page-header"><h1 className="section-title">Tournament Settings</h1><Link href={`/tournaments/${params.id}`} className="btn-secondary btn-sm">← Grid</Link></div>
      <form onSubmit={save} className="space-y-5">
        <div className="card p-5"><h2 className="font-semibold text-slate-800 mb-4">General</h2><div><label className="label">Tournament Name</label><input className="input" value={name} onChange={e=>setName(e.target.value)} required/></div></div>
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-1">Pay Rates (per game)</h2>
          <p className="text-xs text-slate-400 mb-4">Staff pay rate overrides take priority over these defaults.</p>
          <div className="space-y-3">{RATE_FIELDS.map(f=><div key={f.key} className="flex items-center justify-between gap-4"><p className="text-sm font-medium text-slate-700">{f.label}</p><div className="flex items-center gap-1.5"><span className="text-slate-400 text-sm">$</span><input type="number" min="0" step="0.01" className="input w-24 text-right" value={rates[f.key]??0} onChange={e=>setRates(r=>({...r,[f.key]:parseFloat(e.target.value)||0}))}/></div></div>)}</div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-1">Division Ref Count Rules</h2>
          <p className="text-xs text-slate-400 mb-4">Set ref count for divisions containing a keyword. e.g. "7v7" → 1 ref.</p>
          <div className="space-y-2 mb-4">{Object.entries(divRules).map(([k,v])=><div key={k} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2"><span className="text-sm font-medium text-slate-700">"{k}" → <strong>{v} ref{v!==1?'s':''}</strong></span><button type="button" onClick={()=>removeRule(k)} className="text-red-400 hover:text-red-600 text-xs">Remove</button></div>)}</div>
          <div className="flex gap-2 items-end">
            <div className="flex-1"><label className="label">Division keyword</label><input className="input" value={newKeyword} onChange={e=>setNewKeyword(e.target.value)} placeholder="e.g. 7v7, U8, Lower School"/></div>
            <div className="w-24"><label className="label">Ref count</label><select className="select" value={newCount} onChange={e=>setNewCount(e.target.value)}><option value="1">1 ref</option><option value="2">2 refs</option><option value="3">3 refs</option></select></div>
            <button type="button" onClick={addRule} className="btn-secondary btn-sm mb-0.5">Add</button>
          </div>
        </div>
        <button type="submit" className="btn-primary w-full btn-lg" disabled={saving}>{saving?'Saving…':'Save Settings'}</button>
      </form>
    </div>
  )
}
