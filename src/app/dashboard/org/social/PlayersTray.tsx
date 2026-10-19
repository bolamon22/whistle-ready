'use client'
// "Cleared to post" — players whose family said Yes on the photo-permission page,
// right on the social scheduler (Bo, Oct 18 2026: "put the yes's on the social
// scheduler as potential posts ... just a few clicks to post a reel or add to story").
// Each card opens Compose already filled in (the page does the work: see
// composePlayer / reelPlayer / squadReel / planAll in page.tsx). Data: /api/social/players.
//
// With dozens of yeses (Bo: "we're going to need some sort of a way to filter teams,
// divisions, boys and girls ... group them as we go ... a separate screen to view them
// all"), the tray has filters and a grouping, shows the first dozen in a strip, and
// "See all" opens every match full screen, grouped. Filters, looks and the Squad picks
// are shared between the strip and the full view.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Film, Image as ImageIcon, Smartphone, Sparkles, Check, Users, X, Search, Maximize2, ChevronDown, ExternalLink } from 'lucide-react'
import { POST_STYLES, FAVORITE_STYLES, SIBLING_STYLE, SIBLING_POSTER } from '@/lib/socialPosts'
import { lookFor, teamLabel, firstOf, type ClearedPlayer } from '@/lib/playerPostText'
import { postPngUrl } from './playerMedia'

export type ClearedData = { players: ClearedPlayer[]; waiting: number; passOn: boolean }
/** A Reel maker's settings saved to finish later (api/social/reel-drafts). */
export type ReelDraft = { id: string; label: string; savedAt: string; playerIds: string[]; look: string; looks?: string[]; setup: Record<string, unknown> }

/** What "Plan" would make for these players: one post per cleared player at an upcoming
 *  event who has nothing scheduled yet, and a Roll Call carousel per event with 3+
 *  cleared players and no Roll Call yet. */
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
const STRIP = 12
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const LOOK_LABEL: Record<string, string> = { ...Object.fromEntries(POST_STYLES.map(s => [s.id, s.label])), siblings: 'Siblings', 'siblings-poster': 'Siblings · Movie poster' }
const PLAT: Record<string, string> = { instagram: 'IG', facebook: 'FB' }
const posted = (p: ClearedPlayer) => p.posts.filter(x => x.status === 'published').length

type GroupBy = 'none' | 'club' | 'division' | 'team' | 'gender'
type Filters = { q: string; event: string; gender: '' | 'boys' | 'girls'; division: string; club: string; status: '' | 'todo' | 'done'; ig: boolean; groupBy: GroupBy }
const NO_FILTERS: Filters = { q: '', event: '', gender: '', division: '', club: '', status: '', ig: false, groupBy: 'none' }
const groupKey = (p: ClearedPlayer, g: GroupBy) => g === 'club' ? p.club || 'No club' : g === 'division' ? p.division || 'Division not set' : g === 'team' ? teamLabel(p) || 'No team' : g === 'gender' ? (p.gender === 'girls' ? 'Girls' : p.gender === 'boys' ? 'Boys' : 'Not set') : ''
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${on ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-300 bg-white text-slate-500 hover:text-slate-900'}`
const sel_ = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 max-w-[200px]'

export default function PlayersTray({ data, canPost, busy, onPost, onReel, onStory, onSquad, onPlanAll, drafts = [], onOpenDraft, onDeleteDraft, onLinkSiblings, onUnlinkSibling }: {
  data: ClearedData; canPost: boolean; busy: string
  /** Reels saved to finish later, reopened in the Reel maker where they left off. */
  drafts?: ReelDraft[]; onOpenDraft?: (d: ReelDraft) => void; onDeleteDraft?: (id: string) => void
  onPost: (p: ClearedPlayer, look: string) => void
  onReel: (p: ClearedPlayer, look: string) => void
  onStory: (p: ClearedPlayer, look: string) => void
  /** Squad Reel: 2–4 ticked players from one event, each in their card's look. */
  onSquad: (players: ClearedPlayer[], looks: string[]) => void
  /** Plan drafts for these players (the ones the filters show). */
  onPlanAll: (players: ClearedPlayer[]) => void
  /** Link 2–4 players as siblings ('' = title from their genders), or take one out. */
  onLinkSiblings?: (ids: string[], rel: string) => Promise<void>
  onUnlinkSibling?: (id: string) => Promise<void>
}) {
  const [looks, setLooks] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState(false)
  const [sel, setSel] = useState<string[]>([])   // ticked for a Squad Reel, in the order ticked
  const [f, setF] = useState<Filters>(NO_FILTERS)
  const [full, setFull] = useState(false)
  const [logOpen, setLogOpen] = useState<string | null>(null)
  const [sibRel, setSibRel] = useState('')
  const [linking, setLinking] = useState(false)
  const link = async (ids: string[], rel: string) => { if (!onLinkSiblings || linking) return; setLinking(true); try { await onLinkSiblings(ids, rel); setSel([]) } finally { setLinking(false) } }
  const draftIds = useMemo(() => new Set(drafts.flatMap(d => d.playerIds)), [drafts])   // the card whose usage log is open
  const set = (patch: Partial<Filters>) => setF(x => ({ ...x, ...patch }))
  const { players, waiting } = data

  // Options come from the players in the chosen event (and gender), so a division that
  // doesn't exist for girls isn't offered when Girls is on.
  const scope = useMemo(() => players.filter(p => (!f.event || p.tournamentId === f.event) && (!f.gender || p.gender === f.gender)), [players, f.event, f.gender])
  const divisions = useMemo(() => uniq(scope.map(p => p.division)), [scope])
  const clubs = useMemo(() => uniq(scope.map(p => p.club)), [scope])
  const events = useMemo(() => Array.from(new Map(players.map(p => [p.tournamentId, p.event])).entries()), [players])
  const hasGender = players.some(p => p.gender)

  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return scope.filter(p => (!f.division || p.division === f.division) && (!f.club || p.club === f.club)
      && (!f.status || (f.status === 'todo' ? !p.posts.length : p.posts.length > 0))
      && (!f.ig || !!p.instagram)
      && (!q || `${p.playerName} ${p.club} ${p.team} ${p.division} ${p.jersey} ${p.instagram}`.toLowerCase().includes(q)))
      // Least used first (never used at the front), so the next one to feature leads
      // and nobody gets featured twice while others wait.
      .sort((a, b) => a.posts.length - b.posts.length || posted(a) - posted(b))
  }, [scope, f])
  const groups = useMemo(() => {
    if (f.groupBy === 'none') return [{ key: '', list: shown }]
    const m = new Map<string, ClearedPlayer[]>()
    for (const p of shown) { const k = groupKey(p, f.groupBy); m.set(k, [...(m.get(k) || []), p]) }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], undefined, { numeric: true })).map(([key, list]) => ({ key, list }))
  }, [shown, f.groupBy])
  const filtered = JSON.stringify({ ...f, groupBy: 'none' }) !== JSON.stringify({ ...NO_FILTERS, groupBy: 'none' })

  if (!data.passOn) return null
  if (!players.length && !waiting) return null
  if (!players.length) return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 flex items-center gap-2 flex-wrap">
      <Users size={15} className="text-teal-600" />
      <span><b>Cleared to post</b> · {waiting} famil{waiting === 1 ? 'y is' : 'ies are'} still deciding. Players show up here the minute a family says yes.</span>
    </div>
  )

  const plan = planList(shown)
  const planN = plan.posts.length + plan.rollcalls.length
  const lookOf = (p: ClearedPlayer) => looks[p.id] || lookFor(p.event.daysOut, 0)
  const picked = sel.map(id => players.find(p => p.id === id)).filter((p): p is ClearedPlayer => !!p)
  const sameEvent = new Set(picked.map(p => p.tournamentId)).size <= 1
  const squadOk = picked.length >= 2 && picked.length <= 4 && sameEvent
  const toggle = (id: string, on: boolean) => setSel(s => on ? (s.includes(id) ? s : [...s, id]) : s.filter(x => x !== id))
  /** A group's header button: tick up to 4 of its players not posted yet. */
  const squadFromGroup = (list: ClearedPlayer[]) => setSel(list.filter(p => !p.posts.length).concat(list.filter(p => p.posts.length > 0)).slice(0, 4).map(p => p.id))

  const card = (p: ClearedPlayer, wide = false) => {
    const look = lookOf(p)
    const last = p.posts[p.posts.length - 1]
    const handles = [p.instagram, p.clubInstagram].filter(Boolean)
    return (
      <div key={p.id} className={`${wide ? '' : 'snap-start flex-none w-[190px]'} rounded-xl border overflow-hidden flex flex-col ${sel.includes(p.id) ? 'border-pink-400 ring-2 ring-pink-200' : p.posts.length ? 'border-slate-200 bg-slate-50' : 'border-teal-200 bg-white'}`}>
        <div className="relative aspect-[4/5] bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={postPngUrl(p.token, look, null, 360)} alt={`${p.playerName}, ${look} post`} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          {p.posts.length > 0 && (posted(p) > 0
            ? <span className="absolute top-2 left-2 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 inline-flex items-center gap-1" title={`Went out ${posted(p)} time${posted(p) === 1 ? '' : 's'}`}><Check size={10} />Posted {posted(p)}×</span>
            : <span className="absolute top-2 left-2 rounded-md bg-white/90 text-slate-800 text-[10px] font-extrabold px-1.5 py-0.5 inline-flex items-center gap-1"><Check size={10} />{STATUS[last.status] || 'Planned'}</span>)}
          <label className="absolute top-2 right-2 rounded-md bg-white/90 text-slate-800 text-[10px] font-extrabold px-1.5 py-0.5 inline-flex items-center gap-1 cursor-pointer" title="Add to a Squad Reel">
            <input type="checkbox" checked={sel.includes(p.id)} onChange={e => toggle(p.id, e.target.checked)} className="accent-pink-600" /> Squad
          </label>
        </div>
        <div className="p-2.5 flex flex-col gap-0.5 min-w-0">
          <div className="text-sm font-extrabold truncate">{p.playerName}{p.jersey ? ` #${p.jersey}` : ''}</div>
          <div className="text-[11px] text-slate-500 truncate" title={teamLabel(p)}>{teamLabel(p)}</div>
          {(p.division || p.gender) && <div className="text-[11px] text-slate-500 truncate">{[p.division, !p.division && p.gender ? (p.gender === 'girls' ? 'Girls' : 'Boys') : ''].filter(Boolean).join(' · ')}</div>}
          <div className="text-[11px] font-semibold text-teal-700 truncate" title={handles.join(' · ')}>{handles.length ? `Collab ${handles.join(' · ')}` : 'No Instagram given'}</div>
          {p.siblings && (
            <div className="text-[11px] font-bold text-indigo-700 flex items-center gap-1 min-w-0">
              <Users size={11} className="shrink-0" />
              <span className="truncate" title={`${p.siblings.title.toLowerCase()}: ${p.siblings.names.join(', ')}`}>{p.siblings.title.charAt(0) + p.siblings.title.slice(1).toLowerCase()} · {p.siblings.names.filter((_, i) => p.siblings!.ids[i] !== p.id).join(', ')}</span>
              <button type="button" onClick={() => { const ids = p.siblings!.ids; const list = ids.map(id => players.find(x => x.id === id)).filter((x): x is ClearedPlayer => !!x); onSquad(list, list.map(() => SIBLING_STYLE)) }} disabled={!canPost || !!busy} className="shrink-0 text-pink-700 hover:underline disabled:opacity-40" title="Squad Reel of the siblings, each in the Siblings look">Reel</button>
              {onUnlinkSibling && <button type="button" onClick={() => onUnlinkSibling(p.id)} className="shrink-0 text-slate-400 hover:text-rose-700" aria-label={`Unlink ${p.playerName} from the siblings`} title="Not siblings? Unlink"><X size={11} /></button>}
            </div>
          )}
          {!p.siblings && p.maybeSiblings?.length && onLinkSiblings ? (
            <div className="text-[11px] text-indigo-700 flex items-center gap-1 min-w-0">
              <span className="truncate">Sibling of {p.maybeSiblings.map(id => firstOf(players.find(x => x.id === id)?.playerName || '')).filter(Boolean).join(', ')}?</span>
              <button type="button" onClick={() => link([p.id, ...p.maybeSiblings!].slice(0, 4), '')} disabled={linking} className="shrink-0 font-bold hover:underline disabled:opacity-40">Link</button>
            </div>
          ) : null}
          {draftIds.has(p.id) && <div className="text-[11px] font-bold text-pink-700 truncate inline-flex items-center gap-1"><Film size={11} />Reel draft saved · Reel opens it</div>}
          {p.posts.length ? (
            <button type="button" onClick={() => setLogOpen(o => o === p.id ? null : p.id)} aria-expanded={logOpen === p.id} title="Every post this player is in"
              className="text-left text-[11px] font-semibold text-slate-700 hover:text-teal-700 inline-flex items-center gap-1 min-w-0">
              <span className="truncate">Used {p.posts.length}×{posted(p) && posted(p) < p.posts.length ? ` · ${posted(p)} posted` : ` · ${shortDay(last.scheduledFor)}`}</span>
              <ChevronDown size={12} className={`shrink-0 transition-transform ${logOpen === p.id ? 'rotate-180' : ''}`} />
            </button>
          ) : <div className="text-[11px] text-slate-500 truncate">Not used yet</div>}
          {logOpen === p.id && p.posts.length > 0 && (
            // The usage log, newest first: what it was, which look, where it went, when.
            <ol className="mt-1 mb-0.5 rounded-lg bg-white border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
              {p.posts.slice().reverse().map(x => (
                <li key={x.postId} className="px-2 py-1.5 text-[11px] leading-tight">
                  <div className="font-bold text-slate-800 truncate">{KIND[x.kind] || 'Post'}{x.story && x.kind !== 'story' ? ' + Story' : ''} · {LOOK_LABEL[x.style] || x.style}</div>
                  <div className="text-slate-500 flex items-center gap-1">
                    <span className={x.status === 'published' ? 'text-emerald-700 font-semibold' : x.status === 'failed' ? 'text-rose-700 font-semibold' : ''}>{STATUS[x.status] || x.status}</span>
                    <span className="truncate">{shortDay(x.scheduledFor)}{x.platforms?.length ? ` · ${x.platforms.map(k => PLAT[k] || k).join(' + ')}` : ''}</span>
                    {x.permalink && <a href={x.permalink} target="_blank" rel="noreferrer" className="ml-auto shrink-0 text-teal-700 hover:underline inline-flex items-center gap-0.5">View<ExternalLink size={10} /></a>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <select value={look} onChange={e => setLooks({ ...looks, [p.id]: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700" aria-label="Look">
            {p.siblings && <optgroup label={`Siblings · ${p.siblings.title.charAt(0) + p.siblings.title.slice(1).toLowerCase()}`}>
              <option value={SIBLING_POSTER}>Movie poster · {p.siblings.title.startsWith('BROTHER &') ? '' : 'The '}{p.siblings.title.toLowerCase()} take on {p.event.name || 'the event'}</option>
              <option value={SIBLING_STYLE}>Card set · one card each</option>
            </optgroup>}
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
  }

  const filterBar = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="relative"><Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" /><input value={f.q} onChange={e => set({ q: e.target.value })} placeholder="Name, team, #" className="rounded-lg border border-slate-300 bg-white pl-6 pr-2 py-1.5 text-xs w-36" /></div>
      {events.length > 1 && <select value={f.event} onChange={e => set({ event: e.target.value, division: '', club: '' })} className={sel_} aria-label="Event"><option value="">All events</option>{events.map(([id, e]) => <option key={id} value={id}>{e.name}</option>)}</select>}
      {hasGender && (['', 'boys', 'girls'] as const).map(g => <button key={g || 'all'} type="button" onClick={() => set({ gender: g, division: '' })} className={chip(f.gender === g)}>{g === '' ? 'Boys & girls' : g === 'boys' ? 'Boys' : 'Girls'}</button>)}
      {divisions.length > 0 && <select value={f.division} onChange={e => set({ division: e.target.value })} className={sel_} aria-label="Division"><option value="">All divisions</option>{divisions.map(d => <option key={d} value={d}>{d}</option>)}</select>}
      {clubs.length > 1 && <select value={f.club} onChange={e => set({ club: e.target.value })} className={sel_} aria-label="Club"><option value="">All clubs</option>{clubs.map(c => <option key={c} value={c}>{c}</option>)}</select>}
      <select value={f.status} onChange={e => set({ status: e.target.value as Filters['status'] })} className={sel_} aria-label="Posted"><option value="">Used or not</option><option value="todo">Not used yet</option><option value="done">Already used</option></select>
      <button type="button" onClick={() => set({ ig: !f.ig })} className={chip(f.ig)}>Has Instagram</button>
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 ml-1">Group</span>
      <select value={f.groupBy} onChange={e => set({ groupBy: e.target.value as GroupBy })} className={sel_} aria-label="Group by"><option value="none">None</option><option value="club">Club</option><option value="team">Team</option><option value="division">Division</option>{hasGender && <option value="gender">Boys / girls</option>}</select>
      {filtered && <button type="button" onClick={() => setF({ ...NO_FILTERS, groupBy: f.groupBy })} className="text-xs font-bold text-slate-500 hover:text-slate-900 px-1.5">Clear filters</button>}
    </div>
  )

  const planButton = busy ? <span className="text-xs font-bold text-teal-700 animate-pulse">{busy}</span>
    : confirm ? (
      <span className="inline-flex items-center gap-2 text-xs flex-wrap">
        <span className="text-slate-700 font-bold">Make {plan.posts.length} player post{plan.posts.length === 1 ? '' : 's'}{plan.rollcalls.length ? ` + ${plan.rollcalls.length} Roll Call` : ''} as drafts on open days? Nothing posts until you approve.</span>
        <button onClick={() => { setConfirm(false); onPlanAll(shown) }} className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5">Make drafts</button>
        <button onClick={() => setConfirm(false)} className="text-slate-500 font-bold px-2">Cancel</button>
      </span>
    ) : <button onClick={() => setConfirm(true)} disabled={!canPost || !planN} title={!canPost ? 'Connect an account first' : !planN ? 'Everyone shown already has a post' : ''} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-3 py-2 disabled:opacity-40"><Sparkles size={13} /> {filtered ? `Plan these ${shown.length}` : 'Plan all cleared players'}</button>

  const squadBar = picked.length > 0 && (
    <div className="flex items-center gap-2 flex-wrap rounded-xl bg-pink-50 border border-pink-200 px-3 py-2 text-xs">
      <span className="font-bold text-pink-900">Squad Reel · {picked.map(p => firstOf(p.playerName)).join(', ')}</span>
      <span className="text-pink-800/80">{!sameEvent ? 'Pick players from the same event.' : picked.length < 2 ? 'Tick 1–3 more players (2–4 in all).' : picked.length > 4 ? 'Four players at most.' : `${picked.length <= 2 ? '15' : '30'} seconds, one look each (change them in the next step), then an end card naming everyone.`}</span>
      <span className="ml-auto inline-flex gap-1.5">
        <button onClick={() => { setFull(false); onSquad(picked, picked.map((p, i) => looks[p.id] || (picked.every(x => x.siblings && x.siblings.ids.length === picked.length && picked.every(y => x.siblings!.ids.includes(y.id))) ? SIBLING_STYLE : lookFor(p.event.daysOut, i)))) }} disabled={!squadOk || !canPost || !!busy} className="rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-bold px-3 py-1.5 inline-flex items-center gap-1 disabled:opacity-40"><Film size={12} /> Make Squad Reel</button>
        {onLinkSiblings && picked.length >= 2 && picked.length <= 4 && sameEvent && (
          // Siblings get their own look: one card each, naming the others (lib/siblings).
          <span className="inline-flex items-center rounded-lg border border-indigo-300 bg-white overflow-hidden">
            <select value={sibRel} onChange={e => setSibRel(e.target.value)} aria-label="Sibling title" className="text-[11px] font-semibold text-indigo-900 bg-white pl-1.5 py-1.5 border-r border-indigo-200">
              <option value="">Title from their info</option><option value="brothers">Brothers</option><option value="sisters">Sisters</option><option value="mixed">Brother &amp; Sister</option>
            </select>
            <button onClick={() => link(picked.map(p => p.id), sibRel)} disabled={linking} className="text-indigo-800 hover:bg-indigo-50 font-bold px-2.5 py-1.5 inline-flex items-center gap-1 disabled:opacity-40"><Users size={12} /> {linking ? 'Linking…' : 'Link as siblings'}</button>
          </span>
        )}
        <button onClick={() => setSel([])} className="rounded-lg text-pink-800 font-bold px-2 py-1.5 inline-flex items-center gap-1"><X size={12} /> Clear</button>
      </span>
    </div>
  )

  const groupHead = (key: string, list: ClearedPlayer[]) => key && (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-extrabold">{key}</span>
      <span className="text-xs text-slate-500">{list.length} player{list.length === 1 ? '' : 's'}{list.some(p => !p.posts.length) ? ` · ${list.filter(p => !p.posts.length).length} not used` : ''}</span>
      {list.length >= 2 && <button type="button" onClick={() => squadFromGroup(list)} className="text-[11px] font-bold text-pink-700 hover:underline">Squad these{list.length > 4 ? ' (first 4)' : ''}</button>}
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
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setFull(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:border-teal-400 text-xs font-bold px-3 py-2"><Maximize2 size={13} /> See all {shown.length}</button>
          {planButton}
        </div>
      </div>
      {drafts.length > 0 && (
        // Reels saved in the Reel maker to finish later: open one where it left off.
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 inline-flex items-center gap-1"><Film size={12} /> Saved Reels</span>
          {drafts.map(d => (
            <span key={d.id} className="inline-flex items-center rounded-full border border-pink-200 bg-pink-50 text-pink-900 text-xs font-bold">
              <button type="button" onClick={() => onOpenDraft?.(d)} disabled={!canPost || !!busy} title={`Saved ${new Date(d.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · open it in the Reel maker`} className="pl-2.5 pr-1.5 py-1 hover:underline disabled:opacity-50">{d.label}</button>
              <button type="button" onClick={() => onDeleteDraft?.(d.id)} aria-label={`Delete the saved Reel ${d.label}`} className="pr-2 pl-0.5 py-1 text-pink-400 hover:text-rose-700"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {filterBar}
      {squadBar}
      {!shown.length ? <div className="text-xs text-slate-500 py-3 text-center">No cleared players match these filters.</div> : f.groupBy === 'none' ? (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {shown.slice(0, STRIP).map(p => card(p))}
          {shown.length > STRIP && <button type="button" onClick={() => setFull(true)} className="flex-none w-[150px] rounded-xl border border-dashed border-slate-300 text-sm font-bold text-teal-700 hover:border-teal-400 grid place-items-center">See all {shown.length} ›</button>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.slice(0, 3).map(g => (
            <div key={g.key} className="flex flex-col gap-1.5">
              {groupHead(g.key, g.list)}
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">{g.list.slice(0, STRIP).map(p => card(p))}{g.list.length > STRIP && <button type="button" onClick={() => setFull(true)} className="flex-none w-[150px] rounded-xl border border-dashed border-slate-300 text-sm font-bold text-teal-700 grid place-items-center">+{g.list.length - STRIP} more ›</button>}</div>
            </div>
          ))}
          {groups.length > 3 && <button type="button" onClick={() => setFull(true)} className="self-start text-xs font-bold text-teal-700 hover:underline">{groups.length - 3} more group{groups.length - 3 === 1 ? '' : 's'} · see all ›</button>}
        </div>
      )}

      {/* Every match, full screen. z-40 like the app's top bar, which comes earlier on the page,
          so this covers it (at z-30 the bar hid this header: title, close, filters). The post
          drawer and the Reel maker come later at z-40 and up, so they still open above it. */}
      {full && (
        <div className="fixed inset-0 z-40 bg-slate-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Cleared players">
          <div className="border-b border-slate-200 bg-white px-4 sm:px-6 py-3 flex flex-col gap-2.5" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold inline-flex items-center gap-1.5"><Users size={16} className="text-teal-600" /> Cleared to post</span>
                <span className="text-xs text-slate-500">{shown.length} of {players.length} shown{waiting ? ` · ${waiting} still deciding` : ''}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">{planButton}<button type="button" onClick={() => setFull(false)} className="w-9 h-9 rounded-lg border border-slate-300 bg-white grid place-items-center text-slate-500 hover:text-slate-900" aria-label="Close"><X size={16} /></button></div>
            </div>
            {filterBar}
            {squadBar}
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-5">
            {!shown.length && <div className="text-sm text-slate-500 py-10 text-center">No cleared players match these filters.</div>}
            {groups.map(g => (
              <div key={g.key || 'all'} className="flex flex-col gap-2">
                {groupHead(g.key, g.list)}
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">{g.list.map(p => card(p, true))}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
