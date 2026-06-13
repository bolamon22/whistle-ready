'use client'
import { useEffect, useState, useMemo, useContext, createContext, Fragment } from 'react'
import { useParams } from 'next/navigation'

const LogosContext = createContext<Record<string, string>>({})
import Link from 'next/link'
import { Users, Calendar, LayoutGrid, Trophy, Clock, ChevronDown, Star, CalendarPlus, Medal } from 'lucide-react'

interface Tournament { id:string; name:string; startDate:string; endDate:string; location:string; logoUrl:string; sport:string }
interface Game { id:string; gameNumber:string; date:string; startTime:string; division:string; pool:string|null; location:string; team1:string; team2:string; score1:number|null; score2:number|null; isCanceled:boolean; isChampionship:boolean }
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

const DEFAULT_TBS=['record','goal_diff','goals_for']
const TB_LABEL:Record<string,string>={record:'record',win_pct:'win %',head_to_head:'head-to-head',h2h_two:'head-to-head',h2h_gd:'H2H goal diff',goal_diff:'goal diff',goals_for:'goals scored',goals_against:'goals allowed'}
function calcStandings(games:Game[],division:string,pool?:string,tbs:string[]=DEFAULT_TBS):Standing[] {
  const map:Record<string,Standing>={}
  const ensure=(t:string)=>{if(!map[t])map[t]={team:t,w:0,l:0,t:0,gf:0,ga:0,pts:0}}
  const rel=games.filter(g=>g.division===division&&!g.isCanceled&&!g.isChampionship&&(pool!==undefined?g.pool===pool:true))
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

function PoolCard({division,pool,standings,games,followedTeams,tiebreakers,advanceCount,numPools,onScheduleClick,onTeamClick}:{division:string;pool:string;standings:Standing[];games:Game[];followedTeams:string[];tiebreakers:string[];advanceCount:number;numPools:number;onScheduleClick:()=>void;onTeamClick:(team:string)=>void}) {
  const [pview,setPview]=useState<'grid'|'list'>('list')
  const teamForm=(team:string)=>{
    const tg=games.filter(g=>g.division===division&&!g.isCanceled&&!g.isChampionship&&(pool?g.pool===pool:true)&&(g.team1===team||g.team2===team)&&g.score1!==null&&g.score2!==null)
      .sort((a,b)=>`${a.date}${a.startTime}`<`${b.date}${b.startTime}`?-1:1)
    return tg.slice(-3).map(g=>{const my=g.team1===team?g.score1!:g.score2!,op=g.team1===team?g.score2!:g.score1!;return my>op?'W':my<op?'L':'T'})
  }
  const cutoff = numPools>1 ? Math.max(1,Math.ceil(advanceCount/numPools)) : advanceCount
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="text-white font-bold text-sm uppercase tracking-wide">{division}{pool ? ` — Group ${pool}` : ''}</span>
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
      {pview==='grid' && (
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 bg-white">
          {standings.map((s,i)=>(
            <button key={s.team} onClick={()=>onTeamClick(s.team)} className="flex flex-col items-center py-5 px-3 gap-2 hover:bg-teal-50 transition-colors w-full cursor-pointer" title={`View ${s.team} schedule`}>
              <TeamAvatar name={s.team}/>
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-0.5">{i+1}</div>
                <div className="text-xs font-bold text-slate-800 uppercase leading-tight">{s.team}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {pview==='list' && (
        <div className="bg-white overflow-x-auto">
          <table className="w-full text-xs min-w-[400px]">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-3 py-2.5 w-6 text-slate-400 font-semibold"></th>
              <th className="text-left px-2 py-2.5 text-slate-500 font-semibold">Team</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold w-7">W</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold w-7">L</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold w-8">GA</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold w-8">GF</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold w-10">GD</th>
              <th className="text-center px-2 py-2.5 text-slate-500 font-semibold">Last 3</th>
            </tr></thead>
            <tbody>
              {standings.map((s,i)=>{
                const mp=s.w+s.l+s.t,gd=s.gf-s.ga,form=teamForm(s.team)
                return (
                  <Fragment key={s.team}>
                    <tr className={`border-t border-slate-50 ${i===0&&mp>0?'bg-amber-50/40':''}`}>
                      <td className="px-3 py-2.5 text-slate-400 font-semibold">{i+1}</td>
                      <td className="px-2 py-2.5"><div className="flex items-center gap-2"><TeamAvatar name={s.team} size="sm"/><button onClick={()=>onTeamClick(s.team)} className={`font-semibold text-xs leading-tight text-left hover:underline ${followedTeams.includes(s.team)?'text-teal-700':'text-slate-800'}`}>{s.team}</button></div></td>
                      <td className="px-2 py-2.5 text-center font-semibold text-slate-700">{s.w}</td>
                      <td className="px-2 py-2.5 text-center text-slate-600">{s.l}</td>
                      <td className="px-2 py-2.5 text-center text-slate-600">{s.ga}</td>
                      <td className="px-2 py-2.5 text-center text-slate-600">{s.gf}</td>
                      <td className={`px-2 py-2.5 text-center font-bold ${gd>0?'text-emerald-600':gd<0?'text-red-500':'text-slate-400'}`}>{gd>0?'+':''}{gd}</td>
                      <td className="px-2 py-2.5"><div className="flex items-center justify-center gap-1">{form.length===0?<span className="text-slate-300">—</span>:form.map((r,fi)=><span key={fi} className={`w-4 h-4 rounded-full text-[8px] font-bold text-white flex items-center justify-center ${r==='W'?'bg-emerald-500':r==='L'?'bg-red-500':'bg-slate-400'}`}>{r}</span>)}</div></td>
                    </tr>
                    {cutoff>0 && cutoff<standings.length && i===cutoff-1 && (
                      <tr><td colSpan={8} className="p-0"><div className="border-t-2 border-dashed border-teal-300 mx-3 relative h-0"><span className="absolute right-2 -top-2 bg-white px-2 text-[9px] font-semibold text-teal-600 uppercase tracking-wide">Advances &uarr;</span></div></td></tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {tiebreakers.length>0 && <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400">Tiebreakers: {tiebreakers.map((tb,i)=>(i?' \u2192 ':'')+(TB_LABEL[tb]||tb)).join('')}</div>}
        </div>
      )}
      <button onClick={onScheduleClick} className="w-full bg-[#0f1f3d] hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors">Schedule</button>
    </div>
  )
}


// ── Bracket visual constants ───────────────────────────────────────────────
const BK_H=82, BK_W=220, BK_CONN=48, BK_GAP=14, BK_UNIT=BK_H+BK_GAP
const BK_BAR_H=34, BK_BAR_GAP=10, BK_ROW=132, BK_TOP=22
function bkTop(round:number,idx:number){const sp=BK_UNIT*Math.pow(2,round-1);const fc=BK_H/2+(sp-BK_UNIT)/2;return fc+idx*sp-BK_H/2}
function bkLeft(round:number){return(round-1)*(BK_W+BK_CONN)}
function bkRoundLabel(r:number,max:number){if(r===max)return'Championship';if(r===max-1&&max>=3)return'Semifinals';if(r===max-2&&max>=4)return'Quarterfinals';return`Round ${r}`}
function fmt12bk(t:string){if(!t)return'';const[h,m]=t.split(':').map(Number);return`${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`}
function fmtShortDate(d:string){if(!d)return'';const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
const isPlaceholderTeam=(n:string)=>/^(seed\s|w-b\d|l-b\d|bracket|winner|loser|tbd$)/i.test((n||'').trim())

interface BkBracketGame{gameNumber:number;round:number;section:string;team1Source:string;team2Source:string;label:string|null}
interface BkBracket{id:string;format:string;teamCount:number;flight?:string;numberOffset?:number;games:BkBracketGame[];seeds:Record<string,string>}

// ── Both-ways consolation tournament (mirror) ──────────────────────────────
function MirrorBracket({bracket,scheduledGames,showFlight}:{bracket:BkBracket;scheduledGames:Game[];showFlight:boolean}){
  const logos=useContext(LogosContext)
  const [zoom,setZoom]=useState(1)
  const offset=bracket.numberOffset??0
  const schedByNum=new Map(scheduledGames.map(g=>[g.gameNumber,g]))
  function TeamAv({name,isTbd}:{name:string;isTbd:boolean}){
    const sz='w-7 h-7'
    if(!isTbd&&logos[name])return<div className={`${sz} rounded-full overflow-hidden bg-white border border-slate-200 flex-shrink-0`}><img src={logos[name]} alt="" className="w-full h-full object-contain"/></div>
    if(isTbd)return<div className={`${sz} rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0`}><span className="text-gray-300 text-[9px]">?</span></div>
    const initials=name.split(' ').filter((w:string)=>w.length>2).slice(0,2).map((w:string)=>w[0].toUpperCase()).join('')||name.substring(0,2).toUpperCase()
    const colors=['#1a3a5c','#8b1a1a','#1a5c3a','#5c3a1a','#3a1a5c','#1a5c5c','#5c1a4a','#2a4a1a']
    const idx=name.split('').reduce((a:number,c:string)=>a+c.charCodeAt(0),0)%colors.length
    return<div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-[9px]`} style={{backgroundColor:colors[idx]}}>{initials}</div>
  }
  function resolveTeam(src:string,sched:string|undefined):{name:string;isTbd:boolean}{
    if(sched&&!isPlaceholderTeam(sched))return{name:sched,isTbd:false}
    if(src.startsWith('seed:')){const sn=src.slice(5);const t=bracket.seeds?.[sn];return t?{name:t,isTbd:false}:{name:`Seed ${sn}`,isTbd:true}}
    if(src.startsWith('winner:'))return{name:`W-B${parseInt(src.slice(7))+offset}`,isTbd:true}
    if(src.startsWith('loser:'))return{name:`L-B${parseInt(src.slice(6))+offset}`,isTbd:true}
    return{name:sched||'TBD',isTbd:true}
  }
  const isWin=(g:BkBracketGame)=>g.section==='winners'||g.section==='championship'
  const wins=bracket.games.filter(isWin)
  const cons=bracket.games.filter(g=>!isWin(g))
  if(wins.length===0)return null
  const byNum:Record<number,BkBracketGame>={}; bracket.games.forEach(g=>{byNum[g.gameNumber]=g})
  const feederNums=(g:BkBracketGame)=>[g.team1Source,g.team2Source].map(src=>{const m=(src||'').match(/^(winner|loser):(\d+)$/);const n=m?parseInt(m[2]):NaN;return byNum[n]?n:null})
  const minWinRound=Math.min(...wins.map(g=>g.round))
  const r1=wins.filter(g=>g.round===minWinRound).map(g=>g.gameNumber)
  // consolation BRACKET = games reachable from R1 losers (3rd-place placement games excluded)
  const consSet=new Set<number>(); let ch=true
  while(ch){ch=false; for(const g of cons){ if(consSet.has(g.gameNumber))continue
    const ok=[g.team1Source,g.team2Source].some(src=>{const m=(src||'').match(/^(winner|loser):(\d+)$/);if(!m)return false;const ref=parseInt(m[2]);if(src.startsWith('loser:')&&r1.includes(ref))return true;if(consSet.has(ref))return true;return false})
    if(ok){consSet.add(g.gameNumber);ch=true} } }
  const consBracket=cons.filter(g=>consSet.has(g.gameNumber))
  const placement=cons.filter(g=>!consSet.has(g.gameNumber))
  const mirGames=[...wins,...consBracket]
  const inMir=new Set(mirGames.map(g=>g.gameNumber))
  const fOf=(g:BkBracketGame)=>feederNums(g).map(n=>n!=null&&inMir.has(n)?n:null)
  const HALF_BAR=(BK_BAR_H+BK_BAR_GAP)/2
  const referenced=new Set<number>(); mirGames.forEach(g=>fOf(g).forEach(n=>{if(n!=null)referenced.add(n)}))
  const roots=mirGames.filter(g=>!referenced.has(g.gameNumber)).sort((a,b)=>b.round-a.round||a.gameNumber-b.gameNumber)
  const rough:Record<number,number>={}; let ls0=0
  const roughY=(num:number):number=>{if(rough[num]!==undefined)return rough[num];const g=byNum[num];if(!g)return 0;const[a,b]=fOf(g);const cs:number[]=[];if(a!=null)cs.push(roughY(a));if(b!=null)cs.push(roughY(b));const y=cs.length?cs.reduce((p,q)=>p+q,0)/cs.length:(ls0++*BK_ROW);rough[num]=y;return y}
  roots.forEach(r=>roughY(r.gameNumber)); mirGames.forEach(g=>{if(rough[g.gameNumber]===undefined)rough[g.gameNumber]=ls0++*BK_ROW})
  const rv=mirGames.map(g=>rough[g.gameNumber]); const mid=rv.length?(Math.min(...rv)+Math.max(...rv))/2:0
  const winnerTopOf:Record<number,boolean>={}; const yByNum:Record<number,number>={}; let leaf=0
  const placeY=(num:number):number=>{if(yByNum[num]!==undefined)return yByNum[num];const g=byNum[num];if(!g)return 0;const[f1,f2]=fOf(g);let y:number;if(f1!=null&&f2!=null)y=(placeY(f1)+placeY(f2))/2;else if(f1!=null||f2!=null){const fN=(f1!=null?f1:f2) as number;const wt=rough[fN]<=mid;winnerTopOf[num]=wt;y=placeY(fN)+(wt?HALF_BAR:-HALF_BAR)}else y=leaf++*BK_ROW;yByNum[num]=y;return y}
  roots.forEach(r=>placeY(r.gameNumber)); mirGames.forEach(g=>{if(yByNum[g.gameNumber]===undefined)yByNum[g.gameNumber]=leaf++*BK_ROW})
  const minY=Math.min(0,...mirGames.map(g=>yByNum[g.gameNumber]))
  const stepX=BK_W+BK_CONN
  const maxWinDepth=Math.max(0,...wins.map(g=>g.round-minWinRound))
  const maxConsDepth=consBracket.length?Math.max(...consBracket.map(g=>g.round-minWinRound)):0
  const CX=maxConsDepth*stepX+10
  const colX=(g:BkBracketGame)=>isWin(g)?CX+(g.round-minWinRound)*stepX:CX-(g.round-minWinRound)*stepX
  const positions=new Map<number,{x:number;y:number;cy:number}>()
  mirGames.forEach(g=>{const y=yByNum[g.gameNumber]-minY+BK_TOP+30;positions.set(g.gameNumber,{x:colX(g),y,cy:y+BK_BAR_H+BK_BAR_GAP/2})})
  const canvasW=CX+maxWinDepth*stepX+BK_W+10
  const allY=[...positions.values()]
  const canvasH=Math.max(220,...allY.map(p=>p.y+2*BK_BAR_H+BK_BAR_GAP))+24
  const conns:JSX.Element[]=[]
  mirGames.forEach(g=>{const pos=positions.get(g.gameNumber);if(!pos)return;const win=isWin(g)
    fOf(g).forEach(fn=>{if(fn==null)return;const fp=positions.get(fn);if(!fp)return
      const fx=win?fp.x+BK_W:fp.x; const tx=win?pos.x:pos.x+BK_W; const mx=(fx+tx)/2
      conns.push(<path key={`c${g.gameNumber}-${fn}`} d={`M${fx},${fp.cy} H${mx} V${pos.cy} H${tx}`} fill="none" stroke="#cbd5e1" strokeWidth="1.5"/>)})})
  const champGame=wins.find(g=>g.section==='championship')||wins.slice().sort((a,b)=>b.round-a.round)[0]
  const consFinal=consBracket.length?consBracket.slice().sort((a,b)=>b.round-a.round)[0]:null
  const champPos=champGame?positions.get(champGame.gameNumber):null
  const consPos=consFinal?positions.get(consFinal.gameNumber):null
  return(
    <div>
      {showFlight&&<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Flight {bracket.flight||'A'}</p>}
      <div className="flex items-center gap-1 mb-1 text-gray-400">
        <span className="text-[10px] mr-1">Zoom</span>
        <button onClick={()=>setZoom(z=>Math.max(0.5,Math.round((z-0.15)*100)/100))} className="w-5 h-5 rounded border border-gray-200 hover:bg-gray-50 text-xs leading-none">−</button>
        <span className="text-[10px] w-9 text-center">{Math.round(zoom*100)}%</span>
        <button onClick={()=>setZoom(z=>Math.min(1,Math.round((z+0.15)*100)/100))} className="w-5 h-5 rounded border border-gray-200 hover:bg-gray-50 text-xs leading-none">+</button>
      </div>
      <div style={{overflowX:'auto',paddingBottom:8}}>
        <div style={{width:canvasW*zoom,height:canvasH*zoom}}>
        <div style={{position:'relative',width:canvasW,height:canvasH,transformOrigin:'top left',transform:zoom!==1?`scale(${zoom})`:undefined}}>
          <svg style={{position:'absolute',top:0,left:0,width:canvasW,height:canvasH,pointerEvents:'none'}} viewBox={`0 0 ${canvasW} ${canvasH}`}>{conns}</svg>
          {mirGames.map(g=>{
            const pos=positions.get(g.gameNumber);if(!pos)return null
            const sgNum=`B${g.gameNumber+offset}`; const sg=schedByNum.get(sgNum)
            const isChamp=g.section==='championship'
            const hasScore=sg&&sg.score1!=null&&sg.score2!=null
            const hasSched=sg&&(sg.date||sg.startTime||sg.location)
            const cap=hasSched?`${fmtShortDate(sg!.date)} ${fmt12bk(sg!.startTime)} · ${(sg!.location||'').split(' - ').pop()||sg!.location}`:(g.label||(isChamp?'Championship':'Not scheduled'))
            const w0=!!hasScore&&sg!.score1!>sg!.score2!, w1=!!hasScore&&sg!.score2!>sg!.score1!
            const ra={src:g.team1Source,team:resolveTeam(g.team1Source,sg?.team1),score:sg?.score1,win:w0}
            const rb={src:g.team2Source,team:resolveTeam(g.team2Source,sg?.team2),score:sg?.score2,win:w1}
            const[fa,fb]=fOf(g); const isByeGame=(fa!=null)!==(fb!=null)
            let rows=[ra,rb]
            if(isByeGame){const feederRow=fa!=null?ra:rb;const byeRow=fa!=null?rb:ra;rows=winnerTopOf[g.gameNumber]?[feederRow,byeRow]:[byeRow,feederRow]}
            return(
              <div key={g.gameNumber}>
                <div style={{position:'absolute',left:pos.x,top:pos.y-17,width:BK_W}} className="flex items-center gap-1 px-1">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasScore?'bg-green-500':hasSched?'bg-blue-400':'bg-gray-300'}`}/>
                  <span className={`text-[10px] truncate ${isChamp?'text-amber-600 font-semibold':'text-gray-400'}`}>{cap}</span>
                </div>
                {rows.map((r,idx)=>{const isSeed=r.src.startsWith('seed:');const top=pos.y+(idx===0?0:BK_BAR_H+BK_BAR_GAP)
                  return(
                    <div key={idx} style={{position:'absolute',left:pos.x,top,width:BK_W,height:BK_BAR_H}} className={`flex items-center rounded-lg border shadow-sm overflow-hidden ${r.win?'border-blue-300 bg-blue-50':isChamp?'border-amber-300 bg-white':'border-gray-200 bg-white'}`}>
                      <span className={`h-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${isSeed?(isByeGame?'bg-amber-500 text-white':'bg-teal-600 text-white'):'bg-gray-100 text-gray-400'}`} style={{width:26}}>{isSeed?r.src.slice(5):''}</span>
                      <div className="pl-2 pr-1.5 flex-shrink-0"><TeamAv name={r.team.name} isTbd={r.team.isTbd}/></div>
                      <span className={`flex-1 text-[12px] truncate ${r.team.isTbd?'text-gray-400 italic':r.win?'font-bold text-gray-900':'font-medium text-gray-700'}`}>{r.team.name}</span>
                      {!r.team.isTbd&&hasScore&&<span className={`text-[14px] font-bold px-2 ${r.win?'text-blue-600':'text-gray-400'}`}>{r.score}</span>}
                      {r.win&&<Trophy size={11} className="text-amber-500 flex-shrink-0 mr-2"/>}
                    </div>)})}
              </div>)
          })}
          {champPos&&(<div style={{position:'absolute',left:champPos.x,top:Math.max(2,champPos.y-61),width:BK_W,height:40}} className="flex items-center justify-center gap-2 rounded-xl bg-amber-700 text-white font-bold text-[13px] shadow-sm"><Trophy size={14}/> Champion</div>)}
          {consPos&&(<div style={{position:'absolute',left:consPos.x,top:Math.max(2,consPos.y-61),width:BK_W,height:40}} className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-600 text-white font-semibold text-[12px] shadow-sm"><Medal size={14}/> Consolation Champ</div>)}
        </div>
        </div>
      </div>
      {placement.length>0&&(
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Placement</p>
          <div className="flex flex-wrap gap-3">
            {placement.map(g=>{const sgNum=`B${g.gameNumber+offset}`;const sg=schedByNum.get(sgNum);const hasScore=sg&&sg.score1!=null&&sg.score2!=null;const t1=resolveTeam(g.team1Source,sg?.team1);const t2=resolveTeam(g.team2Source,sg?.team2);const t1w=hasScore&&sg!.score1!>sg!.score2!,t2w=hasScore&&sg!.score2!>sg!.score1!
              return(<div key={g.gameNumber} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm" style={{width:BK_W}}>
                <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{g.label||'Placement'}</div>
                {[{r:t1,sc:sg?.score1,w:t1w},{r:t2,sc:sg?.score2,w:t2w}].map((x,i)=>(<div key={i} className={`flex items-center gap-2 px-3 py-2 ${i===0?'border-b border-gray-100':''} ${x.w?'bg-blue-50':''}`}><TeamAv name={x.r.name} isTbd={x.r.isTbd}/><span className={`flex-1 text-[12px] truncate ${x.r.isTbd?'text-gray-400 italic':x.w?'font-bold text-gray-900':'text-gray-700'}`}>{x.r.name}</span>{!x.r.isTbd&&hasScore&&<span className={`text-[13px] font-bold ${x.w?'text-blue-600':'text-gray-400'}`}>{x.sc}</span>}</div>))}
              </div>)})}
          </div>
        </div>
      )}
    </div>
  )
}

function BracketView({bracketList,scheduledGames}:{bracketList:BkBracket[];scheduledGames:Game[]}){
  const [showCons,setShowCons]=useState(false)
  const logos=useContext(LogosContext)

  function TeamAv({name,isTbd}:{name:string;isTbd:boolean}){
    const sz='w-7 h-7'
    if(!isTbd&&logos[name])return<div className={`${sz} rounded-full overflow-hidden bg-white border border-slate-200 flex-shrink-0`}><img src={logos[name]} alt="" className="w-full h-full object-contain"/></div>
    if(isTbd)return<div className={`${sz} rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0`}><span className="text-gray-300 text-[9px]">?</span></div>
    const initials=name.split(' ').filter((w:string)=>w.length>2).slice(0,2).map((w:string)=>w[0].toUpperCase()).join('')||name.substring(0,2).toUpperCase()
    const colors=['#1a3a5c','#8b1a1a','#1a5c3a','#5c3a1a','#3a1a5c','#1a5c5c','#5c1a4a','#2a4a1a']
    const idx=name.split('').reduce((a:number,c:string)=>a+c.charCodeAt(0),0)%colors.length
    return<div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-[9px]`} style={{backgroundColor:colors[idx]}}>{initials}</div>
  }

  if(bracketList.length===0)return(
    <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
      <div className="text-3xl mb-2">🏆</div>
      <p className="font-medium">Bracket games will appear here once pool play concludes.</p>
    </div>
  )

  return(
    <div className="space-y-6">
      {bracketList.map(bracket=>{
        if(bracket.format==='2gg')return <MirrorBracket key={bracket.id} bracket={bracket} scheduledGames={scheduledGames} showFlight={bracketList.length>1}/>
        const offset=bracket.numberOffset??0
        const schedByNum=new Map(scheduledGames.map(g=>[g.gameNumber,g]))
        const mainGames=bracket.games.filter(g=>g.section==='winners'||g.section==='championship')
        const consGames=bracket.games.filter(g=>g.section==='consolation'||g.section==='losers')
        const maxRound=Math.max(0,...mainGames.map(g=>g.round))
        const roundGroups=new Map<number,BkBracketGame[]>()
        mainGames.forEach(g=>{if(!roundGroups.has(g.round))roundGroups.set(g.round,[]);roundGroups.get(g.round)!.push(g)})
        interface BkPos{x:number;y:number;cy:number}
        // Feeder-graph layout: position each game from the games that feed it, so byes align
        // with their feeder and round-1 games never overlap (fixes the old bkTop power-of-2 math).
        const byNum:Record<number,BkBracketGame>={}
        mainGames.forEach(g=>{byNum[g.gameNumber]=g})
        const feederOf=(g:BkBracketGame):(number|null)[]=>[g.team1Source,g.team2Source].map(src=>{const m=(src||'').match(/^(winner|loser):(\d+)$/);const n=m?parseInt(m[2]):NaN;return(!isNaN(n)&&byNum[n])?n:null})
        const referenced=new Set<number>()
        mainGames.forEach(g=>feederOf(g).forEach(fn=>{if(fn!=null)referenced.add(fn)}))
        const roots=mainGames.filter(g=>!referenced.has(g.gameNumber)).sort((a,b)=>b.round-a.round||a.gameNumber-b.gameNumber)
        const HALF_BAR=(BK_BAR_H+BK_BAR_GAP)/2
        // Pass 1: rough positions (byes centred) to learn which half of the bracket each game is in.
        const rough:Record<number,number>={}
        let ls0=0
        const roughY=(num:number):number=>{
          if(rough[num]!==undefined)return rough[num]
          const g=byNum[num];if(!g)return 0
          const[a,b]=feederOf(g)
          const cs:number[]=[]
          if(a!=null)cs.push(roughY(a))
          if(b!=null)cs.push(roughY(b))
          const y=cs.length?cs.reduce((p,q)=>p+q,0)/cs.length:(ls0++*BK_ROW)
          rough[num]=y;return y
        }
        roots.forEach(r=>roughY(r.gameNumber))
        mainGames.forEach(g=>{if(rough[g.gameNumber]===undefined)rough[g.gameNumber]=ls0++*BK_ROW})
        const rv=mainGames.map(g=>rough[g.gameNumber])
        const mid=rv.length?(Math.min(...rv)+Math.max(...rv))/2:0
        // Pass 2: a bye game is offset half a bar so its winner-feeder slot aligns with its feeder
        // (winner toward the outer edge, bye toward centre) instead of sitting straight on the feeder line.
        const winnerTopOf:Record<number,boolean>={}
        const yByNum:Record<number,number>={}
        let leaf=0
        const placeY=(num:number):number=>{
          if(yByNum[num]!==undefined)return yByNum[num]
          const g=byNum[num];if(!g)return 0
          const[f1,f2]=feederOf(g)
          let y:number
          if(f1!=null&&f2!=null)y=(placeY(f1)+placeY(f2))/2
          else if(f1!=null||f2!=null){const fNum=(f1!=null?f1:f2) as number;const wt=rough[fNum]<=mid;winnerTopOf[num]=wt;y=placeY(fNum)+(wt?HALF_BAR:-HALF_BAR)}
          else y=leaf++*BK_ROW
          yByNum[num]=y;return y
        }
        roots.forEach(r=>placeY(r.gameNumber))
        mainGames.forEach(g=>{if(yByNum[g.gameNumber]===undefined)yByNum[g.gameNumber]=leaf++*BK_ROW})
        const minY=Math.min(0,...mainGames.map(g=>yByNum[g.gameNumber]))
        const positions=new Map<number,BkPos>()
        mainGames.forEach(g=>{const y=yByNum[g.gameNumber]-minY+BK_TOP;positions.set(g.gameNumber,{x:bkLeft(g.round),y,cy:y+BK_BAR_H+BK_BAR_GAP/2})})
        const allPos=[...positions.values()]
        const canvasW=bkLeft(maxRound)+BK_W+24
        const canvasH=allPos.length?Math.max(...allPos.map(p=>p.y+2*BK_BAR_H+BK_BAR_GAP))+24:200

        // SVG connectors
        const connectors:JSX.Element[]=[]
        mainGames.forEach(g=>{
          const pos=positions.get(g.gameNumber);if(!pos)return
          const feeders:[string,string][]=[g.team1Source,g.team2Source].map(src=>{const m=src.match(/^winner:(\d+)$/);return m?[m[1],'']:null}).filter(Boolean) as [string,string][]
          const feederPositions=feeders.map(([n])=>positions.get(parseInt(n))).filter(Boolean) as BkPos[]
          if(feederPositions.length===2){
            const[f1,f2]=feederPositions
            const midX=f1.x+BK_W+BK_CONN/2
            connectors.push(<path key={`a-${g.gameNumber}`} d={`M${f1.x+BK_W},${f1.cy} H${midX}`} fill="none" stroke="#e5e7eb" strokeWidth="1.5"/>)
            connectors.push(<path key={`b-${g.gameNumber}`} d={`M${f2.x+BK_W},${f2.cy} H${midX}`} fill="none" stroke="#e5e7eb" strokeWidth="1.5"/>)
            connectors.push(<line key={`c-${g.gameNumber}`} x1={midX} y1={f1.cy} x2={midX} y2={f2.cy} stroke="#e5e7eb" strokeWidth="1.5"/>)
            connectors.push(<path key={`d-${g.gameNumber}`} d={`M${midX},${pos.cy} H${pos.x}`} fill="none" stroke="#e5e7eb" strokeWidth="1.5"/>)
          }else if(feederPositions.length===1){
            const f=feederPositions[0]
            connectors.push(<path key={`sf-${g.gameNumber}`} d={`M${f.x+BK_W},${f.cy} H${pos.x}`} fill="none" stroke="#e5e7eb" strokeWidth="1.5"/>)
          }
        })

        function resolveTeam(src:string,sched:string|undefined):{name:string;isTbd:boolean}{
          if(sched&&!isPlaceholderTeam(sched))return{name:sched,isTbd:false}
          if(src.startsWith('seed:')){const sn=src.slice(5);const t=bracket.seeds?.[sn];return t?{name:t,isTbd:false}:{name:`Seed ${sn}`,isTbd:true}}
          if(src.startsWith('winner:'))return{name:`W-B${parseInt(src.slice(7))+offset}`,isTbd:true}
          if(src.startsWith('loser:'))return{name:`L-B${parseInt(src.slice(6))+offset}`,isTbd:true}
          return{name:sched||'TBD',isTbd:true}
        }

        // Progress: how many rounds are complete
        const totalRounds=maxRound
        const completedRounds=[...roundGroups.entries()].filter(([r,gs])=>gs.every(bg=>{const sg=schedByNum.get(`B${bg.gameNumber+offset}`);return sg&&sg.score1!=null})).map(([r])=>r)
        const roundsDone=completedRounds.length

        return(
          <div key={bracket.id}>
            {bracketList.length>1&&<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Flight {bracket.flight||'A'}</p>}

            {/* Progress bar */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex gap-1">
                {Array.from({length:totalRounds},(_,i)=>(
                  <div key={i} className={`h-1.5 w-8 rounded-full ${i<roundsDone?'bg-blue-500':'bg-gray-200'}`}/>
                ))}
              </div>
              <span className="text-xs text-gray-500">{roundsDone} of {totalRounds} {totalRounds===1?'round':'rounds'} complete</span>
            </div>

            {/* Round labels */}
            <div style={{position:'relative',height:18,width:canvasW,marginBottom:6}}>
              {[...roundGroups.keys()].map(r=>(
                <div key={r} style={{position:'absolute',left:bkLeft(r),width:BK_W,textAlign:'center'}}
                  className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  {bkRoundLabel(r,maxRound)}
                </div>
              ))}
            </div>

            {/* Bracket canvas */}
            <div style={{overflowX:'auto',paddingBottom:8}}>
              <div style={{position:'relative',width:canvasW,height:canvasH}}>
                <svg style={{position:'absolute',top:0,left:0,width:canvasW,height:canvasH,pointerEvents:'none'}} viewBox={`0 0 ${canvasW} ${canvasH}`}>
                  {connectors}
                </svg>
                {mainGames.map(bg=>{
                  const pos=positions.get(bg.gameNumber);if(!pos)return null
                  const sgNum=`B${bg.gameNumber+offset}`
                  const sg=schedByNum.get(sgNum)
                  const isChamp=bg.section==='championship'||(bg.label||'').toLowerCase().includes('championship')
                  const hasScore=sg&&sg.score1!=null&&sg.score2!=null
                  const hasSched=sg&&(sg.date||sg.startTime||sg.location)
                  const cap=hasSched?`${fmtShortDate(sg!.date)} ${fmt12bk(sg!.startTime)} · ${(sg!.location||'').split(' - ').pop()||sg!.location}`:(isChamp?(bg.label||'Championship'):'Not scheduled')
                  const w0=!!hasScore&&sg!.score1!>sg!.score2!, w1=!!hasScore&&sg!.score2!>sg!.score1!
                  const r1={src:bg.team1Source,team:resolveTeam(bg.team1Source,sg?.team1),score:sg?.score1,win:w0}
                  const r2={src:bg.team2Source,team:resolveTeam(bg.team2Source,sg?.team2),score:sg?.score2,win:w1}
                  const[fa,fb]=feederOf(bg)
                  const isByeGame=(fa!=null)!==(fb!=null)
                  let rows=[r1,r2]
                  if(isByeGame){const feederRow=fa!=null?r1:r2;const byeRow=fa!=null?r2:r1;rows=winnerTopOf[bg.gameNumber]?[feederRow,byeRow]:[byeRow,feederRow]}
                  return(
                    <div key={bg.gameNumber}>
                      {/* Caption (schedule / round) */}
                      <div style={{position:'absolute',left:pos.x,top:pos.y-17,width:BK_W}} className="flex items-center gap-1 px-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasScore?'bg-green-500':hasSched?'bg-blue-400':'bg-gray-300'}`}/>
                        <span className={`text-[10px] truncate ${isChamp?'text-amber-600 font-semibold':'text-gray-400'}`}>{cap}</span>
                      </div>
                      {/* Team bars */}
                      {rows.map((r,idx)=>{
                        const isSeed=r.src.startsWith('seed:')
                        const top=pos.y+(idx===0?0:BK_BAR_H+BK_BAR_GAP)
                        return(
                          <div key={idx} style={{position:'absolute',left:pos.x,top,width:BK_W,height:BK_BAR_H}}
                            className={`flex items-center rounded-lg border shadow-sm overflow-hidden ${r.win?'border-blue-300 bg-blue-50':isChamp?'border-amber-300 bg-white':'border-gray-200 bg-white'}`}>
                            <span className={`h-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${isSeed?(isByeGame?'bg-amber-500 text-white':'bg-teal-600 text-white'):'bg-gray-100 text-gray-400'}`} style={{width:26}}>{isSeed?r.src.slice(5):''}</span>
                            <div className="pl-2 pr-1.5 flex-shrink-0"><TeamAv name={r.team.name} isTbd={r.team.isTbd}/></div>
                            <span className={`flex-1 text-[12px] truncate ${r.team.isTbd?'text-gray-400 italic':r.win?'font-bold text-gray-900':'font-medium text-gray-700'}`}>{r.team.name}</span>
                            {!r.team.isTbd&&hasScore&&<span className={`text-[14px] font-bold px-2 ${r.win?'text-blue-600':'text-gray-400'}`}>{r.score}</span>}
                            {r.win&&<Trophy size={11} className="text-amber-500 flex-shrink-0 mr-2"/>}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Consolation */}
            {consGames.length>0&&(
              <div className="mt-3">
                <button onClick={()=>setShowCons(v=>!v)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2">
                  <span className="font-semibold uppercase tracking-wide">3rd place / consolation</span>
                  <span>{showCons?'▲':'▼'}</span>
                </button>
                {showCons&&(
                  <div className="flex flex-wrap gap-3">
                    {consGames.map(bg=>{
                      const sgNum=`B${bg.gameNumber+offset}`;const sg=schedByNum.get(sgNum)
                      const hasScore=sg&&sg.score1!=null&&sg.score2!=null
                      const t1w=hasScore&&sg!.score1!>sg!.score2!,t2w=hasScore&&sg!.score2!>sg!.score1!
                      const t1=resolveTeam(bg.team1Source,sg?.team1)
                      const t2=resolveTeam(bg.team2Source,sg?.team2)
                      return(
                        <div key={bg.gameNumber} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm" style={{width:BK_W}}>
                          <div className={`flex items-center gap-2 px-3 py-2.5 ${t1w?'bg-blue-50':t2w?'bg-gray-50':''}`}>
                            <TeamAv name={t1.name} isTbd={t1.isTbd}/>
                            <span className={`flex-1 text-[12px] truncate ${t1.isTbd?'text-gray-400 italic':t1w?'font-bold text-gray-900':'font-medium text-gray-700'}`}>{t1.name}</span>
                            {hasScore&&<span className={`text-[15px] font-bold ${t1w?'text-blue-600':'text-gray-400'}`}>{sg!.score1}</span>}
                          </div>
                          <div className="border-t border-gray-100"/>
                          <div className={`flex items-center gap-2 px-3 py-2.5 ${t2w?'bg-blue-50':t1w?'bg-gray-50':''}`}>
                            <TeamAv name={t2.name} isTbd={t2.isTbd}/>
                            <span className={`flex-1 text-[12px] truncate ${t2.isTbd?'text-gray-400 italic':t2w?'font-bold text-gray-900':'font-medium text-gray-700'}`}>{t2.name}</span>
                            {hasScore&&<span className={`text-[15px] font-bold ${t2w?'text-blue-600':'text-gray-400'}`}>{sg!.score2}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-gray-100 bg-gray-50">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasScore?'bg-green-500':'bg-gray-300'}`}/>
                            <span className="text-[10px] text-gray-500 truncate">{sg&&(sg.date||sg.location)?`${fmtShortDate(sg.date)} · ${(sg.location||'').split(' - ').pop()||sg.location}`:bg.label||'Not scheduled'}</span>
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
      })}
    </div>
  )
}

type DivTab = 'standings'|'schedule'|'bracket'

function DivisionView({division,games,followedTeams,toggleFollow,tournamentId,tiebreakers}:{division:string;games:Game[];followedTeams:string[];toggleFollow:(t:string)=>void;tournamentId:string;tiebreakers:string[]}) {
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
  const handleTeamClick=(team:string)=>{setSelectedTeam(team);setDivTab('schedule')}
  const divGames=games.filter(g=>g.division===division&&!g.isCanceled)
  const pools=Array.from(new Set(divGames.map(g=>g.pool).filter(Boolean))).sort() as string[]
  const scheduleGames=divGames.filter(g=>!g.isChampionship).sort((a,b)=>a.date!==b.date?(a.date<b.date?-1:1):a.startTime<b.startTime?-1:1)
  const bracketGames=divGames.filter(g=>g.isChampionship).sort((a,b)=>a.startTime<b.startTime?-1:1)

  const tabs:DivTab[]=['standings','schedule','bracket']
  const tabLabels:{[k in DivTab]:string}={standings:'Standings',schedule:'Schedule',bracket:'Bracket'}

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-4 bg-white rounded-t-xl overflow-hidden shadow-sm">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setDivTab(t)}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${divTab===t?'bg-[#0f1f3d] text-white':'text-gray-500 hover:bg-gray-50'}`}>
            {tabLabels[t]}
          </button>
        ))}
      </div>


      {divTab==='standings' && (
        <div className="space-y-4">
          {pools.length>0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pools.map(pool=>(
                <PoolCard key={pool} division={division} pool={pool} standings={calcStandings(games,division,pool,tiebreakers)} games={games} followedTeams={followedTeams} tiebreakers={tiebreakers} advanceCount={advanceCount} numPools={pools.length} onScheduleClick={()=>setDivTab('schedule')} onTeamClick={handleTeamClick}/>
              ))}
            </div>
          ) : <PoolCard division={division} pool="" standings={calcStandings(games,division,undefined,tiebreakers)} games={games} followedTeams={followedTeams} tiebreakers={tiebreakers} advanceCount={advanceCount} numPools={1} onScheduleClick={()=>setDivTab('schedule')} onTeamClick={handleTeamClick}/>}
        </div>
      )}

      {divTab==='schedule' && (() => {
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
        const downloadIcs = (g:Game)=>{ const st=parseStartMs(g.date,g.startTime); if(st==null) return; const fmt=(ms:number)=>new Date(ms).toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'; const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GameDay//EN','BEGIN:VEVENT','UID:'+g.id+'@gameday','DTSTART:'+fmt(st),'DTEND:'+fmt(st+3600000),'SUMMARY:'+g.team1+' vs '+g.team2,'LOCATION:'+(g.location||''),'DESCRIPTION:'+division,'END:VEVENT','END:VCALENDAR'].join('\r\n'); const blob=new Blob([ics],{type:'text/calendar'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=(g.team1+'-vs-'+g.team2).replace(/[^a-z0-9]+/gi,'-')+'.ics'; a.click(); URL.revokeObjectURL(url) }
        const upNext = followedTeams.length>0 ? all.find(g=>g.score1==null && (followedTeams.includes(g.team1)||followedTeams.includes(g.team2))) : null
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
          const isHL=followedTeams.includes(g.team1)||followedTeams.includes(g.team2)
          const chipCls=g.isChampionship?'bg-amber-100 text-amber-800':'bg-teal-100 text-teal-700'
          const pill=hs?{t:'Final',c:'bg-slate-100 text-slate-500'}:live?{t:'Live',c:'bg-red-100 text-red-700'}:g.isChampionship?{t:'Bracket',c:'bg-amber-50 text-amber-700'}:g.pool?{t:'Pool '+g.pool,c:'bg-teal-50 text-teal-700'}:{t:'Upcoming',c:'bg-slate-100 text-slate-500'}
          return (
            <div key={g.id} className={`bg-white border rounded-xl px-2.5 py-2 flex items-center gap-2.5 ${live?'border-red-200':isHL?'border-teal-300 bg-teal-50/30':'border-slate-200'}`}>
              <span className={`text-[10px] font-bold w-8 text-center py-0.5 rounded flex-shrink-0 ${chipCls}`}>{g.gameNumber}</span>
              <div className="w-[58px] flex-shrink-0 text-center border-r border-slate-100 pr-2">
                <div className="text-[12px] font-semibold text-slate-800">{g.startTime||'TBD'}</div>
                <div className="text-[10px] text-slate-400 truncate">{(g.location||'').split(' - ').pop()||''}</div>
              </div>
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                  <button onClick={()=>toggleFollow(g.team1)} className="flex-shrink-0">{followedTeams.includes(g.team1)?<Star size={12} className="text-amber-500" fill="currentColor"/>:<Star size={12} className="text-slate-300"/>}</button>
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
                  <button onClick={()=>toggleFollow(g.team2)} className="flex-shrink-0">{followedTeams.includes(g.team2)?<Star size={12} className="text-amber-500" fill="currentColor"/>:<Star size={12} className="text-slate-300"/>}</button>
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

      {divTab==='bracket' && (
        <BracketView bracketList={bracketList} scheduledGames={bracketGames}/>
      )}
    </div>
  )
}

// Scoped dark-mode override: recolors the light utility classes used on this page
// when the root carries `.gd-dark`. Keeps the markup untouched; fully reversible.
const GD_DARK_CSS = `
.gd-dark{background:#0b0f17}
.gd-dark .bg-gray-50{background:#0b0f17!important}
.gd-dark .bg-white{background:#111827!important}
.gd-dark .bg-gray-100,.gd-dark .bg-slate-100,.gd-dark .bg-slate-50,.gd-dark .bg-gray-200,.gd-dark .bg-yellow-50{background:#1f2937!important}
.gd-dark .bg-gray-300,.gd-dark .bg-slate-200,.gd-dark .bg-slate-300{background:#374151!important}
.gd-dark .text-gray-900,.gd-dark .text-slate-900,.gd-dark .text-gray-800,.gd-dark .text-slate-800,.gd-dark .text-gray-700,.gd-dark .text-slate-700{color:#f1f5f9!important}
.gd-dark .text-gray-600,.gd-dark .text-slate-600,.gd-dark .text-gray-500,.gd-dark .text-slate-500{color:#cbd5e1!important}
.gd-dark .text-gray-400,.gd-dark .text-slate-400,.gd-dark .text-gray-300,.gd-dark .text-slate-300{color:#94a3b8!important}
.gd-dark .border-slate-200,.gd-dark .border-gray-200,.gd-dark .border-slate-100,.gd-dark .border-gray-100,.gd-dark .border-slate-50,.gd-dark .border-gray-50,.gd-dark .border-slate-300,.gd-dark .border-gray-300{border-color:#1f2937!important}
.gd-dark .divide-slate-100>:not([hidden])~:not([hidden]),.gd-dark .divide-y>:not([hidden])~:not([hidden]),.gd-dark .divide-x>:not([hidden])~:not([hidden]){border-color:#1f2937!important}
.gd-dark .shadow-sm,.gd-dark .shadow-xl{box-shadow:0 1px 0 rgba(255,255,255,0.04)!important}
.gd-dark [class*="bg-amber-50"]{background:rgba(120,53,15,0.30)!important}
.gd-dark input,.gd-dark textarea{background:#1f2937!important;color:#f1f5f9!important}
`

export default function PublicTournamentPage() {
  const {id}=useParams()
  const [tournament,setTournament]=useState<Tournament|null>(null)
  const [logos,setLogos]=useState<Record<string,string>>({})
  const [tiebreakers,setTiebreakers]=useState<string[]>(DEFAULT_TBS)
  const [games,setGames]=useState<Game[]>([])
  const [loading,setLoading]=useState(true)
  const [selectedDiv,setSelectedDiv]=useState<string|null>(null)
  const [followedTeams,setFollowedTeams]=useState<string[]>([])
  const [teamSearch,setTeamSearch]=useState('')
  const [showNotifyModal,setShowNotifyModal]=useState(false)
  const [notifyEmail,setNotifyEmail]=useState('')
  const [notifySent,setNotifySent]=useState(false)
  const [dark,setDark]=useState(false)
  useEffect(()=>{ try{ setDark(localStorage.getItem(`theme-${id}`)==='dark') }catch{} },[id])
  useEffect(()=>{ try{ localStorage.setItem(`theme-${id}`, dark?'dark':'light') }catch{} },[dark,id])

  useEffect(()=>{
    Promise.all([
      fetch(`/api/tournaments/${id}`).then(r=>r.json()),
      fetch(`/api/tournaments/${id}/games`).then(r=>r.json()),
      fetch(`/api/tournaments/${id}/team-logos`).then(r=>r.ok?r.json():{}).catch(()=>({})),
    ]).then(([t,g,lg])=>{setTournament(t);setGames(Array.isArray(g)?g:[]);setLogos(lg||{});try{const o=JSON.parse((t&&t.tiebreakers)||'{}');const pool=Array.isArray(o)?o:(o.pool||[]);if(pool.length)setTiebreakers(pool)}catch{};setLoading(false)})
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
  const allTeamsWithMeta=useMemo(()=>{
    const seen=new Set<string>()
    const teams:{name:string;division:string;pool:string|null}[]=[]
    games.filter(g=>!g.isCanceled).forEach(g=>{
      if(!seen.has(g.team1+g.division)){seen.add(g.team1+g.division);teams.push({name:g.team1,division:g.division,pool:g.pool})}
      if(!seen.has(g.team2+g.division)){seen.add(g.team2+g.division);teams.push({name:g.team2,division:g.division,pool:g.pool})}
    })
    return teams.sort((a,b)=>a.name.localeCompare(b.name))
  },[games])

  const divMeta=useMemo(()=>{
    const meta:Record<string,{teams:number;total:number;completed:number;pools:number;leader:string|null;champion:string|null;lastUpdated:string;status:string}>={}
    divisions.forEach(div=>{
      const divGames=games.filter(g=>g.division===div&&!g.isCanceled)
      const teamSet=new Set<string>(); divGames.forEach(g=>{teamSet.add(g.team1);teamSet.add(g.team2)})
      const poolSet=new Set(divGames.filter(g=>g.pool).map(g=>g.pool))
      const total=divGames.length
      const completed=divGames.filter(g=>g.score1!==null&&g.score2!==null).length
      const champ=divGames.find(g=>g.isChampionship&&g.score1!==null&&g.score2!==null)
      const champion=champ?(champ.score1!>champ.score2!?champ.team1:champ.team2):null
      const hasBracket=divGames.some(g=>g.isChampionship)
      const standings=calcStandings(games,div,undefined,tiebreakers)
      const leader=(!champion&&completed>0&&standings.length>0)?standings[0].team:null
      const scored=[...divGames.filter(g=>g.score1!==null)].sort((a,b)=>`${a.date}${a.startTime}`<`${b.date}${b.startTime}`?-1:1)
      const lastUpdated=scored.length>0?fmtDateTime(scored[scored.length-1].date+' '+scored[scored.length-1].startTime):''
      const status=champion?'Final':hasBracket?'Bracket':'Pool play'
      meta[div]={teams:teamSet.size,total,completed,pools:poolSet.size,leader,champion,lastUpdated,status}
    })
    return meta
  },[games,divisions,tiebreakers])

  const submitNotify = () => {
    if (!notifyEmail) return
    // Store preference locally and show confirmation
    try { localStorage.setItem(`notify-${id}`, JSON.stringify({ email: notifyEmail, teams: followedTeams })) } catch {}
    setNotifySent(true)
  }

  const sportIcon = (() => {
    const s = (tournament?.sport || '').toLowerCase()
    if (s.includes('lacrosse')) return '🥍'
    if (s.includes('football') && s.includes('flag')) return '🏈'
    if (s.includes('football')) return '🏈'
    if (s.includes('soccer')) return '⚽'
    if (s.includes('basketball')) return '🏀'
    if (s.includes('baseball')) return '⚾'
    if (s.includes('softball')) return '🥎'
    if (s.includes('hockey')) return '🏒'
    if (s.includes('volleyball')) return '🏐'
    if (s.includes('rugby')) return '🏉'
    return '🏆'
  })()

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>

  return (
    <LogosContext.Provider value={logos}>
    <div className={`min-h-screen bg-gray-50 ${dark ? 'gd-dark' : ''}`}>
      <style>{GD_DARK_CSS}</style>
      {/* Notification modal */}
      {showNotifyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setShowNotifyModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e=>e.stopPropagation()}>
            {notifySent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">You're all set!</h3>
                <p className="text-sm text-gray-500 mb-4">We'll notify you at <strong>{notifyEmail}</strong> when your teams play.</p>
                <button onClick={()=>{setShowNotifyModal(false);setNotifySent(false)}} className="bg-blue-600 text-white font-semibold text-sm px-6 py-2.5 rounded-lg w-full">Done</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">🔔 Get Notified</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Get score updates for your followed teams</p>
                  </div>
                  <button onClick={()=>setShowNotifyModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                </div>
                {followedTeams.length > 0 && (
                  <div className="mb-4 bg-yellow-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Following {followedTeams.length} team{followedTeams.length!==1?'s':''}:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {followedTeams.map(t=><span key={t} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">⭐ {t}</span>)}
                    </div>
                  </div>
                )}
                {followedTeams.length === 0 && <p className="text-sm text-gray-500 mb-4">Follow some teams first, then sign up for updates.</p>}
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={e=>setNotifyEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-3"
                />
                <button onClick={submitNotify} disabled={!notifyEmail||followedTeams.length===0}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm py-3 rounded-xl transition-colors">
                  Notify Me
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sport header bar */}
      <div className="bg-[#0f1f3d] text-white px-4 py-2.5 flex items-center gap-2">
        <span className="text-sm">{sportIcon}</span>
        <span className="text-xs font-bold uppercase tracking-widest text-gray-300">{tournament?.sport||'Flag Football'}</span>
        <button onClick={()=>setDark(d=>!d)} title="Toggle light / dark" aria-label="Toggle light or dark mode"
          className="ml-auto text-base leading-none hover:opacity-80 transition-opacity">{dark?'☀️':'🌙'}</button>
      </div>

      {/* Tournament card */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-5 flex gap-4 items-start">
          {tournament?.logoUrl ? (
            <img src={tournament.logoUrl} alt="logo" className="w-20 h-20 object-contain rounded-xl border border-gray-100 flex-shrink-0"/>
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-3xl flex-shrink-0">{sportIcon}</div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">{tournament?.name}</h1>
            <p className="text-sm font-semibold text-teal-600 mt-0.5">
              {tournament?.startDate&&fmtDate(tournament.startDate)}{tournament?.endDate&&tournament.endDate!==tournament.startDate&&` - ${fmtDate(tournament.endDate)}`}
            </p>
            <p className="text-sm mt-0.5">
              {tournament?.location ? (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(tournament.location)}`} target="_blank" rel="noopener noreferrer"
                  className="text-gray-500 hover:text-blue-600 hover:underline transition-colors inline-flex items-center gap-1">
                  📍 {tournament.location}
                </a>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link href={`/tournaments/${id}/player-register`} target="_blank"
                className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
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
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                placeholder="Search for a team…"
                className="w-full pl-9 pr-4 py-3 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
              />
              {teamSearch && <button onClick={()=>setTeamSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>}
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
                        <div className="text-xs text-gray-400">{t.division}{t.pool ? ` · Pool ${t.pool}` : ''}</div>
                      </div>
                      <button onClick={()=>toggleFollow(t.name)}
                        className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${followedTeams.includes(t.name) ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700'}`}>
                        {followedTeams.includes(t.name) ? '⭐ Following' : '☆ Follow'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* My Teams section */}
            {followedTeams.length > 0 && !teamSearch && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">⭐ My Teams</h2>
                  <button onClick={()=>setShowNotifyModal(true)}
                    className="text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                    🔔 Get Notified
                  </button>
                </div>
                <div className="space-y-2">
                  {followedTeams.map(team => {
                    const nextGame = games.filter(g=>!g.isCanceled&&(g.team1===team||g.team2===team)).sort((a,b)=>a.date!==b.date?(a.date<b.date?-1:1):a.startTime<b.startTime?-1:1)[0]
                    const teamMeta = allTeamsWithMeta.find(t=>t.name===team)
                    return (
                      <div key={team} className="bg-white border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-3">
                        <TeamAvatar name={team} size="sm" />
                        <div className="flex-1 min-w-0">
                          <button onClick={()=>teamMeta&&setSelectedDiv(teamMeta.division)} className="font-bold text-sm text-gray-800 hover:text-blue-700 hover:underline text-left truncate block">{team}</button>
                          {nextGame ? (
                            <div className="text-xs text-gray-500 mt-0.5">
                              Next: <span className="font-medium">{fmtDate(nextGame.date)} {nextGame.startTime}</span> vs <span className="font-medium">{nextGame.team1===team?nextGame.team2:nextGame.team1}</span> · {nextGame.location}
                            </div>
                          ) : <div className="text-xs text-gray-400">No upcoming games</div>}
                        </div>
                        <button onClick={()=>toggleFollow(team)} className="text-gray-300 hover:text-red-400 text-lg transition-colors" title="Unfollow">✕</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {divisions.length===0 && <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-3">📅</div><p>No games scheduled yet.</p></div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {divisions.map(div=>{
                const m=divMeta[div]
                if(!m) return null
                const pctDone=m.total>0?Math.round(m.completed/m.total*100):0
                const pill=m.status==='Final'?'bg-amber-100 text-amber-800':m.status==='Bracket'?'bg-amber-50 text-amber-700':'bg-teal-50 text-teal-700'
                return (
                  <button key={div} onClick={()=>setSelectedDiv(div)}
                    className="text-left bg-white border border-slate-200 rounded-xl p-3.5 hover:border-teal-300 hover:shadow-sm transition-all group">
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <h3 className="font-semibold text-slate-900 text-sm truncate group-hover:text-teal-700 transition-colors">{div}</h3>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0 ${pill}`}>
                        {m.status==='Final'&&<Trophy size={10}/>}{m.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3.5 mb-3 text-xs text-slate-500 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Users size={13}/><b className="text-slate-800 font-semibold">{m.teams}</b> teams</span>
                      <span className="inline-flex items-center gap-1"><Calendar size={13}/><b className="text-slate-800 font-semibold">{m.total}</b> games</span>
                      {m.pools>0&&<span className="inline-flex items-center gap-1"><LayoutGrid size={13}/><b className="text-slate-800 font-semibold">{m.pools}</b> pool{m.pools!==1?'s':''}</span>}
                    </div>
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
              followedTeams={followedTeams}
              toggleFollow={toggleFollow}
              tournamentId={id as string}
              tiebreakers={tiebreakers}
            />
          </div>
        )}
      </div>
    </div>
    </LogosContext.Provider>
  )
}
