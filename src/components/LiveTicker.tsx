'use client'
// Live-score ticker (Regystra-inspired): a horizontal strip of score cards at
// the top of the public page — live games first (pulsing LIVE badge), then the
// most recent finals. Each card links to that game's public page. Hidden
// entirely when there's nothing to show, so it costs nothing off-season.
// Polls the live-scores endpoint (~30s) — same store the scorekeeper writes.
//
// Public: a game shows LIVE only on its scheduled date (Bo, Oct 12 2026: a
// scorekeeper test on P1 twelve days before the event put "LIVE · HALF 1" on the
// public page). Staff (`staff`, the Post scores page) see every live entry, with
// the card opening the scorekeeper and a Stop live button, so a stray one can be
// found and switched off.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Game { id:string; gameNumber:string; date:string; startTime:string; division:string; pool:string|null; location:string; team1:string; team2:string; score1:number|null; score2:number|null; isCanceled:boolean; isChampionship:boolean }
export interface LivePenalty { team:1|2; num:string; secs:number; paused:boolean }
export interface LiveScore { score1:number; score2:number; period:number; periodLabel:string; live:boolean; updatedAt:string; clockMs?:number|null; clockRunning?:boolean; penalties?:LivePenalty[] }
const mss=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
// Players in the box now, with time left: penalty timers run only while the game
// clock runs (as on the scorekeeper), and never past the clock's own time left.
export function livePenalties(ls:LiveScore|undefined|null, now:number):(LivePenalty&{left:number;text:string})[]{
  if(!ls||!ls.live||!Array.isArray(ls.penalties)) return []
  const sent=Date.parse(ls.updatedAt||'')
  const ran=ls.clockRunning&&!isNaN(sent)?Math.floor(Math.min(Math.max(0,now-sent),ls.clockMs??Infinity)/1000):0
  return ls.penalties.map(p=>{const left=Math.max(0,p.secs-(p.paused?0:ran));return {...p,left,text:mss(left)}}).filter(p=>p.left>0).sort((a,b)=>a.left-b.left)
}

// The scorer's clock as a viewer should see it now: time left when it was sent,
// less the time since if it is running. '' when the scorer's phone sent no clock.
export function liveClockText(ls:LiveScore|undefined|null, now:number):string{
  if(!ls||ls.clockMs==null) return ''
  const sent=Date.parse(ls.updatedAt||'')
  const ms=ls.clockRunning&&!isNaN(sent)?Math.max(0,ls.clockMs-Math.max(0,now-sent)):ls.clockMs
  const s=Math.ceil(ms/1000)
  return mss(s)
}
// Re-render once a second while any clock is counting down.
export function useNowTicking(on:boolean){
  const [now,setNow]=useState(()=>Date.now())
  useEffect(()=>{ if(!on) return; const t=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(t) },[on])
  return now
}

export default function LiveTicker({ tournamentId, games, logos, staff=false, scores, onStop }:{ tournamentId:string; games:Game[]; logos:Record<string,string>; staff?:boolean; scores?:Record<string,LiveScore>; onStop?:(gameId:string)=>void }){
  const [polled,setLiveScores]=useState<Record<string,LiveScore>>({})
  const liveScores=scores??polled

  useEffect(()=>{ if(!tournamentId||scores) return
    const pull=()=>fetch(`/api/tournaments/${tournamentId}/live-scores`).then(r=>r.json()).then(d=>setLiveScores(d?.scores||{})).catch(()=>{})
    pull()
    const t=setInterval(pull,30000)
    return ()=>clearInterval(t)
  },[tournamentId,!!scores])

  const items=useMemo(()=>{
    const today=new Date().toLocaleDateString('en-CA')
    const live=games.filter(g=>!g.isCanceled&&g.score1==null&&liveScores[g.id]?.live&&(staff||g.date===today))
      .sort((a,b)=>`${a.date}${a.startTime}`<`${b.date}${b.startTime}`?-1:1)
    const finals=games.filter(g=>!g.isCanceled&&g.score1!=null&&g.score2!=null)
      .sort((a,b)=>`${a.date}${a.startTime}`>`${b.date}${b.startTime}`?-1:1)
      .slice(0,Math.max(0,12-live.length))
    return [...live.map(g=>({g,ls:liveScores[g.id],live:true})),...finals.map(g=>({g,ls:undefined as LiveScore|undefined,live:false}))]
  },[games,liveScores,staff])

  const now=useNowTicking(items.some(x=>x.live&&x.ls?.clockRunning))
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
            <div key={g.id} className={`w-[190px] flex-shrink-0 border rounded-lg hover:shadow-sm transition-shadow bg-white ${live?'border-red-200':'border-slate-200'}`}>
            <Link href={staff&&live?`/tournaments/${tournamentId}/games/${g.id}/scorekeeper`:`/tournaments/${tournamentId}/public/games/${g.id}`}
              title={staff&&live?'Open the scorekeeper for this game':undefined}
              className="block px-2.5 py-1.5">
              <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide mb-1">
                {live
                  ? <span className="text-red-600"><span className="animate-pulse">●</span> Live{ls!.periodLabel?` · ${ls!.periodLabel}`:''}{liveClockText(ls,now)?<> · <span className="tabular-nums">{liveClockText(ls,now)}</span>{ls!.clockRunning?'':' ⏸'}</>:''}</span>
                  : <span className="text-emerald-600">Final</span>}
                {g.gameNumber&&<span className="text-slate-300">#{g.gameNumber}</span>}
              </div>
              {[{t:g.team1,s:s1,w:t1w},{t:g.team2,s:s2,w:t2w}].map((r,i)=>{
                const pens=live?livePenalties(ls,now).filter(p=>p.team===i+1):[]
                return (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  {crest(r.t)}
                  <span className={`text-[11px] truncate flex-1 ${r.w?'font-bold text-slate-900':'text-slate-600'}`}>{r.t||'TBD'}</span>
                  {pens.length>0&&<span title={pens.map(p=>`${p.num?'#'+p.num+' ':''}${p.text}`).join(', ')} className="text-[9px] font-bold tabular-nums text-amber-800 bg-amber-100 rounded px-1 flex-shrink-0">{pens[0].num?`#${pens[0].num} `:''}{pens[0].text}{pens.length>1?` +${pens.length-1}`:''}</span>}
                  <span className={`text-[12px] tabular-nums ${r.w?'font-bold text-slate-900':'font-semibold text-slate-500'}`}>{r.s??''}</span>
                </div>)})}
              <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5">
                <span className="truncate">{g.division}</span>
                <span className="truncate ml-2">{field}</span>
              </div>
            </Link>
            {staff&&live&&onStop&&(
              <button type="button" onClick={()=>onStop(g.id)} className="w-full border-t border-red-100 text-[10px] font-bold uppercase tracking-wide text-red-700 hover:bg-red-50 py-1 rounded-b-lg">Stop live</button>
            )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
