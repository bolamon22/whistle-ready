'use client'
import { useEffect, useState, useMemo, useContext, createContext, Fragment } from 'react'
import { useParams } from 'next/navigation'
import PublicChirp from '@/components/PublicChirp'
import LiveTicker from '@/components/LiveTicker'
import FollowButton from '@/components/FollowButton'
import FollowAlertsSheet from '@/components/FollowAlertsSheet'
import { deviceId as getDeviceId } from '@/lib/pushClient'
import { nameKey, teamRefKey } from '@/lib/names'
import { BracketView, LogosContext, isPlaceholderTeam, type BkBracket } from '@/components/BracketDiagram'

// Follower counts per team, from /follows. Bo wants Follow to read like Instagram --
// "how many people are following a particular team" -- so the number sits under
// the name wherever a Follow button does. Hidden at zero: a wall of "0 followers"
// on launch day reads as nobody cares, and the first tap fixes it anyway.
// Keyed by teamRefKey(division, team): "Miami Reign" in HS A, HS B and U14 B are
// three teams with three follower counts, not one.
const FollowCountsContext = createContext<Record<string, number>>({})
type FollowRef = {division:string;team:string}
function FollowerCount({division,team,className=''}:{division:string;team:string;className?:string}) {
  const n=useContext(FollowCountsContext)[teamRefKey(division,team)]||0
  if(!n) return null
  return <span className={`inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 ${className}`} title={`${n} follower${n===1?'':'s'}`}><Users size={10} aria-hidden/>{n} follower{n===1?'':'s'}</span>
}
import Link from 'next/link'
import { Users, Calendar, LayoutGrid, Trophy, Clock, ChevronDown, ChevronUp, Star, CalendarPlus, Medal, Bell, X, Megaphone, Search, Info } from 'lucide-react'


interface Tournament { id:string; name:string; startDate:string; endDate:string; location:string; logoUrl:string; sport:string }
// One pool as staff set it on the Divisions page.
interface PoolRoster { id:string; division:string; name:string; teams:string[]; unassigned?:boolean }
interface Game { id:string; gameNumber:string; date:string; startTime:string; division:string; pool:string|null; location:string; team1:string; team2:string; score1:number|null; score2:number|null; isCanceled:boolean; isChampionship:boolean; ifNeeded?:boolean }
interface Standing { team:string; w:number; l:number; t:number; gf:number; ga:number; pts:number }

const fmtDate = (d:string) => { if(!d) return ''; const[y,m,day]=d.split('-'); return `${parseInt(m)}/${parseInt(day)}/${y}` }
const fmtDateTime = (d:string) => { if(!d) return ''; const dt=new Date(d); return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) }
const fmtDayHeader = (d:string) => { if(!d) return ''; const dt=new Date(d+'T12:00:00'); return dt.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}) }
const parseStartMs = (date:string,t:string):number|null => { if(!date||!t) return null; let str=t.trim().toUpperCase(); let ap:string|null=null; if(str.endsWith('AM')){ap='AM';str=str.slice(0,-2).trim()} else if(str.endsWith('PM')){ap='PM';str=str.slice(0,-2).trim()}; const p=str.split(':'); let h=parseInt(p[0])||0; const m=parseInt(p[1])||0; if(ap==='PM'&&h<12)h+=12; if(ap==='AM'&&h===12)h=0; const dt=new Date(date+'T00:00:00'); dt.setHours(h,m,0,0); return dt.getTime() }

function TeamAvatar({name,size='md'}:{name:string,size?:'sm'|'md'|'lg'}) {
  const logos=useContext(LogosContext)
  const sz=size==='lg'?'w-16 h-16 text-lg':size==='sm'?'w-8 h-8 text-xs':'w-11 h-11 text-sm'
  const url=logos[name]
  if(url) return <div className={`${sz} rounded-full overflow-hidden bg-white border border-slate-200 flex-shrink-0`}><img src={url} alt="" className="w-full h-full object-contain"/></div>
  const initials = name.split(' ').filter(w=>w.length>2).slice(0,2).map(w=>w[0].toUpperCase()).join('')||name.substring(0,2).toUpperCase()
  const colors=['#1a3a5c','#8b1a1a','#1a5c3a','#5c3a1a','#3a1a5c','#1a5c5c','#5c1a4a','#2a4a1a']
  const idx=name.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%colors.length
  return <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`} style={{backgroundColor:colors[idx]}}>{initials}</div>
}

// Pool names are often stored as "Pool A"; only add the word when it's missing.
const poolLabel=(p:string)=>{const t=(p||'').trim();return /^(pool|group)\b/i.test(t)?t:`Pool ${t}`}
// Staff name a pool "A" on the Divisions page while the scheduler writes "Pool A"
// onto the game (or the other way round). Match on the bare letter so a roster
// and its games always find each other.
const poolKey=(p:string|null|undefined)=>String(p||'').trim().replace(/^(pool|group)\s*/i,'').toLowerCase()
const samePool=(a:string|null|undefined,b:string|null|undefined)=>poolKey(a)===poolKey(b)
const DEFAULT_TBS=['record','goal_diff','goals_for']
const TB_LABEL:Record<string,string>={record:'record',win_pct:'win %',head_to_head:'head-to-head',h2h_two:'head-to-head',h2h_gd:'H2H goal diff',goal_diff:'goal diff',goals_for:'goals scored',goals_against:'goals allowed'}
// `roster` is the pool's team list as staff set it. When one is given it decides
// who appears -- the schedule only supplies the record. Deriving the list from
// the games instead is what kept a removed team on the standings: its old games
// still named it, so it kept being re-created here.
function calcStandings(games:Game[],division:string,pool?:string,tbs:string[]=DEFAULT_TBS,roster?:string[]):Standing[] {
  const map:Record<string,Standing>={}
  const ensure=(t:string)=>{if(!map[t])map[t]={team:t,w:0,l:0,t:0,gf:0,ga:0,pts:0}}
  const only=roster&&roster.length?new Set(roster):null
  if(only)roster!.forEach(ensure)
  const listed=(t:string)=>!only||only.has(t)
  const rel=games.filter(g=>g.division===division&&!g.isCanceled&&!g.isChampionship&&(pool!==undefined?samePool(g.pool,pool):true)&&listed(g.team1)&&listed(g.team2))
  rel.forEach(g=>{ensure(g.team1);ensure(g.team2)})
  const scored=rel.filter(g=>g.score1!==null&&g.score2!==null)
  scored.forEach(g=>{
    const s1=g.score1!,s2=g.score2!
    map[g.team1].gf+=s1;map[g.team1].ga+=s2;map[g.team2].gf+=s2;map[g.team2].ga+=s1
    if(s1>s2){map[g.team1].w++;map[g.team1].pts+=3;map[g.team2].l++}
    else if(s2>s1){map[g.team2].w++;map[g.team2].pts+=3;map[g.team1].l++}
    else{map[g.team1].t++;map[g.team1].pts++;map[g.team2].t++;map[g.team2].pts++}
  })
  const mp=(x:Standing)=>x.w+x.l+x.t
  const h2h=(aT:string,bT:string)=>{let aP=0,bP=0,aGd=0;scored.filter(g=>(g.team1===aT&&g.team2===bT)||(g.team1===bT&&g.team2===aT)).forEach(g=>{const aS=g.team1===aT?g.score1!:g.score2!,bS=g.team1===aT?g.score2!:g.score1!;aGd+=aS-bS;if(aS>bS)aP+=3;else if(bS>aS)bP+=3;else{aP++;bP++}});return {aP,bP,aGd}}
  const cmp=(a:Standing,b:Standing)=>{
    for(const tb of tbs){
      let d=0
      if(tb==='record')d=b.pts-a.pts
      else if(tb==='win_pct')d=(b.w+0.5*b.t)/Math.max(1,mp(b))-(a.w+0.5*a.t)/Math.max(1,mp(a))
      else if(tb==='goal_diff')d=(b.gf-b.ga)-(a.gf-a.ga)
      else if(tb==='goals_for')d=b.gf-a.gf
      else if(tb==='goals_against')d=a.ga-b.ga
      else if(tb==='head_to_head'||tb==='h2h_two'){const h=h2h(a.team,b.team);d=h.bP-h.aP}
      else if(tb==='h2h_gd'){const h=h2h(a.team,b.team);d=-2*h.aGd}
      if(d)return d
    }
    return 0
  }
  return Object.values(map).sort(cmp)
}

// `preSchedule`: the schedule is not published, so there is nothing to rank or
// open -- the card is a roster. Grid first, alphabetical, no rank numbers, no
// stat columns, nothing clickable, and a team count by the toggle. Separate
// from `showSchedule`, which only governs the Schedule button.
function PoolCard({division,pool,standings,games,followed,onFollow,tiebreakers,advanceCount,numPools,onScheduleClick,onTeamClick,showSchedule=true,preSchedule=false,title,cutLabel,note}:{division:string;pool:string;standings:Standing[];games:Game[];followed:(team:string)=>boolean;onFollow:(team:string)=>void;tiebreakers:string[];advanceCount:number;numPools:number;onScheduleClick:()=>void;onTeamClick:(team:string)=>void;showSchedule?:boolean;preSchedule?:boolean;title?:string;cutLabel?:string;note?:string}) {
  // The visitor's own toggle wins. Until they touch it, the default follows
  // preSchedule -- which can change after mount, because the visibility switch
  // arrives in its own request, so a plain useState default could stick on list.
  const [picked,setPview]=useState<'grid'|'list'|null>(null)
  const pview=picked??(preSchedule?'grid':'list')
  // With no games every team ties at zero and the sort keeps roster order, so
  // pre-schedule the order is set here: alphabetical, for a parent scanning
  // for their club.
  const rows=preSchedule?[...standings].sort((a,b)=>a.team.localeCompare(b.team)):standings
  const teamForm=(team:string)=>{
    const tg=games.filter(g=>g.division===division&&!g.isCanceled&&!g.isChampionship&&(pool?samePool(g.pool,pool):true)&&(g.team1===team||g.team2===team)&&g.score1!==null&&g.score2!==null)
      .sort((a,b)=>`${a.date}${a.startTime}`<`${b.date}${b.startTime}`?-1:1)
    return tg.slice(-3).map(g=>{const my=g.team1===team?g.score1!:g.score2!,op=g.team1===team?g.score2!:g.score1!;return my>op?'W':my<op?'L':'T'})
  }
  // advanceCount 0 means no line (by-division pools, rosters): Math.max(1, ...) used to
  // turn it into a line under #1 on every pool.
  const cutoff = advanceCount<=0 ? 0 : numPools>1 ? Math.max(1,Math.ceil(advanceCount/numPools)) : advanceCount
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="text-white font-bold text-sm uppercase tracking-wide">{title ?? <>{division}{pool ? ` — ${poolLabel(pool)}` : ''}</>}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
        {preSchedule && <span className="text-[11px] font-semibold text-white bg-white/15 px-2.5 py-0.5 rounded-full whitespace-nowrap">{rows.length} team{rows.length===1?'':'s'}</span>}
        <div className="flex gap-1">
          {(['grid','list'] as const).map(v=>(
            <button key={v} onClick={()=>setPview(v)} className={`p-1.5 rounded ${pview===v?'bg-white/20 text-white':'text-slate-400 hover:text-white'}`}>
              {v==='grid'
                ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>}
            </button>
          ))}
        </div>
        </div>
      </div>
      {pview==='grid' && (
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 bg-white">
          {rows.map((s,i)=>preSchedule ? (
            <div key={s.team} className="flex flex-col items-center py-4 px-3 gap-2 w-full">
              <TeamAvatar name={s.team}/>
              <div className={`text-xs font-bold uppercase leading-tight text-center ${followed(s.team)?'text-teal-700':'text-slate-800'}`}>{s.team}</div>
              <FollowerCount division={division} team={s.team} className="-mt-1"/>
              {/* mt-auto: a tile with no count line is shorter, so pin the button to the bottom of the row */}
              <FollowButton team={s.team} following={followed(s.team)} onToggle={onFollow} className="w-full mt-auto" />
            </div>
          ) : (
            <div key={s.team} className="flex flex-col items-center py-4 px-3 gap-2 w-full">
              <button onClick={()=>onTeamClick(s.team)} className="flex flex-col items-center gap-2 w-full rounded-lg hover:bg-teal-50 transition-colors cursor-pointer py-1" title={`View ${s.team} schedule`}>
                <TeamAvatar name={s.team}/>
                <div className="text-center">
                  <div className="text-xs text-slate-400 mb-0.5">{i+1}</div>
                  <div className="text-xs font-bold text-slate-800 uppercase leading-tight">{s.team}</div>
                  <FollowerCount division={division} team={s.team} className="mt-1"/>
                </div>
              </button>
              <FollowButton team={s.team} following={followed(s.team)} onToggle={onFollow} className="w-full mt-auto" />
            </div>
          ))}
        </div>
      )}
      {pview==='list' && preSchedule && (
        <div className="bg-white divide-y divide-slate-100">
          {rows.map(s=>(
            <div key={s.team} className="flex items-center gap-2.5 px-4 py-2.5">
              <TeamAvatar name={s.team} size="sm"/>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className={`font-semibold text-xs leading-tight ${followed(s.team)?'text-teal-700':'text-slate-800'}`}>{s.team}</span>
                <FollowerCount division={division} team={s.team}/>
              </span>
              <FollowButton team={s.team} following={followed(s.team)} onToggle={onFollow} />
            </div>
          ))}
        </div>
      )}
      {pview==='list' && !preSchedule && (
        <div className="bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-3 py-2.5 w-6 text-slate-400 font-semibold"></th>
              <th className="text-left px-2 py-2.5 text-slate-500 font-semibold">Team</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold w-7">W</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold w-7">L</th>
              <th className="hidden sm:table-cell text-center px-2 py-2.5 text-slate-500 font-semibold w-8">GA</th>
              <th className="hidden sm:table-cell text-center px-2 py-2.5 text-slate-500 font-semibold w-8">GF</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold w-10">GD</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold">Last 3</th>
              <th className="w-9 px-1 py-2.5"><span className="sr-only">Follow</span></th>
            </tr></thead>
            <tbody>
              {standings.map((s,i)=>{
                const mp=s.w+s.l+s.t,gd=s.gf-s.ga,form=teamForm(s.team)
                return (
                  <Fragment key={s.team}>
                    <tr className={`border-t border-slate-50 ${i===0&&mp>0?'bg-amber-50/40':''}`}>
                      <td className="px-3 py-2.5 text-slate-400 font-semibold">{i+1}</td>
                      <td className="px-2 py-2.5"><div className="flex items-center gap-2"><TeamAvatar name={s.team} size="sm"/><span className="flex flex-col"><button onClick={()=>onTeamClick(s.team)} className={`font-semibold text-xs leading-tight text-left hover:underline ${followed(s.team)?'text-teal-700':'text-slate-800'}`}>{s.team}</button><FollowerCount division={division} team={s.team}/></span></div></td>
                      <td className="px-2 py-2.5 text-center font-semibold text-slate-700">{s.w}</td>
                      <td className="px-2 py-2.5 text-center text-slate-600">{s.l}</td>
                      <td className="hidden sm:table-cell px-2 py-2.5 text-center text-slate-600">{s.ga}</td>
                      <td className="hidden sm:table-cell px-2 py-2.5 text-center text-slate-600">{s.gf}</td>
                      <td className={`px-2 py-2.5 text-center font-bold ${gd>0?'text-emerald-600':gd<0?'text-red-500':'text-slate-400'}`}>{gd>0?'+':''}{gd}</td>
                      <td className="px-2 py-2.5"><div className="flex items-center justify-center gap-1">{form.length===0?<span className="text-slate-300">—</span>:form.map((r,fi)=><span key={fi} className={`w-4 h-4 rounded-full text-[8px] font-bold text-white flex items-center justify-center ${r==='W'?'bg-emerald-500':r==='L'?'bg-red-500':'bg-slate-400'}`}>{r}</span>)}</div></td>
                      <td className="px-1 py-2.5"><FollowButton team={s.team} following={followed(s.team)} onToggle={onFollow} compact /></td>
                    </tr>
                    {cutoff>0 && cutoff<standings.length && i===cutoff-1 && (
                      <tr><td colSpan={9} className="p-0"><div className="border-t-2 border-dashed border-teal-300 mx-3 relative h-0"><span className="absolute right-2 -top-2 bg-white px-2 text-[9px] font-semibold text-teal-600 uppercase tracking-wide">{cutLabel??'Advances'} &uarr;</span></div></td></tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {note && <div className="px-3 py-2 bg-teal-50 border-t border-teal-100 text-[11px] text-teal-800">{note}</div>}
          {tiebreakers.length>0 && <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400">Tiebreakers: {tiebreakers.map((tb,i)=>(i?' \u2192 ':'')+(TB_LABEL[tb]||tb)).join('')}</div>}
        </div>
      )}
      {showSchedule && <button onClick={onScheduleClick} className="w-full bg-[#0f1f3d] hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors">Schedule</button>}
    </div>
  )
}


type DivTab = 'standings'|'schedule'|'bracket'

function DivisionView({division,games,isFollowed,anyFollowed,toggleFollow,tournamentId,tiebreakers,divTiebreakers=tiebreakers,advanceBy='division',scheduleLive=true,rosters=[],notes,poolOnly=false}:{division:string;games:Game[];isFollowed:(division:string,team:string)=>boolean;anyFollowed:boolean;toggleFollow:(division:string,team:string)=>void;tournamentId:string;tiebreakers:string[];divTiebreakers?:string[];advanceBy?:'division'|'pool';scheduleLive?:boolean;rosters?:PoolRoster[];notes?:{division:string;all:string};poolOnly?:boolean}) {
  // Every team on this view plays in `division`; follows are per (division, team).
  const followed=(team:string)=>isFollowed(division,team)
  const onFollow=(team:string)=>toggleFollow(division,team)
  const [divTab,setDivTab]=useState<DivTab>('standings')
  const [selectedTeam,setSelectedTeam]=useState<string|null>(null)
  const [schedStatus,setSchedStatus]=useState<'all'|'upcoming'|'final'>('all')
  const [schedField,setSchedField]=useState('')
  const [schedGroup,setSchedGroup]=useState<'time'|'field'>('time')
  const schedLogos=useContext(LogosContext)
  const [advanceCount,setAdvanceCount]=useState(0)
  const [bracketList,setBracketList]=useState<BkBracket[]>([])
  useEffect(()=>{
    fetch(`/api/tournaments/${tournamentId}/divisions/${encodeURIComponent(division)}/bracket`).then(r=>r.ok?r.json():[]).then(b=>{
      const fl:BkBracket[]=Array.isArray(b)?b:(b&&b.id?[b]:[])
      setBracketList(fl)
      setAdvanceCount(fl.reduce((acc:number,x:any)=>acc+(x.teamCount||0),0))
    }).catch(()=>{setBracketList([]);setAdvanceCount(0)})
  },[tournamentId,division])
  const handleTeamClick=(team:string)=>{if(!scheduleLive)return;setSelectedTeam(team);setDivTab('schedule')}
  const divGames=games.filter(g=>g.division===division&&!g.isCanceled)
  // Pools come from what staff assigned, so a division shows its pools before a
  // single game exists -- and still shows them if the schedule is wiped. Only a
  // division with no pools set falls back to reading them off the games.
  // Real pools only. The `unassigned` row -- registered teams in no pool yet --
  // is shown on its own below, and only while the schedule is unpublished.
  const realRosters=rosters.filter(r=>!r.unassigned&&r.teams.length)
  const loose=scheduleLive?undefined:rosters.find(r=>r.unassigned&&r.teams.length)
  const rosterPools=realRosters.map(r=>r.name)
  const gamePools=Array.from(new Set(divGames.map(g=>g.pool).filter(Boolean))).sort() as string[]
  const pools=rosterPools.length?rosterPools:gamePools
  const rosterFor=(p:string)=>realRosters.find(r=>samePool(r.name,p))?.teams||[]
  const divRoster=Array.from(new Set(realRosters.flatMap(r=>r.teams)))
  // How teams reach the bracket (Settings > Standings, lib/standings). By division
  // (Bo, Oct 12 2026: how Monster Mash seeds), the pools show no "Advances" line --
  // drawing the top two of each pool told families the wrong teams were through --
  // and one overall card ranks the whole division with the cut where it really is.
  // Pool games only: bracket games other than the final aren't flagged
  // isChampionship, so an unfiltered division ranking would count semifinals.
  const byDivision=advanceBy!=='pool'&&pools.length>1
  const poolPlay=games.filter(g=>!(g.division===division&&/^B\d+$/i.test(g.gameNumber||'')))
  const flights=bracketList.length>1
  const overallCut=flights?(bracketList[0] as any).teamCount||0:advanceCount
  const overallLabel=flights?`Flight ${(bracketList[0] as any).flight||'A'}`:'Advances'
  // isChampionship means THE FINAL -- the division tile names its winner as champion.
  // The bracket tree therefore cannot use it to decide which games to look at: it
  // resolves each bracket game by looking up the schedule game numbered B<n>, so it
  // needs the whole division, not just the one game that happens to be the final.
  // Filtering here is what made a fully played bracket render as W-B1 placeholders
  // with "Not scheduled" captions.
  const scheduleGames=divGames.sort((a,b)=>a.date!==b.date?(a.date<b.date?-1:1):a.startTime<b.startTime?-1:1)
  const bracketGames=divGames

  // Before the schedule is published there is only the roster, so no tab bar
  // at all -- it used to show a lone "Standings" tab over a division with no games.
  const tabs:DivTab[]=['standings','schedule','bracket']
  const tabLabels:{[k in DivTab]:string}={standings:'Standings',schedule:'Schedule',bracket:'Bracket'}

  return (
    <div>
      {/* Notes staff wrote on the Divisions page (lib/divisionNotes): this division's,
          then the one for every division. */}
      {notes&&(notes.division||notes.all)&&(
        <div className="mb-4 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex items-start gap-2.5" data-testid="division-notes">
          <Info size={16} className="text-teal-600 mt-0.5 flex-shrink-0"/>
          <div className="min-w-0 space-y-1.5 text-sm text-slate-700 leading-relaxed">
            {notes.division&&<p className="whitespace-pre-line break-words">{notes.division}</p>}
            {notes.all&&<p className={`whitespace-pre-line break-words ${notes.division?'text-slate-500':''}`}>{notes.all}</p>}
          </div>
        </div>
      )}
      {scheduleLive && <div className="flex border-b border-gray-200 mb-4 bg-white rounded-t-xl overflow-hidden shadow-sm">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setDivTab(t)}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${divTab===t?'bg-[#0f1f3d] text-white':'text-gray-500 hover:bg-gray-50'}`}>
            {tabLabels[t]}
          </button>
        ))}
      </div>}


      {(divTab==='standings'||!scheduleLive) && (
        <div className="space-y-4">
          {pools.length>0 ? (
            // items-start: a 4-team pool beside a 6-team one stretched to match,
            // leaving a grey band inside its border (under the Schedule button,
            // once the schedule is live).
            <>
            {byDivision&&scheduleLive&&(
              <PoolCard division={division} pool="" title={`${division} — Overall`} standings={calcStandings(poolPlay,division,undefined,divTiebreakers,divRoster)} games={poolPlay} followed={followed} onFollow={onFollow} tiebreakers={divTiebreakers} advanceCount={overallCut} numPools={1} cutLabel={overallLabel} note={`Bracket seeds come from this overall ranking across ${pools.length} pools, not from pool finish.`} showSchedule={false} onScheduleClick={()=>{}} onTeamClick={handleTeamClick}/>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              {pools.map(pool=>(
                <PoolCard key={pool} division={division} pool={pool} standings={calcStandings(games,division,pool,tiebreakers,rosterFor(pool))} games={games} followed={followed} onFollow={onFollow} tiebreakers={tiebreakers} advanceCount={byDivision?0:advanceCount} numPools={pools.length} showSchedule={scheduleLive} preSchedule={!scheduleLive} onScheduleClick={()=>setDivTab('schedule')} onTeamClick={handleTeamClick}/>
              ))}
              {loose && <PoolCard key="__loose" division={division} pool="" title={`${division} — Not in a pool yet`} standings={calcStandings(games,division,undefined,tiebreakers,loose.teams)} games={games} followed={followed} onFollow={onFollow} tiebreakers={tiebreakers} advanceCount={0} numPools={pools.length} showSchedule={false} preSchedule onScheduleClick={()=>{}} onTeamClick={handleTeamClick}/>}
            </div>
            </>
          ) : loose
            // No pools set yet: every registered team in one card, same shape,
            // so the page doesn't change character once they are split up.
            ? <PoolCard division={division} pool="" standings={calcStandings(games,division,undefined,tiebreakers,loose.teams)} games={games} followed={followed} onFollow={onFollow} tiebreakers={tiebreakers} advanceCount={0} numPools={1} showSchedule={false} preSchedule onScheduleClick={()=>{}} onTeamClick={handleTeamClick}/>
            : <PoolCard division={division} pool="" standings={calcStandings(games,division,undefined,tiebreakers,divRoster)} games={games} followed={followed} onFollow={onFollow} tiebreakers={tiebreakers} advanceCount={advanceCount} numPools={1} showSchedule={scheduleLive} preSchedule={!scheduleLive} onScheduleClick={()=>setDivTab('schedule')} onTeamClick={handleTeamClick}/>}
          {/* The bracket's format before the schedule is out: the bracket route sends
              the games and where their teams come from, no teams, times or fields. */}
          {!scheduleLive&&(bracketList.length>0||poolOnly)&&(
            <div className="pt-2" data-testid="bracket-format">
              <div className="flex items-baseline justify-between gap-x-3 gap-y-1 flex-wrap mb-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Bracket format</h3>
                {!poolOnly&&<span className="text-xs text-slate-500">Teams are placed after pool play. Times and fields are coming soon.</span>}
              </div>
              {poolOnly
                ? <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">Pool play only: this division has no bracket.</div>
                : <div className="bg-white rounded-xl border border-slate-200 p-4"><BracketView bracketList={bracketList} scheduledGames={[]} preview/></div>}
            </div>
          )}
        </div>
      )}

      {scheduleLive && divTab==='schedule' && (() => {
        const now = Date.now()
        const all = [...divGames].sort((a,b)=>a.date!==b.date?(a.date<b.date?-1:1):((parseStartMs(a.date,a.startTime)||0)-(parseStartMs(b.date,b.startTime)||0)))
        const isPlaceholder = (n:string)=>/^(seed\s|w-b|l-b|bracket\b|winner\b|loser\b|tbd$)/i.test((n||'').trim())
        const teamsInDiv = [...new Set(divGames.filter(g=>!g.isChampionship).flatMap(g=>[g.team1,g.team2]).filter(n=>!!n&&!isPlaceholder(n)))].sort()
        const realTeams = new Set(teamsInDiv)
        const fieldsInDiv = [...new Set(divGames.map(g=>g.location).filter(Boolean))].sort()
        const isLive = (g:Game)=>{ if(g.score1!=null) return false; const st=parseStartMs(g.date,g.startTime); return st!=null && now>=st && now<=st+90*60000 }
        const crest = (name:string)=> schedLogos[name]
          ? <img src={schedLogos[name]} alt="" className="w-5 h-5 rounded-full object-contain bg-white border border-slate-200 flex-shrink-0"/>
          : <span className="w-5 h-5 rounded-full bg-slate-300 text-white text-[9px] font-semibold flex items-center justify-center flex-shrink-0">{(name||'?').charAt(0).toUpperCase()}</span>
        const downloadIcs = (g:Game)=>{ const st=parseStartMs(g.date,g.startTime); if(st==null) return; const fmt=(ms:number)=>new Date(ms).toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'; const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Whistle Ready//EN','BEGIN:VEVENT','UID:'+g.id+'@whistleready','DTSTART:'+fmt(st),'DTEND:'+fmt(st+3600000),'SUMMARY:'+g.team1+' vs '+g.team2,'LOCATION:'+(g.location||''),'DESCRIPTION:'+division,'END:VEVENT','END:VCALENDAR'].join('\r\n'); const blob=new Blob([ics],{type:'text/calendar'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=(g.team1+'-vs-'+g.team2).replace(/[^a-z0-9]+/gi,'-')+'.ics'; a.click(); URL.revokeObjectURL(url) }
        const upNext = anyFollowed ? all.find(g=>g.score1==null && (isFollowed(g.division,g.team1)||isFollowed(g.division,g.team2))) : null
        const base = all.filter(g=>{
          if(selectedTeam && g.team1!==selectedTeam && g.team2!==selectedTeam) return false
          if(schedField && g.location!==schedField) return false
          const hs=g.score1!=null&&g.score2!=null
          if(schedStatus==='final'&&!hs) return false
          if(schedStatus==='upcoming'&&hs) return false
          return true
        })
        const groups = schedGroup==='time'
          ? [...new Set(base.map(g=>g.date))].map(d=>({key:d,label:fmtDayHeader(d),sub:base.filter(g=>g.date===d).length+' games',games:base.filter(g=>g.date===d)}))
          : [...new Set(base.map(g=>g.location||'TBD'))].sort().map(fl=>({key:fl,label:fl,sub:base.filter(g=>(g.location||'TBD')===fl).length+' games',games:base.filter(g=>(g.location||'TBD')===fl)}))
        const card = (g:Game)=>{
          const hs=g.score1!=null&&g.score2!=null
          const live=isLive(g)
          const t1w=hs&&g.score1!>g.score2!, t2w=hs&&g.score2!>g.score1!
          const isHL=isFollowed(g.division,g.team1)||isFollowed(g.division,g.team2)
          const chipCls=g.isChampionship?'bg-amber-100 text-amber-800':'bg-teal-100 text-teal-700'
          // "If needed": only played on a certain result (lib/ifNeeded), so families don't plan around it
          const pill=hs?{t:'Final',c:'bg-slate-100 text-slate-500'}:live?{t:'Live',c:'bg-red-100 text-red-700'}:g.ifNeeded?{t:'If needed',c:'bg-violet-50 text-violet-700'}:g.isChampionship?{t:'Bracket',c:'bg-amber-50 text-amber-700'}:g.pool?{t:poolLabel(g.pool),c:'bg-teal-50 text-teal-700'}:{t:'Upcoming',c:'bg-slate-100 text-slate-500'}
          return (
            <div key={g.id} className={`bg-white border rounded-xl px-2.5 py-2 flex items-center gap-2.5 ${live?'border-red-200':isHL?'border-teal-300 bg-teal-50/30':'border-slate-200'}`}>
              <Link href={`/tournaments/${tournamentId}/public/games/${g.id}`} title="Game page" className={`text-[10px] font-bold w-8 text-center py-0.5 rounded flex-shrink-0 hover:ring-2 hover:ring-teal-300 ${chipCls}`}>{g.gameNumber}</Link>
              <div className="w-[58px] flex-shrink-0 text-center border-r border-slate-100 pr-2">
                <div className="text-[12px] font-semibold text-slate-800">{g.startTime||'TBD'}</div>
                <div className="text-[10px] text-slate-400 truncate">{(g.location||'').split(' - ').pop()||''}</div>
              </div>
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                  <FollowButton team={g.team1} following={isFollowed(g.division,g.team1)} onToggle={t=>toggleFollow(g.division,t)} compact />
                  {realTeams.has(g.team1)
                    ? <button onClick={()=>setSelectedTeam(g.team1)} className={`text-[12.5px] truncate text-right hover:underline ${t1w?'font-semibold text-teal-700':'text-slate-700'}`}>{g.team1}</button>
                    : <span className={`text-[12.5px] truncate ${t1w?'font-semibold text-teal-700':'text-slate-700'}`}>{g.team1||'TBD'}</span>}
                  {crest(g.team1)}
                </div>
                {hs ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`w-6 h-6 rounded text-[13px] font-bold flex items-center justify-center ${t1w?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{g.score1}</span>
                    <span className="text-slate-300 text-[10px]">–</span>
                    <span className={`w-6 h-6 rounded text-[13px] font-bold flex items-center justify-center ${t2w?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{g.score2}</span>
                  </div>
                ) : <span className="text-[11px] text-slate-400 font-medium flex-shrink-0">vs</span>}
                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                  {crest(g.team2)}
                  {realTeams.has(g.team2)
                    ? <button onClick={()=>setSelectedTeam(g.team2)} className={`text-[12.5px] truncate text-left hover:underline ${t2w?'font-semibold text-teal-700':'text-slate-700'}`}>{g.team2}</button>
                    : <span className={`text-[12.5px] truncate ${t2w?'font-semibold text-teal-700':'text-slate-700'}`}>{g.team2||'TBD'}</span>}
                  <FollowButton team={g.team2} following={isFollowed(g.division,g.team2)} onToggle={t=>toggleFollow(g.division,t)} compact />
                </div>
              </div>
              {!hs && parseStartMs(g.date,g.startTime)!=null && <button onClick={()=>downloadIcs(g)} title="Add to calendar" className="flex-shrink-0 text-slate-400 hover:text-teal-600"><CalendarPlus size={15}/></button>}
              <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${pill.c}`}>{live?'● ':''}{pill.t}</span>
            </div>
          )
        }
        return (
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <select value={selectedTeam||''} onChange={e=>setSelectedTeam(e.target.value||null)} className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">All teams</option>
                {teamsInDiv.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <select value={schedField} onChange={e=>setSchedField(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">All fields</option>
                {fieldsInDiv.map(fl=><option key={fl} value={fl}>{fl}</option>)}
              </select>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {(['all','upcoming','final'] as const).map(st=><button key={st} onClick={()=>setSchedStatus(st)} className={`text-[11px] px-2.5 py-1 rounded-md capitalize transition-colors ${schedStatus===st?'bg-white shadow text-teal-700 font-medium':'text-slate-500 hover:text-slate-700'}`}>{st}</button>)}
              </div>
              <div className="flex bg-slate-100 rounded-lg p-0.5 ml-auto">
                {(['time','field'] as const).map(gp=><button key={gp} onClick={()=>setSchedGroup(gp)} className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${schedGroup===gp?'bg-white shadow text-teal-700 font-medium':'text-slate-500 hover:text-slate-700'}`}>By {gp}</button>)}
              </div>
            </div>
            {upNext && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                <Clock size={14} className="text-teal-600 flex-shrink-0"/>
                <span className="text-xs text-teal-700 truncate"><b>Up next</b> · {upNext.startTime} · {upNext.team1} vs {upNext.team2}{upNext.location?' · '+(upNext.location.split(' - ').pop()):''}</span>
              </div>
            )}
            {groups.length===0 ? <div className="text-center py-12 text-slate-400">No games found.</div> : groups.map(grp=>(
              <div key={grp.key} className="mb-4">
                <div className="flex items-center gap-2 mb-2 mt-1">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{grp.label}</p>
                  <span className="text-[10px] text-slate-400">{grp.sub}</span>
                  <span className="flex-1 border-t border-slate-200"></span>
                </div>
                <div className="space-y-2">{grp.games.map(card)}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {scheduleLive && divTab==='bracket' && (
        <BracketView bracketList={bracketList} scheduledGames={bracketGames} poolOnly={poolOnly}/>
      )}
    </div>
  )
}


export default function PublicTournamentPage() {
  const {id}=useParams()
  const [tournament,setTournament]=useState<Tournament|null>(null)
  // An event is "over" the day AFTER its last day, so the live header survives the
  // final evening -- parents check scores on the drive home. Dates are plain
  // YYYY-MM-DD, so build them from parts: new Date('2025-12-14') parses as UTC and
  // flips the answer for anyone west of Greenwich.
  const [logos,setLogos]=useState<Record<string,string>>({})
  const [tiebreakers,setTiebreakers]=useState<string[]>(DEFAULT_TBS)
  const [divTiebreakers,setDivTiebreakers]=useState<string[]>(DEFAULT_TBS)
  const [advanceBy,setAdvanceBy]=useState<'division'|'pool'>('division')
  const [games,setGames]=useState<Game[]>([])
  const [loading,setLoading]=useState(true)
  const [selectedDiv,setSelectedDiv]=useState<string|null>(null)
  // Follows live on the server, keyed by a device id this browser minted once
  // (lib/pushClient). They used to live only in localStorage, which is why
  // nothing could count them and nothing could send to them.
  // What this device follows: (division, team) pairs, in the order they were followed.
  const [followed,setFollowed]=useState<FollowRef[]>([])
  const isFollowed=(division:string,team:string)=>followed.some(f=>teamRefKey(f.division,f.team)===teamRefKey(division,team))
  // Follows saved before they were saved anywhere but this browser: names only,
  // carried over once the rosters say which divisions those names play in.
  const [legacyNames,setLegacyNames]=useState<string[]>([])
  const [device,setDevice]=useState('')
  const [alertsOn,setAlertsOn]=useState<boolean|null>(null)
  const [askAlertsFor,setAskAlertsFor]=useState<string|null>(null)
  const [teamSearch,setTeamSearch]=useState('')
  const [announcements,setAnnouncements]=useState<any[]>([])
  // Division notes from the Divisions page (lib/divisionNotes), and the divisions set
  // to pool play only (lib/divisionPlan).
  const [divNotes,setDivNotes]=useState<{all:string;divisions:Record<string,string>}>({all:'',divisions:{}})
  const [poolOnlyDivs,setPoolOnlyDivs]=useState<string[]>([])
  const noteFor=(div:string)=>{const k=nameKey(div);const hit=Object.keys(divNotes.divisions).find(n=>nameKey(n)===k);return hit?divNotes.divisions[hit]:''}
  // Registered-team count per division (same numbers the staff Divisions page shows).
  const [regTeamCounts,setRegTeamCounts]=useState<Record<string,number>>({})
  // What staff have published (lib/publicView). The games feed is already filtered
  // server-side; this only decides which tabs and messages to show.
  const [pubVis,setPubVis]=useState<{pools:'live'|'hidden';schedule:'live'|'hidden'}>({pools:'live',schedule:'live'})
  // Divisions, pools and who is in them -- the record this page is really about.
  // Kept separate from the games so the page still has something to show when
  // there is no schedule yet, or when one is cleared and rebuilt.
  const [poolRosters,setPoolRosters]=useState<PoolRoster[]>([])
  // `unassigned` rows only show while the schedule is unpublished; once it is
  // live the page reads the rosters exactly as it did before they existed.
  const liveRosters=useMemo(()=>pubVis.schedule==='live'?poolRosters.filter(r=>!r.unassigned):poolRosters,[poolRosters,pubVis.schedule])
  const [annOpen,setAnnOpen]=useState(false)
  const [followCounts,setFollowCounts]=useState<Record<string,number>>({})

  useEffect(()=>{
    Promise.all([
      fetch(`/api/tournaments/${id}`).then(r=>r.json()),
      fetch(`/api/tournaments/${id}/games?view=public`).then(r=>r.json()),
      fetch(`/api/tournaments/${id}/team-logos`).then(r=>r.ok?r.json():{}).catch(()=>({})),
    ]).then(([t,g,lg])=>{setTournament(t);setGames(Array.isArray(g)?g:[]);setLogos(lg||{});try{const o=JSON.parse((t&&t.tiebreakers)||'{}');const pool=Array.isArray(o)?o:(o.pool||[]);if(pool.length)setTiebreakers(pool);const dv=Array.isArray(o)?o:(o.division||[]);setDivTiebreakers(dv.length?dv:(pool.length?pool:DEFAULT_TBS));setAdvanceBy(!Array.isArray(o)&&o.advanceBy==='pool'?'pool':'division')}catch{};setLoading(false)})
    const dev=getDeviceId(); setDevice(dev)
    ;(async()=>{
      // People who followed before follows were saved anywhere but their own
      // browser: carry those over once, then the server is the truth.
      let legacy:string[]=[]
      try{ legacy=JSON.parse(localStorage.getItem(`follows-${id}`)||'[]'); if(!Array.isArray(legacy)) legacy=[] }catch{}
      if(dev&&legacy.length) setLegacyNames(legacy.filter(x=>typeof x==='string'))
      try{
        const r=await fetch(`/api/tournaments/${id}/follows?device=${encodeURIComponent(dev||'')}`)
        const d=r.ok?await r.json():null
        if(d&&d.counts&&typeof d.counts==='object') setFollowCounts(d.counts)
        if(!dev) return   // storage blocked: everyone else's counts still show; following works for this visit only
        if(d&&Array.isArray(d.following)) setFollowed(d.following.filter((f:any)=>f&&typeof f.team==='string').map((f:any)=>({division:String(f.division||''),team:f.team})))
        const dv=await fetch(`/api/follows/device?device=${encodeURIComponent(dev)}`).then(r=>r.ok?r.json():null).catch(()=>null)
        setAlertsOn(!!dv?.enabled)
      }catch{}
    })()
    fetch(`/api/tournaments/${id}/announcements`).then(r=>r.ok?r.json():null).then(d=>{if(d&&Array.isArray(d.announcements))setAnnouncements(d.announcements)}).catch(()=>{})
    fetch(`/api/tournaments/${id}/division-notes?view=public`).then(r=>r.ok?r.json():null).then(d=>{if(d&&typeof d==='object')setDivNotes({all:typeof d.all==='string'?d.all:'',divisions:d.divisions&&typeof d.divisions==='object'?d.divisions:{}})}).catch(()=>{})
    fetch(`/api/tournaments/${id}/visibility`).then(r=>r.ok?r.json():null).then(d=>{if(d&&d.pools)setPubVis({pools:d.pools,schedule:d.schedule})}).catch(()=>{})
    fetch(`/api/tournaments/${id}/pools?view=public`).then(r=>r.ok?r.json():[]).then(d=>{if(Array.isArray(d))setPoolRosters(d.filter((x:any)=>x&&typeof x.division==='string'))}).catch(()=>{})
    fetch(`/api/tournaments/${id}/divisions?view=public`).then(r=>r.ok?r.json():null).then(d=>{if(Array.isArray(d)){const m:Record<string,number>={};d.forEach((x:any)=>{if(x&&typeof x.name==='string')m[x.name]=Number(x.teamCount)||0});setRegTeamCounts(m);setPoolOnlyDivs(d.filter((x:any)=>x&&x.noBracket&&typeof x.name==='string').map((x:any)=>x.name))}}).catch(()=>{})
  },[id])

  // A name-only legacy follow becomes a follow of that name in every division it
  // plays in -- which is what the follower saw before follows knew divisions.
  useEffect(()=>{
    if(!device||!legacyNames.length||(!liveRosters.length&&!games.length)) return
    const names=legacyNames; setLegacyNames([])
    ;(async()=>{
      const refs:FollowRef[]=[]
      const seen=new Set<string>()
      const add=(division:string,team:string)=>{const k=teamRefKey(division,team); if(!seen.has(k)){seen.add(k);refs.push({division,team})}}
      liveRosters.forEach(r=>r.teams.forEach(t=>{ if(names.some(n=>teamRefKey('',n)===teamRefKey('',t))) add(r.division,t) }))
      games.forEach(g=>[g.team1,g.team2].forEach(t=>{ if(!isPlaceholderTeam(t)&&names.some(n=>teamRefKey('',n)===teamRefKey('',t))) add(g.division,t) }))
      await Promise.all(refs.map(f=>fetch(`/api/tournaments/${id}/follows`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:device,division:f.division,teamName:f.team,follow:true})}).catch(()=>{})))
      try{ localStorage.removeItem(`follows-${id}`) }catch{}
      try{
        const r=await fetch(`/api/tournaments/${id}/follows?device=${encodeURIComponent(device)}`); const d=r.ok?await r.json():null
        if(d&&Array.isArray(d.following)) setFollowed(d.following.map((f:any)=>({division:String(f.division||''),team:String(f.team||'')})))
        if(d&&d.counts) setFollowCounts(d.counts)
      }catch{}
    })()
  },[device,legacyNames,liveRosters,games,id])

  const toggleFollow=async(division:string,team:string)=>{
    const key=teamRefKey(division,team)
    const was=isFollowed(division,team)
    const firstEver=!was&&followed.length===0
    // Optimistic: the button flips now, the server confirms, a failure flips it back.
    const without=(list:FollowRef[])=>list.filter(f=>teamRefKey(f.division,f.team)!==key)
    setFollowed(prev=>was?without(prev):[...without(prev),{division,team}])
    if(!device){ return }   // storage blocked: works for this visit only
    const bump=(delta:number)=>setFollowCounts(c=>({...c,[key]:Math.max(0,(c[key]||0)+delta)}))
    bump(was?-1:1)
    try{
      const r=await fetch(`/api/tournaments/${id}/follows`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:device,division,teamName:team,follow:!was})})
      const d=r.ok?await r.json():null
      if(d&&Array.isArray(d.following)) setFollowed(d.following.map((f:any)=>({division:String(f.division||''),team:String(f.team||'')})))
      else if(!r.ok){ setFollowed(prev=>was?[...without(prev),{division,team}]:without(prev)); bump(was?1:-1) }
      // The server's count is the truth -- other phones have been tapping too.
      if(d&&typeof d.count==='number') setFollowCounts(c=>({...c,[d.team?teamRefKey(d.team.division,d.team.team):key]:d.count}))
      // The soft ask, once per device: asked again only if they never decided.
      let asked=false; try{ asked=localStorage.getItem('wr-alerts-asked')==='1' }catch{}
      if(r.ok&&firstEver&&!asked&&alertsOn!==true) setAskAlertsFor(team)
    }catch{
      setFollowed(prev=>was?[...without(prev),{division,team}]:without(prev)); bump(was?1:-1)
    }
  }
  const closeAlertsAsk=(enabled:boolean)=>{
    setAskAlertsFor(null)
    if(enabled) setAlertsOn(true)
    try{ localStorage.setItem('wr-alerts-asked','1') }catch{}
  }

  // A division counts as published once it has pools OR games. Reading only the
  // games meant an event with no schedule yet showed an empty public page, which
  // is why the schedule could never be cleared and rebuilt.
  const divisions=useMemo(()=>{
    const set=new Set<string>()
    games.filter(g=>!g.isCanceled).forEach(g=>{if(g.division)set.add(g.division)})
    liveRosters.forEach(r=>{if(r.division&&r.teams.length)set.add(r.division)})
    return Array.from(set).sort()
  },[games,liveRosters])

  // Per-division: last updated time and champion
  const allTeamsWithMeta=useMemo(()=>{
    const seen=new Set<string>()
    const teams:{name:string;division:string;pool:string|null}[]=[]
    // Rostered divisions are listed from the roster and nothing else -- a team
    // dropped from every pool must not walk back in through an old game.
    const rostered=new Set<string>()
    liveRosters.forEach(r=>{
      if(!r.teams.length)return
      rostered.add(r.division)
      r.teams.forEach(name=>{
        if(isPlaceholderTeam(name)||seen.has(name+r.division))return
        seen.add(name+r.division); teams.push({name,division:r.division,pool:r.name})
      })
    })
    games.filter(g=>!g.isCanceled&&!rostered.has(g.division)).forEach(g=>{
      if(isPlaceholderTeam(g.team1)&&isPlaceholderTeam(g.team2))return
      if(!isPlaceholderTeam(g.team1)&&!seen.has(g.team1+g.division)){seen.add(g.team1+g.division);teams.push({name:g.team1,division:g.division,pool:g.pool})}
      if(!isPlaceholderTeam(g.team2)&&!seen.has(g.team2+g.division)){seen.add(g.team2+g.division);teams.push({name:g.team2,division:g.division,pool:g.pool})}
    })
    return teams.sort((a,b)=>a.name.localeCompare(b.name))
  },[games,liveRosters])

  const divMeta=useMemo(()=>{
    const meta:Record<string,{teams:number;rosterTeams:number;total:number;completed:number;pools:number;leader:string|null;champion:string|null;lastUpdated:string;status:string}>={}
    divisions.forEach(div=>{
      const divGames=games.filter(g=>g.division===div&&!g.isCanceled)
      // Bracket slots not yet filled are stored as placeholders ("Seed 3", "W-B2", "TBD").
      // Counting every name in the games made a 15-team division read 33. Prefer the
      // registered count; fall back to real names found in the schedule.
      const teamSet=new Set<string>(); divGames.forEach(g=>{[g.team1,g.team2].forEach(t=>{if(t&&!isPlaceholderTeam(t))teamSet.add(t)})})
      const divRosters=liveRosters.filter(r=>r.division===div&&r.teams.length)
      // "Not in a pool yet" is not a pool; counting it made two pools read three.
      const realPools=divRosters.filter(r=>!r.unassigned)
      const poolSet=realPools.length
        ? new Set(realPools.map(r=>r.name))
        : new Set(divGames.filter(g=>g.pool).map(g=>g.pool))
      // What the division's cards list before the schedule: pooled teams plus
      // those not in a pool yet, waitlisted teams left out. Registration counts
      // include the waiting list, so the tile and the card could disagree.
      const rosterTeams=new Set(divRosters.flatMap(r=>r.teams)).size
      const total=divGames.length
      const completed=divGames.filter(g=>g.score1!==null&&g.score2!==null).length
      const champ=divGames.find(g=>g.isChampionship&&g.score1!==null&&g.score2!==null)
      // A level final decides nothing. Without this the ternary falls through to team2
      // and the tile crowns whoever happens to be listed second.
      const champion=(champ&&champ.score1!==champ.score2)?(champ.score1!>champ.score2!?champ.team1:champ.team2):null
      const hasBracket=divGames.some(g=>g.isChampionship)
      const standings=calcStandings(games,div,undefined,tiebreakers)
      const leader=(!champion&&completed>0&&standings.length>0)?standings[0].team:null
      const scored=[...divGames.filter(g=>g.score1!==null)].sort((a,b)=>`${a.date}${a.startTime}`<`${b.date}${b.startTime}`?-1:1)
      const lastUpdated=scored.length>0?fmtDateTime(scored[scored.length-1].date+' '+scored[scored.length-1].startTime):''
      const status=champion?'Final':hasBracket?'Bracket':'Pool play'
      meta[div]={teams:regTeamCounts[div]??teamSet.size,rosterTeams,total,completed,pools:poolSet.size,leader,champion,lastUpdated,status}
    })
    return meta
  },[games,divisions,tiebreakers,regTeamCounts,liveRosters])



  if(loading) return <div className="bg-slate-50 py-24 flex items-center justify-center"><div className="text-slate-400">Loading…</div></div>

  return (
    <LogosContext.Provider value={logos}>
    <FollowCountsContext.Provider value={followCounts}>
    <div className="bg-slate-50">
      {/* Live-score ticker: live games + recent finals, linking to per-game pages */}
      <LiveTicker tournamentId={String(id)} games={games} logos={logos}/>
      {/* First follow on this device: ask about alerts, once. */}
      {askAlertsFor && device && <FollowAlertsSheet team={askAlertsFor} deviceId={device} onDone={closeAlertsAsk} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12">
        {announcements.length > 0 && (
          <div className="mb-4">
            <button onClick={() => setAnnOpen(o => !o)}
              className={`w-full text-left rounded-xl px-4 py-3 border flex items-start gap-2.5 shadow-sm ${announcements[0].urgent ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
              <Megaphone size={16} className={`mt-0.5 flex-shrink-0 ${announcements[0].urgent ? 'text-amber-500' : 'text-teal-600'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${announcements[0].urgent ? 'text-amber-800 font-medium' : 'text-slate-700'} ${annOpen ? '' : 'truncate'}`}>{announcements[0].text}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{announcements[0].scope} · {new Date(announcements[0].createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{announcements.length > 1 ? ` · ${annOpen ? 'hide' : announcements.length + ' announcements'}` : ''}</p>
              </div>
              {announcements.length > 1 && (annOpen ? <ChevronUp size={15} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-slate-400 flex-shrink-0" />)}
            </button>
            {annOpen && announcements.length > 1 && (
              <div className="mt-1.5 space-y-1.5">
                {announcements.slice(1).map((a: any) => (
                  <div key={a.id} className={`rounded-lg px-4 py-2.5 border text-sm ${a.urgent ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-slate-200 text-slate-700'}`}>
                    <p>{a.text}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{a.scope} · {new Date(a.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {pubVis.schedule!=='live'&&pubVis.pools==='live'&&divisions.length>0&&(
          <div className="mb-4 rounded-xl px-4 py-3 border bg-sky-50 border-sky-200 text-sm text-sky-800 flex items-center gap-2">
            <Calendar size={15} className="flex-shrink-0"/> Pools are posted. Game times and fields are coming soon.
          </div>
        )}
        {/* Back button when viewing a division */}
        {selectedDiv && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative">
              <select value={selectedDiv} onChange={e=>setSelectedDiv(e.target.value)}
                className="appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-9 py-2 text-sm font-semibold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-400">
                {divisions.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
            </div>
            <button onClick={()=>setSelectedDiv(null)} className="text-sm text-slate-500 hover:text-teal-700 font-medium">All divisions</button>
          </div>
        )}

        {/* Division grid overview */}
        {!selectedDiv && (
          <>
            {/* Search bar */}
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                placeholder="Search for a team…"
                className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent shadow-sm"
              />
              {teamSearch && <button onClick={()=>setTeamSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={16}/></button>}
            </div>

            {/* Search results */}
            {teamSearch.length > 1 && (
              <div className="mb-5 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                {allTeamsWithMeta.filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-400 text-sm">No teams found for "{teamSearch}"</div>
                ) : (
                  allTeamsWithMeta.filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase())).map(t => (
                    <div key={t.name} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <TeamAvatar name={t.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <button onClick={()=>{setSelectedDiv(t.division);setTeamSearch('')}} className="font-semibold text-sm text-blue-700 hover:underline text-left">{t.name}</button>
                        <div className="text-xs text-gray-400 flex items-center gap-2">{t.division}{t.pool ? ` · ${poolLabel(t.pool)}` : ''}<FollowerCount division={t.division} team={t.name}/></div>
                      </div>
                      <FollowButton team={t.name} following={isFollowed(t.division,t.name)} onToggle={n=>toggleFollow(t.division,n)} />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* My Teams section */}
            {followed.length > 0 && !teamSearch && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide inline-flex items-center gap-1.5"><Star size={14} fill="currentColor"/> My Teams</h2>
                  {/* Following IS being notified; this only says whether this
                      phone hears, and offers to turn it on if not. */}
                  {alertsOn
                    ? <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-full inline-flex items-center gap-1"><Bell size={13}/> Alerts on</span>
                    : device && <button onClick={()=>setAskAlertsFor(followed[0].team)}
                        className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1">
                        <Bell size={13}/> Turn on alerts
                      </button>}
                </div>
                <div className="space-y-2">
                  {followed.map(({division,team}) => {
                    const sameDiv=(d:string)=>teamRefKey(d,'x')===teamRefKey(division,'x')
                    const nextGame = games.filter(g=>!g.isCanceled&&sameDiv(g.division)&&(g.team1===team||g.team2===team)).sort((a,b)=>a.date!==b.date?(a.date<b.date?-1:1):a.startTime<b.startTime?-1:1)[0]
                    const teamMeta = allTeamsWithMeta.find(t=>t.name===team&&sameDiv(t.division))
                    return (
                      <div key={teamRefKey(division,team)} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
                        <TeamAvatar name={team} size="sm" />
                        <div className="flex-1 min-w-0">
                          <button onClick={()=>setSelectedDiv(teamMeta?.division||division)} className="font-bold text-sm text-gray-800 hover:text-blue-700 hover:underline text-left truncate block">{team} <span className="font-normal text-xs text-gray-400">· {division}</span></button>
                          {nextGame ? (
                            <div className="text-xs text-gray-500 mt-0.5">
                              Next: <span className="font-medium">{fmtDate(nextGame.date)} {nextGame.startTime}</span> vs <span className="font-medium">{nextGame.team1===team?nextGame.team2:nextGame.team1}</span> · {nextGame.location}
                            </div>
                          ) : <div className="text-xs text-gray-400">{pubVis.schedule==='live'?'No upcoming games':'Schedule coming soon'}</div>}
                        </div>
                        <FollowButton team={team} following onToggle={t=>toggleFollow(division,t)} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {divisions.length===0 && <div className="text-center py-16 text-gray-400"><div className="flex justify-center mb-3"><Calendar size={36} className="text-slate-300"/></div><p>{pubVis.schedule==='live'?'No games scheduled yet.':'The schedule is coming soon.'}</p></div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {divisions.map(div=>{
                const m=divMeta[div]
                if(!m) return null
                const pctDone=m.total>0?Math.round(m.completed/m.total*100):0
                const pill=m.status==='Final'?'bg-amber-100 text-amber-800':m.status==='Bracket'?'bg-amber-50 text-amber-700':'bg-teal-50 text-teal-700'
                // Before the schedule is published the tile says who is in the
                // division and nothing else: no game count, no progress bar, no
                // "No scores yet" -- all of it only means something once games
                // exist, and it comes back as it was the moment they do.
                const pre=pubVis.schedule!=='live'
                const teamCount=pre?(m.rosterTeams||m.teams):m.teams
                return (
                  <button key={div} onClick={()=>setSelectedDiv(div)}
                    className="text-left bg-white border border-slate-200 rounded-xl p-3.5 hover:border-teal-300 hover:shadow-sm transition-all group">
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <h3 className="font-semibold text-slate-900 text-sm truncate group-hover:text-teal-700 transition-colors">{div}</h3>
                      {!pre&&<span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0 ${pill}`}>
                        {m.status==='Final'&&<Trophy size={10}/>}{m.status}
                      </span>}
                    </div>
                    <div className={`flex items-center gap-3.5 text-xs text-slate-500 flex-wrap ${pre?'':'mb-3'}`}>
                      <span className="inline-flex items-center gap-1"><Users size={13}/><b className="text-slate-800 font-semibold">{teamCount}</b> team{teamCount===1?'':'s'}</span>
                      {!pre&&<span className="inline-flex items-center gap-1"><Calendar size={13}/><b className="text-slate-800 font-semibold">{m.total}</b> games</span>}
                      {m.pools>0&&<span className="inline-flex items-center gap-1"><LayoutGrid size={13}/><b className="text-slate-800 font-semibold">{m.pools}</b> pool{m.pools!==1?'s':''}</span>}
                    </div>
                    {!pre&&<>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                      <span><b className="text-slate-800">{m.completed}</b> of {m.total} complete</span>
                      {m.completed>=m.total&&m.total>0?<span className="text-teal-600 font-semibold">Done</span>:<span><b className="text-slate-800">{m.total-m.completed}</b> left</span>}
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mb-3"><div className="h-full bg-teal-600 rounded-full" style={{width:`${pctDone}%`}}/></div>
                    <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-xs text-slate-600 min-w-0">
                      {m.champion
                        ? <><Trophy size={13} className="text-amber-500 flex-shrink-0"/><span className="truncate">Champion: <b className="text-amber-700">{m.champion}</b></span></>
                        : m.leader
                          ? <>{logos[m.leader]
                              ? <img src={logos[m.leader]} alt="" className="w-5 h-5 rounded-full object-contain bg-white border border-slate-200 flex-shrink-0"/>
                              : <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-[9px] font-semibold flex items-center justify-center flex-shrink-0">{m.leader.charAt(0).toUpperCase()}</span>}
                            <span className="truncate">Leader: <b className="text-slate-900">{m.leader}</b></span></>
                          : <span className="text-slate-400 italic">No scores yet</span>}
                    </div>
                    {m.lastUpdated&&<p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1"><Clock size={10}/>Updated {m.lastUpdated}</p>}
                    </>}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Per-division view with tabs */}
        {selectedDiv && (
          <div>
            <DivisionView
              division={selectedDiv}
              games={games}
              isFollowed={isFollowed}
              anyFollowed={followed.length>0}
              toggleFollow={toggleFollow}
              tournamentId={id as string}
              tiebreakers={tiebreakers}
              divTiebreakers={divTiebreakers}
              advanceBy={advanceBy}
              scheduleLive={pubVis.schedule==='live'}
              rosters={liveRosters.filter(r=>r.division===selectedDiv)}
              notes={{division:noteFor(selectedDiv),all:divNotes.all}}
              poolOnly={poolOnlyDivs.some(n=>nameKey(n)===nameKey(selectedDiv))}
            />
          </div>
        )}
      </div>
      <footer className="border-t border-slate-200 mt-6 py-6 text-center">
        <p className="text-xs text-slate-400">{tournament?.name ? `${tournament.name} · ` : ''}Sunshine Events Group</p>
        <p className="text-xs text-slate-400 mt-1">Powered by <span className="font-semibold text-slate-500">Whistle Ready</span></p>
      </footer>
      <PublicChirp tournamentId={id as string} tournamentName={tournament?.name} />
    </div>
    </FollowCountsContext.Provider>
    </LogosContext.Provider>
  )
}
