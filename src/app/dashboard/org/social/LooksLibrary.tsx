'use client'
// The Looks library (Bo, Oct 18 2026: "we're probably gonna need to build some sort of
// folder and preview area"): every post look in folders (Favorites, Everyday, Fall,
// Christmas, Siblings), each previewed on a real cleared player. Star a look to put it in
// Favorites, which lead every look menu on the scheduler; Post or Reel opens it for that
// player right away.
import { useMemo, useState } from 'react'
import { X, Star, Image as ImageIcon, Film, Users } from 'lucide-react'
import { LIBRARY_STYLES, LOOK_FOLDERS, seasonOf, type LookFolder } from '@/lib/socialPosts'
import { firstOf, teamLabel, type ClearedPlayer } from '@/lib/playerPostText'
import { postPngUrl } from './playerMedia'

type Tab = 'favorites' | LookFolder

export default function LooksLibrary({ players, favorites, onToggleFavorite, onPost, onReel, onClose }: {
  players: ClearedPlayer[]
  favorites: string[]
  onToggleFavorite: (id: string) => void
  onPost: (p: ClearedPlayer, look: string) => void
  onReel: (p: ClearedPlayer, look: string) => void
  onClose: () => void
}) {
  // Preview on a player with a photo; one with linked siblings if there is one, so the
  // Siblings folder has something to show.
  const [pid, setPid] = useState(() => (players.find(p => p.siblings) || players[0])?.id || '')
  const p = players.find(x => x.id === pid) || players[0]
  const season = p ? seasonOf(p.event.name, p.event.start) : ''
  const [tab, setTab] = useState<Tab>(season || 'everyday')
  const [big, setBig] = useState('')
  const counts = useMemo(() => Object.fromEntries(LOOK_FOLDERS.map(f => [f.id, LIBRARY_STYLES.filter(s => s.folder === f.id).length])), [])
  const looks = tab === 'favorites'
    ? favorites.map(id => LIBRARY_STYLES.find(s => s.id === id)).filter((s): s is (typeof LIBRARY_STYLES)[number] => !!s)
    : LIBRARY_STYLES.filter(s => s.folder === tab)
  const sibNeeded = (folder: LookFolder) => folder === 'siblings' && !p?.siblings
  const tabBtn = (id: Tab, label: string, n: number) => (
    <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap border ${tab === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}>
      {id === 'favorites' && <Star size={11} className="inline -mt-0.5 mr-1" fill="currentColor" />}{label} <span className="opacity-60 font-semibold">{n}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/70 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Looks library" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-slate-200">
          <h2 className="font-extrabold text-slate-900">Looks library</h2>
          {players.length ? (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold">Preview on</span>
              <select value={pid} onChange={e => setPid(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold bg-white max-w-[240px]">
                {players.map(x => <option key={x.id} value={x.id}>{x.playerName}{x.siblings ? ' · siblings' : ''} · {x.event.name}</option>)}
              </select>
            </label>
          ) : <span className="text-xs text-slate-500">Previews show once a family says yes.</span>}
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto h-9 w-9 rounded-lg border border-slate-300 grid place-items-center text-slate-500 hover:text-slate-900"><X size={16} /></button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap px-4 py-2.5 border-b border-slate-100">
          {tabBtn('favorites', 'Favorites', favorites.length)}
          {LOOK_FOLDERS.map(f => tabBtn(f.id, f.label + (f.id === season ? ' · this event' : ''), counts[f.id] || 0))}
          <span className="text-[11px] text-slate-500 ml-1">Star a look to put it first in every look menu.</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!p ? <p className="text-sm text-slate-500 text-center py-10">No cleared players yet. Looks preview on a real player once a family says yes.</p>
            : tab !== 'favorites' && sibNeeded(tab) ? (
              <div className="text-sm text-slate-600 text-center py-10 flex flex-col items-center gap-2"><Users size={22} className="text-indigo-500" /><p className="max-w-md">Link siblings in Cleared to post (tick them, then <b>Link as siblings</b>), then pick one of them above to preview these.</p></div>
            ) : !looks.length ? <p className="text-sm text-slate-500 text-center py-10">No favorites yet. Star looks in the other folders.</p> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {looks.map(s => {
                  const fav = favorites.includes(s.id)
                  const blocked = s.folder === 'siblings' && !p.siblings
                  return (
                    <div key={s.id} className="rounded-xl border border-slate-200 overflow-hidden flex flex-col bg-slate-50">
                      <div className="relative aspect-[4/5] bg-slate-900">
                        {blocked ? <div className="absolute inset-0 grid place-items-center text-xs text-slate-300 p-3 text-center">Needs linked siblings</div> : (
                          <button type="button" onClick={() => setBig(s.id)} className="absolute inset-0" aria-label={`See ${s.label} bigger`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={postPngUrl(p.token, s.id, null, 360)} alt={`${s.label} on ${firstOf(p.playerName)}`} loading="lazy" className="w-full h-full object-cover" />
                          </button>
                        )}
                        <button type="button" onClick={() => onToggleFavorite(s.id)} aria-pressed={fav} aria-label={fav ? `Unstar ${s.label}` : `Star ${s.label}`}
                          className={`absolute top-2 right-2 h-8 w-8 rounded-full grid place-items-center shadow ${fav ? 'bg-amber-400 text-white' : 'bg-white/90 text-slate-500 hover:text-amber-500'}`}>
                          <Star size={15} fill={fav ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                      <div className="p-2.5 flex flex-col gap-1.5">
                        <div className="text-sm font-extrabold truncate">{s.label}</div>
                        <div className="text-[11px] text-slate-500">{LOOK_FOLDERS.find(f => f.id === s.folder)?.label}</div>
                        <div className="grid grid-cols-2 gap-1">
                          <button type="button" disabled={blocked} onClick={() => onPost(p, s.id)} className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold py-1.5 inline-flex items-center justify-center gap-1 disabled:opacity-40"><ImageIcon size={12} />Post</button>
                          <button type="button" disabled={blocked} onClick={() => onReel(p, s.id)} className="rounded-lg border border-slate-300 bg-white hover:border-teal-400 text-[11px] font-bold py-1.5 inline-flex items-center justify-center gap-1 disabled:opacity-40"><Film size={12} />Reel</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>
        {p && <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500">Previewing on {firstOf(p.playerName)} · {teamLabel(p)} · {p.event.name}. Post and Reel open it for {firstOf(p.playerName)}.</div>}
      </div>
      {big && p && (
        <div className="fixed inset-0 z-[60] bg-slate-900/85 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); setBig('') }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={postPngUrl(p.token, big, null, 720)} alt="" className="max-h-[90vh] max-w-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  )
}
