'use client'
// "Cleared to post" — players whose family said Yes on the photo-permission page,
// right on the social scheduler (Bo, Oct 18 2026: "put the yes's on the social
// scheduler as potential posts ... just a few clicks to post a reel or add to story").
// Each card opens Compose already filled in (the page does the work: see
// composePlayer / reelPlayer / planAll in page.tsx). Data: /api/social/players.
import { useState } from 'react'
import Link from 'next/link'
import { Film, Image as ImageIcon, Smartphone, Sparkles, Check, Users } from 'lucide-react'
import { POST_STYLES, FAVORITE_STYLES } from '@/lib/socialPosts'
import { lookFor, teamLabel, type ClearedPlayer } from '@/lib/playerPostText'
import { postPngUrl } from './playerMedia'

export type ClearedData = { players: ClearedPlayer[]; waiting: number; passOn: boolean }

/** What "Plan all" would make: one post per cleared player at an upcoming event who
 *  has nothing scheduled yet, and a Roll Call carousel per event with 3+ cleared
 *  players and no Roll Call yet. */
export function planList(players: ClearedPlayer[]): { posts: ClearedPlayer[]; rollcalls: ClearedPlayer[][] } {
  const live = players.filter(p => (p.event.daysOut ?? 0) >= 1)
  const posts = live.filter(p => !p.posts.length)
  const byEvent: Record<string, ClearedPlayer[]> = {}
  for (const p of live) (byEvent[p.tournamentId] ||= []).push(p)
  const rollcalls = Object.values(byEvent).filter(list => list.length >= 3 && !list.some(p => p.posts.some(x => x.kind === 'rollcall')))
  return { posts, rollcalls }
}

// Bo's favorites first, then the rest.
const FAVS = FAVORITE_STYLES.map(id => POST_STYLES.find(s => s.id === id)).filter((s): s is (typeof POST_STYLES)[number] => !!s)
const MORE = POST_STYLES.filter(s => !FAVORITE_STYLES.includes(s.id))
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const STATUS: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', publishing: 'Publishing', published: 'Posted', failed: 'Failed' }
const KIND: Record<string, string> = { post: 'Post', reel: 'Reel', story: 'Story', rollcall: 'Roll Call' }

export default function PlayersTray({ data, canPost, busy, onPost, onReel, onStory, onPlanAll }: {
  data: ClearedData; canPost: boolean; busy: string
  onPost: (p: ClearedPlayer, look: string) => void
  onReel: (p: ClearedPlayer, look: string) => void
  onStory: (p: ClearedPlayer, look: string) => void
  onPlanAll: () => void
}) {
  const [looks, setLooks] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState(false)
  if (!data.passOn) return null
  const { players, waiting } = data
  if (!players.length && !waiting) return null
  const plan = planList(players)
  const planN = plan.posts.length + plan.rollcalls.length
  // Not-yet-posted first, so the next one to feature is always at the front.
  const list = [...players].sort((a, b) => (a.posts.length ? 1 : 0) - (b.posts.length ? 1 : 0))
  const events = Array.from(new Map(players.map(p => [p.tournamentId, p.event])).entries())
  const lookOf = (p: ClearedPlayer) => looks[p.id] || lookFor(p.event.daysOut, 0)

  if (!players.length) return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 flex items-center gap-2 flex-wrap">
      <Users size={15} className="text-teal-600" />
      <span><b>Cleared to post</b> · {waiting} famil{waiting === 1 ? 'y is' : 'ies are'} still deciding. Players show up here the minute a family says yes.</span>
    </div>
  )

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-sm inline-flex items-center gap-1.5"><Users size={15} className="text-teal-600" /> Cleared to post</span>
          <span className="rounded-full bg-teal-50 text-teal-800 text-xs font-bold px-2.5 py-0.5">{players.length} yes{players.length === 1 ? '' : 'es'}</span>
          {waiting > 0 && <span className="rounded-full bg-amber-50 text-amber-800 text-xs font-bold px-2.5 py-0.5">{waiting} still deciding</span>}
          {events.map(([tid, e]) => <Link key={tid} href={`/tournaments/${tid}/player-waivers/social`} className="text-xs font-bold text-teal-700 hover:underline">{e.name}{e.daysOut != null && e.daysOut > 0 ? ` · in ${e.daysOut} day${e.daysOut === 1 ? '' : 's'}` : e.daysOut === 0 ? ' · today' : ''} ›</Link>)}
        </div>
        {busy ? <span className="text-xs font-bold text-teal-700 animate-pulse">{busy}</span>
          : confirm ? (
            <span className="inline-flex items-center gap-2 text-xs flex-wrap">
              <span className="text-slate-700 font-bold">Make {plan.posts.length} player post{plan.posts.length === 1 ? '' : 's'}{plan.rollcalls.length ? ` + ${plan.rollcalls.length} Roll Call` : ''} as drafts on open days? Nothing posts until you approve.</span>
              <button onClick={() => { setConfirm(false); onPlanAll() }} className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5">Make drafts</button>
              <button onClick={() => setConfirm(false)} className="text-slate-500 font-bold px-2">Cancel</button>
            </span>
          ) : <button onClick={() => setConfirm(true)} disabled={!canPost || !planN} title={!canPost ? 'Connect an account first' : !planN ? 'Every cleared player already has a post' : ''} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-3 py-2 disabled:opacity-40"><Sparkles size={13} /> Plan all cleared players</button>}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {list.map(p => {
          const look = lookOf(p)
          const last = p.posts[p.posts.length - 1]
          const handles = [p.instagram, p.clubInstagram].filter(Boolean)
          return (
            <div key={p.id} className={`snap-start flex-none w-[200px] rounded-xl border overflow-hidden flex flex-col ${p.posts.length ? 'border-slate-200 bg-slate-50' : 'border-teal-200 bg-white'}`}>
              <div className="relative aspect-[4/5] bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={postPngUrl(p.token, look, null, 360)} alt={`${p.playerName}, ${look} post`} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                {p.posts.length > 0 && <span className="absolute top-2 left-2 rounded-md bg-white/90 text-slate-800 text-[10px] font-extrabold px-1.5 py-0.5 inline-flex items-center gap-1"><Check size={10} />{STATUS[last.status] || 'Planned'}</span>}
              </div>
              <div className="p-2.5 flex flex-col gap-0.5 min-w-0">
                <div className="text-sm font-extrabold truncate">{p.playerName}{p.jersey ? ` #${p.jersey}` : ''}</div>
                <div className="text-[11px] text-slate-500 truncate" title={teamLabel(p)}>{teamLabel(p)}</div>
                <div className="text-[11px] font-semibold text-teal-700 truncate" title={handles.join(' · ')}>{handles.length ? `Collab ${handles.join(' · ')}` : 'No Instagram given'}</div>
                <div className="text-[11px] text-slate-500 truncate">{p.posts.length ? `${KIND[last.kind] || 'Post'} · ${STATUS[last.status] || ''} ${fmtDay(last.scheduledFor)}${p.posts.length > 1 ? ` · +${p.posts.length - 1}` : ''}` : 'Not posted yet'}</div>
                <select value={look} onChange={e => setLooks({ ...looks, [p.id]: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700" aria-label="Look">
                  <optgroup label="Favorites">{FAVS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
                  <optgroup label="More looks">{MORE.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-1 px-2.5 pb-2.5 mt-auto">
                <button onClick={() => onPost(p, look)} disabled={!canPost || !!busy} title="Feed post + Story, filled in" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold py-1.5 inline-flex items-center justify-center gap-1 disabled:opacity-40"><ImageIcon size={12} />Post</button>
                <button onClick={() => onReel(p, look)} disabled={!canPost || !!busy} title="Reel: 8, 15 or 30 seconds" className="rounded-lg border border-slate-300 bg-white hover:border-teal-400 text-[11px] font-bold py-1.5 inline-flex items-center justify-center gap-1 disabled:opacity-40"><Film size={12} />Reel</button>
                <button onClick={() => onStory(p, look)} disabled={!canPost || !!busy} title="Story only (9:16)" className="rounded-lg border border-slate-300 bg-white hover:border-teal-400 text-[11px] font-bold py-1.5 inline-flex items-center justify-center gap-1 disabled:opacity-40"><Smartphone size={12} />Story</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
