'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Game {
  id:string; gameNumber:string; date:string; startTime:string
  division:string; pool:string|null; location:string
  team1:string; team2:string; score1:number|null; score2:number|null
  isChampionship:boolean; isCanceled:boolean
}
interface Tournament {
  id:string; name:string; sport:string; startDate:string; endDate:string
  location:string; dates:string; logoUrl:string
}
interface TeamRecord { W:number; L:number; T:number; GF:number; GA:number }
type DivStandings = Record<string, TeamRecord>
type AllStandings = Record<string, DivStandings>

function fTime(t:string){if(!t)return'';const[h,m]=t.split(':');const hr=parseInt(h);return`${hr%12||12}:${m} ${hr>=12?'PM':'AM'}`}
function fDate(d:string){return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
function fDateShort(d:string){return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
function fField(f:string){return f.includes(' - ')?f.split(' - ').slice(1).join(' - ').trim():f}
function pts(r:TeamRecord){return r.W*2+r.T}

function buildStandings(games:Game[]):AllStandings {
  const out:AllStandings={}
  for(const g of games){
    if(g.isCanceled||g.score1===null||g.score2===null)continue
    const key=`${g.division}|||${g.pool??''}`
    if(!out[key])out[key]={}
    const add=(team:string,gf:number,ga:number)=>{
      if(!out[key][team])out[key][team]={W:0,L:0,T:0,GF:0,GA:0}
      out[key][team].GF+=gf;out[key][team].GA+=ga
      if(gf>ga)out[key][team].W++
      else if(gf<ga)out[key][team].L++
      else out[key][team].T++
    }
    add(g.team1,g.score1,g.score2);add(g.team2,g.score2,g.score1)
  }
  return out
}

function gameResult(g:Game,team:string):'W'|'L'|'T'|null{
  if(g.score1===null||g.score2===null)return null
  const my=g.team1===team?g.score1:g.score2, opp=g.team1===team?g.score2:g.score1
  return my>opp?'W':my<opp?'L':'T'
}

function sortStandings(entries:[string,TeamRecord][]){
  return [...entries].sort((a,b)=>{
    const pd=pts(b[1])-pts(a[1]);if(pd!==0)return pd
    const wd=b[1].W-a[1].W;if(wd!==0)return wd
    return(b[1].GF-b[1].GA)-(a[1].GF-a[1].GA)
  })
}

// ── Standings table ──────────────────────────────────────────
function StandingsTable({entries,onTeamClick,poolLabel}:{entries:[string,TeamRecord][];onTeamClick:(t:string)=>void;poolLabel?:string}){
  return(
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {poolLabel&&(
        <div className="text-center py-2.5 font-semibold text-sky-700 text-sm border-b border-slate-200 bg-white">{poolLabel}</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-white">
            <th className="text-left px-4 py-2.5 font-bold text-sky-700 text-sm">Team</th>
            <th className="text-center px-4 py-2.5 font-bold text-sky-700 text-sm w-14">W</th>
            <th className="text-center px-4 py-2.5 font-bold text-sky-700 text-sm w-14">L</th>
            <th className="text-center px-4 py-2.5 font-bold text-sky-700 text-sm w-14">T</th>
            <th className="text-center px-4 py-2.5 font-bold text-sky-700 text-sm w-14">GS</th>
            <th className="text-center px-4 py-2.5 font-bold text-sky-700 text-sm w-14">GA</th>
            <th className="text-center px-4 py-2.5 font-bold text-sky-700 text-sm w-14">Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name,r],i)=>(
            <tr key={name} className={`border-t border-slate-100 ${i%2===0?'bg-white':'bg-slate-50/50'} hover:bg-sky-50/40 transition-colors`}>
              <td className="px-4 py-3">
                <button onClick={()=>onTeamClick(name)} className="font-medium text-slate-800 hover:text-sky-600 transition-colors text-left">{name}</button>
              </td>
              <td className="px-4 py-3 text-center text-slate-700">{r.W}</td>
              <td className="px-4 py-3 text-center text-slate-700">{r.L}</td>
              <td className="px-4 py-3 text-center text-slate-700">{r.T}</td>
              <td className="px-4 py-3 text-center text-slate-700">{r.GF}</td>
              <td className="px-4 py-3 text-center text-slate-700">{r.GA}</td>
              <td className="px-4 py-3 text-center font-bold text-slate-800">{pts(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Schedule table ───────────────────────────────────────────
function ScheduleTable({games,activeTeam,onTeamClick}:{games:Game[];activeTeam?:string;onTeamClick:(t:string)=>void}){
  const byDate=games.reduce<Record<string,Game[]>>((acc,g)=>{
    if(!acc[g.date])acc[g.date]=[];acc[g.date].push(g);return acc
  },{})
  const dates=Object.keys(byDate).sort()
  if(games.length===0)return<div className="p-8 text-center text-slate-400 text-sm">No games found</div>
  return(
    <div className="space-y-4">
      {dates.map(date=>(
        <div key={date}>
          <div className="bg-slate-700 text-white text-center text-sm font-semibold py-2 rounded-t-xl">{fDate(date)}</div>
          <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl overflow-hidden">
            <div className="grid grid-cols-[52px_80px_1fr_1fr_72px_1fr] gap-x-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div>Game</div><div>Time</div><div>Location</div><div>Team</div><div className="text-center">Score</div><div>Team</div>
            </div>
            {byDate[date].map((g,i)=>{
              const hs=g.score1!==null&&g.score2!==null
              const t1w=hs&&g.score1!>g.score2!, t2w=hs&&g.score2!>g.score1!
              return(
                <div key={g.id} className={`grid grid-cols-[52px_80px_1fr_1fr_72px_1fr] gap-x-2 px-4 py-3 items-center text-sm ${i>0?'border-t border-slate-100':''} hover:bg-slate-50 ${g.isChampionship?'bg-amber-50/20':''}`}>
                  <div className="text-slate-400 font-mono text-xs">{g.isChampionship?'★ ':''}{g.gameNumber}</div>
                  <div className="font-semibold text-slate-700 text-xs">{fTime(g.startTime)}<div className="text-slate-400 font-normal">{fField(g.location)}</div></div>
                  <div className="text-slate-400 text-xs leading-tight hidden sm:block">{g.location}</div>
                  <button onClick={()=>onTeamClick(g.team1)} className={`font-semibold text-left truncate transition-colors hover:text-sky-600 ${activeTeam===g.team1?'text-sky-700':t1w?'text-emerald-700':t2w?'text-slate-400':'text-slate-800'}`}>{g.team1}</button>
                  <div className="text-center">
                    {hs
                      ?<span className="font-bold tabular-nums text-xs"><span className={t1w?'text-emerald-600':t2w?'text-slate-400':'text-slate-600'}>{g.score1}</span><span className="text-slate-300 mx-0.5">–</span><span className={t2w?'text-emerald-600':t1w?'text-slate-400':'text-slate-600'}>{g.score2}</span></span>
                      :<span className="text-slate-300 text-xs">–</span>
                    }
                  </div>
                  <button onClick={()=>onTeamClick(g.team2)} className={`font-semibold text-left truncate transition-colors hover:text-sky-600 ${activeTeam===g.team2?'text-sky-700':t2w?'text-emerald-700':t1w?'text-slate-400':'text-slate-800'}`}>{g.team2}</button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function PublicPage({params}:{params:{id:string}}){
  const [tournament,setTournament]=useState<Tournament|null>(null)
  const [games,setGames]=useState<Game[]>([])
  const [loading,setLoading]=useState(true)
  const [activeDivision,setActiveDivision]=useState<string|null>(null)
  const [activePool,setActivePool]=useState<string|null>(null)   // null=not chosen yet, ''=no-pool games
  const [activeTeam,setActiveTeam]=useState<string|null>(null)
  const [view,setView]=useState<'standings'|'schedule'|'bracket'>('standings')
  const [teamDateFilter,setTeamDateFilter]=useState('all')

  useEffect(()=>{
    Promise.all([
      fetch(`/api/tournaments/${params.id}`).then(r=>r.json()),
      fetch(`/api/tournaments/${params.id}/games`).then(r=>r.json()),
    ]).then(([t,g])=>{
      setTournament(t)
      setGames((g as Game[]).filter((x:Game)=>!x.isCanceled&&x.startTime&&x.location))
      setLoading(false)
    })
  },[params.id])

  if(loading)return(
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin"/>
      <p className="text-slate-400 text-sm">Loading…</p>
    </div>
  )
  if(!tournament)return<div className="p-8 text-red-500">Not found</div>

  const dates:string[]=JSON.parse(tournament.dates||'[]')
  const allDivisions=[...new Set(games.map(g=>g.division))].sort()
  const standings=buildStandings(games)

  // Navigation helpers
  function goDivision(div:string){
    setActiveDivision(div);setActivePool(null);setActiveTeam(null);setView('standings')
  }
  function goPool(pool:string|null){
    setActivePool(pool??'');setActiveTeam(null);setView('standings')
  }
  function goTeam(team:string){setActiveTeam(team);setTeamDateFilter('all')}
  function goBack(){
    if(activeTeam){setActiveTeam(null);return}
    if(activePool!==null){setActivePool(null);return}
    setActiveDivision(null)
  }

  // Derived data for current division
  const divGames=activeDivision?games.filter(g=>g.division===activeDivision):[]
  const divPools=[...new Set(divGames.map(g=>g.pool))].sort() // includes null
  const hasMultiplePools=divPools.filter(p=>p!==null).length>1

  // Pool-scoped games
  const poolGames=activeDivision&&activePool!==null
    ? divGames.filter(g=>(g.pool??'')===(activePool??''))
    : []

  const poolKey=`${activeDivision}|||${activePool??''}`
  const poolStandingEntries=standings[poolKey]?sortStandings(Object.entries(standings[poolKey])):[]
  const poolTeams=[...new Set(poolGames.flatMap(g=>[g.team1,g.team2]))].sort()
  const completed=poolGames.filter(g=>g.score1!==null&&g.score2!==null).length

  // Team games (across the whole division, not just one pool)
  const teamGames=activeTeam
    ? divGames.filter(g=>g.team1===activeTeam||g.team2===activeTeam)
        .filter(g=>teamDateFilter==='all'||g.date===teamDateFilter)
        .sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime))
    : []
  const teamDates=[...new Set((activeTeam?divGames.filter(g=>g.team1===activeTeam||g.team2===activeTeam):[] ).map(g=>g.date))].sort()

  // Find team record across all pools in this division
  const teamRecord=activeTeam&&activeDivision
    ? Object.entries(standings)
        .filter(([k])=>k.startsWith(`${activeDivision}|||`))
        .flatMap(([,d])=>Object.entries(d))
        .filter(([n])=>n===activeTeam)
        .reduce<TeamRecord|null>((acc,[,r])=>acc?{W:acc.W+r.W,L:acc.L+r.L,T:acc.T+r.T,GF:acc.GF+r.GF,GA:acc.GA+r.GA}:r, null)
    : null

  // ── Shared sticky header ──
  const Breadcrumb=()=>(
    <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm flex-wrap min-w-0">
            {tournament.logoUrl && <img src={tournament.logoUrl} alt="logo" className="h-7 w-7 object-contain rounded shrink-0" />}
            {tournament.sport&&<span className="text-xs font-bold text-sky-600 uppercase tracking-wider shrink-0">{tournament.sport}</span>}
            <span className="text-sky-400 shrink-0">·</span>
            <span className="font-bold text-slate-900 truncate">{tournament.name}</span>
            {activeDivision&&<><span className="text-slate-300 shrink-0">›</span><button onClick={()=>{setActiveDivision(null);setActivePool(null);setActiveTeam(null)}} className="text-slate-500 hover:text-sky-600 transition-colors shrink-0">{activeDivision}</button></>}
            {activePool!==null&&!activeTeam&&<><span className="text-slate-300 shrink-0">›</span><span className="text-slate-700 font-medium shrink-0">{activePool?`Pool ${activePool}`:'Schedule'}</span></>}
            {activeTeam&&<><span className="text-slate-300 shrink-0">›</span><button onClick={()=>setActiveTeam(null)} className="text-slate-500 hover:text-sky-600 transition-colors truncate">{activePool?`Pool ${activePool}`:'Schedule'}</button><span className="text-slate-300 shrink-0">›</span><span className="text-slate-700 font-medium truncate">{activeTeam}</span></>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(activeDivision||activeTeam)&&<button onClick={goBack} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">← Back</button>}
            <Link href={`/tournaments/${params.id}`} className="text-xs text-slate-300 hover:text-slate-500 transition-colors">Admin ↗</Link>
          </div>
        </div>
        {/* Tournament meta (collapsed once drilling) */}
        {!activeDivision&&(
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {(tournament.startDate||dates.length>0)&&(
              <span className="text-xs text-slate-500">
                {tournament.startDate
                  ?(tournament.endDate&&tournament.endDate!==tournament.startDate?`${tournament.startDate} – ${tournament.endDate}`:tournament.startDate)
                  :dates.map(d=>fDateShort(d)).join(' & ')}
              </span>
            )}
            {tournament.location&&<span className="text-xs text-slate-500">· {tournament.location}</span>}
          </div>
        )}
      </div>
    </div>
  )

  // ── 1. DIVISION HOME ──────────────────────────────────────
  if(!activeDivision){
    const totalDone=games.filter(g=>g.score1!==null&&g.score2!==null).length
    return(
      <div className="min-h-screen bg-slate-50">
        <Breadcrumb/>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              {label:'Divisions',val:allDivisions.length,color:'text-slate-800'},
              {label:'Total Games',val:games.length,color:'text-slate-800'},
              {label:'Completed',val:totalDone,color:'text-emerald-600'},
              {label:'Remaining',val:games.length-totalDone,color:'text-sky-600'},
            ].map(s=>(
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 py-4 text-center shadow-sm">
                <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Select a Division</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {allDivisions.map(div=>{
              const dg=games.filter(g=>g.division===div)
              const dc=dg.filter(g=>g.score1!==null&&g.score2!==null).length
              const pools=[...new Set(dg.map(g=>g.pool))].filter(Boolean)
              const allDivStandingEntries=Object.entries(standings)
                .filter(([k])=>k.startsWith(`${div}|||`))
                .flatMap(([,d])=>Object.entries(d))
              const leader=allDivStandingEntries.length
                ? [...allDivStandingEntries].sort((a,b)=>pts(b[1])-pts(a[1]))[0]
                : null
              return(
                <button key={div} onClick={()=>goDivision(div)}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-left hover:border-sky-400 hover:shadow-md transition-all group">
                  <div className="font-bold text-slate-800 group-hover:text-sky-700 transition-colors leading-tight mb-1">{div}</div>
                  {pools.length>0&&<div className="text-xs text-slate-400 mb-1">{pools.length} pool{pools.length!==1?'s':''}</div>}
                  <div className="text-xs text-slate-400">{dg.length} games{dc>0?` · ${dc} done`:''}</div>
                  {leader&&dc>0&&<div className="text-xs text-slate-500 mt-2 font-medium truncate">🏅 {leader[0]}</div>}
                </button>
              )
            })}
          </div>
        </div>
        <div className="text-center py-6 text-xs text-slate-300">Powered by GameDay Staff</div>
      </div>
    )
  }

  // ── 2. POOL PICKER ────────────────────────────────────────
  if(activeDivision&&activePool===null){
    const pools=[...new Set(divGames.map(g=>g.pool))].sort()
    // If no pools at all, skip straight into the single "pool"
    if(pools.length===1&&pools[0]===null){goPool(null);return null}

    return(
      <div className="min-h-screen bg-slate-50">
        <Breadcrumb/>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Select a Pool</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {pools.filter(p=>p!==null).map(pool=>{
              const pg=divGames.filter(g=>g.pool===pool)
              const dc=pg.filter(g=>g.score1!==null&&g.score2!==null).length
              const key=`${activeDivision}|||${pool}`
              const se=standings[key]?sortStandings(Object.entries(standings[key])):[]
              return(
                <button key={pool} onClick={()=>goPool(pool)}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-left hover:border-sky-400 hover:shadow-md transition-all group">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Pool</div>
                  <div className="text-2xl font-bold text-slate-800 group-hover:text-sky-700 transition-colors mb-2">{pool}</div>
                  <div className="text-xs text-slate-400">{pg.length} games{dc>0?` · ${dc} done`:''}</div>
                  {se.length>0&&dc>0&&(
                    <div className="mt-3 space-y-0.5">
                      {se.slice(0,3).map(([name,r],i)=>(
                        <div key={name} className="flex items-center justify-between text-xs">
                          <span className={`truncate ${i===0?'font-bold text-slate-700':'text-slate-500'}`}>{i+1}. {name}</span>
                          <span className="text-sky-600 font-semibold ml-2">{pts(r)}pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
            {/* Also show no-pool games if any */}
            {divGames.some(g=>g.pool===null)&&(
              <button onClick={()=>goPool(null)}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-left hover:border-sky-400 hover:shadow-md transition-all group">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Games</div>
                <div className="text-2xl font-bold text-slate-800 group-hover:text-sky-700 transition-colors mb-2">All</div>
                <div className="text-xs text-slate-400">{divGames.filter(g=>g.pool===null).length} games</div>
              </button>
            )}
          </div>
        </div>
        <div className="text-center py-6 text-xs text-slate-300">Powered by GameDay Staff</div>
      </div>
    )
  }

  // ── 3. TEAM DETAIL ────────────────────────────────────────
  if(activeDivision&&activePool!==null&&activeTeam){
    return(
      <div className="min-h-screen bg-slate-50">
        <Breadcrumb/>
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Team header */}
          <div className="mb-5">
            <h2 className="text-2xl font-bold text-slate-900">{activeTeam}</h2>
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <span className="text-slate-500 text-sm">{activeDivision}{activePool?` · Pool ${activePool}`:''}</span>
              {teamRecord&&<span className="text-sm font-semibold text-slate-600">{teamRecord.W}–{teamRecord.L}{teamRecord.T>0?`–${teamRecord.T}`:''} · {pts(teamRecord)} pts</span>}
            </div>
          </div>
          {teamRecord&&(
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[{label:'Wins',val:teamRecord.W,color:'text-emerald-600'},{label:'Losses',val:teamRecord.L,color:'text-red-500'},{label:'Ties',val:teamRecord.T,color:'text-slate-500'},{label:'Points',val:pts(teamRecord),color:'text-sky-600'}].map(s=>(
                <div key={s.label} className="bg-white rounded-xl border border-slate-200 py-3 text-center shadow-sm">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          {/* Date filter */}
          {teamDates.length>1&&(
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={()=>setTeamDateFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${teamDateFilter==='all'?'bg-sky-600 text-white':'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>All Dates</button>
              {teamDates.map(d=><button key={d} onClick={()=>setTeamDateFilter(d)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${teamDateFilter===d?'bg-sky-600 text-white':'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>{fDateShort(d)}</button>)}
            </div>
          )}
          <ScheduleTable games={teamGames} activeTeam={activeTeam} onTeamClick={t=>{if(t!==activeTeam)goTeam(t)}}/>
        </div>
        <div className="text-center py-6 text-xs text-slate-300">Powered by GameDay Staff</div>
      </div>
    )
  }

  // ── 4. POOL DETAIL ────────────────────────────────────────
  return(
    <div className="min-h-screen bg-slate-50">
      <Breadcrumb/>
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* View tabs */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex gap-1 bg-slate-200 rounded-lg p-1">
            {(['standings','schedule','bracket'] as const).map(v=>(
              <button key={v} onClick={()=>setView(v)} className={`px-4 py-1.5 rounded-md text-sm font-semibold capitalize transition-colors ${view===v?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{v}</button>
            ))}
          </div>
          {poolGames.length>0&&(
            <div className="ml-auto text-xs text-slate-400">
              {completed}/{poolGames.length} games completed
              <span className="inline-block ml-2 w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden align-middle">
                <span className="block h-full bg-emerald-500 rounded-full" style={{width:`${Math.round(completed/poolGames.length*100)}%`}}/>
              </span>
            </div>
          )}
        </div>

        {/* Standings */}
        {view==='standings'&&(
          <div>
            {poolStandingEntries.length===0
              ?<div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">No completed games yet — standings will appear here once scores are posted</div>
              :<StandingsTable entries={poolStandingEntries} onTeamClick={goTeam} poolLabel={activePool?`Pool ${activePool}`:activeDivision??undefined}/>
            }
            <p className="text-xs text-slate-400 mt-2 text-center">W=Win(2pts) · T=Tie(1pt) · L=Loss · GS=Goals Scored · GA=Goals Against · Pts=Points</p>
          </div>
        )}

        {/* Schedule */}
        {view==='schedule'&&(
          <ScheduleTable games={poolGames.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.location.localeCompare(b.location))} onTeamClick={goTeam}/>
        )}

        {/* Bracket */}
        {view==='bracket'&&(
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">Bracket Coming Soon</h2>
            <p className="text-slate-400 text-sm max-w-xs mx-auto">Playoff bracket will be posted once pool play is complete.</p>
          </div>
        )}

      </div>
      <div className="text-center py-6 text-xs text-slate-300">Powered by GameDay Staff</div>
    </div>
  )
}
