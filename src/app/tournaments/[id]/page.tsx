'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatTime, formatDate, certLabel, GRID_ROLES, getDivisionColor, resetDivisionColors } from '@/lib/utils'
import TournamentNav from './TournamentNav'

interface Worker { id:string;name:string;certLevel:string;defaultRole:string;roles:string;gender:string;payRateOverride:number|null }
interface Assignment { id:string;workerId:string;role:string;payRate:number;worker:Worker }
interface Game { id:string;gameNumber:string;date:string;startTime:string;division:string;pool:string|null;location:string;team1:string;team2:string;score1:number|null;score2:number|null;refCount:number;isChampionship:boolean;isCanceled:boolean;assignments:Assignment[] }
interface Tournament { id:string;name:string;dates:string;divisionRules:string;logoUrl:string }
interface Availability { workerId:string;date:string;timeSlots:string }
interface RosterEntry { workerId:string;gameTarget:number }
interface GapEntry { gameNumber:string;division:string;location:string;missingRoles:string[] }

const FIELD_LABELS=[{key:'gameNumber',label:'Game Number',required:true},{key:'date',label:'Game Date',required:true},{key:'startTime',label:'Start Time',required:true},{key:'division',label:'Division',required:true},{key:'location',label:'Location / Field',required:true},{key:'team1',label:'Team 1',required:true},{key:'team2',label:'Team 2',required:true},{key:'pool',label:'Pool',required:false}]

// Searchable dropdown component
function SearchSelect({ value, onChange, options, placeholder, assigned, disabled }: {
  value: string; onChange: (v:string)=>void
  options: {id:string;label:string;sublabel?:string;warning?:boolean}[]
  placeholder: string; assigned: boolean; disabled: boolean
}) {
  const [open,setOpen]=useState(false)
  const [search,setSearch]=useState('')
  const ref=useRef<HTMLDivElement>(null)
  const inputRef=useRef<HTMLInputElement>(null)

  useEffect(()=>{
    function handle(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}
    document.addEventListener('mousedown',handle)
    return()=>document.removeEventListener('mousedown',handle)
  },[])

  const selected=options.find(o=>o.id===value)
  const filtered=options.filter(o=>o.label.toLowerCase().includes(search.toLowerCase()))

  return(
    <div ref={ref} className="relative w-full">
      <div
        className={`flex items-center gap-1 rounded-md border px-1 h-5 cursor-text text-[10px] transition-colors ${assigned?'border-sky-400 font-semibold':'border-slate-200'} ${disabled?'opacity-50 cursor-not-allowed':''}`}
        style={assigned?{background:'#e0f2fe'}:{background:'rgba(255,255,255,0.85)'}}
        onClick={()=>{if(!disabled){setOpen(true);setTimeout(()=>inputRef.current?.focus(),50)}}}
      >
        {open?(
          <input ref={inputRef} className="w-full bg-transparent outline-none text-[10px] text-slate-800" value={search} onChange={e=>setSearch(e.target.value)} placeholder="type to search…" onClick={e=>e.stopPropagation()}/>
        ):(
          <span className={`truncate ${assigned?'text-sky-800':'text-slate-400'}`}>{selected?.label||placeholder}</span>
        )}
      </div>
      {open&&(
        <div className="absolute z-50 left-0 top-6 w-52 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            <div className="px-2 py-1.5 text-[10px] text-slate-400 hover:bg-slate-50 cursor-pointer border-b border-slate-100" onClick={()=>{onChange('');setOpen(false);setSearch('')}}>— unassigned —</div>
            {filtered.length===0?<div className="px-3 py-2 text-[10px] text-slate-400">No matches</div>:filtered.map(o=>(
              <div key={o.id} onClick={()=>{onChange(o.id);setOpen(false);setSearch('')}}
                className={`px-2 py-1.5 cursor-pointer hover:bg-sky-50 ${o.id===value?'bg-sky-100':''}`}>
                <div className={`text-[11px] font-medium ${o.warning?'text-amber-600':'text-slate-800'}`}>{o.warning?'⚠ ':''}{o.label}</div>
                {o.sublabel&&<div className="text-[10px] text-slate-400">{o.sublabel}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GridPage({ params }: { params:{id:string} }) {
  const [tournament,setTournament]=useState<Tournament|null>(null)
  const [games,setGames]=useState<Game[]>([])
  const [workers,setWorkers]=useState<Worker[]>([])
  const [avails,setAvails]=useState<Availability[]>([])
  const [roster,setRoster]=useState<RosterEntry[]>([])
  const [loading,setLoading]=useState(true)
  const [activeDay,setActiveDay]=useState('')
  const [assigningGame,setAssigningGame]=useState<string|null>(null)
  const fileRef=useRef<HTMLInputElement>(null)

  // Import state
  const [importStep,setImportStep]=useState<'idle'|'mapping'|'importing'>('idle')
  const [pendingFile,setPendingFile]=useState<File|null>(null)
  const [headers,setHeaders]=useState<string[]>([])
  const [preview,setPreview]=useState<Record<string,string>[]>([])
  const [mapping,setMapping]=useState<Record<string,string>>({})

  // Auto-assign state
  const [showAutoAssign,setShowAutoAssign]=useState(false)
  const [stickyScorekeeper,setStickyScorekeeper]=useState(true)
  const [autoAssigning,setAutoAssigning]=useState(false)
  const [autoResult,setAutoResult]=useState<{assigned:number;gaps:GapEntry[];missingRefs:number;missingSKs:number;summary:string}|null>(null)

  // Clear assignments state
  const [showClear,setShowClear]=useState(false)
  const [clearConfirm,setClearConfirm]=useState('')
  const [clearName,setClearName]=useState('')
  const [clearSaving,setClearSaving]=useState(false)

  // View mode
  const [viewMode,setViewMode]=useState<'grid'|'list'|'division'|'staff'>('grid')
  const [staffViewId,setStaffViewId]=useState('')
  const [listSearch,setListSearch]=useState('')
  const [listDivFilter,setListDivFilter]=useState('all')

  // Inline assignment expand (list/division views)
  const [assignExpandId,setAssignExpandId]=useState<string|null>(null)

  // Drag and drop
  const [dragGame,setDragGame]=useState<Game|null>(null)
  const [dragOver,setDragOver]=useState<{time:string;field:string}|null>(null)

  // Collapsible field columns
  const [collapsedFields,setCollapsedFields]=useState<Set<string>>(new Set())
  function toggleField(f:string){setCollapsedFields(s=>{const n=new Set(s);n.has(f)?n.delete(f):n.add(f);return n})}

  // Collapsible time rows
  const [collapsedTimes,setCollapsedTimes]=useState<Set<string>>(new Set())
  function toggleTime(t:string){setCollapsedTimes(s=>{const n=new Set(s);n.has(t)?n.delete(t):n.add(t);return n})}

  // Game edit/add
  const [editGame,setEditGame]=useState<Game|null>(null)
  const [showAddGame,setShowAddGame]=useState(false)
  const [gameForm,setGameForm]=useState<Record<string,unknown>>({})
  const [gameSaving,setGameSaving]=useState(false)

  const load=useCallback(async()=>{
    const [tR,gR,wR,aR,rR]=await Promise.all([
      fetch(`/api/tournaments/${params.id}`),fetch(`/api/tournaments/${params.id}/games`),
      fetch('/api/workers'),fetch(`/api/availability?tournamentId=${params.id}`),
      fetch(`/api/tournaments/${params.id}/roster`),
    ])
    const t=await tR.json();const g=await gR.json();const w=await wR.json();const a=await aR.json();const r=await rR.json()
    setTournament(t);setGames(g);setWorkers(w);setAvails(a)
    setRoster(r.map((e:{workerId:string;gameTarget:number})=>({workerId:e.workerId,gameTarget:e.gameTarget})))
    const dates:string[]=JSON.parse(t.dates||'[]')
    if(dates.length>0)setActiveDay(d=>d||dates[0])
    resetDivisionColors();setLoading(false)
  },[params.id])

  useEffect(()=>{load()},[load])

  async function handleFileSelect(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return
    setPendingFile(file);setImportStep('mapping')
    const fd=new FormData();fd.append('file',file)
    const res=await fetch(`/api/tournaments/${params.id}/parse-headers`,{method:'POST',body:fd})
    const data=await res.json()
    if(!res.ok){toast.error(data.error||'Failed');setImportStep('idle');return}
    setHeaders(data.headers);setPreview(data.preview)
    const guessed:Record<string,string>={}
    for(const f of FIELD_LABELS){const m=data.headers.find((h:string)=>h.toLowerCase().replace(/\s+/g,'').includes(f.key.toLowerCase())||h.toLowerCase().replace(/\s+/g,'')===f.label.toLowerCase().replace(/\s+/g,''));if(m)guessed[f.key]=m}
    setMapping(guessed)
    if(fileRef.current)fileRef.current.value=''
  }

  async function confirmImport(){
    if(!pendingFile)return
    const missing=FIELD_LABELS.filter(f=>f.required&&!mapping[f.key])
    if(missing.length>0){toast.error(`Please map: ${missing.map(f=>f.label).join(', ')}`);return}
    setImportStep('importing')
    const fd=new FormData();fd.append('file',pendingFile);fd.append('mapping',JSON.stringify(mapping))
    const res=await fetch(`/api/tournaments/${params.id}/import`,{method:'POST',body:fd})
    const data=await res.json()
    if(res.ok){toast.success(`Imported ${data.imported} games`);setActiveDay('');await load()}
    else toast.error(data.error||'Import failed')
    setImportStep('idle');setPendingFile(null);setHeaders([]);setPreview([]);setMapping({})
  }

  async function runAutoAssign(){
    setAutoAssigning(true)
    const res=await fetch(`/api/tournaments/${params.id}/auto-assign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:activeDay,stickyScorekeeper})})
    const data=await res.json()
    if(res.ok){setAutoResult(data);await load()}
    else toast.error(data.error||'Auto-assign failed')
    setAutoAssigning(false)
  }

  async function clearAssignments(){
    if(clearConfirm!=='DELETE'||!clearName.trim())return
    setClearSaving(true)
    const res=await fetch(`/api/tournaments/${params.id}/clear-assignments`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletedBy:clearName.trim(),date:activeDay})})
    const data=await res.json()
    if(res.ok){toast.success(`Cleared ${data.deleted} assignments`);await load()}
    else toast.error('Failed to clear')
    setClearSaving(false);setShowClear(false);setClearConfirm('');setClearName('')
  }

  function openEditGame(g:Game){setEditGame(g);setGameForm({gameNumber:g.gameNumber,date:g.date,startTime:g.startTime,location:g.location,division:g.division,pool:g.pool??'',team1:g.team1,team2:g.team2,refCount:g.refCount,isChampionship:g.isChampionship,isCanceled:g.isCanceled})}
  function openAddGame(){setShowAddGame(true);setGameForm({gameNumber:'',date:activeDay||dates[0]||'',startTime:'08:00',location:'',division:'',pool:'',team1:'TBD',team2:'TBD',refCount:2,isChampionship:false})}

  async function saveGameEdit(e:React.FormEvent){
    e.preventDefault();if(!editGame)return;setGameSaving(true)
    const res=await fetch(`/api/games/${editGame.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(gameForm)})
    if(res.ok){toast.success('Game updated');setEditGame(null);await load()}else toast.error('Failed')
    setGameSaving(false)
  }

  async function saveNewGame(e:React.FormEvent){
    e.preventDefault();setGameSaving(true)
    const res=await fetch(`/api/tournaments/${params.id}/games`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(gameForm)})
    if(res.ok){toast.success('Game added');setShowAddGame(false);await load()}else toast.error('Failed')
    setGameSaving(false)
  }

  async function cancelGame(g:Game){
    const next=!g.isCanceled
    await fetch(`/api/games/${g.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isCanceled:next})})
    toast.success(next?'Game canceled':'Game restored');setEditGame(null);await load()
  }

  async function deleteGame(g:Game){
    if(!confirm(`Delete game #${g.gameNumber}? This removes all assignments too.`))return
    await fetch(`/api/games/${g.id}`,{method:'DELETE'});toast.success('Game deleted');setEditGame(null);await load()
  }

  function checkDropConflict(game:Game,time:string,field:string,date:string){
    const candidates=games.filter(g=>g.id!==game.id&&g.date===date&&g.startTime===time&&!g.isCanceled&&g.startTime&&g.location)
    const fieldConflict=candidates.find(g=>g.location===field)??null
    // Team conflict: same team name AND same division (different divisions = different age groups = different teams)
    const teamConflict=candidates.find(g=>
      g.division===game.division&&
      [g.team1,g.team2].some(t=>t.toLowerCase()===game.team1.toLowerCase()||t.toLowerCase()===game.team2.toLowerCase())
    )??null
    return{fieldConflict,teamConflict}
  }

  async function handleDrop(gameId:string,time:string,field:string,date:string){
    const game=games.find(g=>g.id===gameId);if(!game)return
    if(game.startTime===time&&game.location===field&&game.date===date)return
    const{fieldConflict,teamConflict}=checkDropConflict(game,time,field,date)
    if(fieldConflict||teamConflict){
      const msgs=[]
      if(fieldConflict)msgs.push(`Field taken by Game #${fieldConflict.gameNumber} (${fieldConflict.team1} vs ${fieldConflict.team2})`)
      if(teamConflict)msgs.push(`Team conflict with Game #${teamConflict.gameNumber} (${teamConflict.team1} vs ${teamConflict.team2})`)
      if(!confirm(`⚠️ Scheduling conflict:\n${msgs.join('\n')}\n\nMove game anyway?`))return
    }
    await fetch(`/api/games/${gameId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({startTime:time,location:field,date})})
    await load()
  }

  async function unscheduleGame(game:Game){
    await fetch(`/api/games/${game.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({startTime:'',location:''})})
    toast.success(`Game #${game.gameNumber} moved to parking lot`);setEditGame(null);await load()
  }

  async function assign(gameId:string,role:string,workerId:string){
    if(!workerId){
      const game=games.find(g=>g.id===gameId);const ex=game?.assignments.find(a=>a.role===role)
      if(ex){await fetch(`/api/assignments/${ex.id}`,{method:'DELETE'});await load()}
      return
    }
    // Double-booking check
    const dayGames=games.filter(g=>g.date===activeDay)
    const targetGame=dayGames.find(g=>g.id===gameId)
    const conflict=dayGames.find(g=>g.id!==gameId&&g.startTime===targetGame?.startTime&&g.assignments.some(a=>a.workerId===workerId))
    if(conflict){
      const ok=confirm(`⚠️ ${workers.find(w=>w.id===workerId)?.name} is already assigned to game #${conflict.gameNumber} (${conflict.location}) at the same time. Assign anyway?`)
      if(!ok)return
    }
    setAssigningGame(gameId)
    await fetch('/api/assignments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId,workerId,role})})
    await load();setAssigningGame(null)
  }

  async function saveScore(gameId:string,field:'score1'|'score2',val:string){
    await fetch(`/api/games/${gameId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({[field]:val})})
    await load()
  }

  function getGameCount(workerId:string, date?:string):number{return games.filter(g=>g.date===(date??activeDay)&&g.assignments.some(a=>a.workerId===workerId)).length}

  // Double-booking detection for visual warnings
  function getDoubleBookedWorkers(time:string, date?:string):Set<string>{
    const gamesAtTime=games.filter(g=>g.date===(date??activeDay)&&g.startTime===time)
    const workerGameCount=new Map<string,number>()
    for(const g of gamesAtTime)for(const a of g.assignments){workerGameCount.set(a.workerId,(workerGameCount.get(a.workerId)||0)+1)}
    const doubled=new Set<string>()
    workerGameCount.forEach((count,wid)=>{if(count>1)doubled.add(wid)})
    return doubled
  }

  const rosterIds=new Set(roster.map(r=>r.workerId))
  const rosterWorkers=workers.filter(w=>rosterIds.has(w.id))
  function workerRoles(w:Worker):string[]{try{const r=JSON.parse(w.roles||'[]');return Array.isArray(r)&&r.length?r:[w.defaultRole]}catch{return[w.defaultRole]}}
  function canScorekeeper(w:Worker):boolean{return w.defaultRole==='scorekeeper'||(w.defaultRole==='ref'&&workerRoles(w).includes('scorekeeper'))}

  if(loading)return<div className="text-slate-400 text-center py-16">Loading…</div>
  if(!tournament)return<div className="text-red-500">Not found</div>

  const dates:string[]=JSON.parse(tournament.dates||'[]')

  // Apply division keyword rules to determine ref count
  const divRules:Record<string,number>=JSON.parse(tournament.divisionRules||'{}')
  function getRefCount(game:Game):number{
    const div=game.division.toLowerCase()
    for(const [keyword,count] of Object.entries(divRules)){
      if(div.includes(keyword.toLowerCase()))return game.isChampionship?Math.max(count,3):count
    }
    return game.isChampionship?Math.max(game.refCount,3):game.refCount
  }

  const dayGames=games.filter(g=>g.date===activeDay)
  const times=[...new Set(dayGames.map(g=>g.startTime))].sort()
  // Parse field number + suffix from anywhere in the string, e.g. "Village Park - Field 2A (7's)" → {n:2, suffix:'A'}
  function parseField(s:string):{n:number;suffix:string}{const m=s.match(/(\d+)\s*([A-Za-z]*)/);return m?{n:parseInt(m[1]),suffix:m[2].toUpperCase()}:{n:0,suffix:s}}
  const fields=[...new Set(dayGames.map(g=>g.location))].sort((a,b)=>{const pa=parseField(a),pb=parseField(b);return pa.n!==pb.n?pa.n-pb.n:pa.suffix.localeCompare(pb.suffix)})
  // Strip venue prefix ("Village Park - ") but keep everything after the dash
  const fieldLabel=(f:string)=>f.includes(' - ')?f.split(' - ').slice(1).join(' - ').trim():f
  const gameMap=new Map<string,Game>()
  for(const g of dayGames)gameMap.set(`${g.startTime}::${g.location}`,g)
  const assignedCount=games.filter(g=>g.assignments.length>0).length
  const unscheduledGames=games.filter(g=>!g.startTime||!g.location)

  // Staff counts for active day
  const workerMap=new Map(workers.map(w=>[w.id,w]))
  const refRoles=new Set(['ref1','ref2','ref3'])
  const dayAssignments=dayGames.flatMap(g=>g.assignments)
  const assignedBoysRefs=dayAssignments.filter(a=>refRoles.has(a.role)&&(a.worker?.gender??workerMap.get(a.workerId)?.gender)==='boys').length
  const assignedGirlsRefs=dayAssignments.filter(a=>refRoles.has(a.role)&&(a.worker?.gender??workerMap.get(a.workerId)?.gender)==='girls').length
  const assignedBothRefs=dayAssignments.filter(a=>refRoles.has(a.role)&&(a.worker?.gender??workerMap.get(a.workerId)?.gender)==='both').length
  const assignedSKs=dayAssignments.filter(a=>a.role==='scorekeeper').length

  // Live conflict detection for the edit modal
  const editConflicts=(()=>{
    if(!editGame&&!showAddGame)return null
    const date=String(gameForm.date??''),time=String(gameForm.startTime??''),loc=String(gameForm.location??'')
    if(!date||!time||!loc)return null
    const others=games.filter(g=>g.id!==editGame?.id&&g.date===date&&g.startTime===time&&!g.isCanceled&&g.startTime&&g.location)
    const fieldConflict=others.find(g=>g.location===loc)??null
    const t1=String(gameForm.team1??'').toLowerCase(),t2=String(gameForm.team2??'').toLowerCase()
    const div=String(gameForm.division??'')
    // Only flag team conflicts within the same division — same name in different age groups = different teams
    const teamConflict=t1&&t2?others.find(g=>g.division===div&&[g.team1,g.team2].some(t=>t.toLowerCase()===t1||t.toLowerCase()===t2))??null:null
    return(fieldConflict||teamConflict)?{fieldConflict,teamConflict}:null
  })()
  const divColorMap=new Map<string,ReturnType<typeof getDivisionColor>>()
  ;[...new Set(dayGames.map(g=>g.division))].forEach(d=>divColorMap.set(d,getDivisionColor(d)))

  return(
    <div>
      {/* Import modal */}
      {importStep==='mapping'&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100"><h2 className="text-lg font-bold">Map Your Columns</h2><p className="text-sm text-slate-500 mt-1">Match each field to a column in your file</p></div>
            <div className="px-6 py-4 space-y-3">
              {FIELD_LABELS.map(f=>(
                <div key={f.key} className="flex items-center gap-4">
                  <div className="w-44 shrink-0"><span className="text-sm font-semibold text-slate-700">{f.label}</span>{f.required&&<span className="ml-1 text-red-400 text-xs">*</span>}</div>
                  <select className="select flex-1" value={mapping[f.key]??''} onChange={e=>setMapping(m=>({...m,[f.key]:e.target.value}))}><option value="">{f.required?'— select —':'— skip —'}</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select>
                  {mapping[f.key]&&preview[0]&&<span className="text-xs text-slate-400 w-28 truncate shrink-0">e.g. {preview[0][mapping[f.key]]}</span>}
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button className="btn-secondary" onClick={()=>{setImportStep('idle');setPendingFile(null)}}>Cancel</button>
              <button className="btn-primary" onClick={confirmImport}>Import Games →</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-assign modal */}
      {showAutoAssign&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold">Auto-Assign — {formatDate(activeDay)}</h2>
              <p className="text-sm text-slate-500 mt-1">Fills unassigned slots based on availability, gender, and game targets. Won't touch existing assignments.</p>
            </div>
            {!autoResult?(
              <div className="px-6 py-5 space-y-4">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:border-sky-300 transition-colors">
                  <input type="checkbox" checked={stickyScorekeeper} onChange={e=>setStickyScorekeeper(e.target.checked)} className="mt-0.5"/>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Keep scorekeepers on one field all day</p>
                    <p className="text-xs text-slate-400 mt-0.5">Each scorekeeper stays on a single field for all games. Recommended for consistency.</p>
                  </div>
                </label>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={()=>setShowAutoAssign(false)}>Cancel</button>
                  <button className="btn-primary flex-1" onClick={runAutoAssign} disabled={autoAssigning}>{autoAssigning?'Assigning…':'Run Auto-Assign'}</button>
                </div>
              </div>
            ):(
              <div className="px-6 py-5">
                <div className={`p-4 rounded-xl mb-4 ${autoResult.gaps.length===0?'bg-emerald-50 border border-emerald-200':'bg-amber-50 border border-amber-200'}`}>
                  <p className={`font-semibold ${autoResult.gaps.length===0?'text-emerald-800':'text-amber-800'}`}>{autoResult.gaps.length===0?'✅':'⚠️'} {autoResult.summary}</p>
                  <p className="text-sm mt-1 text-slate-600">{autoResult.assigned} slots filled</p>
                </div>
                {autoResult.gaps.length>0&&(
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Games needing staff ({autoResult.gaps.length})</p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {autoResult.gaps.map((g,i)=>(
                        <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
                          <span className="font-medium text-slate-700">#{g.gameNumber} · {g.division} · {g.location}</span>
                          <span className="text-red-500 font-medium">{g.missingRoles.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                    {(autoResult.missingRefs>0||autoResult.missingSKs>0)&&(
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-xs text-red-700">
                        <strong>To fill all games you need: </strong>
                        {autoResult.missingRefs>0&&`${autoResult.missingRefs} more ref${autoResult.missingRefs!==1?'s':''}`}
                        {autoResult.missingRefs>0&&autoResult.missingSKs>0&&' and '}
                        {autoResult.missingSKs>0&&`${autoResult.missingSKs} more scorekeeper${autoResult.missingSKs!==1?'s':''}`}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={()=>{setShowAutoAssign(false);setAutoResult(null)}}>Close</button>
                  <button className="btn-primary flex-1" onClick={()=>{setAutoResult(null);runAutoAssign()}} disabled={autoAssigning}>Run Again</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Clear assignments modal */}
      {showClear&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-red-100 bg-red-50 rounded-t-2xl">
              <h2 className="text-lg font-bold text-red-800">Clear Assignments</h2>
              <p className="text-sm text-red-600 mt-1">This will delete all assignments for <strong>{formatDate(activeDay)}</strong>. This cannot be undone.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="label">Your name (for the audit log)</label>
                <input className="input" placeholder="e.g. John Smith" value={clearName} onChange={e=>setClearName(e.target.value)}/>
              </div>
              <div>
                <label className="label">Type <strong>DELETE</strong> to confirm</label>
                <input className="input font-mono" placeholder="DELETE" value={clearConfirm} onChange={e=>setClearConfirm(e.target.value)}/>
              </div>
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={()=>{setShowClear(false);setClearConfirm('');setClearName('')}}>Cancel</button>
                <button
                  className="flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-colors bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={clearAssignments}
                  disabled={clearConfirm!=='DELETE'||!clearName.trim()||clearSaving}
                >{clearSaving?'Clearing…':'Clear All Assignments'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tournament Nav */}
      {/* ── Assigner header ────────────────────────────────────────── */}
      <div className="bg-[#0f1f3d] -mx-6 px-6 pt-4 pb-0 mb-6">
        <div className="flex items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-3">
            <Link href={`/tournaments/${params.id}/dashboard`} className="flex-shrink-0">
              {tournament.logoUrl
                ? <img src={tournament.logoUrl} alt="logo" className="h-11 w-11 object-contain rounded-xl border border-white/10 bg-white/5 hover:border-white/30 transition-colors" />
                : null}
            </Link>
            <div>
              <div className="text-[11px] text-slate-400 mb-0.5">
                <Link href="/" className="hover:text-teal-400 transition-colors">Tournaments</Link>
                <span className="mx-1 opacity-40">/</span>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/tournaments/${params.id}/dashboard`} className="text-lg font-bold text-white leading-tight hover:text-teal-300 transition-colors">{tournament.name}</Link>
                <span className="text-[10px] font-semibold bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full tracking-wide">ASSIGNER</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-slate-400">{games.length} games</span>
                <span className="text-slate-600">·</span>
                <span className="text-[11px] text-sky-400">{assignedCount} assigned</span>
                {games.length > 0 && (
                  <span className={`text-[11px] font-semibold ${Math.round(assignedCount/Math.max(games.length,1)*100) >= 90 ? 'text-emerald-400' : Math.round(assignedCount/Math.max(games.length,1)*100) >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {Math.round(assignedCount / Math.max(games.length, 1) * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href={`/tournaments/${params.id}/dashboard`}
              className="text-xs text-slate-300 hover:text-white border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors">
              ← Dashboard
            </Link>
            {/* Staff assignment counts */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5">
              <span className="text-[11px] text-sky-300 font-medium">{assignedBoysRefs} Boys Refs</span>
              <span className="text-white/20">·</span>
              <span className="text-[11px] text-pink-300 font-medium">{assignedGirlsRefs} Girls Refs</span>
              {assignedBothRefs > 0 && <><span className="text-white/20">·</span><span className="text-[11px] text-slate-300 font-medium">{assignedBothRefs} Both</span></>}
              <span className="text-white/20">·</span>
              <span className="text-[11px] text-emerald-300 font-medium">{assignedSKs} Scorekeepers</span>
            </div>
            <Link href={`/tournaments/${params.id}/roster`}
              className="text-xs text-slate-300 hover:text-white border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors">
              👥 Staff Roster
            </Link>
            <Link href={`/tournaments/${params.id}/pay-summary`}
              className="text-xs text-slate-300 hover:text-white border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors">
              💰 Pay
            </Link>
            <button
              onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/tournaments/${params.id}/public`);toast.success('Link copied!')}}
              className="text-xs text-slate-300 hover:text-white border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors">
              🔗 Share
            </button>
          </div>
        </div>

        {/* Day tabs — inside header */}
        {dates.length > 0 && viewMode !== 'staff' && (
          <div className="flex gap-0">
            {dates.map(d => (
              <button key={d} onClick={() => setActiveDay(d)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeDay === d ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-400 hover:text-white hover:border-white/20'}`}>
                {formatDate(d)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Control bar: views + actions ────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {games.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(['grid','list','division','staff'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {v === 'grid' ? '⊞ Grid' : v === 'list' ? '≡ List' : v === 'division' ? '⬡ Division' : '👤 Staff'}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {dayGames.length > 0 && <button onClick={() => { setShowAutoAssign(true); setAutoResult(null) }} className="btn-secondary btn-sm text-purple-600 border-purple-200 hover:bg-purple-50">⚡ Auto-Assign</button>}
        {dayGames.length > 0 && <button onClick={() => { setShowClear(true); setClearConfirm(''); setClearName('') }} className="btn-secondary btn-sm text-red-500 border-red-200 hover:bg-red-50">🗑 Clear</button>}
        <button onClick={openAddGame} className="btn-secondary btn-sm">+ Game</button>
        <label className="btn-primary btn-sm cursor-pointer">↑ Import<input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect}/></label>
      </div>

      {/* ── LIST VIEW ── */}
      {viewMode==='list'&&games.length>0&&(()=>{
        const allDivs=[...new Set(games.map(g=>g.division))].sort()
        const listGames=games
          .filter(g=>activeDay?g.date===activeDay:true)
          .filter(g=>listDivFilter==='all'||g.division===listDivFilter)
          .filter(g=>!listSearch||[g.gameNumber,g.team1,g.team2,g.division,g.location].some(s=>s.toLowerCase().includes(listSearch.toLowerCase())))
          .sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.location.localeCompare(b.location))
        return(
          <div>
            <div className="flex gap-3 mb-4 flex-wrap items-center">
              <input className="input !w-52 text-sm" placeholder="Search game, team, field…" value={listSearch} onChange={e=>setListSearch(e.target.value)}/>
              <select className="select !w-auto text-sm" value={listDivFilter} onChange={e=>setListDivFilter(e.target.value)}>
                <option value="all">All divisions</option>
                {allDivs.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <span className="text-xs text-slate-400">{listGames.length} games</span>
              {(listSearch||listDivFilter!=='all')&&<button className="text-xs text-slate-400 hover:text-slate-600" onClick={()=>{setListSearch('');setListDivFilter('all')}}>Clear</button>}
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Field</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Division</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Teams</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Staff</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listGames.map(g=>{
                    const refs=g.assignments.filter(a=>a.role.startsWith('ref'))
                    const sk=g.assignments.find(a=>a.role==='scorekeeper')
                    const isAssignOpen=assignExpandId===g.id
                    const doubled=getDoubleBookedWorkers(g.startTime,g.date)
                    const refCount=getRefCount(g)
                    return(<>
                      <tr key={g.id} className={`border-b border-slate-100 cursor-pointer ${isAssignOpen?'bg-sky-50/40 border-b-0':'hover:bg-slate-50'} ${g.isCanceled?'opacity-50':''}`} onClick={()=>setAssignExpandId(isAssignOpen?null:g.id)}>
                        <td className="px-4 py-3 font-mono text-slate-500 text-xs">{g.gameNumber}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{formatTime(g.startTime)}</td>
                        <td className="px-4 py-3 text-slate-600">{fieldLabel(g.location)}</td>
                        <td className="px-4 py-3"><span className="badge bg-slate-100 text-slate-700">{g.division}{g.pool?` · ${g.pool}`:''}</span>{g.isChampionship&&<span className="ml-1 badge bg-amber-100 text-amber-700">★</span>}</td>
                        <td className="px-4 py-3 text-slate-800"><div>{g.team1}</div><div className="text-slate-500">{g.team2}</div></td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {refs.length>0?<div>{refs.map(a=>a.worker.name).join(', ')}</div>:<div className="text-red-400">No refs</div>}
                          {sk?<div className="text-slate-400">SK: {sk.worker.name}</div>:<div className="text-amber-500">No SK</div>}
                        </td>
                        <td className="px-4 py-3">{g.isCanceled?<span className="badge bg-red-100 text-red-600">Canceled</span>:g.assignments.length===0?<span className="badge bg-amber-100 text-amber-600">Unassigned</span>:<span className="badge bg-emerald-100 text-emerald-700">Assigned</span>}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={e=>{e.stopPropagation();openEditGame(g)}} className="text-xs text-slate-400 hover:text-slate-600 font-medium">Edit</button>
                        </td>
                      </tr>
                      {isAssignOpen&&(
                        <tr key={`${g.id}-assign`} className="border-b border-slate-200">
                          <td colSpan={8} className="px-6 py-4 bg-sky-50/40">
                            <div className="flex flex-wrap gap-3 items-center">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign Staff —</span>
                              {Array.from({length:refCount},(_,i)=>{
                                const role=i===0?'ref1':i===1?'ref2':'ref3'
                                const roleObj={value:role,label:`Ref ${i+1}`,short:`R${i+1}`,color:'#0284c7'}
                                const existing=g.assignments.find(a=>a.role===role)
                                return<div key={role} className="flex items-center gap-1 min-w-[180px]"><span className="text-[11px] font-bold text-sky-600 w-6">R{i+1}</span><div className="flex-1"><SearchSelect value={existing?.workerId??''} onChange={wid=>assign(g.id,role,wid)} options={rosterWorkers.filter(w=>w.defaultRole==='ref').map(w=>{const count=getGameCount(w.id,g.date);return{id:w.id,label:`${w.name} ${count>=8?'🔴':count>=5?'🟡':'🟢'}${count}`,sublabel:certLabel(w.certLevel),warning:doubled.has(w.id)}})} placeholder="unassigned" assigned={!!existing} disabled={assigningGame===g.id}/></div></div>
                              })}
                              <div className="flex items-center gap-1 min-w-[180px]"><span className="text-[11px] font-bold text-emerald-600 w-6">SK</span><div className="flex-1"><SearchSelect value={g.assignments.find(a=>a.role==='scorekeeper')?.workerId??''} onChange={wid=>assign(g.id,'scorekeeper',wid)} options={rosterWorkers.filter(w=>canScorekeeper(w)).map(w=>{const count=getGameCount(w.id,g.date);return{id:w.id,label:`${w.name} ${count>=8?'🔴':count>=5?'🟡':'🟢'}${count}`,sublabel:certLabel(w.certLevel),warning:doubled.has(w.id)}})} placeholder="unassigned" assigned={!!g.assignments.find(a=>a.role==='scorekeeper')} disabled={assigningGame===g.id}/></div></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>)
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── DIVISION VIEW ── */}
      {viewMode==='division'&&games.length>0&&(()=>{
        const divGames=games.filter(g=>activeDay?g.date===activeDay:true)
        const divisions=[...new Set(divGames.map(g=>g.division))].sort()
        return(
          <div className="space-y-6">
            {divisions.map(div=>{
              const dg=divGames.filter(g=>g.division===div).sort((a,b)=>a.startTime.localeCompare(b.startTime))
              const assigned=dg.filter(g=>g.assignments.length>0).length
              return(
                <div key={div} className="card overflow-hidden">
                  <div className="px-5 py-3 bg-slate-700 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{div}</span>
                      <span className="text-slate-300 text-sm">{dg.length} games</span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${assigned===dg.length?'bg-emerald-500/30 text-emerald-200':'bg-amber-500/30 text-amber-200'}`}>{assigned}/{dg.length} assigned</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {dg.map(g=>{
                        const refs=g.assignments.filter(a=>a.role.startsWith('ref'))
                        const sk=g.assignments.find(a=>a.role==='scorekeeper')
                        const isAssignOpen=assignExpandId===g.id
                        const doubled=getDoubleBookedWorkers(g.startTime,g.date)
                        const refCount=g.isChampionship?Math.max(g.refCount,3):g.refCount
                        return(<>
                          <tr key={g.id} className={`border-b border-slate-100 cursor-pointer ${isAssignOpen?'bg-sky-50/40 border-b-0':'hover:bg-slate-50'} ${g.isCanceled?'opacity-40':''}`} onClick={()=>setAssignExpandId(isAssignOpen?null:g.id)}>
                            <td className="px-4 py-2.5 text-slate-400 text-xs w-10">{g.gameNumber}</td>
                            <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap w-20">{formatTime(g.startTime)}</td>
                            <td className="px-4 py-2.5 text-slate-500 w-28">{fieldLabel(g.location)}</td>
                            <td className="px-4 py-2.5 text-slate-800"><span>{g.team1}</span><span className="text-slate-400 mx-1">vs</span><span>{g.team2}</span></td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">
                              {refs.length>0?refs.map(a=>a.worker.name).join(', '):<span className="text-red-400">No refs</span>}
                              {sk&&<span className="ml-2 text-slate-400">· SK: {sk.worker.name}</span>}
                            </td>
                            <td className="px-4 py-2.5">{g.isCanceled&&<span className="badge bg-red-100 text-red-600">Canceled</span>}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              <button onClick={e=>{e.stopPropagation();openEditGame(g)}} className="text-xs text-slate-400 hover:text-slate-600 font-medium">Edit</button>
                            </td>
                          </tr>
                          {isAssignOpen&&(
                            <tr key={`${g.id}-assign`} className="border-b border-slate-200">
                              <td colSpan={7} className="px-6 py-4 bg-sky-50/40">
                                <div className="flex flex-wrap gap-3 items-center">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign Staff —</span>
                                  {Array.from({length:refCount},(_,i)=>{
                                    const role=i===0?'ref1':i===1?'ref2':'ref3'
                                    const existing=g.assignments.find(a=>a.role===role)
                                    return<div key={role} className="flex items-center gap-1 min-w-[180px]"><span className="text-[11px] font-bold text-sky-600 w-6">R{i+1}</span><div className="flex-1"><SearchSelect value={existing?.workerId??''} onChange={wid=>assign(g.id,role,wid)} options={rosterWorkers.filter(w=>w.defaultRole==='ref').map(w=>{const count=getGameCount(w.id,g.date);return{id:w.id,label:`${w.name} ${count>=8?'🔴':count>=5?'🟡':'🟢'}${count}`,sublabel:certLabel(w.certLevel),warning:doubled.has(w.id)}})} placeholder="unassigned" assigned={!!existing} disabled={assigningGame===g.id}/></div></div>
                                  })}
                                  <div className="flex items-center gap-1 min-w-[180px]"><span className="text-[11px] font-bold text-emerald-600 w-6">SK</span><div className="flex-1"><SearchSelect value={g.assignments.find(a=>a.role==='scorekeeper')?.workerId??''} onChange={wid=>assign(g.id,'scorekeeper',wid)} options={rosterWorkers.filter(w=>canScorekeeper(w)).map(w=>{const count=getGameCount(w.id,g.date);return{id:w.id,label:`${w.name} ${count>=8?'🔴':count>=5?'🟡':'🟢'}${count}`,sublabel:certLabel(w.certLevel),warning:doubled.has(w.id)}})} placeholder="unassigned" assigned={!!g.assignments.find(a=>a.role==='scorekeeper')} disabled={assigningGame===g.id}/></div></div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>)
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── STAFF VIEW ── */}
      {viewMode==='staff'&&(()=>{
        const staffGame=staffViewId?games.filter(g=>g.assignments.some(a=>a.workerId===staffViewId)).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)):[]
        const staffDates=[...new Set(staffGame.map(g=>g.date))].sort()
        return(
          <div>
            <div className="flex gap-3 mb-5 items-center flex-wrap">
              <label className="text-sm font-medium text-slate-600">View schedule for:</label>
              <select className="select !w-64" value={staffViewId} onChange={e=>setStaffViewId(e.target.value)}>
                <option value="">— pick a staff member —</option>
                {workers.filter(w=>rosterIds.has(w.id)).sort((a,b)=>a.name.localeCompare(b.name)).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              {staffViewId&&<span className="text-sm text-slate-500">{staffGame.length} games assigned</span>}
            </div>
            {!staffViewId?<div className="card p-12 text-center text-slate-400">Select a staff member to see their schedule</div>:staffGame.length===0?<div className="card p-12 text-center text-slate-400">No games assigned yet</div>:(
              <div className="space-y-4">
                {staffDates.map(date=>{
                  const dayG=staffGame.filter(g=>g.date===date)
                  return(
                    <div key={date} className="card overflow-hidden">
                      <div className="px-5 py-3 bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">{formatDate(date)} — {dayG.length} games</div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {dayG.map(g=>{
                            const myRole=g.assignments.find(a=>a.workerId===staffViewId)
                            return(
                              <tr key={g.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{formatTime(g.startTime)}</td>
                                <td className="px-4 py-3 text-slate-600">{g.location}</td>
                                <td className="px-4 py-3"><span className="badge bg-slate-100 text-slate-700">{g.division}</span></td>
                                <td className="px-4 py-3 text-slate-800">{g.team1} vs {g.team2}</td>
                                <td className="px-4 py-3"><span className="badge bg-sky-100 text-sky-700">{myRole?.role.replace('ref1','Ref 1').replace('ref2','Ref 2').replace('ref3','Ref 3').replace('scorekeeper','Scorekeeper')}</span></td>
                                {myRole&&<td className="px-4 py-3 text-slate-500 text-xs">${myRole.payRate}/game</td>}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── GRID VIEW ── */}
      {viewMode==='grid'&&games.length===0?(
        <div className="card p-16 text-center"><div className="text-5xl mb-4">📋</div><p className="font-semibold text-slate-700">No games imported yet</p><p className="text-sm text-slate-400 mt-1">Click "↑ Import" to upload your schedule</p></div>
      ):viewMode==='grid'&&dayGames.length===0?<div className="text-slate-400 text-center py-12">No games on this day</div>:viewMode==='grid'&&(
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="border-collapse text-xs min-w-max bg-white">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-700 text-white border-r border-slate-600 px-4 py-3 text-left font-semibold min-w-[90px]">Time</th>
                {fields.map(f=>{
                  const collapsed=collapsedFields.has(f)
                  return(
                    <th key={f} onClick={()=>toggleField(f)} className={`border-r border-slate-200 py-3 text-center bg-slate-100 last:border-r-0 cursor-pointer hover:bg-slate-200 transition-colors select-none ${collapsed?'w-8 px-0':'min-w-[190px] px-3'}`} title={collapsed?`Expand ${fieldLabel(f)}`:`Collapse ${fieldLabel(f)}`}>
                      {collapsed?(
                        <div className="flex items-center justify-center h-full">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide" style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap'}}>{fieldLabel(f)}</span>
                        </div>
                      ):(
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{fieldLabel(f)}</span>
                          <span className="text-[10px] text-slate-300">▼</span>
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {times.map((time,ti)=>{
                const doubled=getDoubleBookedWorkers(time)
                const timeCollapsed=collapsedTimes.has(time)
                if(timeCollapsed)return(
                  <tr key={time} className="border-t border-slate-300">
                    <td
                      className="sticky left-0 z-10 bg-slate-600 text-white border-r border-slate-500 px-4 py-1 font-bold text-[10px] whitespace-nowrap cursor-pointer hover:bg-slate-500 transition-colors select-none"
                      onClick={()=>toggleTime(time)}
                      title="Click to expand"
                    >▶ {formatTime(time)}</td>
                    {fields.map(field=>(
                      <td key={field} className={`border-r border-slate-300 last:border-r-0 h-2 ${collapsedFields.has(field)?'w-8':''} ${gameMap.get(`${time}::${field}`)&&!collapsedFields.has(field)?'bg-slate-200':''}`}/>
                    ))}
                  </tr>
                )
                return(
                  <tr key={time} className={ti%2===0?'bg-white':'bg-slate-50/50'}>
                    <td
                      className="sticky left-0 z-10 bg-slate-700 text-white border-r border-slate-600 border-t border-slate-600 px-4 py-3 font-bold text-[11px] whitespace-nowrap cursor-pointer hover:bg-slate-600 transition-colors select-none"
                      onClick={()=>toggleTime(time)}
                      title="Click to collapse"
                    >▼ {formatTime(time)}</td>
                    {fields.map(field=>{
                      const collapsed=collapsedFields.has(field)
                      const game=gameMap.get(`${time}::${field}`)
                      const isDragTarget=dragGame&&dragOver?.time===time&&dragOver?.field===field
                      const dropConflict=isDragTarget&&dragGame?checkDropConflict(dragGame,time,field,activeDay):null
                      const dropHasConflict=!!(dropConflict?.fieldConflict||dropConflict?.teamConflict)
                      if(collapsed)return(
                        <td key={field} className={`border-r border-t border-slate-300 last:border-r-0 w-8 cursor-pointer ${game?'bg-slate-200':'bg-slate-50'}`} onClick={()=>toggleField(field)} title="Click to expand">
                          {game&&<div className="w-2 mx-auto h-full bg-slate-400 rounded-full opacity-40"/>}
                        </td>
                      )
                      if(!game)return(
                        <td key={field}
                          className={`border-r border-t border-slate-300 last:border-r-0 min-h-[80px] transition-colors ${isDragTarget?dropHasConflict?'bg-red-100 ring-2 ring-inset ring-red-400':'bg-emerald-100 ring-2 ring-inset ring-emerald-400':'bg-white'}`}
                          onDragOver={e=>{e.preventDefault();if(dragGame)setDragOver({time,field})}}
                          onDragLeave={()=>setDragOver(null)}
                          onDrop={e=>{e.preventDefault();const gId=e.dataTransfer.getData('gameId');if(gId)handleDrop(gId,time,field,activeDay);setDragOver(null)}}
                        />
                      )
                      const dc=divColorMap.get(game.division)||{bg:'#f8fafc',border:'#e2e8f0',text:'#475569'}
                      const isAssigning=assigningGame===game.id
                      const hasDoubleBooking=game.assignments.some(a=>doubled.has(a.workerId))
                      const refCount=getRefCount(game)

                      return(
                        <td key={field}
                          className={`border-r border-t border-slate-300 last:border-r-0 p-2 align-top relative group transition-colors ${hasDoubleBooking?'ring-2 ring-inset ring-red-400':''} ${game.isCanceled?'opacity-40':''} ${isDragTarget?dropHasConflict?'ring-2 ring-inset ring-red-400 bg-red-50':'ring-2 ring-inset ring-emerald-400 bg-emerald-50':''}`}
                          style={isDragTarget?{}:{background:dc.bg}}
                          onDragOver={e=>{e.preventDefault();if(dragGame&&dragGame.id!==game.id)setDragOver({time,field})}}
                          onDragLeave={()=>setDragOver(null)}
                          onDrop={e=>{e.preventDefault();const gId=e.dataTransfer.getData('gameId');if(gId&&gId!==game.id)handleDrop(gId,time,field,activeDay);setDragOver(null)}}
                        >
                          {hasDoubleBooking&&(()=>{
                            const names=game.assignments.filter(a=>doubled.has(a.workerId)).map(a=>a.worker.name)
                            return(
                              <div className="relative group/db">
                                <div className="text-[9px] font-bold text-red-500 mb-1 cursor-help">⚠ Double-booked</div>
                                <div className="absolute left-0 top-4 z-50 hidden group-hover/db:block bg-slate-900 text-white text-[10px] rounded-lg px-2.5 py-2 shadow-xl w-48 pointer-events-none">
                                  <p className="font-semibold mb-1">Assigned to multiple games at this time:</p>
                                  {names.map(n=><p key={n} className="text-red-300">• {n}</p>)}
                                </div>
                              </div>
                            )
                          })()}
                          <button className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-[9px] text-slate-400 hover:text-slate-700 transition-opacity" onClick={e=>{e.stopPropagation();openEditGame(game)}}>✎</button>
                          <div
                            className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-opacity text-[12px] leading-none select-none"
                            draggable
                            onDragStart={e=>{e.dataTransfer.setData('gameId',game.id);e.dataTransfer.effectAllowed='move';setDragGame(game)}}
                            onDragEnd={()=>{setDragGame(null);setDragOver(null)}}
                            title="Drag to move game"
                          >⠿</div>
                          <div className="flex items-center justify-between mb-1.5 pb-1.5 pl-3" style={{borderBottom:`2px solid ${dc.border}`}}>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="font-bold text-[10px] text-slate-500 shrink-0">{formatTime(game.startTime)}</span>
                              <span className="text-slate-300 text-[9px]">·</span>
                              <span className="font-bold text-[10px] shrink-0" style={{color:dc.text}}>#{game.gameNumber}</span>
                              <span className="text-[10px] font-semibold truncate" style={{color:dc.text}}>{game.division}{game.pool?` · ${game.pool}`:''}</span>
                            </div>
                            {game.isChampionship&&<span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1 py-0.5 rounded-full shrink-0">★</span>}
                          </div>
                          <div className="mb-2 space-y-1">
                            <div className="flex items-center gap-1"><span className="font-bold text-[12px] text-slate-900 flex-1 leading-tight">{game.team1}</span><input type="number" min="0" className="w-8 h-5 text-[10px] text-center border border-slate-200 rounded bg-white/80 focus:outline-none" defaultValue={game.score1??''} onBlur={e=>saveScore(game.id,'score1',e.target.value)} placeholder="—"/></div>
                            <div className="flex items-center gap-1"><span className="font-bold text-[12px] text-slate-900 flex-1 leading-tight">{game.team2}</span><input type="number" min="0" className="w-8 h-5 text-[10px] text-center border border-slate-200 rounded bg-white/80 focus:outline-none" defaultValue={game.score2??''} onBlur={e=>saveScore(game.id,'score2',e.target.value)} placeholder="—"/></div>
                          </div>
                          <div className="space-y-0.5 pt-1" style={{borderTop:`1px solid ${dc.border}`}}>
                            {/* Ref slots */}
                            {Array.from({length:refCount},(_,i)=>{
                              const role=i===0?'ref1':i===1?'ref2':'ref3'
                              const roleObj=GRID_ROLES.find(r=>r.value===role)||{value:role,label:`Ref ${i+1}`,short:`R${i+1}`,color:'#0284c7'}
                              const existing=game.assignments.find(a=>a.role===role)
                              return<AssignSelect key={role} roleObj={roleObj} existing={existing} workers={rosterWorkers} avails={avails} date={game.date} time={game.startTime} disabled={isAssigning} division={game.division} onAssign={wid=>assign(game.id,role,wid)} getGameCount={getGameCount} doubled={doubled} slotType="ref"/>
                            })}
                            {/* Scorekeeper */}
                            <AssignSelect roleObj={{value:'scorekeeper',label:'Scorekeeper',short:'SK',color:'#059669'}} existing={game.assignments.find(a=>a.role==='scorekeeper')} workers={rosterWorkers} avails={avails} date={game.date} time={game.startTime} disabled={isAssigning} division={game.division} onAssign={wid=>assign(game.id,'scorekeeper',wid)} getGameCount={getGameCount} doubled={doubled} slotType="scorekeeper"/>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-slate-400">R1/R2/R3 = Refs · SK = Scorekeeper · 🟢🟡🔴 = game load · ⚠ = double-booked · ⠿ drag · click column header to collapse</div>
        <div className="flex gap-3">
          <span className="text-xs text-slate-400">Columns:</span>
          <button onClick={()=>setCollapsedFields(new Set(fields))} className="text-xs text-slate-400 hover:text-slate-600">Collapse all</button>
          <span className="text-slate-200">|</span>
          <button onClick={()=>setCollapsedFields(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Expand all</button>
          <span className="text-slate-200 mx-1">·</span>
          <span className="text-xs text-slate-400">Rows:</span>
          <button onClick={()=>setCollapsedTimes(new Set(times))} className="text-xs text-slate-400 hover:text-slate-600">Collapse all</button>
          <span className="text-slate-200">|</span>
          <button onClick={()=>setCollapsedTimes(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Expand all</button>
        </div>
      </div>

      {/* ── PARKING LOT ── */}
      {viewMode==='grid'&&unscheduledGames.length>0&&(
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🅿</span>
              <h3 className="font-semibold text-slate-700">Parking Lot — {unscheduledGames.length} game{unscheduledGames.length!==1?'s':''} need scheduling</h3>
            </div>
            <p className="text-xs text-slate-400">Drag a game from here onto the grid to schedule it, or click Edit to set time and field manually.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {unscheduledGames.map(g=>(
              <div
                key={g.id}
                draggable
                onDragStart={e=>{e.dataTransfer.setData('gameId',g.id);e.dataTransfer.effectAllowed='move';setDragGame(g)}}
                onDragEnd={()=>{setDragGame(null);setDragOver(null)}}
                className={`card p-3 cursor-grab active:cursor-grabbing w-48 border-2 border-dashed border-slate-300 hover:border-sky-400 transition-colors ${dragGame?.id===g.id?'opacity-40':''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-400">#{g.gameNumber}</span>
                  <button onClick={()=>openEditGame(g)} className="text-[10px] text-sky-600 hover:text-sky-800 font-medium">Edit</button>
                </div>
                <div className="text-xs font-semibold text-slate-700 mb-0.5">{g.division}</div>
                <div className="text-xs text-slate-600">{g.team1}</div>
                <div className="text-xs text-slate-400">vs {g.team2}</div>
                <div className="text-[10px] text-orange-500 mt-1.5 font-medium">Needs time + field</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GAME EDIT MODAL ── */}
      {(editGame||showAddGame)&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{showAddGame?'Add Game':editGame?.isCanceled?`Game #${editGame.gameNumber} (Canceled)`:`Edit Game #${editGame?.gameNumber}`}</h2>
                {!showAddGame&&<p className="text-sm text-slate-500 mt-0.5">Click name to edit · Changes save immediately</p>}
              </div>
              {editGame&&!showAddGame&&(
                <div className="flex gap-2 flex-wrap">
                  <button onClick={()=>unscheduleGame(editGame)} className="btn-sm btn-secondary text-orange-600 text-xs" title="Remove from grid and park until you find a slot">🅿 Park</button>
                  <button onClick={()=>cancelGame(editGame)} className={`btn-sm text-xs ${editGame.isCanceled?'btn-secondary text-emerald-600':'btn-secondary text-amber-600'}`}>{editGame.isCanceled?'Restore':'Cancel'}</button>
                  <button onClick={()=>deleteGame(editGame)} className="btn-sm btn-secondary text-red-500 text-xs">Delete</button>
                </div>
              )}
            </div>

            {/* Conflict warnings */}
            {editConflicts&&(
              <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                <p className="font-semibold text-amber-800 mb-1">⚠️ Scheduling conflict</p>
                {editConflicts.fieldConflict&&<p className="text-amber-700 text-xs">Field taken: Game #{editConflicts.fieldConflict.gameNumber} — {editConflicts.fieldConflict.team1} vs {editConflicts.fieldConflict.team2}</p>}
                {editConflicts.teamConflict&&<p className="text-amber-700 text-xs">Team conflict: Game #{editConflicts.teamConflict.gameNumber} — {editConflicts.teamConflict.team1} vs {editConflicts.teamConflict.team2}</p>}
              </div>
            )}

            <form onSubmit={showAddGame?saveNewGame:saveGameEdit} className="px-6 py-5 grid grid-cols-2 gap-4">
              <div><label className="label">Game #</label><input className="input" value={String(gameForm.gameNumber??'')} onChange={e=>setGameForm(f=>({...f,gameNumber:e.target.value}))}/></div>
              <div><label className="label">Date</label><input className="input" type="date" value={String(gameForm.date??'')} onChange={e=>setGameForm(f=>({...f,date:e.target.value}))}/></div>
              <div><label className="label">Start Time</label><input className="input" type="time" value={String(gameForm.startTime??'')} onChange={e=>setGameForm(f=>({...f,startTime:e.target.value}))}/></div>
              <div><label className="label">Field / Location</label><input className="input" value={String(gameForm.location??'')} onChange={e=>setGameForm(f=>({...f,location:e.target.value}))} list="field-options"/><datalist id="field-options">{[...new Set(games.filter(g=>g.location).map(g=>g.location))].sort().map(l=><option key={l} value={l}/>)}</datalist></div>
              <div><label className="label">Division</label><input className="input" value={String(gameForm.division??'')} onChange={e=>setGameForm(f=>({...f,division:e.target.value}))} list="div-options"/><datalist id="div-options">{[...new Set(games.map(g=>g.division))].sort().map(d=><option key={d} value={d}/>)}</datalist></div>
              <div><label className="label">Pool</label><input className="input" value={String(gameForm.pool??'')} onChange={e=>setGameForm(f=>({...f,pool:e.target.value}))} placeholder="Optional"/></div>
              <div><label className="label">Team 1</label><input className="input" value={String(gameForm.team1??'')} onChange={e=>setGameForm(f=>({...f,team1:e.target.value}))}/></div>
              <div><label className="label">Team 2</label><input className="input" value={String(gameForm.team2??'')} onChange={e=>setGameForm(f=>({...f,team2:e.target.value}))}/></div>
              <div><label className="label">Ref Count</label><select className="select" value={String(gameForm.refCount??2)} onChange={e=>setGameForm(f=>({...f,refCount:Number(e.target.value)}))}>
                <option value="1">1 Ref</option><option value="2">2 Refs</option><option value="3">3 Refs</option>
              </select></div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={Boolean(gameForm.isChampionship)} onChange={e=>setGameForm(f=>({...f,isChampionship:e.target.checked}))}/>Championship</label>
              </div>
              <div className="col-span-2 flex gap-2 pt-2">
                <button type="submit" className={`btn-primary ${editConflicts?'bg-amber-500 hover:bg-amber-600':''}`} disabled={gameSaving}>{gameSaving?'Saving…':editConflicts?'Save Anyway':showAddGame?'Add Game':'Save Changes'}</button>
                <button type="button" className="btn-secondary" onClick={()=>{setEditGame(null);setShowAddGame(false)}}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function AssignSelect({ roleObj,existing,workers,avails,date,time,disabled,division,onAssign,getGameCount,doubled,slotType }:{
  roleObj:{value:string;label:string;short:string;color:string};existing?:Assignment;workers:Worker[];avails:Availability[];date:string;time:string;disabled:boolean;division:string;onAssign:(w:string)=>void;getGameCount:(id:string)=>number;doubled:Set<string>;slotType:'ref'|'scorekeeper'
}){
  const divLower=division.toLowerCase()
  const gameGender=divLower.includes('girl')||divLower.includes('women')?'girls':divLower.includes('boy')||divLower.includes('men')?'boys':'both'

  const availableIds=new Set(avails.filter(a=>{
    if(a.date!==date)return false
    const slots:string[]=JSON.parse(a.timeSlots)
    return slots.length===0||slots.includes(time)
  }).map(a=>a.workerId))

  // For scorekeeper slot: dedicated scorekeepers + refs who have Scorekeeper checked in their roles
  // For ref slots: show only refs with gender match
  function hasSkRole(w:Worker){try{const r=JSON.parse(w.roles||'[]');return Array.isArray(r)&&r.includes('scorekeeper')}catch{return false}}
  const eligible=slotType==='scorekeeper'
    ?[
        ...workers.filter(w=>w.defaultRole==='scorekeeper'),
        ...workers.filter(w=>w.defaultRole==='ref'&&hasSkRole(w)),
      ]
    :workers.filter(w=>{
        if(w.defaultRole!=='ref')return false
        if(gameGender==='boys')return w.gender==='boys'||w.gender==='both'
        if(gameGender==='girls')return w.gender==='girls'||w.gender==='both'
        return true
      })

  const options=eligible.map(w=>{
    const count=getGameCount(w.id)
    const countEmoji=count>=8?'🔴':count>=5?'🟡':'🟢'
    const avail=availableIds.has(w.id)
    const isDoubled=doubled.has(w.id)
    const isRefAsSK=slotType==='scorekeeper'&&w.defaultRole==='ref'
    return{
      id:w.id,
      label:`${w.name}${isRefAsSK?' (Ref→SK)':''} ${countEmoji}${count}`,
      sublabel:`${certLabel(w.certLevel)}${!avail?' · ⚠ unavailable':''}${isDoubled?' · ⚠ double-booked':''}`,
      warning:!avail||isDoubled,
    }
  })

  const isDoubledAssigned=existing&&doubled.has(existing.workerId)

  return(
    <div className="flex items-center gap-0.5">
      <span className="text-[9px] font-bold w-5 shrink-0" style={{color:roleObj.color}}>{roleObj.short}</span>
      <div className="flex-1 relative">
        {isDoubledAssigned&&<div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full z-10"/>}
        <SearchSelect value={existing?.workerId??''} onChange={onAssign} options={options} placeholder="unassigned" assigned={!!existing} disabled={disabled}/>
      </div>
    </div>
  )
}
