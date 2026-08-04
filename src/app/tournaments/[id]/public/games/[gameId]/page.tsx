'use client'
// Public per-game page — a shareable URL for every game (Regystra-inspired).
// Matchup header with crests + big score, live/final/upcoming status, and
// game meta (date, time, field, division, pool/bracket). Lives under /public
// so the existing middleware public-route regex covers it with no changes.
// Live games poll the live-scores endpoint (same source as the scorekeeper).
import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Trophy, MapPin, Calendar, Clock, Share2, CalendarPlus } from 'lucide-react'

interface Game { id:string; gameNumber:string; date:string; startTime:string; division:string; pool:string|null; location:string; team1:string; team2:string; score1:number|null; score2:number|null; isCanceled:boolean; isChampionship:boolean }
interface LiveScore { score1:number; score2:number; period:number; periodLabel:string; live:boolean; updatedAt:string }

const fmtDate=(d:string)=>{ if(!d) return ''; const [y,m,day]=d.split('-'); const dt=new Date(+y,+m-1,+day); return isNaN(dt.getTime())?d:dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}) }
const parseStartMs=(date:string,time:string)=>{ if(!date||!time) return null; const m=time.match(/(\d+):(\d+)\s*(AM|PM)?/i); if(!m) return null; let h=+m[1]; const min=+m[2]; const ap=(m[3]||'').toUpperCase(); if(ap==='PM'&&h!==12)h+=12; if(ap==='AM'&&h===12)h=0; const [y,mo,d]=date.split('-').map(Number); const dt=new Date(y,mo-1,d,h,min); return isNaN(dt.getTime())?null:dt.getTime() }

function Crest({team,logos,size=72}:{team:string;logos:Record<string,string>;size?:number}){
  const url=logos[team]
  if(url) return <img src={url} alt="" style={{width:size,height:size}} className="rounded-2xl object-contain bg-white border border-slate-200 p-1"/>
  return <span style={{width:size,height:size,fontSize:size*0.4}} className="rounded-2xl bg-slate-100 border border-slate-200 text-slate-400 font-bold flex items-center justify-center">{(team||'?').charAt(0).toUpperCase()}</span>
}

export default function PublicGamePage(){
  const params=useParams()
  const id=String(params.id||''); const gameId=String(params.gameId||'')
  const [tournament,setTournament]=useState<any>(null)
  const [game,setGame]=useState<Game|null>(null)
  const [logos,setLogos]=useState<Record<string,string>>({})
  const [liveScore,setLiveScore]=useState<LiveScore|null>(null)
  const [loading,setLoading]=useState(true)
  const [copied,setCopied]=useState(false)

  useEffect(()=>{ if(!id||!gameId) return
    Promise.all([
      fetch(`/api/tournaments/${id}`).then(r=>r.json()).catch(()=>null),
      fetch(`/api/tournaments/${id}/games`).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/tournaments/${id}/team-logos`).then(r=>r.ok?r.json():{}).catch(()=>({})),
    ]).then(([t,gs,lg])=>{
      setTournament(t); setLogos(lg||{})
      setGame((Array.isArray(gs)?gs:[]).find((g:Game)=>g.id===gameId)||null)
      setLoading(false)
    })
  },[id,gameId])

  // Live score: fetch once, then poll while the game is live.
  useEffect(()=>{ if(!id||!gameId) return
    let timer:ReturnType<typeof setInterval>|null=null
    const pull=()=>fetch(`/api/tournaments/${id}/live-scores`).then(r=>r.json()).then(d=>{
      const ls=d?.scores?.[gameId]; setLiveScore(ls||null)
      if(ls?.live&&!timer){ timer=setInterval(pull,20000) }
      if(!ls?.live&&timer){ clearInterval(timer); timer=null }
    }).catch(()=>{})
    pull()
    return ()=>{ if(timer) clearInterval(timer) }
  },[id,gameId])

  const status=useMemo(()=>{
    if(!game) return null
    if(game.isCanceled) return {label:'Canceled',cls:'bg-slate-200 text-slate-500'}
    if(game.score1!=null&&game.score2!=null) return {label:'Final',cls:'bg-emerald-100 text-emerald-700'}
    if(liveScore?.live) return {label:`Live${liveScore.periodLabel?` · ${liveScore.periodLabel}`:''}`,cls:'bg-red-100 text-red-700 animate-pulse'}
    const st=parseStartMs(game.date,game.startTime)
    if(st!=null&&Date.now()>=st&&Date.now()<=st+90*60000) return {label:'In progress',cls:'bg-red-50 text-red-600'}
    return {label:'Upcoming',cls:'bg-slate-100 text-slate-500'}
  },[game,liveScore])

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>
  if(!game) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-center px-6">
      <div>
        <Trophy size={40} className="mx-auto text-slate-300"/>
        <h1 className="mt-3 text-xl font-bold text-slate-800">Game not found</h1>
        <Link href={`/tournaments/${id}/public`} className="text-teal-700 hover:underline text-sm mt-2 inline-block">Back to tournament</Link>
      </div>
    </div>
  )

  const hs=game.score1!=null&&game.score2!=null
  const s1=hs?game.score1:(liveScore?.live?liveScore.score1:null)
  const s2=hs?game.score2:(liveScore?.live?liveScore.score2:null)
  const t1w=hs&&game.score1!>game.score2!, t2w=hs&&game.score2!>game.score1!
  const field=(game.location||'').split(' - ').pop()||game.location

  const share=async()=>{
    const url=window.location.href
    const title=`${game.team1} vs ${game.team2} — ${tournament?.name||'Tournament'}`
    try{ if(navigator.share){ await navigator.share({title,url}); return } }catch{}
    try{ await navigator.clipboard.writeText(url); setCopied(true); setTimeout(()=>setCopied(false),2000) }catch{}
  }
  const downloadIcs=()=>{
    const st=parseStartMs(game.date,game.startTime); if(st==null) return
    const fmt=(ms:number)=>new Date(ms).toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'
    const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//WhistleReady//EN','BEGIN:VEVENT','UID:'+game.id+'@whistleready','DTSTART:'+fmt(st),'DTEND:'+fmt(st+3600000),'SUMMARY:'+game.team1+' vs '+game.team2,'LOCATION:'+(game.location||''),'DESCRIPTION:'+game.division,'END:VEVENT','END:VCALENDAR'].join('\r\n')
    const blob=new Blob([ics],{type:'text/calendar'}); const url=URL.createObjectURL(blob)
    const a=document.createElement('a'); a.href=url; a.download=(game.team1+'-vs-'+game.team2).replace(/[^a-z0-9]+/gi,'-')+'.ics'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <Link href={`/tournaments/${id}/public`} className="text-sm text-teal-700 hover:underline inline-flex items-center gap-1">
            <ChevronLeft size={15}/>{tournament?.name||'Tournament'}
          </Link>
          <div className="flex items-center gap-2">
            {!hs&&parseStartMs(game.date,game.startTime)!=null&&(
              <button onClick={downloadIcs} className="text-slate-400 hover:text-teal-600" title="Add to calendar"><CalendarPlus size={17}/></button>
            )}
            <button onClick={share} className="text-slate-400 hover:text-teal-600 inline-flex items-center gap-1 text-xs" title="Share game">
              <Share2 size={16}/>{copied?'Copied!':''}
            </button>
          </div>
        </div>

        {/* Matchup card */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
            <span className="inline-flex items-center gap-1.5"><Calendar size={12}/>{fmtDate(game.date)||'TBD'}<Clock size={12} className="ml-1"/>{game.startTime||'TBD'}</span>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full normal-case tracking-normal ${status!.cls}`}>{status!.label}</span>
            <span className="inline-flex items-center gap-1"><MapPin size={12}/>{field||'TBD'}</span>
          </div>
          <div className="px-6 py-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex flex-col items-center gap-2 text-center min-w-0">
              <Crest team={game.team1} logos={logos}/>
              <div className={`text-sm sm:text-base leading-tight ${t1w?'font-bold text-teal-700':'font-semibold text-slate-800'}`}>{game.team1||'TBD'}{t1w&&game.isChampionship&&<Trophy size={15} className="inline ml-1.5 text-amber-500 align-text-top"/>}</div>
            </div>
            <div className="text-center">
              {s1!=null&&s2!=null
                ? <div className="flex items-baseline gap-2 text-4xl sm:text-5xl font-extrabold">
                    <span className={t1w?'text-slate-900':hs?'text-slate-400':'text-slate-900'}>{s1}</span>
                    <span className="text-slate-300 text-2xl">–</span>
                    <span className={t2w?'text-slate-900':hs?'text-slate-400':'text-slate-900'}>{s2}</span>
                  </div>
                : <div className="text-xl font-semibold text-slate-300">vs</div>}
            </div>
            <div className="flex flex-col items-center gap-2 text-center min-w-0">
              <Crest team={game.team2} logos={logos}/>
              <div className={`text-sm sm:text-base leading-tight ${t2w?'font-bold text-teal-700':'font-semibold text-slate-800'}`}>{game.team2||'TBD'}{t2w&&game.isChampionship&&<Trophy size={15} className="inline ml-1.5 text-amber-500 align-text-top"/>}</div>
            </div>
          </div>
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-2 flex-wrap text-[11px]">
            <span className="bg-white border border-slate-200 rounded-full px-2.5 py-1 text-slate-600 font-medium">{game.division}</span>
            <span className={`rounded-full px-2.5 py-1 font-medium ${game.isChampionship?'bg-amber-100 text-amber-800':'bg-teal-50 text-teal-700'}`}>
              {game.isChampionship?'Bracket':game.pool?`Pool ${game.pool}`:'Pool play'}
            </span>
            {game.gameNumber&&<span className="bg-white border border-slate-200 rounded-full px-2.5 py-1 text-slate-500 font-medium">Game {game.gameNumber}</span>}
            {game.location&&<span className="bg-white border border-slate-200 rounded-full px-2.5 py-1 text-slate-500 font-medium">{game.location}</span>}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          Scores update live during the game · <Link href={`/tournaments/${id}/public`} className="text-teal-600 hover:underline">Full schedule &amp; standings</Link>
        </p>
      </div>
    </div>
  )
}
