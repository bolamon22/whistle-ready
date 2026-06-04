'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { DEFAULT_PAY_RATES, PayRates } from '@/lib/utils'
import TournamentNav from '../TournamentNav'

const RATE_FIELDS=[{key:'youth',label:'Referee – Youth Cert'},{key:'hs',label:'Referee – HS Cert'},{key:'college',label:'Referee – College Cert'},{key:'scorekeeper',label:'Scorekeeper'},{key:'athletic_trainer',label:'Athletic Trainer (hourly base)'},{key:'field_ops',label:'Field Ops (hourly base)'},{key:'assigner',label:'Assigner bonus'}]

export default function SettingsPage({ params }: { params:{id:string} }) {
  const DEFAULT_PRICING = { tier1: 1495, tier1Max: 3, tier2: 1450, tier2Max: 6, tier3: 1395, sevenVSeven: 1095 }
  const DEFAULT_DIVISIONS = [
    'Boys High School A','Boys High School B','Boys High School B2',
    'Boys U14 A and B','Boys U12 A and B',
    'Boys U10 A and B (7v7)','Boys U10 A and B (10v10)','Boys U8 (7v7)',
    'Girls High School A','Girls High School B','Girls High School B2',
    'Girls Middle School A','Girls Middle School B (No 2030's)',
    'Girls Lower School A (7v7)','Girls Lower School B (7v7 – No 2033's)',
  ]
  const [name,setName]=useState('');const [rates,setRates]=useState<PayRates>(DEFAULT_PAY_RATES);const [divRules,setDivRules]=useState<Record<string,number>>({});const [pricing,setPricing]=useState(DEFAULT_PRICING);const [divisions,setDivisions]=useState<string[]>(DEFAULT_DIVISIONS);const [newDivision,setNewDivision]=useState('');const [tName,setTName]=useState('');const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [newKeyword,setNewKeyword]=useState('');const [newCount,setNewCount]=useState('1')
  useEffect(()=>{fetch(`/api/tournaments/${params.id}`).then(r=>r.json()).then(t=>{setName(t.name);setTName(t.name);setRates({...DEFAULT_PAY_RATES,...JSON.parse(t.payRates)});setDivRules(JSON.parse(t.divisionRules||'{}'));try{const p=JSON.parse(t.registrationPricing||'{}');if(p.tier1)setPricing(p)}catch{}try{const d=JSON.parse(t.registrationDivisions||'[]');if(d.length>0)setDivisions(d)}catch{}setLoading(false)})},[params.id])
  async function save(e:React.FormEvent){e.preventDefault();setSaving(true);const res=await fetch(`/api/tournaments/${params.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,payRates:rates,divisionRules:divRules,registrationPricing:JSON.stringify(pricing),registrationDivisions:JSON.stringify(divisions)})});if(res.ok){toast.success('Saved');setTName(name)}else toast.error('Failed');setSaving(false)}
  function addRule(){if(!newKeyword.trim())return;setDivRules(r=>({...r,[newKeyword.trim()]:parseInt(newCount)||1}));setNewKeyword('');setNewCount('1')}
  function removeRule(k:string){setDivRules(r=>{const n={...r};delete n[k];return n})}
  if(loading)return<div className="text-slate-400 text-center py-12">Loading…</div>
  return(
    <div className="max-w-xl">
      <TournamentNav id={params.id} name={tName} />
      <div className="page-header"><h1 className="section-title">Tournament Settings</h1></div>
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
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-1">Registration Fees</h2>
          <p className="text-xs text-slate-400 mb-4">Default fees apply unless overridden here. These show on the public registration form.</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-slate-700">1–<input type="number" min="1" max="10" className="input w-14 text-center inline-block mx-1 px-1" value={pricing.tier1Max} onChange={e=>setPricing(p=>({...p,tier1Max:parseInt(e.target.value)||3}))}/> teams (per team)</p>
              <div className="flex items-center gap-1.5"><span className="text-slate-400 text-sm">$</span><input type="number" min="0" step="1" className="input w-24 text-right" value={pricing.tier1} onChange={e=>setPricing(p=>({...p,tier1:parseFloat(e.target.value)||0}))}/></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-slate-700">{pricing.tier1Max+1}–<input type="number" min="1" max="20" className="input w-14 text-center inline-block mx-1 px-1" value={pricing.tier2Max} onChange={e=>setPricing(p=>({...p,tier2Max:parseInt(e.target.value)||6}))}/> teams (per team)</p>
              <div className="flex items-center gap-1.5"><span className="text-slate-400 text-sm">$</span><input type="number" min="0" step="1" className="input w-24 text-right" value={pricing.tier2} onChange={e=>setPricing(p=>({...p,tier2:parseFloat(e.target.value)||0}))}/></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-slate-700">{pricing.tier2Max+1}+ teams (per team)</p>
              <div className="flex items-center gap-1.5"><span className="text-slate-400 text-sm">$</span><input type="number" min="0" step="1" className="input w-24 text-right" value={pricing.tier3} onChange={e=>setPricing(p=>({...p,tier3:parseFloat(e.target.value)||0}))}/></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-slate-700">7v7 teams (per team)</p>
              <div className="flex items-center gap-1.5"><span className="text-slate-400 text-sm">$</span><input type="number" min="0" step="1" className="input w-24 text-right" value={pricing.sevenVSeven} onChange={e=>setPricing(p=>({...p,sevenVSeven:parseFloat(e.target.value)||0}))}/></div>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <button type="button" onClick={()=>setPricing(DEFAULT_PRICING)} className="text-xs text-slate-400 hover:text-slate-600 underline">Reset to defaults</button>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-1">Registration Divisions</h2>
          <p className="text-xs text-slate-400 mb-4">Check the divisions offered in this tournament. You can rename any division inline.</p>
          <div className="space-y-1.5 mb-4">
            {DEFAULT_DIVISIONS.map((defaultDiv, i) => {
              const activeIndex = divisions.indexOf(defaultDiv)
              const isChecked = activeIndex !== -1
              const customName = isChecked ? divisions[activeIndex] : defaultDiv
              return (
                <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                  <input type="checkbox" checked={isChecked}
                    onChange={e => {
                      if (e.target.checked) setDivisions(d => [...d, defaultDiv])
                      else setDivisions(d => d.filter(v => v !== customName))
                    }}
                    className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                  {isChecked ? (
                    <input
                      className="input flex-1 py-0.5 text-sm"
                      value={customName}
                      onChange={e => setDivisions(d => d.map(v => v === customName ? e.target.value : v))}
                    />
                  ) : (
                    <span className="text-sm text-slate-400 flex-1">{defaultDiv}</span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs text-slate-500 font-medium">Add a custom division</p>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="e.g. Boys U9 (7v7)" value={newDivision} onChange={e=>setNewDivision(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(newDivision.trim()){setDivisions(d=>[...d,newDivision.trim()]);setNewDivision('')}}}}/>
              <button type="button" className="btn-secondary btn-sm" onClick={()=>{if(newDivision.trim()){setDivisions(d=>[...d,newDivision.trim()]);setNewDivision('')}}}>Add</button>
            </div>
            {divisions.filter(d => !DEFAULT_DIVISIONS.includes(d)).map((d, i) => (
              <div key={i} className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2">
                <input type="checkbox" checked readOnly className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                <input className="input flex-1 py-0.5 text-sm" value={d}
                  onChange={e => setDivisions(divs => divs.map(v => v === d ? e.target.value : v))} />
                <button type="button" onClick={() => setDivisions(divs => divs.filter(v => v !== d))} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={()=>setDivisions(DEFAULT_DIVISIONS)} className="text-xs text-slate-400 hover:text-slate-600 underline mt-3 block">Reset to defaults</button>
        </div>
        <button type="submit" className="btn-primary w-full btn-lg" disabled={saving}>{saving?'Saving…':'Save Settings'}</button>
      </form>
    </div>
  )
}
