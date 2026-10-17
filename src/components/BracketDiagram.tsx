'use client'
import { createContext, useContext, useState } from 'react'
import { Trophy, Medal, ChevronDown, ChevronUp } from 'lucide-react'
import { teamInitials } from '@/lib/names'

// The bracket drawing from the public event page, shared with the Scheduler's
// bracket pop-over (Bo, Oct 11 2026: "Is there a reason the bracket can't look
// more like the one on the website when I look at the preview in the
// scheduler?"). Same layout either way: games placed from the games that feed
// them, byes lined up with their feeder, connectors, seed chips. The Scheduler
// passes `pick` to make each game clickable and ring the one being placed.

/** Team logos by team name, provided by the page that has them. */
export const LogosContext = createContext<Record<string, string>>({})

/** A scheduled game as the bracket needs it (B# number, teams, when and where). */
export interface BkSchedGame { gameNumber:string; date:string; startTime:string; location:string; team1:string; team2:string; score1?:number|null; score2?:number|null; ifNeeded?:boolean }

/** Click-to-pick for the Scheduler: `selected` and `near` are B# game numbers. */
export interface BkPick { selected?:string; near?:Set<string>; onPick:(gameNumber:string)=>void }

// ── Bracket visual constants ───────────────────────────────────────────────
const BK_H=82, BK_W=220, BK_CONN=48, BK_GAP=14, BK_UNIT=BK_H+BK_GAP
const BK_BAR_H=34, BK_BAR_GAP=10, BK_ROW=132, BK_TOP=22
function bkTop(round:number,idx:number){const sp=BK_UNIT*Math.pow(2,round-1);const fc=BK_H/2+(sp-BK_UNIT)/2;return fc+idx*sp-BK_H/2}
function bkLeft(round:number){return(round-1)*(BK_W+BK_CONN)}
function bkRoundLabel(r:number,max:number){if(r===max)return'Championship';if(r===max-1&&max>=3)return'Semifinals';if(r===max-2&&max>=4)return'Quarterfinals';return`Round ${r}`}
function fmt12bk(t:string){if(!t)return'';const[h,m]=t.split(':').map(Number);return`${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`}
function fmtShortDate(d:string){if(!d)return'';const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
export const isPlaceholderTeam=(n:string)=>/^(seed\s|w-b\d|l-b\d|bracket\b|winner\b|loser\b|tbd$)/i.test((n||'').trim())
// Bracket format before the schedule is out (`preview`): each game is captioned with
// its number, the name the W-B#/L-B# slots refer to, instead of "Not scheduled".
const bkPreviewCap=(num:number,label:string|null,isChamp:boolean)=>`B${num}${label?` · ${label}`:isChamp?' · Championship':''}`

export interface BkBracketGame{gameNumber:number;round:number;section:string;team1Source:string;team2Source:string;label:string|null}
export interface BkBracket{id:string;format:string;teamCount:number;flight?:string;numberOffset?:number;games:BkBracketGame[];seeds:Record<string,string>}

// The Scheduler's click target over one game: rings the picked game, tints its neighbors.
function PickOverlay({pick,num,x,y}:{pick?:BkPick;num:string;x:number;y:number}){
  if(!pick)return null
  const on=pick.selected===num, near=!on&&!!pick.near?.has(num)
  return <button type="button" onClick={()=>pick.onPick(num)} aria-label={`Pick ${num}`} aria-pressed={on}
    style={{position:'absolute',left:x-5,top:y-20,width:BK_W+10,height:2*BK_BAR_H+BK_BAR_GAP+25}}
    className={`rounded-xl transition-colors ${on?'ring-[3px] ring-teal-500 bg-teal-500/10':near?'ring-1 ring-teal-400/70 bg-teal-400/10 hover:bg-teal-400/20':'hover:bg-slate-500/10'}`}/>
}

// ── Both-ways consolation tournament (mirror) ──────────────────────────────
function MirrorBracket({bracket,scheduledGames,showFlight,preview=false,pick}:{bracket:BkBracket;scheduledGames:BkSchedGame[];showFlight:boolean;preview?:boolean;pick?:BkPick}){
  const logos=useContext(LogosContext)
  const [zoom,setZoom]=useState(1)
  const offset=bracket.numberOffset??0
  const schedByNum=new Map(scheduledGames.map(g=>[g.gameNumber,g]))
  function TeamAv({name,isTbd}:{name:string;isTbd:boolean}){
    const sz='w-7 h-7'
    if(!isTbd&&logos[name])return<div className={`${sz} rounded-full overflow-hidden bg-white border border-slate-200 flex-shrink-0`}><img src={logos[name]} alt="" className="w-full h-full object-contain"/></div>
    if(isTbd)return<div className={`${sz} rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0`}><span className="text-gray-300 text-[9px]">?</span></div>
    const initials=teamInitials(name)
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
            const cap=preview?bkPreviewCap(g.gameNumber+offset,g.label,isChamp):(sg?.ifNeeded?'If needed · ':'')+(hasSched?`${fmtShortDate(sg!.date)} ${fmt12bk(sg!.startTime)} · ${(sg!.location||'').split(' - ').pop()||sg!.location}`:(g.label||(isChamp?'Championship':'Not scheduled')))
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
                <PickOverlay pick={pick} num={sgNum} x={pos.x} y={pos.y}/>
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
              return(<div key={g.gameNumber} onClick={pick?()=>pick.onPick(sgNum):undefined} role={pick?'button':undefined} className={`bg-white rounded-xl border overflow-hidden shadow-sm ${pick?'cursor-pointer':''} ${pick?.selected===sgNum?'border-teal-500 ring-[3px] ring-teal-500':'border-gray-200'}`} style={{width:BK_W}}>
                <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{g.label||'Placement'}</div>
                {[{r:t1,sc:sg?.score1,w:t1w},{r:t2,sc:sg?.score2,w:t2w}].map((x,i)=>(<div key={i} className={`flex items-center gap-2 px-3 py-2 ${i===0?'border-b border-gray-100':''} ${x.w?'bg-blue-50':''}`}><TeamAv name={x.r.name} isTbd={x.r.isTbd}/><span className={`flex-1 text-[12px] truncate ${x.r.isTbd?'text-gray-400 italic':x.w?'font-bold text-gray-900':'text-gray-700'}`}>{x.r.name}</span>{!x.r.isTbd&&hasScore&&<span className={`text-[13px] font-bold ${x.w?'text-blue-600':'text-gray-400'}`}>{x.sc}</span>}</div>))}
              </div>)})}
          </div>
        </div>
      )}
    </div>
  )
}

export function BracketView({bracketList,scheduledGames,preview=false,poolOnly=false,pick,consOpen=false}:{bracketList:BkBracket[];scheduledGames:BkSchedGame[];preview?:boolean;poolOnly?:boolean;pick?:BkPick;consOpen?:boolean}){
  const [showCons,setShowCons]=useState(consOpen)
  const logos=useContext(LogosContext)

  function TeamAv({name,isTbd}:{name:string;isTbd:boolean}){
    const sz='w-7 h-7'
    if(!isTbd&&logos[name])return<div className={`${sz} rounded-full overflow-hidden bg-white border border-slate-200 flex-shrink-0`}><img src={logos[name]} alt="" className="w-full h-full object-contain"/></div>
    if(isTbd)return<div className={`${sz} rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0`}><span className="text-gray-300 text-[9px]">?</span></div>
    const initials=teamInitials(name)
    const colors=['#1a3a5c','#8b1a1a','#1a5c3a','#5c3a1a','#3a1a5c','#1a5c5c','#5c1a4a','#2a4a1a']
    const idx=name.split('').reduce((a:number,c:string)=>a+c.charCodeAt(0),0)%colors.length
    return<div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-[9px]`} style={{backgroundColor:colors[idx]}}>{initials}</div>
  }

  if(bracketList.length===0)return(
    <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
      <div className="flex justify-center mb-2"><Trophy size={30} className="text-slate-300"/></div>
      <p className="font-medium">{poolOnly?'Pool play only: this division has no bracket.':'Bracket games will appear here once pool play concludes.'}</p>
    </div>
  )

  return(
    <div className="space-y-6">
      {bracketList.map(bracket=>{
        if(bracket.format==='2gg'&&bracket.games.some(g=>(g.label||'').toLowerCase().includes('consolation championship')))return <MirrorBracket key={bracket.id} bracket={bracket} scheduledGames={scheduledGames} showFlight={bracketList.length>1} preview={preview} pick={pick}/>
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
            {!preview&&!pick&&<div className="flex items-center gap-2 mb-3">
              <div className="flex gap-1">
                {Array.from({length:totalRounds},(_,i)=>(
                  <div key={i} className={`h-1.5 w-8 rounded-full ${i<roundsDone?'bg-blue-500':'bg-gray-200'}`}/>
                ))}
              </div>
              <span className="text-xs text-gray-500">{roundsDone} of {totalRounds} {totalRounds===1?'round':'rounds'} complete</span>
            </div>}

            {/* Bracket canvas. The round labels scroll with it: outside the scroller
                they ran past the page edge on a phone and the whole page slid sideways. */}
            <div style={{overflowX:'auto',paddingBottom:8}}>
              <div style={{position:'relative',height:18,width:canvasW,marginBottom:6}}>
                {[...roundGroups.keys()].map(r=>(
                  <div key={r} style={{position:'absolute',left:bkLeft(r),width:BK_W,textAlign:'center'}}
                    className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                    {bkRoundLabel(r,maxRound)}
                  </div>
                ))}
              </div>
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
                  const cap=preview?bkPreviewCap(bg.gameNumber+offset,bg.label,isChamp):hasSched?`${fmtShortDate(sg!.date)} ${fmt12bk(sg!.startTime)} · ${(sg!.location||'').split(' - ').pop()||sg!.location}`:(isChamp?(bg.label||'Championship'):'Not scheduled')
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
                      <PickOverlay pick={pick} num={sgNum} x={pos.x} y={pos.y}/>
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
                  <span>{showCons?<ChevronUp size={13}/>:<ChevronDown size={13}/>}</span>
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
                        <div key={bg.gameNumber} onClick={pick?()=>pick.onPick(sgNum):undefined} role={pick?'button':undefined}
                          className={`bg-white rounded-xl border overflow-hidden shadow-sm ${pick?'cursor-pointer hover:shadow-md':''} ${pick?.selected===sgNum?'border-teal-500 ring-[3px] ring-teal-500':pick?.near?.has(sgNum)?'border-teal-400 ring-1 ring-teal-400/70':'border-gray-200'}`} style={{width:BK_W}}>
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
                            <span className="text-[10px] text-gray-500 truncate">{sg&&(sg.date||sg.location)?`${fmtShortDate(sg.date)}${sg.startTime?` ${fmt12bk(sg.startTime)}`:''} · ${(sg.location||'').split(' - ').pop()||sg.location}`:preview?bkPreviewCap(bg.gameNumber+offset,bg.label,false):bg.label||'Not scheduled'}</span>
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
