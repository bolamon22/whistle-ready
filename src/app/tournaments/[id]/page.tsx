'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatTime, formatDate, certLabel, GRID_ROLES, getDivisionColor, resetDivisionColors } from '@/lib/utils'
import TournamentNav from './TournamentNav'
import CheckpointBanner from '@/components/CheckpointBanner'
import { askSideSwitch } from '@/components/askSideSwitch'
import { Users, Lock, ClipboardList, ChevronUp, ChevronDown, Zap, Trash2, Plus, Upload, X, Send, CheckCheck, Eye, EyeOff, Tags, MoreHorizontal, SlidersHorizontal, ChevronsRight, Pin, AlertTriangle, Search, LayoutGrid, Printer, History } from 'lucide-react'
import { CREW_LABEL, type Crew } from '@/lib/staffRelease'
import { eventDayList } from '@/lib/eventDays'
import { divisionAbbr } from '@/lib/names'
import { gameGender, type GameGender } from '@/lib/gameGender'
import { teamsSide } from '@/lib/eventTeams'
import { isOnline, presenceLabel } from '@/lib/presenceTime'
import { useRole } from '@/lib/role-context'
import RefLevelPill from '@/components/RefLevelPill'
import { scoresShown } from '@/lib/eventScores'
import { byLastName, lastFirst } from '@/lib/personName'
import ScheduleBuilder from './ScheduleBuilder'

// refLevel (lib/refLevel) comes back only for those who see this person's pay (api/workers).
interface Worker { id:string;name:string;certLevel:string;defaultRole:string;roles:string;gender:string;payRateOverride:number|null;appStatus?:string;lastSeenAt?:string|null;lastLoginAt?:string|null;refLevel?:number|null }
interface Assignment { id:string;workerId:string;role:string;payRate:number|null;worker:Worker }
interface Game { id:string;gameNumber:string;date:string;startTime:string;division:string;pool:string|null;location:string;team1:string;team2:string;score1:number|null;score2:number|null;refCount:number;isChampionship:boolean;isCanceled:boolean;assignments:Assignment[];ownClub?:boolean }
// ownClub: the viewer's own club plays, so someone else posts the score (lib/ownClub).
interface Tournament { id:string;name:string;dates:string;startDate?:string;endDate?:string;divisionRules:string;logoUrl:string;teams?:string[];scores?:boolean|null }
interface Availability { workerId:string;date:string;timeSlots:string }
interface RosterEntry { workerId:string;gameTarget:number }
interface GapEntry { gameNumber:string;division:string;location:string;missingRoles:string[] }
// One pick from an Auto-assign preview, before it is saved.
interface AaPick { gameId:string;role:string;workerId:string;workerName:string;workerGender:string;gameNumber:string;division:string;startTime:string;location:string }
const aaKey=(p:{gameId:string;role:string})=>`${p.gameId}|${p.role}`
const aaRole=(r:string)=>r==='scorekeeper'?'SK':r==='ref1'?'R1':r==='ref2'?'R2':'R3'
const lastWord=(n:string)=>String(n||'').trim().split(/\s+/).pop()||n
const aaTime=(t:string)=>{const[h,m]=t.split(':').map(Number);return`${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`}

const FIELD_LABELS=[{key:'gameNumber',label:'Game Number',required:true},{key:'date',label:'Game Date',required:true},{key:'startTime',label:'Start Time',required:true},{key:'division',label:'Division',required:true},{key:'location',label:'Location / Field',required:true},{key:'team1',label:'Team 1',required:true},{key:'team2',label:'Team 2',required:true},{key:'pool',label:'Pool',required:false}]

// A worker's main job, short, for "(Field ops→SK)" on a scorekeeper pick.
const mainJob=(r:string)=>r==='ref'?'Ref':r==='field_ops'?'Field ops':r==='athletic_trainer'?'Trainer':r==='scorekeeper'?'SK':'Staff'
function staffKind(w:Worker):{label:string;dot:string}{
  if(w.defaultRole==='scorekeeper')return{label:'Scorekeeper',dot:'bg-emerald-500'}
  // Field ops and trainers are on the board when they also keep score. They are not refs,
  // so they don't get a ref color.
  if(w.defaultRole==='field_ops'||w.defaultRole==='athletic_trainer')return{label:mainJob(w.defaultRole),dot:'bg-slate-400'}
  if(w.gender==='boys')return{label:'Boys ref',dot:'bg-blue-500'}
  if(w.gender==='girls')return{label:'Girls ref',dot:'bg-pink-500'}
  return{label:'Boys & girls ref',dot:'bg-violet-500'}
}
function staffRank(w:Worker):number{
  if(w.defaultRole==='scorekeeper')return 3
  if(w.gender==='boys')return 0
  if(w.gender==='girls')return 1
  return 2
}

// Searchable dropdown component
function SearchSelect({ value, onChange, options, placeholder, assigned, disabled, chip, offList }: {
  value: string; onChange: (v:string)=>void
  options: {id:string;label:string;listLabel?:string;sublabel?:string;warning?:boolean;dot?:string;busy?:string;level?:number|null}[]
  placeholder: string; assigned: boolean; disabled: boolean
  /** Name of whoever holds this slot when they aren't in the pick list (off this event's
   *  roster). Without it the box read "unassigned" while someone was on the game, and
   *  their games flagged double-booked with no name to go on (Zuri, Oct 20 2026). */
  offList?: string
  /** Compact board: a one-line chip (role · last name · games) instead of the row select. */
  chip?: { short:string; color:string; display:string; count?:number; danger?:boolean; tone:'ref'|'sk'; title?:string
    /** Officials' confirmations (lib/officialConfirm): they confirmed this game; or, on an
     *  open slot, who said they can't work it. */
    confirmed?:boolean; declined?:string }
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
  // People already working another game at this time sink to the bottom, greyed
  // out and not pickable (the one already in this slot stays selectable).
  const isBusy=(o:{id:string;busy?:string})=>!!o.busy&&o.id!==value
  // listLabel: how the pick list shows it ("Cox, Chris 4"); search finds either form.
  const filtered=options.filter(o=>[o.label,o.listLabel||''].some(l=>l.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>Number(isBusy(a))-Number(isBusy(b)))

  const list=(
    <div className="max-h-48 overflow-y-auto">
      <div className="px-2 py-1.5 text-[10px] text-slate-400 hover:bg-slate-50 cursor-pointer border-b border-slate-100" onClick={()=>{onChange('');setOpen(false);setSearch('')}}>— unassigned —</div>
      {filtered.length===0?<div className="px-3 py-2 text-[10px] text-slate-400">No matches</div>:filtered.map(o=>isBusy(o)?(
        <div key={o.id} aria-disabled="true" title={`Already working ${o.busy} at this time`} className="px-2 py-1.5 cursor-not-allowed bg-slate-50 opacity-60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 line-through decoration-slate-300">{o.dot&&<span className={`w-1.5 h-1.5 rounded-full shrink-0 ${o.dot}`}/>}<RefLevelPill level={o.level}/>{o.listLabel||o.label}</div>
          <div className="text-[10px] text-slate-500">Busy · on {o.busy}</div>
        </div>
      ):(
        <div key={o.id} onClick={()=>{onChange(o.id);setOpen(false);setSearch('')}}
          className={`px-2 py-1.5 cursor-pointer hover:bg-sky-50 ${o.id===value?'bg-sky-100':''}`}>
          <div className={`flex items-center gap-1 text-[11px] font-medium ${o.warning?'text-amber-600':'text-slate-800'}`}>{o.dot&&<span className={`w-1.5 h-1.5 rounded-full shrink-0 ${o.dot}`}/>}<RefLevelPill level={o.level}/>{o.warning?'⚠ ':''}{o.listLabel||o.label}</div>
          {o.sublabel&&<div className="text-[10px] text-slate-400">{o.sublabel}</div>}
        </div>
      ))}
    </div>
  )

  if(chip){
    const look=chip.danger?'bg-red-50 border-red-300 text-red-700'
      :!assigned&&chip.declined?'bg-red-50 border-dashed border-red-300 text-red-700 hover:border-red-400'
      :assigned?(chip.tone==='sk'?'bg-emerald-50 border-emerald-200 text-slate-900':'bg-teal-50 border-teal-200 text-slate-900')
      :'bg-white border-dashed border-slate-300 text-slate-400 hover:border-teal-500 hover:bg-teal-50'
    return(
      <div ref={ref} className="relative w-full min-w-0">
        <button type="button" disabled={disabled} title={chip.title}
          onClick={()=>{if(!disabled){setOpen(o=>!o);setTimeout(()=>inputRef.current?.focus(),50)}}}
          className={`flex items-center gap-1 h-5 w-full px-1 rounded-md border text-[10px] min-w-0 text-left transition-colors ${look} ${disabled?'opacity-50 cursor-not-allowed':''}`}>
          <span className="text-[8px] font-extrabold shrink-0" style={{color:chip.danger?'#b91c1c':chip.color}}>{chip.short}</span>
          {assigned&&<RefLevelPill level={selected?.level} small/>}
          <span className={`truncate ${assigned?'font-semibold':'font-medium'}`}>{assigned?chip.display:chip.declined?`open · ${chip.declined}`:'open'}</span>
          {assigned&&chip.confirmed&&<span className="text-emerald-600 text-[9px] font-black shrink-0" aria-label="Confirmed">✓</span>}
          {assigned&&chip.count!==undefined&&<span className={`ml-auto text-[9px] shrink-0 ${chip.danger?'text-red-600':'text-slate-500'}`}>{chip.count}</span>}
        </button>
        {open&&(
          <div className="absolute z-50 left-0 top-full mt-0.5 w-56 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <input ref={inputRef} className="w-full px-2 py-1.5 text-[11px] border-b border-slate-100 outline-none" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Type a name…"/>
            {list}
          </div>
        )}
      </div>
    )
  }

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
          <span className={`flex items-center gap-1 truncate ${assigned?'text-sky-800':'text-slate-400'}`}>{selected?.dot&&<span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected.dot}`}/>}<RefLevelPill level={selected?.level} small/>{selected?.label||(assigned?<span className="text-amber-700" title="On this game but not on the event's staff roster. Take them off or add them to the roster.">⚠ {offList||'Not on the roster'}</span>:placeholder)}</span>
        )}
      </div>
      {open&&(
        <div className="absolute z-50 left-0 top-6 w-52 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          {list}
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
  // A schedule laid out as times down, fields across (lib/gridSchedule, Bo Oct 19 2026):
  // the grids found in the file, whether we import it that way, and the day for each grid.
  const [grids,setGrids]=useState<{key:string;label:string;fields:number;games:number;first:string;last:string;dateGuess:string}[]>([])
  const [gridMode,setGridMode]=useState(false)
  const [gridDates,setGridDates]=useState<Record<string,string>>({})

  // Auto-assign state
  const [showAutoAssign,setShowAutoAssign]=useState(false)
  const [stickyScorekeeper,setStickyScorekeeper]=useState(true)
  // Which slots Auto-assign fills: scorekeepers, boys' refs, girls' refs, each on its own.
  // Nothing ticked to start (Bo, Oct 20 2026): the assigner picks what to fill, so nobody
  // auto-assigns over another assigner's crew by clicking through.
  const AA_NONE={scorekeepers:false,boysRefs:false,girlsRefs:false}
  const [aaFill,setAaFill]=useState(AA_NONE)
  // A scorekeeper picked for each field (optional), per day, remembered in this browser.
  const [aaSkFields,setAaSkFieldsRaw]=useState<Record<string,string>>({})
  const skKey=`wr-sk-fields:${params.id}:${activeDay}`
  useEffect(()=>{try{setAaSkFieldsRaw(JSON.parse(localStorage.getItem(skKey)||'{}')||{})}catch{setAaSkFieldsRaw({})}},[skKey])
  const setAaSkField=(field:string,wid:string)=>setAaSkFieldsRaw(m=>{const n={...m};if(wid)n[field]=wid;else delete n[field];try{localStorage.setItem(skKey,JSON.stringify(n))}catch{};return n})
  const [autoAssigning,setAutoAssigning]=useState(false)
  const [autoResult,setAutoResult]=useState<{assigned:number;gaps:GapEntry[];missingRefs:number;missingSKs:number;summary:string;preview?:boolean;proposals?:AaPick[]}|null>(null)
  // Preview first (Bo, Oct 12 2026): picks shown before anything is saved; untick to drop one.
  const [aaDrop,setAaDrop]=useState<Set<string>>(new Set())

  // Clear assignments state
  const [showClear,setShowClear]=useState(false)
  const [clearArmed,setClearArmed]=useState(false) // second-click confirmation step
  const [clearFields,setClearFields]=useState<Set<string>>(new Set()) // empty = all fields
  const [clearName,setClearName]=useState('')
  const [clearSaving,setClearSaving]=useState(false)
  // Clear one person's games by name (Bo, Oct 17 2026: "a scorekeeper said she
  // can't work the entire weekend, so now I can just look her up by name").
  const [clearMode,setClearMode]=useState<'group'|'person'>('group')
  const [clearWho,setClearWho]=useState('')
  const [clearWhoQ,setClearWhoQ]=useState('')
  const [clearScope,setClearScope]=useState<'event'|'day'>('event')
  const [clearMarkOut,setClearMarkOut]=useState(true)
  const [clearCategories,setClearCategories]=useState<Set<string>>(new Set())

  // View mode
  const [viewMode,setViewMode]=useState<'grid'|'list'|'division'|'staff'>('grid')
  const [staffViewId,setStaffViewId]=useState('')
  const [listSearch,setListSearch]=useState('')
  const [listDivFilter,setListDivFilter]=useState('all')
  // Boys / girls games (Bo, Oct 6 2026). On the grid, games outside the filter
  // (this, the division select or the search) gray out rather than vanish, so
  // the field-by-time layout stays put while you work one side.
  const [genderFilter,setGenderFilter]=useState<'all'|'boys'|'girls'>('all')

  // Inline assignment expand (list/division views)
  const [assignExpandId,setAssignExpandId]=useState<string|null>(null)

  // Drag and drop
  const [dragGame,setDragGame]=useState<Game|null>(null)
  const [dragOver,setDragOver]=useState<{time:string;field:string}|null>(null)
  const [dragWorker,setDragWorker]=useState<Worker|null>(null)
  const [dragSlot,setDragSlot]=useState<string|null>(null)
  const [locked,setLocked]=useState(false)
  // Assigners staff games; the scheduler moves and edits them (Bo, Oct 13 2026). They keep
  // refs per game. The API refuses the rest too (api/games/[id], games POST, import).
  const { effectiveRole, planOff }=useRole()
  const noSchedule=effectiveRole==='assigner'
  const gameLocked=locked||noSchedule
  const [showNotify,setShowNotify]=useState(false)
  const [showDivs,setShowDivs]=useState(false)
  // A division that says neither boys nor girls goes by the event's teams (lib/eventTeams).
  const side=teamsSide(tournament?.teams)
  // Bumped after Notify officials sends, which also shows those crews to staff.
  const [releaseKey,setReleaseKey]=useState(0)
  // Officials' confirmations (lib/officialConfirm): each slot's answer and the open slots
  // someone said they can't work. Only directors, admins and assigners get them.
  const [confirms,setConfirms]=useState<{ask:{confirmBy:string}|null;totals:{officials:number;confirmed:number};slots:Record<string,string>;openDeclines:Record<string,{name:string;note:string}>}|null>(null)
  const markFor=(gameId:string,role:string)=>confirms?{st:confirms.slots[`${gameId}|${role}`],declined:confirms.openDeclines[`${gameId}|${role}`]}:undefined
  const [gamesPerRef,setGamesPerRef]=useState(6)
  const [reqsOpen,setReqsOpen]=useState(false)

  // Collapsible field columns
  const [collapsedFields,setCollapsedFields]=useState<Set<string>>(new Set())
  function toggleField(f:string){setCollapsedFields(s=>{const n=new Set(s);n.has(f)?n.delete(f):n.add(f);return n})}

  // Collapsible time rows
  const [collapsedTimes,setCollapsedTimes]=useState<Set<string>>(new Set())
  function toggleTime(t:string){setCollapsedTimes(s=>{const n=new Set(s);n.has(t)?n.delete(t):n.add(t);return n})}

  // Board density and fit (Oct 2026). A game card was 190 px wide and ~200 px tall,
  // so Saturday at 10 fields x 13 start times needed 2,000 x 2,600 px and most of
  // it was off-screen even on a large monitor. Compact (default) is a 3-line card;
  // Mini is one line; Full is the old card. Fit shares the width between the
  // day's fields so there is no sideways scroll. Remembered per tournament.
  type Density='full'|'compact'|'mini'
  const [density,setDensityRaw]=useState<Density>('compact')
  const [fitFields,setFitFieldsRaw]=useState(true)
  const [miniOpen,setMiniOpen]=useState<Set<string>>(new Set())   // games shown as a card while in Mini
  // Refs or Scorekeepers only (Bo, Oct 19 2026): every card shows just those slots, and the
  // open counts, Needs crew and "x of y crewed" count only them. Compact cards drop the teams
  // line so a crew reads at a glance; Full still shows them.
  const [crewShow,setCrewShow]=useState<'all'|'refs'|'sk'>('all')
  // Staffing panel (Oct 2026 redesign): the staff list, the staffing needs and the Staff portal
  // switches moved off the top of the page. Minimized to a rail, a slide-in over the board, or
  // pinned beside it (pinned is remembered on this browser).
  const [panelMode,setPanelModeRaw]=useState<'rail'|'open'|'pinned'>('rail')
  const [panelTab,setPanelTab]=useState<'staff'|'needs'|'portal'>('staff')
  const [statusFilter,setStatusFilter]=useState<'all'|'open'|'bad'>('all')
  const [moreOpen,setMoreOpen]=useState(false)
  const [printOpen,setPrintOpen]=useState(false)
  const [layoutOpen,setLayoutOpen]=useState(false)
  const [staffSearch,setStaffSearch]=useState('')
  const [staffSort,setStaffSort]=useState<'load'|'name'>('load')
  const [staffFilter,setStaffFilter]=useState<'all'|'boys'|'girls'|'sk'>('all')
  useEffect(()=>{try{
    const d=localStorage.getItem('assignerDensity:'+params.id); if(d==='full'||d==='compact'||d==='mini')setDensityRaw(d)
    const f=localStorage.getItem('assignerFit:'+params.id); if(f==='0')setFitFieldsRaw(false)
    if(localStorage.getItem('assignerPanel')==='pinned')setPanelModeRaw('pinned')
  }catch{}},[params.id])
  function setDensity(d:Density){setDensityRaw(d);setMiniOpen(new Set());try{localStorage.setItem('assignerDensity:'+params.id,d)}catch{}}
  // Escape closes an open menu first, then a floating Staffing panel (pinned stays put).
  useEffect(()=>{
    function onKey(e:KeyboardEvent){
      if(e.key!=='Escape')return
      if(moreOpen||layoutOpen||printOpen){setMoreOpen(false);setLayoutOpen(false);setPrintOpen(false);return}
      if(panelMode==='open')setPanelModeRaw('rail')
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[moreOpen,layoutOpen,printOpen,panelMode])
  function setPanelMode(m:'rail'|'open'|'pinned'){setPanelModeRaw(m);try{localStorage.setItem('assignerPanel',m==='pinned'?'pinned':'rail')}catch{}}
  function setFitFields(v:boolean){setFitFieldsRaw(v);try{localStorage.setItem('assignerFit:'+params.id,v?'1':'0')}catch{}}

  // Game edit/add
  const [editGame,setEditGame]=useState<Game|null>(null)
  const [showAddGame,setShowAddGame]=useState(false)
  // Build a schedule by hand, and delete the games to start over (Bo, Oct 19 2026): a head
  // assigner handed a schedule that didn't import well can wipe it and lay it out here.
  const [showBuilder,setShowBuilder]=useState(false)
  const [delGames,setDelGames]=useState<null|'day'|'all'>(null)
  const [deletingGames,setDeletingGames]=useState(false)
  const [gameForm,setGameForm]=useState<Record<string,unknown>>({})
  const [gameSaving,setGameSaving]=useState(false)

  const load=useCallback(async()=>{
    const [tR,gR,wR,aR,rR]=await Promise.all([
      fetch(`/api/tournaments/${params.id}`),fetch(`/api/tournaments/${params.id}/games`),
      fetch(`/api/workers?tournamentId=${params.id}`),fetch(`/api/availability?tournamentId=${params.id}`),
      fetch(`/api/tournaments/${params.id}/roster`),
    ])
    const t=await tR.json();const g=await gR.json();const w=await wR.json();const a=await aR.json();const r=await rR.json()
    setTournament(t);setGames(g);setWorkers(w);setAvails(a)
    setRoster(r.map((e:{workerId:string;gameTarget:number})=>({workerId:e.workerId,gameTarget:e.gameTarget})))
    // Same days as the Scheduler: start..end from Setup plus any day a game is on.
    const dates=eventDayList(t,(Array.isArray(g)?g:[]).map((x:Game)=>x.date))
    // ?day= opens that day (a "can't work" email's Fill it on the Assigner button).
    const want=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('day'):null
    if(dates.length>0)setActiveDay(d=>d&&dates.includes(d)?d:want&&dates.includes(want)?want:dates[0])
    resetDivisionColors();setLoading(false)
    fetch(`/api/tournaments/${params.id}/official-confirm`).then(x=>x.ok?x.json():null).then(d=>setConfirms(d&&d.slots?d:null)).catch(()=>{})
  },[params.id])

  useEffect(()=>{load()},[load])
  useEffect(()=>{try{setLocked(localStorage.getItem('assignerLocked:'+params.id)==='1');const g=localStorage.getItem('gamesPerRef:'+params.id);if(g)setGamesPerRef(Math.max(1,parseInt(g)||6))}catch{}},[params.id])
  function toggleLock(v:boolean){setLocked(v);try{localStorage.setItem('assignerLocked:'+params.id,v?'1':'0')}catch{}}
  function changeGamesPerRef(n:number){const v=Math.max(1,Number.isFinite(n)?n:1);setGamesPerRef(v);try{localStorage.setItem('gamesPerRef:'+params.id,String(v))}catch{}}

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
    // A grid whose columns don't map to games opens as a grid import. Each grid's day is the
    // date in its title, else the event's days in order (setup dates, not stored game dates,
    // which a bad import can fill with junk).
    const gs=Array.isArray(data.grids)?data.grids:[]
    setGrids(gs)
    setGridMode(gs.length>0&&FIELD_LABELS.filter(f=>f.required&&guessed[f.key]).length<4)
    const days=eventDayList({startDate:tournament?.startDate,endDate:tournament?.endDate},[])
    setGridDates(Object.fromEntries(gs.map((g:{key:string;dateGuess:string},i:number)=>[g.key,g.dateGuess||days[i]||days[0]||''])))
    if(fileRef.current)fileRef.current.value=''
  }
  function closeImport(){setImportStep('idle');setPendingFile(null);setHeaders([]);setPreview([]);setMapping({});setGrids([]);setGridMode(false);setGridDates({})}

  async function confirmImport(){
    if(!pendingFile)return
    if(gridMode){
      if(!grids.some(g=>gridDates[g.key])){toast.error('Pick a day for the grid');return}
    }else{
      const missing=FIELD_LABELS.filter(f=>f.required&&!mapping[f.key])
      if(missing.length>0){toast.error(`Please map: ${missing.map(f=>f.label).join(', ')}`);return}
    }
    setImportStep('importing')
    const fd=new FormData();fd.append('file',pendingFile)
    if(gridMode)fd.append('grid',JSON.stringify({dates:gridDates}));else fd.append('mapping',JSON.stringify(mapping))
    const res=await fetch(`/api/tournaments/${params.id}/import`,{method:'POST',body:fd})
    const data=await res.json()
    if(res.ok){toast.success(`Imported ${data.imported} games`);setActiveDay('');await load()}
    else toast.error(data.error||'Import failed')
    closeImport()
  }

  async function runAutoAssign(preview=true){
    setAutoAssigning(true)
    const res=await fetch(`/api/tournaments/${params.id}/auto-assign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:activeDay,stickyScorekeeper,fill:aaFill,preview,skFields:stickyScorekeeper&&aaFill.scorekeepers?aaSkFields:{}})})
    const data=await res.json().catch(()=>({}))
    if(res.ok){setAaDrop(new Set());setAutoResult(data);if(!preview)await load()}
    else toast.error(data.error||'Auto-assign failed')
    setAutoAssigning(false)
  }
  async function applyAutoAssign(){
    const picks=(autoResult?.proposals??[]).filter(p=>!aaDrop.has(aaKey(p))).map(p=>({gameId:p.gameId,role:p.role,workerId:p.workerId}))
    if(!picks.length)return
    setAutoAssigning(true)
    const res=await fetch(`/api/tournaments/${params.id}/auto-assign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:activeDay,apply:picks})})
    const data=await res.json().catch(()=>({}))
    if(res.ok){setAutoResult(data);await load();toast.success(data.summary||'Saved')}
    else toast.error(data.error||'Save failed')
    setAutoAssigning(false)
  }

  function resetClear(){setShowClear(false);setClearArmed(false);setClearName('');setClearCategories(new Set());setClearFields(new Set());setClearMode('group');setClearWho('');setClearWhoQ('');setClearScope('event');setClearMarkOut(true)}
  // Everyone on a game at this event, with their games, for the Clear box's name search.
  function assignedPeople(){
    const by=new Map<string,{id:string;name:string;slots:{g:Game;a:Assignment}[]}>()
    for(const g of games){
      if(g.isCanceled)continue
      for(const a of g.assignments){
        const name=String(a.worker?.name??workerMap.get(a.workerId)?.name??'')
        const p=by.get(a.workerId)||{id:a.workerId,name,slots:[]}
        p.slots.push({g,a});by.set(a.workerId,p)
      }
    }
    for(const p of Array.from(by.values()))p.slots.sort((x,y)=>(x.g.date+x.g.startTime).localeCompare(y.g.date+y.g.startTime))
    return Array.from(by.values()).sort((x,y)=>byLastName(x.name,y.name))
  }
  // Mirrors the clear-assignments route: same kinds, same field filter, same gender rule.
  function clearTargets(kinds:Set<string>,fields:Set<string>){
    let n=0
    for(const g of games){
      if(g.date!==activeDay)continue
      if(fields.size&&!fields.has(g.location))continue
      const gg=gameGender(g.division,side)
      const refsHit=(kinds.has('girls-refs')&&gg!=='boys')||(kinds.has('boys-refs')&&gg!=='girls')
      for(const a of g.assignments){
        if(a.role==='scorekeeper'?kinds.has('scorekeepers'):refsHit&&/^ref[123]$/.test(a.role))n++
      }
    }
    return n
  }

  async function clearPerson(){
    const who=assignedPeople().find(p=>p.id===clearWho)
    if(!clearArmed||!clearName.trim()||!who)return
    const day=clearScope==='day'?activeDay:''
    const outDays=clearScope==='day'?[activeDay]:dates
    setClearSaving(true)
    try{
      const res=await fetch(`/api/tournaments/${params.id}/clear-assignments`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletedBy:clearName.trim(),workerId:who.id,date:day})})
      const data=await res.json().catch(()=>({}))
      if(!res.ok){toast.error(data.error||'Failed to clear');setClearArmed(false);setClearSaving(false);return}
      let note=''
      if(clearMarkOut&&outDays.length){
        // So Auto-assign and the availability counts stop counting on them.
        const r=await fetch('/api/availability/answers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tournamentId:params.id,dates:outDays,answer:'no',workerId:who.id})})
        note=r.ok?` and marked can't work`:` (couldn't mark them can't work. Set it on Availability)`
      }
      toast.success(`Took ${who.name} off ${data.deleted} game${data.deleted===1?'':'s'}${note}`)
      await load();resetClear()
    }catch{toast.error('Failed to clear');setClearArmed(false)}
    setClearSaving(false)
  }

  async function clearAssignments(){
    if(clearMode==='person')return clearPerson()
    if(!clearArmed||!clearName.trim()||clearCategories.size===0)return
    setClearSaving(true)
    try{
      const res=await fetch(`/api/tournaments/${params.id}/clear-assignments`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletedBy:clearName.trim(),date:activeDay,kinds:Array.from(clearCategories),fields:Array.from(clearFields)})})
      const data=await res.json().catch(()=>({}))
      if(res.ok){toast.success(`Cleared ${data.deleted} assignment${data.deleted===1?'':'s'}`);await load();resetClear()}
      else{toast.error(data.error||'Failed to clear');setClearArmed(false)}
    }catch{toast.error('Failed to clear');setClearArmed(false)}
    setClearSaving(false)
  }

  function openEditGame(g:Game){if(noSchedule)return;setEditGame(g);setGameForm({gameNumber:g.gameNumber,date:g.date,startTime:g.startTime,location:g.location,division:g.division,pool:g.pool??'',team1:g.team1,team2:g.team2,refCount:g.refCount,isChampionship:g.isChampionship,isCanceled:g.isCanceled})}
  function openAddGame(){setShowAddGame(true);setGameForm({gameNumber:'',date:activeDay||dates[0]||'',startTime:'08:00',location:'',division:'',pool:'',team1:'TBD',team2:'TBD',refCount:2,isChampionship:false})}

  async function saveGameEdit(e:React.FormEvent){
    e.preventDefault();if(!editGame)return;setGameSaving(true)
    const res=await fetch(`/api/games/${editGame.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(gameForm)})
    if(res.ok){const d=await res.json().catch(()=>({}));toast.success('Game updated');setEditGame(null);await load();askSideSwitch(d.sideSwitch,load)}else toast.error('Failed')
    setGameSaving(false)
  }

  async function saveNewGame(e:React.FormEvent){
    e.preventDefault();setGameSaving(true)
    const res=await fetch(`/api/tournaments/${params.id}/games`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(gameForm)})
    if(res.ok){toast.success('Game added');setShowAddGame(false);await load()}else toast.error('Failed')
    setGameSaving(false)
  }

  // Canceling keeps the game on the board but takes it out of the event: it stops
  // counting toward pool games and leaves the public schedule. The button used to
  // read just "Cancel", next to the dialog's own "Cancel", and Bo canceled Girls LS
  // P1 thinking it closed the box (Oct 17 2026). So it says what it does, and asks.
  async function cancelGame(g:Game){
    const next=!g.isCanceled
    if(next&&!confirm(`Cancel game #${g.gameNumber} (${g.team1} vs ${g.team2})?\n\nIt stays on the board marked Canceled, stops counting as a game for both teams, and comes off the public schedule. You can restore it any time.\n\nTo just close this box, click Close instead.`))return
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
    const r=await fetch(`/api/games/${gameId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({[field]:val})}).catch(()=>null)
    if(!r?.ok){const j=r?await r.json().catch(()=>null):null;toast.error(j?.error||'Could not save that score')}
    await load()
  }
  async function setRefCount(gameId:string,n:number){
    const clamped=Math.max(1,Math.min(3,n))
    await fetch(`/api/games/${gameId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({refCount:clamped})})
    await load()
  }
  async function applyDefaultRefs(n:number){
    const dg=games.filter(g=>g.date===activeDay)
    if(!confirm(`Set every game on this day (${dg.length}) to ${n} ref${n!==1?'s':''}? You can still adjust individual games afterward.`))return
    await Promise.all(dg.map(g=>fetch(`/api/games/${g.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({refCount:n})})))
    toast.success('Updated ref counts')
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

  // Who is already working each time slot (date|time -> worker -> games), so a
  // pick list can grey out someone who is already on another field at that time.
  // The doubled set above only caught people ALREADY on two games, so the list
  // happily offered a person who was on one game at the same time.
  const busyIndex=new Map<string,Map<string,{gameId:string;where:string}[]>>()
  for(const g of games){
    const k=g.date+'|'+g.startTime
    let inner=busyIndex.get(k); if(!inner){inner=new Map();busyIndex.set(k,inner)}
    for(const a of g.assignments){const l=inner.get(a.workerId)||[];l.push({gameId:g.id,where:`${(g.location||'').split(' - ').pop()} · #${g.gameNumber}`});inner.set(a.workerId,l)}
  }
  function busyFor(game:Game,workerId:string):string|undefined{
    const l=busyIndex.get(game.date+'|'+game.startTime)?.get(workerId)
    return l?.find(x=>x.gameId!==game.id)?.where
  }

  const rosterIds=new Set(roster.map(r=>r.workerId))
  const rosterWorkers=workers.filter(w=>rosterIds.has(w.id))

  // Last names for the compact chips: at 10 fields across a chip is ~70 px, and
  // "Andriesse 6" fits where "Mark Andriesse 6" does not. Two people sharing a
  // last name get a first initial ("C Cox", "G Cox").
  const lastNames=(()=>{
    const m=new Map<string,string>(); const byLast=new Map<string,Worker[]>()
    for(const w of workers){const parts=w.name.trim().split(/\s+/);const last=(parts[parts.length-1]||w.name).toLowerCase();if(!byLast.has(last))byLast.set(last,[]);byLast.get(last)!.push(w)}
    byLast.forEach(ws=>{for(const w of ws){const parts=w.name.trim().split(/\s+/);const last=parts[parts.length-1]||w.name;m.set(w.id,ws.length>1&&parts.length>1?`${parts[0][0]} ${last}`:last)}})
    return m
  })()
  const lastNameOf=(w:{id:string;name:string})=>lastNames.get(w.id)||w.name.trim().split(/\s+/).pop()||w.name
  // Refs a game needs: its stored count. A championship's default (one more than the
  // division's usual, so 3, or 2 for 7v7) is set on the game by lib/refRules, so the
  // minus button works on it like any other game.
  const slotsOf=(g:Game)=>g.refCount
  const slotRoles=(rc:number)=>['ref1','ref2','ref3'].slice(0,rc)
  // Who is on a game, slot by slot, and whether it is fully crewed.
  const crewOf=(g:Game,doubled:Set<string>)=>{
    const rc=slotsOf(g)
    const parts=[...slotRoles(rc),'scorekeeper'].map((role,i)=>({role,short:role==='scorekeeper'?'SK':`R${i+1}`,a:g.assignments.find(x=>x.role===role)})).filter(p=>crewShow==='all'||(crewShow==='sk')===(p.role==='scorekeeper'))
    const open=parts.filter(p=>!p.a).length
    const dbl=parts.some(p=>p.a&&doubled.has(p.a.workerId))
    return{parts,open,total:parts.length,dbl,full:open===0&&!dbl}
  }
  function workerRoles(w:Worker):string[]{try{const r=JSON.parse(w.roles||'[]');return Array.isArray(r)&&r.length?r:[w.defaultRole]}catch{return[w.defaultRole]}}
  // Anyone with Scorekeeper among their roles, whatever their main job. It used to take
  // only scorekeepers and refs, so a field ops worker who also keeps score (Bo, Oct 12
  // 2026) never appeared on an SK slot.
  function canScorekeeper(w:Worker):boolean{return w.defaultRole==='scorekeeper'||workerRoles(w).includes('scorekeeper')}

  if(loading)return<div className="text-slate-400 text-center py-16">Loading…</div>
  if(!tournament)return<div className="text-red-500">Not found</div>

  const dates=eventDayList(tournament,games.map(g=>g.date))
  // Score boxes on the Full cards: the event's choice on New Tournament / Edit, else the Scores add-on (lib/eventScores).
  const showScores=scoresShown(tournament.scores,planOff)
  const gameGenderOf=(d:string)=>gameGender(d,side)
  // A division that is neither (coed, unnamed) counts as both, so it never hides.
  const filteredOut=(g:Game)=>{
    if(genderFilter!=='all'){const gg=gameGenderOf(g.division);if(gg!=='both'&&gg!==genderFilter)return true}
    if(listDivFilter!=='all'&&g.division!==listDivFilter)return true
    if(listSearch&&![g.gameNumber,g.team1,g.team2,g.division,g.location].some(s=>String(s||'').toLowerCase().includes(listSearch.toLowerCase())))return true
    if(statusFilter!=='all'){const c=crewOf(g,getDoubleBookedWorkers(g.startTime,g.date));if(statusFilter==='open'&&c.open===0)return true;if(statusFilter==='bad'&&!c.dbl)return true}
    return false
  }
  const outCls='grayscale opacity-30 hover:grayscale-0 hover:opacity-100'
  const dayReqs=dates.map(date=>{
    const gs=games.filter(g=>g.date===date&&!g.isCanceled)
    let boys=0,girls=0,both=0
    for(const g of gs){const slots=slotsOf(g);const gg=gameGenderOf(g.division);if(gg==='girls')girls+=slots;else if(gg==='boys')boys+=slots;else both+=slots}
    const fields=new Set(gs.filter(g=>g.location).map(g=>g.location)).size
    return{date,games:gs.length,boys,girls,both,refSlots:boys+girls+both,fields}
  })

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
  // Day-level counts for the header and filters: slots to fill (refs + scorekeeper per game),
  // how many are filled, who is on two games at once, games still short and games with a clash.
  let slotsTotal=0,slotsFilled=0,openGames=0,badGames=0; const doubledIds=new Set<string>()
  for(const t of times)getDoubleBookedWorkers(t).forEach(id=>doubledIds.add(id))
  for(const g of dayGames){if(g.isCanceled)continue;const rc=slotsOf(g);slotsTotal+=rc+1;slotsFilled+=g.assignments.filter(a=>a.role==='scorekeeper'||slotRoles(rc).includes(a.role)).length;const c=crewOf(g,getDoubleBookedWorkers(g.startTime));if(c.open)openGames++;if(c.dbl)badGames++}
  let nBoysGames=0,nGirlsGames=0
  for(const g of dayGames){if(g.isCanceled)continue;const gg=gameGenderOf(g.division);if(gg==='boys')nBoysGames++;else if(gg==='girls')nGirlsGames++}
  const staffedTimes=times.filter(t=>{const gs=dayGames.filter(g=>g.startTime===t&&!g.isCanceled);return gs.length>0&&gs.every(g=>crewOf(g,getDoubleBookedWorkers(t)).full)})
  const segBtn=(on:boolean)=>`h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${on?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-900'}`
  const barBtn='h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors'
  const menuItem='w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-sm text-slate-700 hover:bg-slate-100 text-left'
  const chipBtn='h-8 px-3 rounded-full border border-slate-200 bg-white text-[12.5px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900 disabled:opacity-40 transition-colors'

  return(
    <>
    <div className={games.length>0&&panelMode==='pinned'?'xl:pr-[336px]':''}>
      {/* Import modal */}
      {importStep==='mapping'&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100"><h2 className="text-lg font-bold">{gridMode?'Field grid found':'Map Your Columns'}</h2><p className="text-sm text-slate-500 mt-1">{gridMode?'This file lays the day out with times down the side and fields across the top. Each filled cell becomes a game on that field at that time, with teams TBD and game numbers 1, 2, 3 in time and field order.':'Match each field to a column in your file'}</p>
              {/* An import replaces every game, and their assignments go with them (api/tournaments/[id]/import).
                  It used to say nothing, so re-importing an updated schedule wiped the board's refs. */}
              {games.length>0&&(()=>{const assigned=games.reduce((n,g)=>n+(g.assignments?.length||0),0);return<p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Importing replaces all {games.length} games on this board{assigned>0?<> and removes their <strong>{assigned} assignment{assigned===1?'':'s'}</strong></>:null}.</p>})()}
            </div>
            {gridMode?(
            <div className="px-6 py-4 space-y-3">
              {grids.map(g=>(
                <div key={g.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-semibold text-slate-800">{g.label}</p>
                    <p className="text-xs text-slate-500">{g.games} game{g.games===1?'':'s'} · {g.fields} fields · {formatTime(g.first)} to {formatTime(g.last)}</p>
                  </div>
                  <label className="text-xs font-semibold text-slate-500 inline-flex items-center gap-2">Day
                    <input type="date" className="input h-9 w-auto" value={gridDates[g.key]||''} onChange={e=>setGridDates(d=>({...d,[g.key]:e.target.value}))}/>
                  </label>
                </div>
              ))}
              <p className="text-xs text-slate-500">Times with no AM or PM that come after noon, like 1:30 after 12:45, are read as afternoon. Leave a day blank to skip that grid.</p>
              {headers.length>0&&<button type="button" className="text-xs font-semibold text-teal-700 hover:underline" onClick={()=>setGridMode(false)}>Map columns instead</button>}
            </div>
            ):(
            <div className="px-6 py-4 space-y-3">
              {grids.length>0&&<button type="button" className="text-xs font-semibold text-teal-700 hover:underline" onClick={()=>setGridMode(true)}>This file is a field grid (times down, fields across): import it that way</button>}
              {!grids.length&&FIELD_LABELS.every(f=>!mapping[f.key])&&(
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                  None of this file&apos;s columns look like a game list (one game per row, with a game number, date, time, field and teams). If you were given the day as a grid or a picture, lay it out with <b>Build a schedule</b> instead.
                  <div className="mt-2"><button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={()=>{closeImport();setShowBuilder(true)}}><LayoutGrid size={15}/> Build a schedule</button></div>
                </div>
              )}
              {FIELD_LABELS.map(f=>(
                <div key={f.key} className="flex items-center gap-4">
                  <div className="w-44 shrink-0"><span className="text-sm font-semibold text-slate-700">{f.label}</span>{f.required&&<span className="ml-1 text-red-400 text-xs">*</span>}</div>
                  <select className="select flex-1" value={mapping[f.key]??''} onChange={e=>setMapping(m=>({...m,[f.key]:e.target.value}))}><option value="">{f.required?'— select —':'— skip —'}</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select>
                  {mapping[f.key]&&preview[0]&&<span className="text-xs text-slate-400 w-28 truncate shrink-0">e.g. {preview[0][mapping[f.key]]}</span>}
                </div>
              ))}
            </div>
            )}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button className="btn-secondary" onClick={closeImport}>Cancel</button>
              <button className="btn-primary" onClick={confirmImport}>{games.length>0?'Replace games →':'Import Games →'}</button>
            </div>
          </div>
        </div>
      )}

      {showBuilder&&<ScheduleBuilder tournamentId={params.id} days={eventDayList({startDate:tournament?.startDate,endDate:tournament?.endDate},games.map(g=>g.date))} defaultDay={activeDay||''}
        gamesByDay={games.reduce((m,g)=>{m[g.date]=(m[g.date]||0)+1;return m},{} as Record<string,number>)}
        knownDivisions={[...new Set(games.map(g=>g.division).filter(Boolean))]}
        onClose={()=>setShowBuilder(false)} onDone={async d=>{setShowBuilder(false);await load();setActiveDay(d)}}/>}
      {delGames&&(()=>{
        const scopeGames=delGames==='day'?games.filter(g=>g.date===activeDay):games
        const assigned=scopeGames.reduce((n,g)=>n+(g.assignments?.length||0),0)
        return(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" role="dialog" aria-label="Delete games">
            <h2 className="text-lg font-bold">Delete games</h2>
            {dates.length>1&&activeDay&&(
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={delGames==='day'} onChange={()=>setDelGames('day')}/> Just {formatDate(activeDay)} ({games.filter(g=>g.date===activeDay).length} games)</label>
                <label className="flex items-center gap-2"><input type="radio" checked={delGames==='all'} onChange={()=>setDelGames('all')}/> The whole event ({games.length} games)</label>
              </div>
            )}
            <p className="text-sm text-slate-600">This deletes {scopeGames.length} game{scopeGames.length===1?'':'s'}{assigned>0?<> and takes <strong>{assigned} ref and scorekeeper assignment{assigned===1?'':'s'}</strong> off them</>:null}. It can&apos;t be undone, but you can import or build the schedule again. Officials aren&apos;t sent change alerts for this.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={()=>setDelGames(null)} disabled={deletingGames}>Cancel</button>
              <button type="button" className="h-10 px-4 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50" disabled={deletingGames||!scopeGames.length} onClick={async()=>{
                setDeletingGames(true)
                const res=await fetch(`/api/tournaments/${params.id}/games`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(delGames==='day'?{date:activeDay}:{})})
                const d=await res.json().catch(()=>({}))
                setDeletingGames(false)
                if(!res.ok){toast.error(d.error||'Could not delete the games');return}
                toast.success(`Deleted ${d.deleted} games`);setDelGames(null);setActiveDay('');await load()
              }}>{deletingGames?'Deleting…':`Delete ${scopeGames.length} game${scopeGames.length===1?'':'s'}`}</button>
            </div>
          </div>
        </div>)})()}
      {showDivs && <DivisionsPanel tournamentId={params.id} games={games} side={side} onClose={()=>setShowDivs(false)} onRenamed={load} />}
      {showNotify && <NotifyOfficials tournamentId={params.id} day={activeDay} dayLabel={activeDay?formatDate(activeDay):''} onClose={()=>setShowNotify(false)} onSent={()=>{load();setReleaseKey(k=>k+1)}} />}
      {/* Auto-assign modal */}
      {showAutoAssign&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className={`bg-white rounded-2xl shadow-2xl w-full ${autoResult?.preview?'max-w-3xl':'max-w-md'} max-h-[92vh] flex flex-col`}>
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold">Auto-Assign{autoResult?.preview?' preview':''} — {formatDate(activeDay)}</h2>
              <p className="text-sm text-slate-500 mt-1">Fills open slots using availability and gender, giving each game to whoever has the fewest so far. Won't touch existing assignments.</p>
            </div>
            {!autoResult?(
              <div className="px-6 py-5 space-y-4">
                {(()=>{
                  // Open slots of each kind on this day (not canceled), so the choice shows what it will fill.
                  const open={scorekeepers:0,boysRefs:0,girlsRefs:0}
                  for(const g of dayGames){
                    if(g.isCanceled)continue
                    if(!g.assignments.some(a=>a.role==='scorekeeper'))open.scorekeepers++
                    const refsOpen=['ref1','ref2','ref3'].slice(0,slotsOf(g)).filter(r=>!g.assignments.some(a=>a.role===r)).length
                    const gg=gameGenderOf(g.division)
                    if(gg==='girls')open.girlsRefs+=refsOpen;else open.boysRefs+=refsOpen
                  }
                  const opts:[keyof typeof aaFill,string,string][]=[['scorekeepers','Scorekeepers','bg-emerald-500'],['boysRefs',"Boys' refs",'bg-sky-500'],['girlsRefs',"Girls' refs",'bg-pink-500']]
                  return(
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Fill</p>
                      <div className="grid grid-cols-3 gap-2">
                        {opts.map(([k,label,dot])=>(
                          <label key={k} className={`flex flex-col gap-0.5 cursor-pointer p-2.5 rounded-xl border transition-colors ${aaFill[k]?'border-sky-400 bg-sky-50':'border-slate-200 hover:border-slate-300'}`}>
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><input type="checkbox" checked={aaFill[k]} onChange={e=>setAaFill(f=>({...f,[k]:e.target.checked}))}/><span className={`w-2 h-2 rounded-full ${dot}`}/>{label}</span>
                            <span className="text-[11px] text-slate-500 pl-5">{open[k]} open</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">{!aaFill.scorekeepers&&!aaFill.boysRefs&&!aaFill.girlsRefs?<span className="font-semibold text-amber-700">Tick what you want filled. </span>:null}Unticked ones are left as they are. Tip: run girls&apos; refs first; refs who do both are saved for girls&apos; games when a boys-only ref is free.</p>
                    </div>
                  )
                })()}
                {aaFill.scorekeepers&&<label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:border-sky-300 transition-colors">
                  <input type="checkbox" checked={stickyScorekeeper} onChange={e=>setStickyScorekeeper(e.target.checked)} className="mt-0.5"/>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Keep scorekeepers on one field all day</p>
                    <p className="text-xs text-slate-400 mt-0.5">Each scorekeeper stays on a single field for all games. Recommended for consistency.</p>
                  </div>
                </label>}
                {aaFill.scorekeepers&&stickyScorekeeper&&(()=>{
                  const dayFields=[...new Set(dayGames.filter(g=>!g.isCanceled&&g.location).map(g=>g.location))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
                  const sks=rosterWorkers.filter(w=>canScorekeeper(w)).sort((a,b)=>(a.defaultRole==='scorekeeper'?0:1)-(b.defaultRole==='scorekeeper'?0:1)||byLastName(a.name,b.name))
                  const fieldOf=new Map(Object.entries(aaSkFields).map(([f,w])=>[w,f]))
                  const short=(f:string)=>f.split(' - ').pop()||f
                  const picked=dayFields.filter(f=>aaSkFields[f]).length
                  return(
                    <details className="rounded-xl border border-slate-200 px-3 py-2" open={picked>0}>
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Pick the scorekeeper for each field <span className="font-normal text-slate-400">({picked} of {dayFields.length} set · the rest are automatic)</span></summary>
                      <div className="grid grid-cols-1 gap-y-1.5 mt-2 max-h-56 overflow-y-auto pr-1">
                        {dayFields.map(f=>(
                          <label key={f} className="flex items-center gap-2 text-xs">
                            <span className="w-24 truncate text-slate-600 font-medium" title={f}>{short(f)}</span>
                            <select className="flex-1 min-w-0 border border-slate-200 rounded-lg px-1.5 py-1 text-xs bg-white" value={aaSkFields[f]??''} onChange={e=>setAaSkField(f,e.target.value)}>
                              <option value="">Auto</option>
                              {sks.map(w=>{const on=fieldOf.get(w.id);return<option key={w.id} value={w.id} disabled={!!on&&on!==f}>{w.name}{w.defaultRole!=='scorekeeper'?` (${mainJob(w.defaultRole).toLowerCase()})`:''}{on&&on!==f?` — on ${short(on)}`:''}</option>})}
                            </select>
                          </label>
                        ))}
                      </div>
                      {sks.length===0&&<p className="text-xs text-amber-600 mt-1">No scorekeepers on the roster yet.</p>}
                    </details>
                  )
                })()}
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={()=>setShowAutoAssign(false)}>Cancel</button>
                  <button className="btn-primary flex-1" onClick={()=>runAutoAssign(true)} disabled={autoAssigning||(!aaFill.scorekeepers&&!aaFill.boysRefs&&!aaFill.girlsRefs)}>{autoAssigning?'Working…':'Preview'}</button>
                </div>
                <button className="w-full text-xs text-slate-400 hover:text-slate-600" onClick={()=>runAutoAssign(false)} disabled={autoAssigning||(!aaFill.scorekeepers&&!aaFill.boysRefs&&!aaFill.girlsRefs)}>Skip the preview and assign now</button>
              </div>
            ):autoResult.preview?(
              <div className="px-6 py-4 flex flex-col min-h-0 flex-1">
                {(()=>{
                  const picks=autoResult.proposals??[]
                  const keep=picks.filter(p=>!aaDrop.has(aaKey(p))).length
                  const byTime=new Map<string,AaPick[]>()
                  for(const p of picks){const k=p.startTime;if(!byTime.has(k))byTime.set(k,[]);byTime.get(k)!.push(p)}
                  const times=[...byTime.keys()].sort()
                  const perPerson=new Map<string,number>()
                  for(const p of picks)if(!aaDrop.has(aaKey(p)))perPerson.set(p.workerName,(perPerson.get(p.workerName)??0)+1)
                  const toggle=(k:string)=>setAaDrop(d=>{const n=new Set(d);if(n.has(k))n.delete(k);else n.add(k);return n})
                  return(<>
                    <div className={`p-3 rounded-xl mb-3 text-sm ${autoResult.gaps.length===0?'bg-emerald-50 border border-emerald-200 text-emerald-800':'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                      <b>{picks.length} picks</b>, nothing saved yet. Untick any you don&apos;t want, then Save.{autoResult.gaps.length>0&&<> {autoResult.gaps.length} game{autoResult.gaps.length===1?'':'s'} would still be short: {autoResult.missingRefs>0&&`${autoResult.missingRefs} ref slot${autoResult.missingRefs===1?'':'s'}`}{autoResult.missingRefs>0&&autoResult.missingSKs>0&&', '}{autoResult.missingSKs>0&&`${autoResult.missingSKs} scorekeeper slot${autoResult.missingSKs===1?'':'s'}`}.</>}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {picks.length===0&&<p className="text-sm text-slate-400 text-center py-8">Nothing to fill with these choices.</p>}
                      {times.map(t=>(
                        <div key={t}>
                          <div className="sticky top-0 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">{aaTime(t)}</div>
                          {byTime.get(t)!.sort((a,b)=>a.location.localeCompare(b.location,undefined,{numeric:true})||a.role.localeCompare(b.role)).map(p=>{
                            const k=aaKey(p),on=!aaDrop.has(k)
                            return(
                              <label key={k} className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50 ${on?'':'opacity-40 line-through'}`}>
                                <input type="checkbox" checked={on} onChange={()=>toggle(k)}/>
                                <span className="w-24 truncate text-slate-500">{(p.location||'').split(' - ').pop()}</span>
                                <span className="w-16 font-mono text-slate-500">#{p.gameNumber}</span>
                                <span className="flex-1 truncate text-slate-600">{p.division}</span>
                                <span className={`w-7 text-center rounded font-bold text-[10px] py-0.5 ${p.role==='scorekeeper'?'bg-emerald-100 text-emerald-700':'bg-sky-100 text-sky-700'}`}>{aaRole(p.role)}</span>
                                <span className="w-44 truncate font-semibold text-slate-800 inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.workerGender==='girls'?'bg-pink-500':p.workerGender==='boys'?'bg-sky-500':'bg-violet-500'}`}/>{p.workerName}<span className="font-normal text-slate-400">({perPerson.get(p.workerName)??0})</span></span>
                              </label>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                    {autoResult.gaps.length>0&&(
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-slate-500 font-semibold">Games still short ({autoResult.gaps.length})</summary>
                        <div className="max-h-32 overflow-y-auto mt-1 space-y-1">
                          {autoResult.gaps.map((g,i)=>(<div key={i} className="flex justify-between bg-slate-50 rounded px-2 py-1"><span>#{g.gameNumber} · {g.division} · {(g.location||'').split(' - ').pop()}</span><span className="text-red-500">{g.missingRoles.join(', ')}</span></div>))}
                        </div>
                      </details>
                    )}
                    <p className="text-[11px] text-slate-400 mt-2">The number after a name is how many games this preview gives them today. Dot: pink girls&apos; ref, blue boys&apos;, purple both.</p>
                    <div className="flex gap-3 mt-3">
                      <button className="btn-secondary flex-1" onClick={()=>setAutoResult(null)} disabled={autoAssigning}>Back</button>
                      <button className="btn-primary flex-1" onClick={applyAutoAssign} disabled={autoAssigning||keep===0}>{autoAssigning?'Saving…':`Save ${keep} assignment${keep===1?'':'s'}`}</button>
                    </div>
                  </>)
                })()}
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
                  <button className="btn-primary flex-1" onClick={()=>{setAutoResult(null);runAutoAssign(true)}} disabled={autoAssigning}>Preview again</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Clear assignments modal */}
      {showClear&&(()=>{
        const KIND_OPTS=[
          {val:'girls-refs',label:'👧 Girls Referees',short:"girls' ref",on:'border-pink-400 bg-pink-50'},
          {val:'boys-refs',label:'👦 Boys Referees',short:"boys' ref",on:'border-sky-400 bg-sky-50'},
          {val:'scorekeepers',label:'📋 Score Keepers',short:'scorekeeper',on:'border-emerald-400 bg-emerald-50'},
        ]
        const fieldList=Array.from(new Set(dayGames.map(g=>g.location).filter(Boolean))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
        const total=clearTargets(clearCategories,clearFields)
        const kindNames=KIND_OPTS.filter(k=>clearCategories.has(k.val)).map(k=>k.short)
        const whereText=clearFields.size===0?'all fields':Array.from(clearFields).join(', ')
        const change=(fn:()=>void)=>{fn();setClearArmed(false)}
        // One person: everyone on a game here, searched by name.
        const people=clearMode==='person'?assignedPeople():[]
        const who=people.find(p=>p.id===clearWho)
        const whoSlots=who?who.slots.filter(x=>clearScope==='event'||x.g.date===activeDay):[]
        const whoDays=who?Array.from(new Set(who.slots.map(x=>x.g.date))).sort():[]
        const q=clearWhoQ.trim().toLowerCase()
        const matches=q?people.filter(p=>p.name.toLowerCase().includes(q)).slice(0,8):[]
        const first=(who?.name||'').split(' ')[0]||'them'
        const roleWord=(r:string)=>r==='scorekeeper'?'SK':r.replace(/^ref/,'R')
        const outDays=clearScope==='day'?[activeDay]:dates
        const n=clearMode==='person'?whoSlots.length:total
        return(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>!clearSaving&&resetClear()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-red-100 bg-red-50 rounded-t-2xl">
              <h2 className="text-lg font-bold text-red-800">Clear Assignments</h2>
              <p className="text-sm text-red-600 mt-1">{clearMode==='group'?<>For <strong>{formatDate(activeDay)}</strong>. </>:null}This cannot be undone.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex gap-0.5 bg-slate-100 rounded-lg p-1" role="tablist" aria-label="Clear by">
                {([['group','By group'],['person','One person']] as const).map(([v,l])=>(
                  <button key={v} type="button" role="tab" aria-selected={clearMode===v} onClick={()=>change(()=>setClearMode(v))}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${clearMode===v?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-800'}`}>{l}</button>
                ))}
              </div>
              {clearMode==='person'&&(
                <div className="space-y-3">
                  {!who?(
                    <div className="space-y-2">
                      <label className="label" htmlFor="clear-who">Who can&apos;t work?</label>
                      <input id="clear-who" className="input" autoFocus placeholder="Start typing a name" value={clearWhoQ} onChange={e=>setClearWhoQ(e.target.value)}/>
                      {q&&!matches.length&&<p className="text-xs text-slate-500">Nobody by that name is on a game at this event.</p>}
                      {matches.length>0&&(
                        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                          {matches.map(p=>(
                            <button key={p.id} type="button" onClick={()=>change(()=>{setClearWho(p.id);setClearWhoQ('')})}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 flex-1">{p.name}</span>
                              <span className="text-xs text-slate-500">{p.slots.length} game{p.slots.length===1?'':'s'} · {Array.from(new Set(p.slots.map(x=>formatDate(x.g.date).split(',')[0]))).join(', ')}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ):(
                    <>
                      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                        <span className="text-sm font-bold text-slate-800 flex-1">{who.name}</span>
                        <button type="button" onClick={()=>change(()=>setClearWho(''))} className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline">Change</button>
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-sm"><input type="radio" name="clear-scope" className="accent-red-600" checked={clearScope==='event'} onChange={()=>change(()=>setClearScope('event'))}/> The whole event <span className="text-slate-400">({who.slots.length} game{who.slots.length===1?'':'s'})</span></label>
                        <label className="flex items-center gap-2 text-sm"><input type="radio" name="clear-scope" className="accent-red-600" checked={clearScope==='day'} onChange={()=>change(()=>setClearScope('day'))}/> Just {formatDate(activeDay)} <span className="text-slate-400">({who.slots.filter(x=>x.g.date===activeDay).length})</span></label>
                      </div>
                      {whoSlots.length>0&&(
                        <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto text-xs">
                          {whoSlots.map(({g,a})=>(
                            <li key={a.id} className="px-3 py-1.5 flex gap-2">
                              <span className="w-24 flex-shrink-0 text-slate-500">{formatDate(g.date).split(',')[0]} {formatTime(g.startTime)}</span>
                              <span className="flex-1 min-w-0 truncate text-slate-700">#{g.gameNumber} {divisionAbbr(g.division)} · {(g.location||'').split(' - ').pop()}</span>
                              <span className="font-semibold text-slate-600">{roleWord(a.role)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="accent-red-600 mt-0.5" checked={clearMarkOut} onChange={e=>change(()=>setClearMarkOut(e.target.checked))}/>
                        <span>Also mark {first} as <b>can&apos;t work</b> {clearScope==='day'?`on ${formatDate(activeDay)}`:whoDays.length?'all weekend':'every day'}<span className="block text-xs text-slate-500">So Auto-assign won&apos;t put {first} back on, and Availability shows it.</span></span>
                      </label>
                    </>
                  )}
                </div>
              )}
              {clearMode==='group'&&<>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">What do you want to clear?</p>
                {KIND_OPTS.map(k=>{
                  const n=clearTargets(new Set([k.val]),clearFields)
                  return(
                  <label key={k.val} className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${clearCategories.has(k.val)?k.on:'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="checkbox" className="w-4 h-4 accent-red-600" checked={clearCategories.has(k.val)} onChange={e=>change(()=>{const s=new Set(clearCategories);e.target.checked?s.add(k.val):s.delete(k.val);setClearCategories(s)})}/>
                    <span className="text-sm font-medium text-slate-800 flex-1">{k.label}</span>
                    <span className={`text-xs font-semibold tabular-nums ${n?'text-slate-600':'text-slate-300'}`}>{n}</span>
                  </label>)
                })}
              </div>
              {fieldList.length>1&&(
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">Which fields?</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={()=>change(()=>setClearFields(new Set()))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${clearFields.size===0?'bg-slate-800 text-white border-slate-800':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>All</button>
                    {fieldList.map(f=>{
                      const on=clearFields.has(f)
                      const n=clearCategories.size?clearTargets(clearCategories,new Set([f])):null
                      return(
                      <button key={f} type="button" aria-pressed={on}
                        onClick={()=>change(()=>{const s=new Set(clearFields);on?s.delete(f):s.add(f);setClearFields(s)})}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${on?'bg-red-600 text-white border-red-600':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {f}{n!==null&&<span className={`ml-1 tabular-nums ${on?'text-red-100':'text-slate-400'}`}>{n}</span>}
                      </button>)
                    })}
                  </div>
                </div>
              )}
              </>}
              <div>
                <label className="label">Your name (for the audit log)</label>
                <input className="input" placeholder="e.g. John Smith" value={clearName} onChange={e=>setClearName(e.target.value)}/>
              </div>
              {!clearArmed?(
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={resetClear}>Cancel</button>
                  <button
                    className="flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-colors bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={()=>setClearArmed(true)}
                    disabled={!clearName.trim()||(clearMode==='person'?!who||n===0:clearCategories.size===0||total===0)}
                  >{clearMode==='person'?(!who?'Pick a person':n===0?'Nothing to clear':`Take ${first} off ${n} game${n===1?'':'s'}…`):clearCategories.size===0?'Pick what to clear':total===0?'Nothing to clear':`Clear ${total} assignment${total===1?'':'s'}…`}</button>
                </div>
              ):(
                <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 space-y-3">
                  <p className="text-sm text-red-800">
                    {clearMode==='person'&&who
                      ?<>Are you sure? This takes <strong>{who.name}</strong> off <strong>{n}</strong> game{n===1?'':'s'} {clearScope==='day'?<>on {formatDate(activeDay)}</>:<>for the whole event</>}{clearMarkOut?<> and marks {first} can&apos;t work {clearScope==='day'?'that day':`on ${outDays.length} day${outDays.length===1?'':'s'}`}</>:null}. Their slots go back to open.</>
                      :<>Are you sure? This removes <strong>{total}</strong> {kindNames.join(' + ')} assignment{total===1?'':'s'} on <strong>{whereText}</strong> for {formatDate(activeDay)}.</>}
                  </p>
                  <div className="flex gap-3">
                    <button className="btn-secondary flex-1" onClick={()=>setClearArmed(false)} disabled={clearSaving}>Go back</button>
                    <button
                      className="flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-colors bg-red-700 text-white hover:bg-red-800 disabled:opacity-40"
                      onClick={clearAssignments}
                      disabled={clearSaving}
                    >{clearSaving?'Clearing…':'Yes, clear them'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>)
      })()}

      {/* ── Page header: shared nav + light toolbar ─────────────────── */}
      <TournamentNav
        id={params.id}
        name={tournament.name}
        logoUrl={tournament.logoUrl}
        stats={{ games: games.length, assigned: assignedCount, pct: Math.round(assignedCount / Math.max(games.length, 1) * 100) }}
      />
      {/* The schedule changed since the newest checkpoint (Oct 21 2026): who had those games. */}
      <CheckpointBanner tournamentId={params.id} />

      {/* Header (Oct 2026 redesign). Assigners said the page was too busy: seven bands sat above the
          first game. Now one action row, one view row and one filter row; the staff list, the
          staffing needs and the Staff portal switches live in the Staffing panel on the right.
          While the panel floats open, these rows make room for it so Notify officials and ⋯ stay
          reachable; the grid underneath keeps its full width. */}
      <div className={panelMode==='open'?'md:pr-[248px]':''}>
      {/* Row 1: which day and view, how full the day is, and the actions */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {dates.length>0&&viewMode!=='staff'&&(
          <div className="inline-flex flex-wrap p-1 rounded-xl bg-slate-100 gap-0.5" role="tablist" aria-label="Day">
            {dates.map(d=>{const n=games.filter(g=>g.date===d).length;return(
              <button key={d} type="button" role="tab" aria-selected={activeDay===d} onClick={()=>setActiveDay(d)} className={segBtn(activeDay===d)}>{formatDate(d)}<span className="text-[11px] font-normal text-slate-400 tabular-nums">{n}</span></button>
            )})}
          </div>
        )}
        {games.length>0&&(
          <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-0.5" aria-label="View">
            {(['grid','list','division','staff'] as const).map(v=>(
              <button key={v} type="button" onClick={()=>setViewMode(v)} aria-pressed={viewMode===v} className={segBtn(viewMode===v)}>{v==='grid'?'Grid':v==='list'?'List':v==='division'?'Division':'Staff'}</button>
            ))}
          </div>
        )}
        {viewMode==='grid'&&dayGames.length>0&&(
          <div className="flex items-center gap-2 ml-1">
            <span className="text-[13px] text-slate-600 whitespace-nowrap"><b className="font-semibold text-slate-900 tabular-nums">{slotsFilled}</b>/<span className="tabular-nums">{slotsTotal}</span> filled</span>
            <span className="hidden sm:block w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden"><span className="block h-full rounded-full bg-teal-600 transition-all" style={{width:`${slotsTotal?Math.round(slotsFilled/slotsTotal*100):0}%`}}/></span>
          </div>
        )}
        {viewMode==='grid'&&doubledIds.size>0&&<button type="button" onClick={()=>setStatusFilter('bad')} title="Show only the games where someone is on two games at once" className="h-7 px-2.5 rounded-full border border-red-200 bg-red-50 text-red-700 text-xs font-semibold inline-flex items-center gap-1.5"><AlertTriangle size={13}/> {doubledIds.size} double-booked</button>}
        {locked&&<button type="button" onClick={()=>toggleLock(false)} className="h-7 px-2.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold inline-flex items-center gap-1.5"><Lock size={13}/> Locked · click to unlock</button>}
        <div className="flex-1"/>
        {confirms?.ask && <Link href={`/tournaments/${params.id}/confirmations`} title="Who has confirmed their games" className={`${barBtn} text-teal-700`}><CheckCheck size={15}/> Confirmed {confirms.totals.confirmed}/{confirms.totals.officials}</Link>}
        {dayGames.length>0&&<button type="button" onClick={()=>{setAaFill(AA_NONE);setShowAutoAssign(true);setAutoResult(null)}} className={barBtn}><Zap size={15} className="text-purple-600"/> Auto-assign</button>}
        {games.length>0&&<button type="button" onClick={()=>setShowNotify(true)} className="h-9 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"><Send size={15}/> Notify officials</button>}
        {/* Bo, Oct 21 2026: "a little icon on the main page just so we know to print", with a
            drop-down that makes the PDF. Each pick opens the print page with the board's Boys /
            Girls and Refs / Scorekeepers filters and brings up the browser's Print (Save as PDF). */}
        {games.length>0&&(()=>{
          const qs=(day:string,layout:string)=>{const q=new URLSearchParams({day,layout,auto:'1'});if(genderFilter!=='all')q.set('side',genderFilter);if(crewShow!=='all')q.set('show',crewShow);return q.toString()}
          const href=(day:string,layout:string)=>`/tournaments/${params.id}/print-schedule?${qs(day,layout)}`
          const note=[genderFilter!=='all'?(genderFilter==='boys'?'Boys games':'Girls games'):'',crewShow==='refs'?'refs only':crewShow==='sk'?'scorekeepers only':''].filter(Boolean).join(', ')
          return(
          <div className="relative">
            <button type="button" aria-label="Print or save as PDF" title="Print or save as PDF" aria-expanded={printOpen} onClick={()=>{setPrintOpen(o=>!o);setMoreOpen(false);setLayoutOpen(false)}} className={`${barBtn} w-9 px-0 justify-center`}><Printer size={16}/></button>
            {printOpen&&(<>
              <div className="fixed inset-0 z-40" onClick={()=>setPrintOpen(false)}/>
              <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Save as PDF{note?` · ${note}`:''}</p>
                {activeDay&&<Link href={href(activeDay,'grid')} className={menuItem} onClick={()=>setPrintOpen(false)}><LayoutGrid size={15} className="text-slate-400"/> {formatDate(activeDay)} · grid</Link>}
                {dates.length>1&&<Link href={href('all','grid')} className={menuItem} onClick={()=>setPrintOpen(false)}><LayoutGrid size={15} className="text-slate-400"/> Every day · grid</Link>}
                {activeDay&&<Link href={href(activeDay,'time')} className={menuItem} onClick={()=>setPrintOpen(false)}><ClipboardList size={15} className="text-slate-400"/> {formatDate(activeDay)} · list by time</Link>}
                {activeDay&&<Link href={href(activeDay,'field')} className={menuItem} onClick={()=>setPrintOpen(false)}><ClipboardList size={15} className="text-slate-400"/> {formatDate(activeDay)} · list by field</Link>}
                <div className="my-1 border-t border-slate-100"/>
                <Link href={`/tournaments/${params.id}/print-schedule`} className={menuItem} onClick={()=>setPrintOpen(false)}><Printer size={15} className="text-slate-400"/> More print choices…</Link>
              </div>
            </>)}
          </div>)
        })()}
        <div className="relative">
          <button type="button" aria-label="More actions" title="More actions" aria-expanded={moreOpen} onClick={()=>{setMoreOpen(o=>!o);setLayoutOpen(false);setPrintOpen(false)}} className={`${barBtn} w-9 px-0 justify-center`}><MoreHorizontal size={16}/></button>
          {moreOpen&&(<>
            <div className="fixed inset-0 z-40" onClick={()=>setMoreOpen(false)}/>
            <div className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {/* Bo, Oct 21 2026: a printable schedule (PDF) and checkpoints of who had each game. */}
              {games.length>0&&<Link href={`/tournaments/${params.id}/print-schedule`} className={menuItem} onClick={()=>setMoreOpen(false)}><Printer size={15} className="text-slate-400"/> Print schedule</Link>}
              <Link href={`/tournaments/${params.id}/checkpoints`} className={menuItem} onClick={()=>setMoreOpen(false)}><History size={15} className="text-slate-400"/> Checkpoints</Link>
              <div className="my-1 border-t border-slate-100"/>
              {!noSchedule&&<button type="button" className={menuItem} onClick={()=>{setMoreOpen(false);openAddGame()}}><Plus size={15} className="text-slate-400"/> Add a game</button>}
              {!noSchedule&&<button type="button" className={menuItem} onClick={()=>{setMoreOpen(false);fileRef.current?.click()}}><Upload size={15} className="text-slate-400"/> Import schedule</button>}
              {!noSchedule&&<button type="button" className={menuItem} onClick={()=>{setMoreOpen(false);setShowBuilder(true)}}><LayoutGrid size={15} className="text-slate-400"/> Build a schedule</button>}
              {!noSchedule&&games.length>0&&<button type="button" className={menuItem} onClick={()=>{setMoreOpen(false);setShowDivs(true)}}><Tags size={15} className="text-slate-400"/> Divisions</button>}
              {!noSchedule&&games.length>0&&<button type="button" className={`${menuItem} text-red-700`} onClick={()=>{setMoreOpen(false);setDelGames(dayGames.length>0&&dates.length>1?'day':'all')}}><Trash2 size={15} className="text-red-400"/> Delete games</button>}
              {!noSchedule&&<div className="my-1 border-t border-slate-100"/>}
              <button type="button" className={menuItem} onClick={()=>{setMoreOpen(false);toggleLock(!locked)}}><Lock size={15} className="text-slate-400"/> {locked?'Unlock editing':'Lock editing'}</button>
              {dayGames.length>0&&(<>
                <div className="my-1 border-t border-slate-100"/>
                <button type="button" className={`${menuItem} text-red-600 hover:bg-red-50`} onClick={()=>{setMoreOpen(false);resetClear();setShowClear(true)}}><Trash2 size={15}/> Clear assignments…</button>
              </>)}
            </div>
          </>)}
          {!noSchedule&&<input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect}/>}
        </div>
      </div>

      {/* Row 2: find and filter on the left (Boys / Girls stays one click away), how the board looks on the right */}
      {games.length>0&&(
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {viewMode!=='staff'&&(<>
            <label className="h-9 flex items-center gap-2 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-400 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/15 w-full sm:w-56">
              <Search size={15}/>
              <input className="flex-1 min-w-0 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none" placeholder="Search team, game, field…" aria-label="Search games" value={listSearch} onChange={e=>setListSearch(e.target.value)}/>
            </label>
            <select className="h-9 max-w-[12rem] bg-white text-slate-700 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/15 focus:border-teal-500" aria-label="Division" value={listDivFilter} onChange={e=>setListDivFilter(e.target.value)}>
              <option value="all">All divisions</option>
              {[...new Set(games.map(g=>g.division))].sort().map(d=><option key={d} value={d}>{d}</option>)}
            </select>
            {/* Boys / Girls: blue or pink when on, with that day's game count; clicking the one that's on goes back to All. */}
            <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-0.5" role="group" aria-label="Boys or girls games">
              <button type="button" onClick={()=>setGenderFilter('all')} aria-pressed={genderFilter==='all'} className={segBtn(genderFilter==='all')}>All</button>
              <button type="button" onClick={()=>setGenderFilter(genderFilter==='boys'?'all':'boys')} aria-pressed={genderFilter==='boys'} className={genderFilter==='boys'?'h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap bg-sky-600 text-white shadow-sm':segBtn(false)}><span className={`w-2 h-2 rounded-full ${genderFilter==='boys'?'bg-white':'bg-sky-600'}`}/>Boys<span className={`text-[11px] font-normal tabular-nums ${genderFilter==='boys'?'text-sky-100':'text-slate-400'}`}>{nBoysGames}</span></button>
              <button type="button" onClick={()=>setGenderFilter(genderFilter==='girls'?'all':'girls')} aria-pressed={genderFilter==='girls'} className={genderFilter==='girls'?'h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap bg-pink-600 text-white shadow-sm':segBtn(false)}><span className={`w-2 h-2 rounded-full ${genderFilter==='girls'?'bg-white':'bg-pink-600'}`}/>Girls<span className={`text-[11px] font-normal tabular-nums ${genderFilter==='girls'?'text-pink-100':'text-slate-400'}`}>{nGirlsGames}</span></button>
            </div>
            <button type="button" onClick={()=>setStatusFilter(statusFilter==='open'?'all':'open')} aria-pressed={statusFilter==='open'} title="Games with a slot still open" className={`h-8 px-3 rounded-full border text-[12.5px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${statusFilter==='open'?'border-amber-500 bg-amber-50 text-amber-800':'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>Needs crew <span className="text-[11px] tabular-nums opacity-70">{openGames}</span></button>
            <button type="button" onClick={()=>setStatusFilter(statusFilter==='bad'?'all':'bad')} aria-pressed={statusFilter==='bad'} title="Games where someone is on two games at once" className={`h-8 px-3 rounded-full border text-[12.5px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${statusFilter==='bad'?'border-red-500 bg-red-50 text-red-700':'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>Conflicts <span className="text-[11px] tabular-nums opacity-70">{badGames}</span></button>
            {(listSearch||listDivFilter!=='all'||genderFilter!=='all'||statusFilter!=='all')&&<button type="button" className="h-8 px-2 text-[13px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 transition-colors" onClick={()=>{setListSearch('');setListDivFilter('all');setGenderFilter('all');setStatusFilter('all')}}><X size={14}/> Clear</button>}
          </>)}
          <div className="flex-1"/>
          {viewMode==='grid'&&dayGames.length>0&&(<>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-0.5" role="group" aria-label="Card size" title="Card size">
              {(['full','compact','mini'] as const).map(d=><button key={d} type="button" onClick={()=>setDensity(d)} aria-pressed={density===d} className={segBtn(density===d)} title={d==='full'?'Card size: full. Both teams, scores and one row per slot':d==='compact'?'Card size: compact. Game, teams, officials as chips':'Card size: mini. One line per game'}>{d==='full'?'Full':d==='compact'?'Compact':'Mini'}</button>)}
            </div>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-0.5" role="group" aria-label="Show crew" title="Show every slot, only refs, or only scorekeepers">
              {([['all','Everyone'],['refs','Refs'],['sk','Scorekeepers']] as const).map(([k,l])=><button key={k} type="button" onClick={()=>setCrewShow(k)} aria-pressed={crewShow===k} className={segBtn(crewShow===k)}>{l}</button>)}
            </div>
            <div className="relative">
              <button type="button" aria-label="Layout" title="Layout: column width, fold rows, refs per game" aria-expanded={layoutOpen} onClick={()=>{setLayoutOpen(o=>!o);setMoreOpen(false)}} className={`${barBtn} w-9 px-0 justify-center`}><SlidersHorizontal size={15}/></button>
            {layoutOpen&&(<>
              <div className="fixed inset-0 z-40" onClick={()=>setLayoutOpen(false)}/>
              <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Columns</p>
                  <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-0.5">
                    <button type="button" onClick={()=>setFitFields(true)} className={segBtn(fitFields)} title="Fields share the width of the window">Fit all fields</button>
                    <button type="button" onClick={()=>setFitFields(false)} className={segBtn(!fitFields)} title="Fixed-width columns that scroll sideways">Fixed width</button>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Start-time rows</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={()=>{setCollapsedTimes(new Set(staffedTimes));setLayoutOpen(false)}} className={chipBtn} title="Fold every start time whose games all have a full crew">Fold staffed</button>
                    <button type="button" onClick={()=>{setCollapsedTimes(new Set(times));setLayoutOpen(false)}} className={chipBtn}>Fold all</button>
                    <button type="button" onClick={()=>{setCollapsedTimes(new Set());setLayoutOpen(false)}} className={chipBtn}>Open all</button>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Refs per game · every game this day</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[1,2,3].map(n=><button key={n} type="button" disabled={locked} onClick={()=>{applyDefaultRefs(n);setLayoutOpen(false)}} className={chipBtn} title={`Set every game on this day to ${n} ref${n===1?'':'s'}; use − / + on a game to change just that one`}>{n} ref{n===1?'':'s'}</button>)}
                  </div>
                </div>
              </div>
            </>)}
            </div>
          </>)}
          <button type="button" onClick={()=>setPanelMode(panelMode==='rail'?'open':'rail')} aria-pressed={panelMode!=='rail'} title="Staff list, staffing needs and the Staff portal" className={panelMode!=='rail'?'h-9 px-3 rounded-lg bg-slate-900 text-white text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap':barBtn}><Users size={15}/> Staffing</button>
        </div>
      )}
      </div>

      {/* Staffing panel: hidden until Staff, Needs or Portal is clicked; a slide-in over the board, or pinned beside it */}
      {games.length>0&&panelMode!=='rail'&&(
        <aside aria-label="Staffing" className={`fixed right-3 top-[72px] bottom-3 z-40 w-80 max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white flex flex-col overflow-hidden ${panelMode==='open'?'shadow-2xl':'shadow-sm'}`}>
          <div className="flex items-center gap-1 pl-4 pr-2 pt-2.5">
            <span className="text-sm font-semibold text-slate-800">Staffing</span>
            <div className="flex-1"/>
            <button type="button" onClick={()=>setPanelMode(panelMode==='pinned'?'open':'pinned')} aria-pressed={panelMode==='pinned'} title={panelMode==='pinned'?'Unpin: float over the board':'Pin open beside the board'} aria-label={panelMode==='pinned'?'Unpin the staffing panel':'Pin the staffing panel open'} className={`hidden xl:inline-flex w-8 h-8 rounded-lg items-center justify-center transition-colors ${panelMode==='pinned'?'bg-teal-50 text-teal-700':'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><Pin size={15}/></button>
            <button type="button" onClick={()=>setPanelMode('rail')} title="Minimize" aria-label="Minimize the staffing panel" className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"><ChevronsRight size={16}/></button>
          </div>
          <div className="flex border-b border-slate-100 px-2" role="tablist">
            {([['staff','Staff'],['needs','Needs'],['portal','Staff portal']] as const).map(([k,l])=>(
              <button key={k} type="button" role="tab" aria-selected={panelTab===k} onClick={()=>setPanelTab(k)} className={`h-10 px-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${panelTab===k?'border-slate-900 text-slate-900':'border-transparent text-slate-500 hover:text-slate-800'}`}>{l}</button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {panelTab==='staff'&&(()=>{
              const q=staffSearch.trim().toLowerCase()
              const list=rosterWorkers.filter(w=>{
                if(q&&!w.name.toLowerCase().includes(q))return false
                if(staffFilter==='sk')return canScorekeeper(w)
                if(staffFilter==='boys')return w.defaultRole==='ref'&&(w.gender==='boys'||w.gender==='both')
                if(staffFilter==='girls')return w.defaultRole==='ref'&&(w.gender==='girls'||w.gender==='both')
                return true
              }).map(w=>({w,count:getGameCount(w.id)})).sort((a,b)=>staffSort==='load'?(a.count-b.count||byLastName(a.w.name,b.w.name)):byLastName(a.w.name,b.w.name))
              const loadCls=(n:number)=>n>=8?'bg-red-50 text-red-700':n>=5?'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700'
              const canDrag=!locked&&viewMode==='grid'
              return(
                <div className="space-y-2.5">
                  <input value={staffSearch} onChange={e=>setStaffSearch(e.target.value)} placeholder="Find a name" aria-label="Find a staff member" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"/>
                  <div className="grid grid-cols-4 p-1 rounded-xl bg-slate-100 gap-0.5">
                    {([['all','All'],['boys','Boys'],['girls','Girls'],['sk','SK']] as const).map(([k,l])=><button key={k} type="button" onClick={()=>setStaffFilter(k)} aria-pressed={staffFilter===k} className={`${segBtn(staffFilter===k)} justify-center`}>{l}</button>)}
                  </div>
                  <div className="flex items-center text-xs text-slate-500">
                    <span>{list.length} {list.length===1?'person':'people'}{canDrag?' · drag onto a slot':''}</span>
                    <div className="flex-1"/>
                    <button type="button" onClick={()=>setStaffSort(staffSort==='load'?'name':'load')} className="h-7 px-2 rounded-md hover:bg-slate-100 hover:text-slate-800">{staffSort==='load'?'Fewest games first':'A–Z'}</button>
                  </div>
                  {viewMode!=='grid'&&<p className="text-xs text-slate-400">Switch to Grid to drag names onto games.</p>}
                  <div className="space-y-0.5">
                    {list.length===0?(
                      <p className="text-xs text-slate-400 italic py-2">{rosterWorkers.length===0?'No staff on the roster yet.':'Nobody matches.'}</p>
                    ):list.map(({w,count})=>{
                      const kind=staffKind(w)
                      // Presence keys only come back for roles allowed to see them (api/workers).
                      const showPresence='lastSeenAt' in w
                      const on=showPresence&&isOnline(w.lastSeenAt)
                      return(
                        <div key={w.id} draggable={canDrag}
                          onDragStart={e=>{e.dataTransfer.setData('workerId',w.id);e.dataTransfer.effectAllowed='copy';setDragWorker(w)}}
                          onDragEnd={()=>{setDragWorker(null);setDragSlot(null)}}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${canDrag?'cursor-grab active:cursor-grabbing hover:bg-slate-50':'cursor-default'} ${dragWorker?.id===w.id?'opacity-40':''}`}
                          title={`${w.name} · ${kind.label} · ${certLabel(w.certLevel)}${w.refLevel&&w.defaultRole==='ref'?` · Ref level ${w.refLevel}`:''} · ${count} game${count!==1?'s':''} today${showPresence?` · ${presenceLabel(w)}`:''}`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${kind.dot}`}/>
                          {w.defaultRole==='ref'&&<RefLevelPill level={w.refLevel}/>}
                          <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-700">{w.name}</span>
                          {on&&<span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0" aria-label="On now"/>}
                          <span className={`text-[11px] font-bold px-1.5 rounded-full shrink-0 ${loadCls(count)}`}>{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            {panelTab==='needs'&&(
              <div className="space-y-3">
                {activeDay&&(
                  <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">On games · {formatDate(activeDay)}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium">
                      <span className="text-sky-700">{assignedBoysRefs} boys refs</span>
                      <span className="text-pink-700">{assignedGirlsRefs} girls refs</span>
                      {assignedBothRefs>0&&<span className="text-slate-600">{assignedBothRefs} both</span>}
                      <span className="text-emerald-700">{assignedSKs} SKs</span>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2">
          {(()=>{
            const pB=Math.max(0,...dayReqs.map(d=>Math.ceil(d.boys/gamesPerRef)))
            const pG=Math.max(0,...dayReqs.map(d=>Math.ceil(d.girls/gamesPerRef)))
            const pBoth=Math.max(0,...dayReqs.map(d=>Math.ceil(d.both/gamesPerRef)))
            const pS=Math.max(0,...dayReqs.map(d=>d.fields))
            const rc={boys:0,girls:0,both:0,sk:0}
            for(const w of rosterWorkers){const r=staffRank(w);if(r===0)rc.boys++;else if(r===1)rc.girls++;else if(r===2)rc.both++;else rc.sk++}
            return(
              <>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <ClipboardList size={14} className="text-sky-500 shrink-0"/>
                <span className="font-semibold text-slate-700">Min staff (busiest day):</span>
                <span className="font-medium text-sky-700">~{pB} boys · ~{pG} girls refs{pBoth?` · ~${pBoth} either`:''} · ~{pS} scorekeeper{pS!==1?'s':''}</span>
                <label className="ml-auto flex items-center gap-1 text-slate-500">
                  <span>Games/ref:</span>
                  <input type="number" min="1" value={gamesPerRef} onChange={e=>changeGamesPerRef(parseInt(e.target.value))} className="w-12 border border-slate-300 rounded px-1.5 py-0.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-sky-400"/>
                </label>
                <button type="button" onClick={()=>setReqsOpen(v=>!v)} className="flex items-center gap-0.5 text-slate-500 hover:text-slate-700">{reqsOpen?<ChevronUp size={13}/>:<ChevronDown size={13}/>}<span>By day</span></button>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs mt-1">
                <span className="font-semibold text-slate-700">On roster:</span>
                <span className="text-slate-600">{rc.boys} boys · {rc.girls} girls{rc.both?` · ${rc.both} both`:''} refs · {rc.sk} scorekeeper{rc.sk!==1?'s':''}</span>
                <span className="text-slate-400">({rosterWorkers.length} total)</span>
              </div>
              </>
            )
          })()}
          {reqsOpen&&(
            <div className="mt-2 pt-2 border-t border-sky-200 space-y-1">
              {dayReqs.map(d=>{
                const minBoys=Math.ceil(d.boys/gamesPerRef),minGirls=Math.ceil(d.girls/gamesPerRef),minBoth=Math.ceil(d.both/gamesPerRef)
                return(
                  <div key={d.date} className="text-xs flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-slate-700 w-28 shrink-0">{formatDate(d.date)}</span>
                    <span className="text-slate-500">{d.games} games · {d.refSlots} ref slots{(d.boys||d.girls)?` (${d.boys} boys, ${d.girls} girls${d.both?`, ${d.both} either`:''})`:''} · {d.fields} field{d.fields!==1?'s':''}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium text-sky-700">~{minBoys} boys, ~{minGirls} girls ref{minGirls!==1?'s':''}{minBoth?`, ~${minBoth} either`:''}, {d.fields} scorekeeper{d.fields!==1?'s':''}</span>
                  </div>
                )
              })}
              <p className="text-[10px] text-slate-400 pt-0.5">Scorekeepers stay on one field all day, so one per field. Refs based on {gamesPerRef} games each; refs who do both sides may lower the total.</p>
            </div>
          )}
                </div>
              </div>
            )}
            {panelTab==='portal'&&<StaffPortalVisibility tournamentId={params.id} refreshKey={releaseKey} inPanel/>}
          </div>
        </aside>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode==='list'&&games.length>0&&(()=>{
        const allDivs=[...new Set(games.map(g=>g.division))].sort()
        const listGames=games
          .filter(g=>activeDay?g.date===activeDay:true)
          .filter(g=>!filteredOut(g))
          .sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.location.localeCompare(b.location))
        return(
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-slate-500">{listGames.length} games</span>
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
                    const refCount=slotsOf(g)
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
                          {!noSchedule&&<button onClick={e=>{e.stopPropagation();openEditGame(g)}} className="text-xs text-slate-400 hover:text-slate-600 font-medium">Edit</button>}
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
                                return<div key={role} className="flex items-center gap-1 min-w-[180px]"><span className="text-[11px] font-bold text-sky-600 w-6">R{i+1}</span><div className="flex-1"><SearchSelect value={existing?.workerId??''} onChange={wid=>assign(g.id,role,wid)} options={rosterWorkers.filter(w=>w.defaultRole==='ref').map(w=>{const count=getGameCount(w.id,g.date);return{id:w.id,label:`${w.name} ${count>=8?'🔴':count>=5?'🟡':'🟢'}${count}`,sublabel:certLabel(w.certLevel),warning:doubled.has(w.id),busy:busyFor(g,w.id),level:w.refLevel}})} placeholder="unassigned" assigned={!!existing} disabled={assigningGame===g.id}/></div></div>
                              })}
                              <div className="flex items-center gap-1 min-w-[180px]"><span className="text-[11px] font-bold text-emerald-600 w-6">SK</span><div className="flex-1"><SearchSelect value={g.assignments.find(a=>a.role==='scorekeeper')?.workerId??''} onChange={wid=>assign(g.id,'scorekeeper',wid)} options={rosterWorkers.filter(w=>canScorekeeper(w)).map(w=>{const count=getGameCount(w.id,g.date);return{id:w.id,label:`${w.name} ${count>=8?'🔴':count>=5?'🟡':'🟢'}${count}`,sublabel:certLabel(w.certLevel),warning:doubled.has(w.id),busy:busyFor(g,w.id)}})} placeholder="unassigned" assigned={!!g.assignments.find(a=>a.role==='scorekeeper')} disabled={assigningGame===g.id}/></div></div>
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
                        const refCount=slotsOf(g)
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
                              {!noSchedule&&<button onClick={e=>{e.stopPropagation();openEditGame(g)}} className="text-xs text-slate-400 hover:text-slate-600 font-medium">Edit</button>}
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
                                    return<div key={role} className="flex items-center gap-1 min-w-[180px]"><span className="text-[11px] font-bold text-sky-600 w-6">R{i+1}</span><div className="flex-1"><SearchSelect value={existing?.workerId??''} onChange={wid=>assign(g.id,role,wid)} options={rosterWorkers.filter(w=>w.defaultRole==='ref').map(w=>{const count=getGameCount(w.id,g.date);return{id:w.id,label:`${w.name} ${count>=8?'🔴':count>=5?'🟡':'🟢'}${count}`,sublabel:certLabel(w.certLevel),warning:doubled.has(w.id),busy:busyFor(g,w.id),level:w.refLevel}})} placeholder="unassigned" assigned={!!existing} disabled={assigningGame===g.id}/></div></div>
                                  })}
                                  <div className="flex items-center gap-1 min-w-[180px]"><span className="text-[11px] font-bold text-emerald-600 w-6">SK</span><div className="flex-1"><SearchSelect value={g.assignments.find(a=>a.role==='scorekeeper')?.workerId??''} onChange={wid=>assign(g.id,'scorekeeper',wid)} options={rosterWorkers.filter(w=>canScorekeeper(w)).map(w=>{const count=getGameCount(w.id,g.date);return{id:w.id,label:`${w.name} ${count>=8?'🔴':count>=5?'🟡':'🟢'}${count}`,sublabel:certLabel(w.certLevel),warning:doubled.has(w.id),busy:busyFor(g,w.id)}})} placeholder="unassigned" assigned={!!g.assignments.find(a=>a.role==='scorekeeper')} disabled={assigningGame===g.id}/></div></div>
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
                {workers.filter(w=>rosterIds.has(w.id)).sort((a,b)=>byLastName(a.name,b.name)).map(w=><option key={w.id} value={w.id}>{lastFirst(w.name)}</option>)}
              </select>
              {staffViewId&&<span className="text-sm text-slate-500">{staffGame.length} games assigned</span>}
              {(()=>{const sw=staffViewId?workers.find(w=>w.id===staffViewId):undefined;if(!sw||!('lastSeenAt' in sw))return null;const on=isOnline(sw.lastSeenAt);return<span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${on?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{on&&<span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>}{presenceLabel(sw)}</span>})()}
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
                                {myRole&&<td className="px-4 py-3 text-slate-500 text-xs">{myRole.payRate!=null?`$${myRole.payRate}/game`:''}</td>}
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
        <div className="card p-16 text-center"><div className="text-5xl mb-4">📋</div><p className="font-semibold text-slate-700">No games yet</p><p className="text-sm text-slate-400 mt-1">{noSchedule?'Your director adds the games.':'Import the schedule from a file, or lay it out by hand.'}</p>{!noSchedule&&<div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Import a file</button><button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={()=>setShowBuilder(true)}><LayoutGrid size={15}/> Build a schedule</button></div>}</div>
      ):viewMode==='grid'&&dayGames.length===0?<div className="text-slate-400 text-center py-12">No games on this day</div>:viewMode==='grid'&&(
        (()=>{
          // Division colors; the card keeps a left stripe and tint in every density.
          const dcOf=(g:Game)=>divColorMap.get(g.division)||{bg:'#f8fafc',border:'#e2e8f0',text:'#475569'}
          const dropWorkerOnGame=(e:React.DragEvent,game:Game)=>{
            // A name dropped on a one-line game goes into its first open slot.
            const wid=e.dataTransfer.getData('workerId'); if(!wid||locked)return false
            const rc=slotsOf(game); const openRole=[...(crewShow==='sk'?[]:slotRoles(rc)),...(crewShow==='refs'?[]:['scorekeeper'])].find(r=>!game.assignments.some(a=>a.role===r))
            if(openRole)assign(game.id,openRole,wid); else toast.error('Every slot on that game is filled')
            return true
          }
          const renderSlots=(game:Game,doubled:Set<string>,isAssigning:boolean,chip:boolean)=>{
            const rc=slotsOf(game)
            const nodes=(crewShow==='sk'?[]:slotRoles(rc)).map((role,i)=>{
              const roleObj=GRID_ROLES.find(r=>r.value===role)||{value:role,label:`Ref ${i+1}`,short:`R${i+1}`,color:'#0284c7'}
              const existing=game.assignments.find(a=>a.role===role)
              return <div key={role} onDragOver={e=>{if(dragWorker&&!locked){e.preventDefault();e.stopPropagation();setDragSlot(game.id+':'+role)}}} onDragLeave={()=>setDragSlot(null)} onDrop={e=>{e.preventDefault();e.stopPropagation();const wid=e.dataTransfer.getData('workerId');setDragSlot(null);if(wid&&!locked)assign(game.id,role,wid)}} className={dragSlot===game.id+':'+role?'rounded ring-1 ring-sky-400 bg-sky-50':''}><AssignSelect roleObj={roleObj} existing={existing} workers={rosterWorkers} avails={avails} date={game.date} busyFor={wid=>busyFor(game,wid)} time={game.startTime} disabled={isAssigning||locked} division={game.division} side={side} onAssign={wid=>assign(game.id,role,wid)} getGameCount={getGameCount} doubled={doubled} slotType="ref" chip={chip} mark={markFor(game.id,role)} displayName={existing?.worker?lastNameOf(existing.worker):undefined}/></div>
            })
            const sk=game.assignments.find(a=>a.role==='scorekeeper')
            if(crewShow!=='refs')nodes.push(<div key="scorekeeper" onDragOver={e=>{if(dragWorker&&!locked){e.preventDefault();e.stopPropagation();setDragSlot(game.id+':scorekeeper')}}} onDragLeave={()=>setDragSlot(null)} onDrop={e=>{e.preventDefault();e.stopPropagation();const wid=e.dataTransfer.getData('workerId');setDragSlot(null);if(wid&&!locked)assign(game.id,'scorekeeper',wid)}} className={dragSlot===game.id+':scorekeeper'?'rounded ring-1 ring-sky-400 bg-sky-50':''}><AssignSelect roleObj={{value:'scorekeeper',label:'Scorekeeper',short:'SK',color:'#059669'}} existing={sk} workers={rosterWorkers} avails={avails} date={game.date} busyFor={wid=>busyFor(game,wid)} time={game.startTime} disabled={isAssigning||locked} division={game.division} side={side} onAssign={wid=>assign(game.id,'scorekeeper',wid)} getGameCount={getGameCount} doubled={doubled} slotType="scorekeeper" chip={chip} mark={markFor(game.id,'scorekeeper')} displayName={sk?.worker?lastNameOf(sk.worker):undefined}/></div>)
            return nodes
          }
          // One line: status dot, game, division, the crew by last name. Used by the
          // Mini density and by folded time rows, so folding a row keeps it readable.
          const renderMini=(game:Game,doubled:Set<string>,onClick:(()=>void)|null,hint:string)=>{
            const dc=dcOf(game); const c=crewOf(game,doubled)
            const dot=c.dbl||c.open===c.total?'bg-red-500':c.open?'bg-amber-500':'bg-emerald-500'
            return(
              <div onClick={onClick??undefined} role={onClick?'button':undefined} tabIndex={onClick?0:undefined} onKeyDown={onClick?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onClick()}}:undefined}
                className={`flex items-center gap-1 h-[22px] px-1.5 rounded border border-slate-200 text-[10px] text-slate-600 whitespace-nowrap overflow-hidden ${onClick?'cursor-pointer hover:border-slate-400':''} ${game.isCanceled?'opacity-40':''}`}
                style={{borderLeft:`4px solid ${dc.border}`,background:dc.bg}}
                title={`#${game.gameNumber} ${game.division}${game.pool?` · ${game.pool}`:''} · ${game.team1} v ${game.team2}${hint?` · ${hint}`:''}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`}/>
                <b className="text-slate-900 shrink-0">#{game.gameNumber}</b>
                <i className="not-italic font-bold shrink-0" style={{color:dc.text}}>{divisionAbbr(game.division)}</i>
                {game.isChampionship&&<span className="text-amber-600 font-bold shrink-0">★</span>}
                <span className="truncate">
                  {c.open===c.total?<span className="text-red-700 font-bold">Nobody yet</span>:c.parts.map((p,i)=>(
                    <span key={p.role}>{i>0&&<span className="text-slate-300"> · </span>}{p.a?<span className={doubled.has(p.a.workerId)?'text-red-700 font-bold':''}>{p.a.worker?lastNameOf(p.a.worker):'?'}</span>:<span className="text-amber-700 font-semibold">{p.short} open</span>}</span>
                  ))}
                </span>
              </div>
            )
          }
          // Three lines: game · division · pool with the ref count, the teams, the
          // officials as chips. 76 px against the old card's ~200.
          const renderCompact=(game:Game,doubled:Set<string>,isAssigning:boolean,hasDoubleBooking:boolean)=>{
            const dc=dcOf(game); const refCount=slotsOf(game)
            return(
              <div className={`relative group/card rounded-lg border border-slate-200 px-1.5 py-1 flex flex-col gap-0.5 min-w-0 ${game.isCanceled?'opacity-40':''}`} style={{borderLeft:`4px solid ${dc.border}`,background:dc.bg}}>
                <div className="flex items-center gap-1 text-[9px] text-slate-500 whitespace-nowrap overflow-hidden leading-none">
                  <span draggable={!gameLocked} onDragStart={e=>{e.dataTransfer.setData('gameId',game.id);e.dataTransfer.effectAllowed='move';setDragGame(game)}} onDragEnd={()=>{setDragGame(null);setDragOver(null)}} className={`select-none text-[11px] leading-none ${gameLocked?'hidden':'cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500'}`} title="Drag to move game">⠿</span>
                  <b className="text-slate-900">#{game.gameNumber}</b>
                  <span className="font-bold truncate" style={{color:dc.text}} title={game.division}>{divisionAbbr(game.division)}</span>
                  {game.pool&&<span className="truncate" title={game.pool}>· {String(game.pool).replace(/^(pool|group)\s*/i,'')}</span>}
                  {game.isChampionship&&<span className="text-amber-600 font-bold shrink-0">★</span>}
                  {hasDoubleBooking&&<span className="text-red-600 font-bold shrink-0" title={`Double-booked: ${game.assignments.filter(a=>doubled.has(a.workerId)).map(a=>a.worker?.name).join(', ')}`}>⚠</span>}
                  <span className="ml-auto flex items-center gap-0.5 shrink-0" title={`${refCount} ref${refCount===1?'':'s'} on this game`}>
                    <button type="button" onClick={()=>setRefCount(game.id,refCount-1)} disabled={refCount<=1||locked} className="w-3 h-3 flex items-center justify-center rounded border border-slate-300 text-slate-500 text-[10px] leading-none hover:bg-white disabled:opacity-30 opacity-0 group-hover/card:opacity-100 transition-opacity" title="One ref fewer on this game">−</button>
                    <span className="font-bold text-slate-600">{refCount}<span className="font-medium text-slate-400">R</span></span>
                    <button type="button" onClick={()=>setRefCount(game.id,refCount+1)} disabled={refCount>=3||locked} className="w-3 h-3 flex items-center justify-center rounded border border-slate-300 text-slate-500 text-[10px] leading-none hover:bg-white disabled:opacity-30 opacity-0 group-hover/card:opacity-100 transition-opacity" title="One more ref on this game">+</button>
                    {!gameLocked&&<button type="button" className="ml-0.5 text-slate-400 hover:text-slate-700 opacity-0 group-hover/card:opacity-100 transition-opacity" onClick={e=>{e.stopPropagation();openEditGame(game)}} title="Edit game">✎</button>}
                  </span>
                </div>
                {crewShow==='all'&&<div className="text-[11px] font-bold text-slate-900 truncate leading-tight" title={`${game.team1} v ${game.team2}`}>{game.team1}<span className="font-normal text-slate-400 px-1">v</span>{game.team2}</div>}
                {/* Chips sit three across when the column has room (a wide monitor) and
                    wrap to two + one when it does not, so a last name stays readable. */}
                <div className="flex flex-wrap gap-0.5 [&>*]:flex-[1_1_68px] [&>*]:min-w-0">{renderSlots(game,doubled,isAssigning,true)}</div>
              </div>
            )
          }
          return(
        <div className={`rounded-xl border border-slate-200 shadow-sm ${fitFields?'overflow-x-hidden':'overflow-x-auto'}`}>
          <table className={`border-collapse text-xs bg-white ${fitFields?'w-full table-fixed':'min-w-max'}`}>
            <colgroup>
              <col style={{width:76}}/>
              {fields.map(f=><col key={f} style={collapsedFields.has(f)?{width:32}:fitFields?undefined:{width:density==='full'?200:190}}/>)}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-700 text-white border-r border-slate-600 px-2 py-2 text-left font-semibold text-[11px]">Time<span className="block text-[9px] font-medium text-slate-300">click to fold</span></th>
                {fields.map(f=>{
                  const collapsed=collapsedFields.has(f)
                  const n=dayGames.filter(g=>g.location===f&&!g.isCanceled).length
                  return(
                    <th key={f} onClick={()=>toggleField(f)} className={`border-r border-slate-200 py-1.5 text-center bg-slate-100 last:border-r-0 cursor-pointer hover:bg-slate-200 transition-colors select-none overflow-hidden ${collapsed?'w-8 px-0':'px-2'}`} title={collapsed?`Expand ${fieldLabel(f)}`:`Collapse ${fieldLabel(f)}`}>
                      {collapsed?(
                        <div className="flex items-center justify-center h-full">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide" style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap'}}>{fieldLabel(f)}</span>
                        </div>
                      ):(
                        <div className="min-w-0">
                          <div className="flex items-center justify-center gap-1"><span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide truncate">{fieldLabel(f)}</span><span className="text-[9px] text-slate-300">▼</span></div>
                          <div className="text-[9px] font-medium text-slate-400">{n} game{n===1?'':'s'}</div>
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
                const rowGames=dayGames.filter(g=>g.startTime===time&&!g.isCanceled)
                const staffed=rowGames.filter(g=>crewOf(g,doubled).full).length
                if(timeCollapsed)return(
                  <tr key={time} className="border-t border-slate-200">
                    <td
                      className="sticky left-0 z-10 bg-slate-500 text-white border-r border-slate-400 px-2 py-0.5 font-bold text-[10px] whitespace-nowrap cursor-pointer hover:bg-slate-400 transition-colors select-none"
                      onClick={()=>toggleTime(time)}
                      title="Click to open this time"
                    >▸ {formatTime(time)}<span className="block text-[9px] font-medium text-slate-200">{staffed} of {rowGames.length} crewed</span></td>
                    {fields.map(field=>{
                      const game=gameMap.get(`${time}::${field}`)
                      if(collapsedFields.has(field))return<td key={field} className={`border-r border-slate-200 last:border-r-0 w-8 ${game?'bg-slate-200':'bg-slate-50'}`}/>
                      return(
                        <td key={field} className={`border-r border-slate-200 last:border-r-0 p-0.5 bg-slate-50 align-middle ${game&&filteredOut(game)?outCls:''}`}
                          onDragOver={e=>{if(game&&dragWorker&&!locked)e.preventDefault()}}
                          onDrop={e=>{e.preventDefault();if(game)dropWorkerOnGame(e,game)}}>
                          {game&&renderMini(game,doubled,()=>toggleTime(time),'click to open the row')}
                        </td>
                      )
                    })}
                  </tr>
                )
                return(
                  <tr key={time} className={ti%2===0?'bg-white':'bg-slate-50/50'}>
                    <td
                      className="sticky left-0 z-10 bg-slate-700 text-white border-r border-slate-600 border-t border-slate-600 px-2 py-2 font-bold text-[11px] whitespace-nowrap cursor-pointer hover:bg-slate-600 transition-colors select-none align-top"
                      onClick={()=>toggleTime(time)}
                      title="Click to fold this time"
                    >▾ {formatTime(time)}{rowGames.length>0&&<span className="block text-[9px] font-medium text-slate-300">{staffed} of {rowGames.length} crewed</span>}</td>
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
                          className={`border-r border-t border-slate-300 last:border-r-0 transition-colors ${density==='mini'?'h-8':'min-h-[80px]'} ${isDragTarget?dropHasConflict?'bg-red-100 ring-2 ring-inset ring-red-400':'bg-emerald-100 ring-2 ring-inset ring-emerald-400':'bg-white'}`}
                          onDragOver={e=>{e.preventDefault();if(dragGame)setDragOver({time,field})}}
                          onDragLeave={()=>setDragOver(null)}
                          onDrop={e=>{e.preventDefault();const gId=e.dataTransfer.getData('gameId');if(gId&&!gameLocked)handleDrop(gId,time,field,activeDay);setDragOver(null)}}
                        />
                      )
                      const dc=dcOf(game)
                      const isAssigning=assigningGame===game.id
                      const hasDoubleBooking=game.assignments.some(a=>doubled.has(a.workerId))
                      const refCount=slotsOf(game)
                      const mode:'full'|'compact'|'mini'=density==='full'?'full':density==='mini'&&!miniOpen.has(game.id)?'mini':'compact'

                      return(
                        <td key={field}
                          className={`border-r border-t border-slate-300 last:border-r-0 align-top relative group transition-colors ${mode==='full'?'p-2':'p-1'} ${hasDoubleBooking&&mode==='full'?'ring-2 ring-inset ring-red-400':''} ${game.isCanceled&&mode==='full'?'opacity-40':''} ${isDragTarget?dropHasConflict?'ring-2 ring-inset ring-red-400 bg-red-50':'ring-2 ring-inset ring-emerald-400 bg-emerald-50':''} ${!isDragTarget&&filteredOut(game)?outCls:''}`}
                          style={isDragTarget||mode!=='full'?{}:{background:dc.bg}}
                          onDragOver={e=>{e.preventDefault();if(dragGame&&dragGame.id!==game.id)setDragOver({time,field})}}
                          onDragLeave={()=>setDragOver(null)}
                          onDrop={e=>{e.preventDefault();const gId=e.dataTransfer.getData('gameId');if(gId&&gId!==game.id&&!gameLocked)handleDrop(gId,time,field,activeDay);else if(!gId&&mode==='mini')dropWorkerOnGame(e,game);setDragOver(null)}}
                        >
                          {mode==='mini'&&renderMini(game,doubled,()=>setMiniOpen(s=>{const n=new Set(s);n.has(game.id)?n.delete(game.id):n.add(game.id);return n}),'click to open the card')}
                          {mode==='compact'&&(
                            <div onClick={density==='mini'?()=>setMiniOpen(s=>{const n=new Set(s);n.delete(game.id);return n}):undefined}>{renderCompact(game,doubled,isAssigning,hasDoubleBooking)}</div>
                          )}
                          {mode==='full'&&<>
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
                          {!gameLocked&&<button className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-[9px] text-slate-400 hover:text-slate-700 transition-opacity" onClick={e=>{e.stopPropagation();openEditGame(game)}}>✎</button>}
                          <div
                            className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-opacity text-[12px] leading-none select-none"
                            draggable={!gameLocked}
                            onDragStart={e=>{e.dataTransfer.setData('gameId',game.id);e.dataTransfer.effectAllowed='move';setDragGame(game)}}
                            onDragEnd={()=>{setDragGame(null);setDragOver(null)}}
                            title="Drag to move game"
                            hidden={gameLocked}
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
                            <div className="flex items-center gap-1"><span className="font-bold text-[12px] text-slate-900 flex-1 leading-tight">{game.team1}</span>{showScores&&<input type="number" min="0" className="w-8 h-5 text-[10px] text-center border border-slate-200 rounded bg-white/80 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" disabled={gameLocked||!!game.ownClub} title={game.ownClub?'Your club plays in this game, so someone else posts its score.':undefined} defaultValue={game.score1??''} onBlur={e=>saveScore(game.id,'score1',e.target.value)} placeholder="—"/>}</div>
                            <div className="flex items-center gap-1"><span className="font-bold text-[12px] text-slate-900 flex-1 leading-tight">{game.team2}</span>{showScores&&<input type="number" min="0" className="w-8 h-5 text-[10px] text-center border border-slate-200 rounded bg-white/80 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" disabled={gameLocked||!!game.ownClub} title={game.ownClub?'Your club plays in this game, so someone else posts its score.':undefined} defaultValue={game.score2??''} onBlur={e=>saveScore(game.id,'score2',e.target.value)} placeholder="—"/>}</div>
                          </div>
                          <div className="space-y-0.5 pt-1" style={{borderTop:`1px solid ${dc.border}`}}>
                            {crewShow!=='sk'&&<>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">Refs</span>
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={()=>setRefCount(game.id,refCount-1)} disabled={refCount<=1||locked} className="w-3.5 h-3.5 flex items-center justify-center rounded border border-slate-300 text-slate-500 text-[11px] leading-none hover:bg-slate-100 disabled:opacity-30">−</button>
                                <span className="text-[9px] font-bold text-slate-600 w-2.5 text-center">{refCount}</span>
                                <button type="button" onClick={()=>setRefCount(game.id,refCount+1)} disabled={refCount>=3||locked} className="w-3.5 h-3.5 flex items-center justify-center rounded border border-slate-300 text-slate-500 text-[11px] leading-none hover:bg-slate-100 disabled:opacity-30">+</button>
                              </div>
                            </div>
                            {/* Ref slots */}
                            {Array.from({length:refCount},(_,i)=>{
                              const role=i===0?'ref1':i===1?'ref2':'ref3'
                              const roleObj=GRID_ROLES.find(r=>r.value===role)||{value:role,label:`Ref ${i+1}`,short:`R${i+1}`,color:'#0284c7'}
                              const existing=game.assignments.find(a=>a.role===role)
                              return<div key={role} onDragOver={e=>{if(dragWorker&&!locked){e.preventDefault();setDragSlot(game.id+":"+role)}}} onDragLeave={()=>setDragSlot(null)} onDrop={e=>{e.preventDefault();e.stopPropagation();const wid=e.dataTransfer.getData("workerId");setDragSlot(null);if(wid&&!locked)assign(game.id,role,wid)}} className={dragSlot===game.id+":"+role?"rounded ring-1 ring-sky-400 bg-sky-50":""}><AssignSelect roleObj={roleObj} existing={existing} workers={rosterWorkers} avails={avails} date={game.date} busyFor={wid=>busyFor(game,wid)} time={game.startTime} disabled={isAssigning||locked} division={game.division} side={side} onAssign={wid=>assign(game.id,role,wid)} getGameCount={getGameCount} doubled={doubled} slotType="ref" mark={markFor(game.id,role)}/></div>
                            })}
                            </>}
                            {/* Scorekeeper */}
                            {crewShow!=='refs'&&<div onDragOver={e=>{if(dragWorker&&!locked){e.preventDefault();setDragSlot(game.id+":scorekeeper")}}} onDragLeave={()=>setDragSlot(null)} onDrop={e=>{e.preventDefault();e.stopPropagation();const wid=e.dataTransfer.getData("workerId");setDragSlot(null);if(wid&&!locked)assign(game.id,"scorekeeper",wid)}} className={dragSlot===game.id+":scorekeeper"?"rounded ring-1 ring-sky-400 bg-sky-50":""}><AssignSelect roleObj={{value:'scorekeeper',label:'Scorekeeper',short:'SK',color:'#059669'}} existing={game.assignments.find(a=>a.role==='scorekeeper')} workers={rosterWorkers} avails={avails} date={game.date} busyFor={wid=>busyFor(game,wid)} time={game.startTime} disabled={isAssigning||locked} division={game.division} side={side} onAssign={wid=>assign(game.id,'scorekeeper',wid)} getGameCount={getGameCount} doubled={doubled} slotType="scorekeeper" mark={markFor(game.id,'scorekeeper')}/></div>}
                          </div>
                          </>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
          )
        })()
      )}
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/> Full crew</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/> A slot open</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/> Nobody, or double-booked</span>
          <span className="text-slate-300">|</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"/> Boys ref</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-pink-500 inline-block"/> Girls ref</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block"/> Boys &amp; girls</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/> Scorekeeper</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"/> Field ops or trainer</span>
          <span className="text-slate-300">|</span>
          <span>Number after a name = games that day · drag a name onto a slot, or click the slot to pick · ⠿ drag a game · click a field header to collapse it</span>
        </div>
        <div className="flex gap-3">
          <span>Columns:</span>
          <button onClick={()=>setCollapsedFields(new Set(fields))} className="hover:text-slate-600">Collapse all</button>
          <span className="text-slate-200">|</span>
          <button onClick={()=>setCollapsedFields(new Set())} className="hover:text-slate-600">Expand all</button>
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
                draggable={!gameLocked}
                onDragStart={e=>{e.dataTransfer.setData('gameId',g.id);e.dataTransfer.effectAllowed='move';setDragGame(g)}}
                onDragEnd={()=>{setDragGame(null);setDragOver(null)}}
                className={`card p-3 cursor-grab active:cursor-grabbing w-48 border-2 border-dashed border-slate-300 hover:border-sky-400 transition-colors ${dragGame?.id===g.id?'opacity-40':''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-400">#{g.gameNumber}</span>
                  {!noSchedule&&<button onClick={()=>openEditGame(g)} className="text-[10px] text-sky-600 hover:text-sky-800 font-medium">Edit</button>}
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
                  <button onClick={()=>cancelGame(editGame)} className={`btn-sm text-xs ${editGame.isCanceled?'btn-secondary text-emerald-600':'btn-secondary text-amber-600'}`}>{editGame.isCanceled?'Restore game':'Cancel game'}</button>
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
                <button type="button" className="btn-secondary" onClick={()=>{setEditGame(null);setShowAddGame(false)}}>Close</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  )
}

function AssignSelect({ roleObj,existing,workers,avails,date,time,disabled,division,side,onAssign,getGameCount,doubled,slotType,chip,displayName,busyFor,mark }:{
  roleObj:{value:string;label:string;short:string;color:string};existing?:Assignment;workers:Worker[];avails:Availability[];date:string;time:string;disabled:boolean;division:string;onAssign:(w:string)=>void;getGameCount:(id:string)=>number;doubled:Set<string>;slotType:'ref'|'scorekeeper'
  /** Compact board chip; displayName is the short (last) name to show on it. */
  chip?:boolean;displayName?:string
  /** Where this worker already is at this time (another game), if anywhere. */
  busyFor?:(workerId:string)=>string|undefined
  /** Officials' confirmations for this slot (lib/officialConfirm): the holder's answer,
   *  and who said they can't work it when it's open. */
  mark?:{st?:string;declined?:{name:string;note:string}}
  /** The event's side for a division that says neither (lib/eventTeams). */
  side?:GameGender
}){
  // Whose game it is (lib/gameGender, the rule Auto-assign uses): the division, or the
  // event's teams when it says neither. This had its own word match, which read any
  // name with "men" or "boy" in it ("Clemens Cup") as a boys' game.
  const gg=gameGender(division,side)

  // Availability records are UNavailability (see the Availability page): [] = out all
  // day, ['08:00',...] = out at those start times. No record = available. This read
  // them as "available", so the warning landed on everyone who hadn't marked anything.
  const outIds=new Set(avails.filter(a=>{
    if(a.date!==date)return false
    let slots:string[]=[]; try{ slots=JSON.parse(a.timeSlots||'[]') }catch{}
    return slots.length===0||slots.includes(time)
  }).map(a=>a.workerId))

  // For scorekeeper slot: dedicated scorekeepers, then anyone else with Scorekeeper checked
  // in their roles (refs, field ops, trainers). It used to be refs only.
  // For ref slots: show only refs with gender match
  function hasSkRole(w:Worker){try{const r=JSON.parse(w.roles||'[]');return Array.isArray(r)&&r.includes('scorekeeper')}catch{return false}}
  const eligible=slotType==='scorekeeper'
    ?[
        ...workers.filter(w=>w.defaultRole==='scorekeeper').sort((a,b)=>byLastName(a.name,b.name)),
        ...workers.filter(w=>w.defaultRole!=='scorekeeper'&&hasSkRole(w)).sort((a,b)=>byLastName(a.name,b.name)),
      ]
    :workers.filter(w=>{
        if(w.defaultRole!=='ref')return false
        if(gg==='boys')return w.gender==='boys'||w.gender==='both'
        if(gg==='girls')return w.gender==='girls'||w.gender==='both'
        return true
      }).sort((a,b)=>byLastName(a.name,b.name))

  const options=eligible.map(w=>{
    const count=getGameCount(w.id)
    const avail=!outIds.has(w.id)
    const isDoubled=doubled.has(w.id)
    const crossSK=slotType==='scorekeeper'&&w.defaultRole!=='scorekeeper'
    return{
      id:w.id,
      label:`${w.name}${crossSK?` (${mainJob(w.defaultRole)}→SK)`:''} ${count}`,
      // The pick list is A–Z by last name, shown last name first (James Vacco, Oct 21 2026).
      listLabel:`${lastFirst(w.name)}${crossSK?` (${mainJob(w.defaultRole)}→SK)`:''} ${count}`,
      dot:staffKind(w).dot,
      // Ref level (lib/refLevel): ref slots only; it's the assigners' rank of their refs.
      level:slotType==='ref'?w.refLevel:null,
      sublabel:`${certLabel(w.certLevel)}${!avail?' · ⚠ unavailable':''}${isDoubled?' · ⚠ double-booked':''}`,
      warning:!avail||isDoubled,
      busy:busyFor?.(w.id),
    }
  })

  const isDoubledAssigned=existing&&doubled.has(existing.workerId)

  if(chip){
    const count=existing?getGameCount(existing.workerId):undefined
    const answer=existing?(mark?.st==='yes'?' · confirmed':mark?.st==='changed'?' · game changed since they confirmed':''):''
    const title=existing
      ?`${roleObj.label}: ${existing.worker?.name??''} · ${count} game${count===1?'':'s'} today${isDoubledAssigned?' · also on another game at this time':''}${answer}`
      :mark?.declined?`${roleObj.label}: open — ${mark.declined.name} can't work it${mark.declined.note?`: “${mark.declined.note}”`:''}. Click to pick, or drop a name here`
      :`${roleObj.label}: open — click to pick, or drop a name here`
    return <SearchSelect value={existing?.workerId??''} onChange={onAssign} options={options} placeholder="open" assigned={!!existing} disabled={disabled}
      chip={{short:roleObj.short,color:roleObj.color,display:displayName||existing?.worker?.name||'',count,danger:!!isDoubledAssigned,tone:slotType==='scorekeeper'?'sk':'ref',title,confirmed:!!existing&&mark?.st==='yes',declined:!existing&&mark?.declined?`${lastWord(mark.declined.name)} can't`:undefined}}/>
  }

  return(
    <div className="flex items-center gap-0.5">
      <span className="text-[9px] font-bold w-5 shrink-0" style={{color:roleObj.color}}>{roleObj.short}</span>
      <div className="flex-1 relative" title={!existing&&mark?.declined?`${mark.declined.name} can't work it${mark.declined.note?`: “${mark.declined.note}”`:''}`:undefined}>
        {isDoubledAssigned&&<div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full z-10"/>}
        <SearchSelect value={existing?.workerId??''} onChange={onAssign} options={options} placeholder={!existing&&mark?.declined?`${lastWord(mark.declined.name)} can't work`:'unassigned'} assigned={!!existing} disabled={disabled} offList={existing?`${existing.worker?.name??'Someone'} · not on roster`:undefined}/>
      </div>
      {existing&&mark?.st==='yes'&&<span className="text-emerald-600 text-[10px] font-black shrink-0" title="Confirmed">✓</span>}
    </div>
  )
}

/** "Notify officials": email (and phone-alert) each official their own games, once
 *  the assignments are ready (api/tournaments/[id]/notify-officials). */
// Rename divisions from the board (Bo, Oct 17 2026: the assigner needs "to be able to
// edit division names when need"). The names come in with the imported games, and the
// Divisions page is off on the Assigner plan. Every game, pool, team and bracket in the
// division follows the new name (PATCH /api/tournaments/[id]/divisions). The tag is
// whose game the name makes it (lib/gameGender), so a name with Girls in it shows
// Girls before it is saved.
function DivisionsPanel({ tournamentId, games, side, onClose, onRenamed }:{ tournamentId:string;games:Game[];side:GameGender;onClose:()=>void;onRenamed:()=>void }){
  const [names,setNames]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState('')
  const counts=new Map<string,number>()
  for(const g of games)if(g.division)counts.set(g.division,(counts.get(g.division)||0)+1)
  const divs=Array.from(counts.keys()).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
  const sideTag=(d:string)=>{const g=gameGender(d,side);return g==='boys'?{label:'Boys',cls:'bg-sky-50 text-sky-700'}:g==='girls'?{label:'Girls',cls:'bg-pink-50 text-pink-700'}:{label:'Boys & girls',cls:'bg-slate-100 text-slate-600'}}
  async function rename(oldName:string){
    const newName=(names[oldName]??oldName).trim()
    if(!newName||newName===oldName)return
    setBusy(oldName)
    try{
      const r=await fetch(`/api/tournaments/${tournamentId}/divisions`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({oldName,newName})})
      const d=await r.json().catch(()=>null)
      if(!r.ok){toast.error(d?.error||'That didn’t save. Please try again.');return}
      toast.success(`${oldName} is now ${newName}`)
      setNames(n=>{const x={...n};delete x[oldName];return x})
      onRenamed()
    }catch{toast.error('That didn’t save. Please try again.')}
    finally{setBusy('')}
  }
  return(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Divisions</h2>
            <p className="text-sm text-slate-500 mt-0.5">Rename a division and its games move with it. A name that says boys, men’s, girls or women’s decides whose game it is; otherwise the event’s teams do.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={18}/></button>
        </div>
        <div className="divide-y divide-slate-100">
          {divs.map(d=>{const v=names[d]??d;const changed=!!v.trim()&&v.trim()!==d;const tag=sideTag(v.trim()||d);return(
            <form key={d} className="px-5 py-3 flex items-center gap-2" onSubmit={e=>{e.preventDefault();rename(d)}}>
              <div className="flex-1 min-w-0">
                <input className="input w-full" value={v} onChange={e=>setNames(n=>({...n,[d]:e.target.value}))} aria-label={`Name for ${d}`} />
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400"><span className={`rounded px-1.5 py-0.5 font-semibold ${tag.cls}`}>{tag.label}</span>{counts.get(d)} game{counts.get(d)===1?'':'s'}</div>
              </div>
              <button type="submit" disabled={!changed||!!busy} className="btn-primary btn-sm flex-shrink-0">{busy===d?'Saving…':'Rename'}</button>
            </form>
          )})}
          {!divs.length&&<p className="px-5 py-6 text-sm text-slate-500">No divisions yet: they come in with the games you import.</p>}
        </div>
      </div>
    </div>
  )
}

function NotifyOfficials({ tournamentId, day, dayLabel, onClose, onSent }: { tournamentId: string; day: string; dayLabel: string; onClose: () => void; onSent?: () => void }) {
  const [scope,setScope]=useState<'all'|'day'>('all')
  const [onlyChanged,setOnlyChanged]=useState(false)
  const [note,setNote]=useState('')
  // Ask them to confirm (Bo, Oct 15 2026; lib/officialConfirm): on unless unticked.
  const [confirm,setConfirm]=useState(true)
  const [confirmBy,setConfirmBy]=useState('')
  // Who (Bo, Oct 15 2026): boys officials, girls officials and scorekeepers have
  // their own assigners, so nobody is picked until the sender picks their crew.
  const [crews,setCrews]=useState<Crew[]>([])
  const [preview,setPreview]=useState<{officials:number;targets:number;games:number;unchanged:number;noEmail:string[];lastSentAt:string;emailOn:boolean;ask:{confirmBy:string;at:string}|null;suggestBy:string;crews?:{crew:Crew;officials:number;games:number;shown:boolean}[];people?:{id:string;name:string;games:number;email:boolean;changed:boolean}[];infoLinks?:{label:string;url:string}[]}|null>(null)
  const [sending,setSending]=useState(false)
  const [testing,setTesting]=useState(false)
  const [primed,setPrimed]=useState(false)
  // Choose who gets it (Bo, Oct 20 2026): everyone in the picked groups, or only the
  // people ticked here.
  const [pickMode,setPickMode]=useState(false)
  const [picked,setPicked]=useState<Set<string>>(new Set())
  const [pickQ,setPickQ]=useState('')
  const body=(extra:object)=>JSON.stringify({date:scope==='day'?day:'',onlyChanged:pickMode?false:onlyChanged,note,confirm,confirmBy:confirmBy||undefined,crews,...(pickMode?{pick:Array.from(picked)}:{}),...extra})
  useEffect(()=>{
    let live=true
    fetch(`/api/tournaments/${tournamentId}/notify-officials`,{method:'POST',headers:{'Content-Type':'application/json'},body:body({preview:true})})
      .then(r=>r.ok?r.json():null).then(d=>{ if(!live||!d) return; setPreview(d)
        // Sent before? Default to only the people whose games changed since, unless nobody
        // has been asked to confirm yet: the first ask has to reach everyone.
        if(!primed){ setPrimed(true); if(d.lastSentAt&&d.ask&&!onlyChanged) setOnlyChanged(true); if(d.suggestBy) setConfirmBy(d.suggestBy) } })
      .catch(()=>{})
    return()=>{live=false}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scope,onlyChanged,tournamentId,crews.join(','),pickMode,Array.from(picked).sort().join(',')])
  // A test goes to the sender only: the email the official with the most games (or the
  // one picked) would get. Nothing else changes (api notify-officials, test).
  const sendTest=async()=>{
    setTesting(true)
    try{
      const r=await fetch(`/api/tournaments/${tournamentId}/notify-officials`,{method:'POST',headers:{'Content-Type':'application/json'},body:body({test:true})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok||!d.ok){toast.error(d.error||'The test didn’t send. Try again.');return}
      toast.success(`Test sent to ${d.to}: the email ${d.as} would get (${d.games} game${d.games===1?'':'s'})`)
    }finally{setTesting(false)}
  }
  const send=async()=>{
    setSending(true)
    try{
      const r=await fetch(`/api/tournaments/${tournamentId}/notify-officials`,{method:'POST',headers:{'Content-Type':'application/json'},body:body({})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok){toast.error(d.error||'That didn’t send. Try again.');return}
      toast.success(`Sent to ${d.emailed} official${d.emailed===1?'':'s'} by email${d.pushed?` · ${d.pushed} phone alert${d.pushed===1?'':'s'}`:''}${confirm&&d.asked?` · ${d.asked} asked to confirm`:''}`)
      if(d.failed?.length) toast.error(`Didn’t go through for: ${d.failed.join(', ')}`)
      onSent?.()
      onClose()
    }finally{setSending(false)}
  }
  const last=preview?.lastSentAt?new Date(preview.lastSentAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Notify officials">
      <div className="card w-full max-w-lg p-6 space-y-4 max-h-[94vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Notify officials</h2>
            <p className="text-sm text-slate-500 mt-1">Emails each official their own games. Anyone with Whistle Ready alerts on gets a phone alert too.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={18}/></button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Who</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(preview?.crews??(['boys','girls','scorekeepers'] as Crew[]).map(c=>({crew:c,officials:0,games:0,shown:false}))).map(c=>{
              const on=crews.includes(c.crew)
              return (
                <label key={c.crew} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${on?'border-teal-500 bg-teal-50':'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={on} onChange={e=>setCrews(cs=>e.target.checked?[...cs,c.crew]:cs.filter(x=>x!==c.crew))} className="accent-teal-600 mt-0.5"/>
                  <span><span className="font-semibold text-slate-800">{CREW_LABEL[c.crew]}</span>
                    <span className="block text-xs text-slate-500">{preview?`${c.officials} ${c.crew==='scorekeepers'?'scorekeeper':'official'}${c.officials===1?'':'s'}`:'…'}{preview&&!c.shown?' · hidden':''}</span></span>
                </label>
              )
            })}
          </div>
          {preview?.crews?.some(c=>crews.includes(c.crew)&&!c.shown)&&<p className="text-xs text-amber-700 flex items-start gap-1.5"><Eye size={13} className="mt-0.5 flex-shrink-0"/>Sending also shows {preview.crews.filter(c=>crews.includes(c.crew)&&!c.shown).map(c=>CREW_LABEL[c.crew].toLowerCase()).join(' and ')} their games on the staff portal.</p>}
        </div>
        {crews.length>0&&(
          <div className="space-y-2">
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="npick" checked={!pickMode} onChange={()=>setPickMode(false)} className="accent-teal-600"/> Everyone in {crews.length===1?'this group':'these groups'}</label>
              <label className="flex items-center gap-2"><input type="radio" name="npick" checked={pickMode} onChange={()=>setPickMode(true)} className="accent-teal-600"/> Only people I pick</label>
            </div>
            {pickMode&&(
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-100">
                  <input value={pickQ} onChange={e=>setPickQ(e.target.value)} placeholder="Search a name…" aria-label="Search officials" className="flex-1 text-sm outline-none px-1 py-0.5"/>
                  <button type="button" className="text-xs font-semibold text-teal-700 hover:underline" onClick={()=>setPicked(new Set((preview?.people??[]).filter(p=>p.name.toLowerCase().includes(pickQ.toLowerCase())).map(p=>p.id)))}>All</button>
                  <button type="button" className="text-xs font-semibold text-slate-500 hover:underline" onClick={()=>setPicked(new Set())}>None</button>
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-50">
                  {(preview?.people??[]).filter(p=>p.name.toLowerCase().includes(pickQ.toLowerCase())).map(p=>(
                    <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={picked.has(p.id)} onChange={e=>setPicked(s=>{const n=new Set(s);e.target.checked?n.add(p.id):n.delete(p.id);return n})} className="accent-teal-600"/>
                      <span className="flex-1 text-slate-800">{p.name}</span>
                      {p.changed&&preview?.lastSentAt&&<span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5">changed</span>}
                      {!p.email&&<span className="text-[10px] text-red-600">no email</span>}
                      <span className="text-xs text-slate-400 w-14 text-right">{p.games} game{p.games===1?'':'s'}</span>
                    </label>
                  ))}
                  {preview&&!(preview.people??[]).length&&<p className="px-3 py-2 text-xs text-slate-400">Nobody in {crews.length===1?'this group':'these groups'} has games yet.</p>}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Which games</p>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="nscope" checked={scope==='all'} onChange={()=>setScope('all')} className="accent-teal-600"/> Every day of the event</label>
          {day&&<label className="flex items-center gap-2 text-sm"><input type="radio" name="nscope" checked={scope==='day'} onChange={()=>setScope('day')} className="accent-teal-600"/> Just {dayLabel}</label>}
          {!pickMode&&<label className="flex items-center gap-2 text-sm pt-1"><input type="checkbox" checked={onlyChanged} onChange={e=>setOnlyChanged(e.target.checked)} className="accent-teal-600"/> Only officials whose games changed since the last send</label>}
        </div>
        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 space-y-2">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} className="accent-teal-600 mt-0.5"/>
            <span><span className="font-semibold text-slate-800">Ask them to confirm their games</span>
              <span className="block text-xs text-slate-500 mt-0.5">Each email gets a Confirm button, no login needed. If someone can&apos;t work a game, it comes off their schedule and you get an email. Answers show on <Link href={`/tournaments/${tournamentId}/confirmations`} className="underline">Confirmations</Link>.</span></span>
          </label>
          {confirm&&<label className="flex items-center gap-2 text-sm pl-6 text-slate-700">Confirm by <input type="date" value={confirmBy} onChange={e=>setConfirmBy(e.target.value)} className="input !w-auto text-sm !py-1"/></label>}
        </div>
        <div>
          <label htmlFor="notify-note" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Note (optional)</label>
          <textarea id="notify-note" value={note} onChange={e=>setNote(e.target.value)} rows={3} maxLength={600} className="input mt-1 w-full text-sm" placeholder="Check in at the ref tent 30 minutes before your first game."/>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 space-y-1" aria-live="polite">
          {!preview?<p className="text-slate-400">Counting…</p>:!crews.length?<p className="text-slate-500">Pick who to notify.</p>:<>
            <p><span className="font-bold">{preview.targets}</span> official{preview.targets===1?'':'s'} · {preview.games} game{preview.games===1?'':'s'}{preview.unchanged>0&&onlyChanged?<span className="text-slate-500"> · {preview.unchanged} unchanged, skipped</span>:''}</p>
            {last&&<p className="text-xs text-slate-500">Last sent {last}</p>}
            {/* Rules, field maps and directions from the event page go at the bottom of each email (Oct 22 2026). */}
            {(preview.infoLinks??[]).length>0
              ?<p className="text-xs text-slate-500">Includes {(preview.infoLinks??[]).map((l,i)=><span key={l.url}>{i>0?', ':''}<a href={l.url} target="_blank" rel="noreferrer" className="text-teal-700 underline">{l.label}</a></span>)}.</p>
              :<p className="text-xs text-slate-400">No rules or field maps on this event&apos;s page, so the email has none.</p>}
            {preview.noEmail.length>0&&<p className="text-xs text-amber-700">No email on file: {preview.noEmail.join(', ')}. Add one on the Roster.</p>}
            {!preview.emailOn&&<p className="text-xs text-red-600">Email isn’t set up on this server, so only phone alerts will go out.</p>}
          </>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={sendTest} disabled={testing||!preview||!crews.length||preview.targets===0} title="Sends you the email one of these officials would get. Nobody else gets anything." className="mr-auto text-sm font-semibold text-teal-700 hover:underline disabled:opacity-40 disabled:no-underline">{testing?'Sending test…':'Email me a test'}</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50" disabled={sending||!preview||!crews.length||preview.targets===0} onClick={send}><Send size={14}/>{sending?'Sending…':`Send to ${preview?.targets??0} official${preview?.targets===1?'':'s'}`}</button>
        </div>
      </div>
    </div>
  )
}

// What refs and scorekeepers can see on the staff portal, per crew (Bo, Oct 15 2026:
// "make a clear area ... telling the assigner whether it's available to see on the
// staff portal or it's not visible at this time"). Assignments are hidden from staff
// until shown here or by Notify officials; the board itself always shows them.
// Server: api/tournaments/[id]/staff-release, lib/staffRelease.
function StaffPortalVisibility({ tournamentId, refreshKey, inPanel }: { tournamentId: string; refreshKey: number; inPanel?: boolean }) {
  type Row = { crew: Crew; shown: boolean; shownAt: string; shownBy: string; officials: number; games: number }
  const [rows,setRows]=useState<Row[]|null>(null)
  const [busy,setBusy]=useState<Crew|null>(null)
  const [denied,setDenied]=useState(false)
  useEffect(()=>{
    let live=true
    fetch(`/api/tournaments/${tournamentId}/staff-release`).then(r=>{ if(r.status===403){ if(live) setDenied(true); return null } return r.ok?r.json():null })
      .then(d=>{ if(live&&d?.crews) setRows(d.crews) }).catch(()=>{})
    return()=>{live=false}
  },[tournamentId,refreshKey])
  const set=async(crew:Crew,visible:boolean)=>{
    setBusy(crew)
    try{
      const r=await fetch(`/api/tournaments/${tournamentId}/staff-release`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({crews:[crew],visible})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok){toast.error(d.error||'That didn’t save. Try again.');return}
      setRows(d.crews)
      toast.success(visible?`${CREW_LABEL[crew]} can see their games now. Nobody was emailed.`:`${CREW_LABEL[crew]}’ games are hidden from the staff portal.`)
    }finally{setBusy(null)}
  }
  if(denied||!rows) return null
  const when=(iso:string)=>iso?new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''
  return (
    <div className={inPanel?'':'mb-4 rounded-xl border border-slate-200 bg-white p-3'}>
      <div className={inPanel?'mb-3':'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2'}>
        {!inPanel&&<p className="text-sm font-bold text-slate-800">Staff portal</p>}
        <p className="text-xs text-slate-500">What refs and scorekeepers can see. Hidden games are only on this board. Notify officials shows a group’s games when it sends.</p>
      </div>
      <div className={inPanel?'grid grid-cols-1 gap-2':'grid grid-cols-1 sm:grid-cols-3 gap-2'}>
        {rows.map(c=>(
          <div key={c.crew} className={`rounded-lg border px-3 py-2 flex items-center gap-3 ${c.shown?'border-teal-200 bg-teal-50/60':'border-amber-200 bg-amber-50/60'}`}>
            {c.shown?<Eye size={16} className="text-teal-600 flex-shrink-0"/>:<EyeOff size={16} className="text-amber-600 flex-shrink-0"/>}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{CREW_LABEL[c.crew]}</p>
              <p className={`text-xs ${c.shown?'text-teal-700':'text-amber-700'}`}>
                {c.shown?(c.shownAt?`Visible since ${when(c.shownAt)}${c.shownBy?` · ${c.shownBy}`:''}`:'Visible'):`Hidden${c.games?` · ${c.games} assignment${c.games===1?'':'s'}`:''}`}
              </p>
            </div>
            <button type="button" disabled={busy===c.crew} onClick={()=>set(c.crew,!c.shown)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap disabled:opacity-50 transition-colors ${c.shown?'border-slate-300 text-slate-600 hover:bg-white':'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'}`}>
              {busy===c.crew?'Saving…':c.shown?'Hide':'Show to staff'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
