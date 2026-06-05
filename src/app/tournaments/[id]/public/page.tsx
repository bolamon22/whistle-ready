'use client'
import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Tournament { id:string; name:string; startDate:string; endDate:string; location:string; logoUrl:string; sport:string }
interface Game { id:string; gameNumber:string; date:string; startTime:string; division:string; pool:string|null; location:string; team1:string; team2:string; score1:number|null; score2:number|null; isCanceled:boolean; isChampionship:boolean }
interface Standing { team:string; w:number; l:number; t:number; gf:number; ga:number; pts:number }

const fmtDate = (d:string) => { if(!d) return ''; const[y,m,day]=d.split('-'); return `${parseInt(m)}/${parseInt(day)}/${y}` }
const fmtDateTime = (d:string) => { if(!d) return ''; const dt=new Date(d); return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) }

function TeamAvatar({name,size='md'}:{name:string,size?:'sm'|'md'|'lg'}) {
  const initials = name.split(' ').filter(w=>w.length>2).slice(0,2).map(w=>w[0].toUpperCase()).join('')||name.substring(0,2).toUpperCase()
  const colors=['#1a3a5c','#8b1a1a','#1a5c3a','#5c3a1a','#3a1a5c','#1a5c5c','#5c1a4a','#2a4a1a']
  const idx=name.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%colors.length
  const sz=size==='lg'?'w-16 h-16 text-lg':size==='sm'?'w-8 h-8 text-xs':'w-11 h-11 text-sm'
  return <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`} style={{backgroundColor:colors[idx]}}>{initials}</div>
}

function calcStandings(games:Game[],division:string,pool?:string):Standing[] {
  const map:Record<string,Standing>={}
  const ensure=(t:string)=>{if(!map[t])map[t]={team:t,w:0,l:0,t:0,gf:0,ga:0,pts:0}}
  const rel=games.filter(g=>g.division===division&&!g.isCanceled&&!g.isChampionship&&(pool!==undefined?g.pool===pool:true))
  rel.forEach(g=>{ensure(g.team1);ensure(g.team2)})
  rel.filter(g=>g.score1!==null&&g.score2!==null).forEach(g=>{
    const s1=g.score1!,s2=g.score2!
    map[g.team1].gf+=s1;map[g.team1].ga+=s2;map[g.team2].gf+=s2;map[g.team2].ga+=s1
    if(s1>s2){map[g.team1].w++;map[g.team1].pts+=3;map[g.team2].l++}
    else if(s2>s1){map[g.team2].w++;map[g.team2].pts+=3;map[g.team1].l++}
    else{map[g.team1].t++;map[g.team1].pts++;map[g.team2].t++;map[g.team2].pts++}
  })
  return Object.values(map).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga))
}

function PoolCard({division,pool,standings,followedTeams,onScheduleClick}:{division:string;pool:string;standings:Standing[];followedTeams:string[];onScheduleClick:()=>void}) {
  const [pview,setPview]=useState<'grid'|'list'>('list')
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <span className="text-white font-bold text-sm uppercase tracking-wide">{division}{pool ? ` — Group ${pool}` : ''}</span>
        <div className="flex gap-1">
          {(['grid','list'] as const).map(v=>(
            <button key={v} onClick={()=>setPview(v)} className={`p-1.5 rounded ${pview===v?'bg-white/20 text-white':'text-gray-400 hover:text-white'}`}>
              {v==='grid'
                ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>}
            </button>
          ))}
        </div>
      </div>
      {pview==='grid' && (
        <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 bg-white">
          {standings.map((s,i)=>(
            <div key={s.team} className="flex flex-col items-center py-5 px-3 gap-2">
              <TeamAvatar name={s.team}/>
              <div className="text-center"><div className="text-xs text-gray-400 mb-0.5">{i+1}</div><div className="text-xs font-bold text-gray-800 uppercase leading-tight">{s.team}</div></div>
            </div>
          ))}
        </div>
      )}
      {pview==='list' && (
        <div className="bg-white overflow-x-auto">
          <table className="w-full text-xs min-w-[280px]">
            <thead><tr className="border-b border-gray-100">
              <th className="px-3 py-2.5 w-6 text-gray-400 font-semibold"></th>
              <th className="text-left px-2 py-2.5 text-gray-500 font-semibold">Team</th>
              <th className="text-center px-2 py-2.5 text-gray-500 font-semibold w-8">MP</th>
              <th className="text-center px-2 py-2.5 text-gray-500 font-semibold w-10">W-L</th>
              <th className="text-center px-2 py-2.5 text-gray-500 font-semibold w-8">GF</th>
              <th className="text-center px-2 py-2.5 text-gray-500 font-semibold w-8">GA</th>
              <th className="text-center px-2 py-2.5 text-gray-500 font-semibold w-10">GD</th>
            </tr></thead>
            <tbody>
              {standings.map((s,i)=>{
                const mp=s.w+s.l+s.t,gd=s.gf-s.ga
                return (
                  <tr key={s.team} className={`border-t border-gray-50 ${i===0&&mp>0?'bg-gray-50':''}`}>
                    <td className="px-3 py-2.5 text-gray-400 font-medium">{i+1}</td>
                    <td className="px-2 py-2.5"><div className="flex items-center gap-2"><TeamAvatar name={s.team} size="sm"/><span className={`font-semibold uppercase text-xs leading-tight ${followedTeams.includes(s.team)?'text-blue-600':'text-gray-800'}`}>{s.team}</span></div></td>
                    <td className="px-2 py-2.5 text-center text-gray-600">{mp}</td>
                    <td className="px-2 py-2.5 text-center font-semibold text-gray-700">{s.w}-{s.l}</td>
                    <td className="px-2 py-2.5 text-center text-gray-600">{s.gf}</td>
                    <td className="px-2 py-2.5 text-center text-gray-600">{s.ga}</td>
                    <td className={`px-2 py-2.5 text-center font-bold ${gd>0?'text-green-600':gd<0?'text-red-500':'text-gray-400'}`}>{gd>0?'+':''}{gd}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <button onClick={onScheduleClick} className="w-full bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors">Schedule</button>
    </div>
  )
}

type DivTab = 'division'|'standings'|'schedule'|'bracket'

function DivisionView({division,games,followedTeams,toggleFollow}:{division:string;games:Game[];followedTeams:string[];toggleFollow:(t:string)=>void}) {
  const [divTab,setDivTab]=useState<DivTab>('division')
  const divGames=games.filter(g=>g.division===division&&!g.isCanceled)
  const pools=Array.from(new Set(divGames.map(g=>g.pool).filter(Boolean))).sort() as string[]
  const scheduleGames=divGames.filter(g=>!g.isChampionship).sort((a,b)=>a.date!==b.date?(a.date<b.date?-1:1):a.startTime<b.startTime?-1:1)
  const bracketGames=divGames.filter(g=>g.isChampionship).sort((a,b)=>a.startTime<b.startTime?-1:1)

  const tabs:DivTab[]=['division','standings','schedule','bracket']
  const tabLabels:{[k in DivTab]:string}={division:'Division',standings:'Standings',schedule:'Schedule',bracket:'Bracket'}

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-4 bg-white rounded-t-xl overflow-hidden shadow-sm">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setDivTab(t)}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${divTab===t?'bg-gray-900 text-white':'text-gray-500 hover:bg-gray-50'}`}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {divTab==='division' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pools.length>0 ? pools.map(pool=>(
            <PoolCard key={pool} division={division} pool={pool} standings={calcStandings(games,division,pool)} followedTeams={followedTeams} onScheduleClick={()=>setDivTab('schedule')}/>
          )) : (
            <PoolCard division={division} pool="" standings={calcStandings(games,division)} followedTeams={followedTeams} onScheduleClick={()=>setDivTab('schedule')}/>
          )}
        </div>
      )}

      {divTab==='standings' && (
        <div className="space-y-4">
          {pools.length>0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pools.map(pool=>(
                <PoolCard key={pool} division={division} pool={pool} standings={calcStandings(games,division,pool)} followedTeams={followedTeams} onScheduleClick={()=>setDivTab('schedule')}/>
              ))}
            </div>
          ) : <PoolCard division={division} pool="" standings={calcStandings(games,division)} followedTeams={followedTeams} onScheduleClick={()=>setDivTab('schedule')}/>}
        </div>
      )}

      {divTab==='schedule' && (
        <div className="space-y-2">
          {scheduleGames.length===0 && <div className="text-center py-12 text-gray-400">No games scheduled yet.</div>}
          {scheduleGames.map(g=>{
            const hasScore=g.score1!==null&&g.score2!==null
            const isHL=followedTeams.includes(g.team1)||followedTeams.includes(g.team2)
            return (
              <div key={g.id} className={`bg-white border rounded-xl overflow-hidden ${isHL?'border-blue-300 shadow-sm':'border-gray-200'}`}>
                <div className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400 mb-2">
                    <span className="font-medium text-gray-600">{fmtDate(g.date)}</span>
                    <span>·</span><span className="font-semibold text-gray-700">{g.startTime}</span>
                    <span>·</span><span>{g.location}</span>
                    {g.pool&&<span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">Pool {g.pool}</span>}
                    <span className="ml-auto text-gray-300">#{g.gameNumber}</span>
                  </div>
                  <div className="space-y-1.5">
                    {[{team:g.team1,score:g.score1,opp:g.score2},{team:g.team2,score:g.score2,opp:g.score1}].map(({team,score,opp})=>(
                      <div key={team} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${hasScore&&score!>opp!?'bg-green-50':hasScore&&score!<opp!?'bg-red-50/40':'bg-gray-50'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <button onClick={()=>toggleFollow(team)} className="text-base hover:scale-110 transition-transform flex-shrink-0 touch-manipulation">{followedTeams.includes(team)?'⭐':'☆'}</button>
                          <span className={`font-semibold text-sm truncate ${hasScore&&score!>opp!?'text-green-700':'text-gray-800'}`}>{team}</span>
                        </div>
                        {hasScore&&<span className={`text-xl font-bold ml-2 flex-shrink-0 ${score!>opp!?'text-green-700':'text-gray-500'}`}>{score}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {divTab==='bracket' && (
        <div>
          {bracketGames.length===0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
              <div className="text-3xl mb-2">🏆</div>
              <p className="font-medium">Bracket games will appear here once pool play concludes.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bracketGames.map(g=>{
                const hasScore=g.score1!==null&&g.score2!==null
                return (
                  <div key={g.id} className="bg-white border border-yellow-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-yellow-50 px-4 py-2 border-b border-yellow-100 flex items-center gap-2">
                      <span className="text-yellow-600">🏆</span>
                      <span className="text-xs font-bold text-yellow-700 uppercase tracking-wide">Championship · {fmtDate(g.date)} {g.startTime} · {g.location}</span>
                    </div>
                    <div className="px-4 py-3 space-y-1.5">
                      {[{team:g.team1,score:g.score1,opp:g.score2},{team:g.team2,score:g.score2,opp:g.score1}].map(({team,score,opp})=>(
                        <div key={team} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${hasScore&&score!>opp!?'bg-yellow-50':hasScore&&score!<opp!?'bg-gray-50':'bg-gray-50'}`}>
                          <div className="flex items-center gap-2"><TeamAvatar name={team} size="sm"/><span className="font-bold text-sm text-gray-800">{team}</span>{hasScore&&score!>opp!&&<span className="text-yellow-500">🏆</span>}</div>
                          {hasScore&&<span className={`text-2xl font-black ml-2 ${score!>opp!?'text-yellow-600':'text-gray-400'}`}>{score}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PublicTournamentPage() {
  const {id}=useParams()
  const [tournament,setTournament]=useState<Tournament|null>(null)
  const [games,setGames]=useState<Game[]>([])
  const [loading,setLoading]=useState(true)
  const [selectedDiv,setSelectedDiv]=useState<string|null>(null)
  const [followedTeams,setFollowedTeams]=useState<string[]>([])

  useEffect(()=>{
    Promise.all([
      fetch(`/api/tournaments/${id}`).then(r=>r.json()),
      fetch(`/api/tournaments/${id}/games`).then(r=>r.json()),
    ]).then(([t,g])=>{setTournament(t);setGames(Array.isArray(g)?g:[]);setLoading(false)})
    try{const saved=JSON.parse(localStorage.getItem(`follows-${id}`)||'[]');setFollowedTeams(saved)}catch{}
  },[id])

  const toggleFollow=(team:string)=>{
    setFollowedTeams(prev=>{
      const next=prev.includes(team)?prev.filter(t=>t!==team):[...prev,team]
      localStorage.setItem(`follows-${id}`,JSON.stringify(next))
      return next
    })
  }

  const divisions=useMemo(()=>Array.from(new Set(games.filter(g=>!g.isCanceled).map(g=>g.division))).sort(),[games])

  // Per-division: last updated time and champion
  const divMeta=useMemo(()=>{
    const meta:Record<string,{lastUpdated:string;champion:string|null}>={}
    divisions.forEach(div=>{
      const divGames=games.filter(g=>g.division===div&&!g.isCanceled)
      const champ=divGames.find(g=>g.isChampionship&&g.score1!==null&&g.score2!==null)
      const champion=champ?(champ.score1!>champ.score2!?champ.team1:champ.team2):null
      const scored=divGames.filter(g=>g.score1!==null)
      const lastUpdated=scored.length>0?fmtDateTime(scored[scored.length-1].date+' '+scored[scored.length-1].startTime):''
      meta[div]={lastUpdated,champion}
    })
    return meta
  },[games,divisions])

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sport header bar */}
      <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center gap-2">
        <span className="text-sm">🏈</span>
        <span className="text-xs font-bold uppercase tracking-widest text-gray-300">{tournament?.sport||'Flag Football'}</span>
      </div>

      {/* Tournament card */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-5 flex gap-4 items-start">
          {tournament?.logoUrl ? (
            <img src={tournament.logoUrl} alt="logo" className="w-20 h-20 object-contain rounded-xl border border-gray-100 flex-shrink-0"/>
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-3xl flex-shrink-0">🏈</div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">{tournament?.name}</h1>
            <p className="text-sm font-semibold text-rose-600 mt-0.5">
              {tournament?.startDate&&fmtDate(tournament.startDate)}{tournament?.endDate&&tournament.endDate!==tournament.startDate&&` - ${fmtDate(tournament.endDate)}`}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{tournament?.location}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link href={`/tournaments/${id}/player-register`} target="_blank"
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded transition-colors">
                📋 Register
              </Link>
              <button className="flex items-center gap-1.5 bg-green-100 text-green-800 text-xs font-bold px-3 py-2 rounded hover:bg-green-200 transition-colors">
                🔔 Get Notified
              </button>
              <button className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-bold px-3 py-2 rounded hover:bg-gray-200 transition-colors">
                📤 Share
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-5">
        {/* Back button when viewing a division */}
        {selectedDiv && (
          <button onClick={()=>setSelectedDiv(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 font-medium transition-colors">
            ← Back to Divisions
          </button>
        )}

        {/* Division grid overview */}
        {!selectedDiv && (
          <>
            {divisions.length===0 && <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-3">📅</div><p>No games scheduled yet.</p></div>}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {divisions.map(div=>{
                const meta=divMeta[div]||{}
                return (
                  <button key={div} onClick={()=>setSelectedDiv(div)}
                    className="text-left bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group">
                    <h3 className="font-bold text-gray-800 text-sm mb-1 group-hover:text-blue-600 transition-colors">{div}</h3>
                    {meta.champion && (
                      <p className="text-xs mb-2"><span className="font-semibold text-gray-500">Champion: </span><span className="font-bold text-rose-600">{meta.champion}</span></p>
                    )}
                    {meta.lastUpdated && (
                      <p className="text-xs text-gray-400"><span className="font-medium">Last Updated</span><br/>{meta.lastUpdated}</p>
                    )}
                    {!meta.lastUpdated && <p className="text-xs text-gray-300 italic">No scores yet</p>}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Per-division view with tabs */}
        {selectedDiv && (
          <div>
            <h2 className="text-xl font-black text-gray-900 mb-4 uppercase">{selectedDiv}</h2>
            <DivisionView
              division={selectedDiv}
              games={games}
              followedTeams={followedTeams}
              toggleFollow={toggleFollow}
            />
          </div>
        )}
      </div>
    </div>
  )
}
