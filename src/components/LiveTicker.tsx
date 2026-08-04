'use client'
// Live-score ticker (Regystra-inspired): a horizontal strip of score cards at
// the top of the public page — live games first (pulsing LIVE badge), then the
// most recent finals. Each card links to that game's public page. Hidden
// entirely when there's nothing to show, so it costs nothing off-season.
// Polls the live-scores endpoint (~30s) — same store the scorekeeper writes.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Game { id:string; gameNumber:string; date:string; startTime:string; division:string; pool:string|null; location:string; team1:string; team2:string; score1:number|null; score2:number|null; isCanceled:boolean; isChampionship:boolean }
interface LiveScore { score1:number; score2:number; period:number; periodLabel:string; live:boolean; updatedAt:string }

export default function LiveTicker({ tournamentId, games, logos }:{ tournamentId:string; games:Game[]; logos:Record<string,string> }){
  const [liveScores,setLiveScores]=useState<Record<string,LiveScore>>({})

  useEffect(()=>{ if(!tournamentId) return
    const pull=()=>fetch(`/api/tournaments/${tournamentId}/live-scores`).then(r=>r.json()).then(d=>setLiveScores(d?.scores||{})).catch(()=>{})
    pull()
    const t=setInterval(pull,30000)
    return ()=>clearInterval(t)
  },[tournamentId])

  const items=useMemo(()=>{
    const live=games.filter(g=>!g.isCanceled&&g.score1==null&&liveScores[g.id]?.live)
      .sort((a,b)=>`${a.date}${a.startTime}`<`${b.date}${b.startTime}`?-1:1)
    const finals=games.filter(g=>!g.isCanceled&&g.score1!=null&&g.score2!=null)
      .sort((a,b)=>`${a.date}${a.startTime}`>`${b.date}${b.startTime}`?-1:1)
      .slice(0,Math.max(0,12-live.length))
    return [...live.map(g=>({g,ls:liveScores[g.id],live:true})),...finals.map(g=>({g,ls:undefined as LiveScore|undefined,live:false}))]
  },[games,liveScores])

  if(items.length===0) return null

  const crest=(team:string)=>{
    const url=logos[team]
    return url
      ? <img src={url} alt="" className="w-5 h-5 rounded object-contain bg-white flex-shrink-0"/>
      : <span className="w-5 h-5 rounded bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{(team||'?').charAt(0).toUpperCase()}</span>
  }

  return (
    <div className="bg-white border-b border-slate-200 overflow-x-auto">
      <div className="flex gap-2 px-3 py-2 min-w-max">
        {items.map(({g,ls,live})=>{
          const s1=live?ls!.score1:g.score1, s2=live?ls!.score2:g.score2
          const t1w=!live&&g.score1!=null&&g.score1>(g.score2??0), t2w=!live&&g.score2!=null&&g.score2>(g.score1??0)
          const field=(g.location||'').split(' - ').pop()||''
          return (
            <Link key={g.id} href={`/tournaments/${tournamentId}/public/games/${g.id}`}
              className={`w-[190px] flex-shrink-0 border rounded-lg px-2.5 py-1.5 hover:shadow-sm transition-shadow bg-white ${live?'border-red-200':'border-slate-200'}`}>
              <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide mb-1">
                {live
                  ? <span className="text-red-600 animate-pulse">● Live{ls!.periodLabel?` · ${ls!.periodLabel}`:''}</span>
                  : <span className="text-emerald-600">Final</span>}
                {g.gameNumber&&<span className="text-slate-300">#{g.gameNumber}</span>}
              </div>
              {[{t:g.team1,s:s1,w:t1w},{t:g.team2,s:s2,w:t2w}].map((r,i)=>(
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  {crest(r.t)}
                  <span className={`text-[11px] truncate flex-1 ${r.w?'font-bold text-slate-900':'text-slate-600'}`}>{r.t||'TBD'}</span>
                  <span className={`text-[12px] tabular-nums ${r.w?'font-bold text-slate-900':'font-semibold text-slate-500'}`}>{r.s??''}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5">
                <span className="truncate">{g.division}</span>
                <span className="truncate ml-2">{field}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
