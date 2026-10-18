'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ArrowLeft, Send, Check, Download, Mail, Eye, X, ChevronLeft, ChevronRight, Film } from 'lucide-react'
import { POST_STYLES, DEFAULT_STYLES, type PostStyle } from '@/lib/socialPosts'
import ReelMaker from '@/components/ReelMaker'

// Photos for social: every player at this event who added a photo to their card.
// Staff pick the good ones and ask the families (lib/photoConsent); the parent
// answers on /pass/photo-ok/<token>, and the answer shows here. Only photos marked
// "Yes" may be posted.

type Player = {
  id: string; playerName: string; clubName: string; teamName: string; jersey: string; position: string
  photoUrl: string; cardUrl: string; parentName: string; emails: string[]
  askAt: string; schedAt: string; ok: string; okAt: string; okName: string; instagram: string; clubInstagram: string; clubFacebook: string
}
type Filter = 'all' | 'new' | 'scheduled' | 'asked' | 'yes' | 'no'

const state = (p: Player): Exclude<Filter, 'all'> => p.ok === 'yes' ? 'yes' : p.ok === 'no' ? 'no' : p.schedAt ? 'scheduled' : p.askAt ? 'asked' : 'new'
const CHIP: Record<Exclude<Filter, 'all'>, { label: string; cls: string }> = {
  new: { label: 'Not asked', cls: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Scheduled', cls: 'bg-sky-100 text-sky-800' },
  asked: { label: 'Asked · waiting', cls: 'bg-amber-100 text-amber-800' },
  yes: { label: 'Yes · OK to post', cls: 'bg-emerald-100 text-emerald-800' },
  no: { label: 'No', cls: 'bg-rose-100 text-rose-800' },
}
const when = (iso: string) => { try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
// Tomorrow at 8:00 AM, in the browser's own time zone, as a datetime-local value.
const tomorrowMorning = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T08:00` }
const day = (iso: string) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '' } }

export default function SocialPhotos() {
  const { id } = useParams() as { id: string }
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emailReady, setEmailReady] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [testing, setTesting] = useState(false)
  const [later, setLater] = useState(true)              // Schedule (default: it's usually late at night) vs Send now
  const [sendAt, setSendAt] = useState(tomorrowMorning)
  const [tick, setTick] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [event, setEvent] = useState<{ name: string; dates: string; location: string; daysOut: number | null }>({ name: '', dates: '', location: '', daysOut: null })
  const [reel, setReel] = useState<{ src: string; style: string; label: string; fileName: string; token?: string } | null>(null)   // player id whose posts are open full size
  const [styles, setStyles] = useState<Set<PostStyle>>(() => new Set(DEFAULT_STYLES))   // example posts the email shows
  const styleList = POST_STYLES.filter(s => styles.has(s.id)).map(s => s.id)
  const toggleStyle = (s: PostStyle) => setStyles(cur => { const n = new Set(cur); n.has(s) ? n.delete(s) : n.add(s); return n })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/tournaments/${id}/social-photos`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Could not load photos'); return }
      setPlayers(Array.isArray(j.players) ? j.players : [])
      setEmailReady(j.emailReady !== false)
      if (j.event) setEvent(j.event)
    }).catch(() => setError('Could not load photos')).finally(() => setLoading(false))
  }, [id, tick])

  const counts = useMemo(() => {
    const c = { all: players.length, new: 0, scheduled: 0, asked: 0, yes: 0, no: 0 }
    for (const p of players) c[state(p)]++
    return c
  }, [players])
  const shown = useMemo(() => filter === 'all' ? players : players.filter(p => state(p) === filter), [players, filter])
  const askable = (p: Player) => (state(p) === 'new' || state(p) === 'asked' || state(p) === 'scheduled') && p.emails.length > 0
  const pickedList = players.filter(p => picked.has(p.id))
  const pickedResend = pickedList.some(p => state(p) === 'asked')

  function toggle(p: Player) {
    if (!askable(p)) return
    setPicked(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })
  }

  async function sendTest() {
    const p = pickedList[0]
    if (!p) return
    setTesting(true)
    try {
      const r = await fetch(`/api/tournaments/${id}/social-photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testId: p.id, styles: styleList }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.sent) { toast.error(j.error || j.errors?.[0] || j.skipped?.[0] || 'Could not send the test'); return }
      toast.success(`Test sent to ${j.to}. Check your inbox.`)
    } catch { toast.error('Could not send the test') }
    finally { setTesting(false) }
  }

  // Move every scheduled send (keeping each one's posts) to a new time.
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveAt, setMoveAt] = useState(tomorrowMorning)
  const [moving, setMoving] = useState(false)
  async function moveScheduled() {
    setMoving(true)
    try {
      const r = await fetch(`/api/tournaments/${id}/social-photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moveTo: new Date(moveAt).toISOString() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error || 'Could not move them'); return }
      toast.success(`Moved ${j.moved} scheduled email${j.moved === 1 ? '' : 's'} to ${when(j.sendAt)}`)
      setMoveOpen(false); setTick(t => t + 1)
    } catch { toast.error('Could not move them') }
    finally { setMoving(false) }
  }

  async function unschedule(p: Player) {
    try {
      const r = await fetch(`/api/tournaments/${id}/social-photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cancelIds: [p.id] }) })
      if (!r.ok) { toast.error('Could not cancel'); return }
      toast.success(`${p.playerName.split(' ')[0]} taken off the schedule`); setTick(t => t + 1)
    } catch { toast.error('Could not cancel') }
  }

  async function send() {
    setSending(true)
    try {
      const r = await fetch(`/api/tournaments/${id}/social-photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...picked], styles: styleList, resend: pickedResend, ...(later ? { sendAt: new Date(sendAt).toISOString() } : {}) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error || 'Could not send'); return }
      if (later) toast.success(`Scheduled ${j.scheduled} for ${when(j.sendAt)}`)
      else toast.success(`Asked ${j.sent} famil${j.sent === 1 ? 'y' : 'ies'}`)
      if (j.errors?.length) toast.error(`${j.errors.length} didn't send: ${j.errors[0]}`)
      else if (j.skipped?.length) toast(`${j.skipped.length} skipped: ${j.skipped[0]}`)
      setPicked(new Set()); setConfirm(false); setTick(t => t + 1)
    } catch { toast.error('Could not send') }
    finally { setSending(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-center" />
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <Link href={`/tournaments/${id}/player-waivers`} className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Player waivers</Link>
          <div className="sm:ml-2 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Photos for social</h1>
            <p className="text-xs text-slate-500">Pick the best player cards and ask the families. Only post the ones marked Yes.</p>
          </div>
          <button type="button" disabled={!picked.size || !emailReady} onClick={() => { setSendAt(tomorrowMorning()); setConfirm(true) }}
            className="sm:ml-auto inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-40">
            <Send size={15} /> Ask permission{picked.size ? ` (${picked.size})` : ''}
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-3 flex flex-wrap gap-2">
          {(['all', 'new', 'scheduled', 'asked', 'yes', 'no'] as Filter[]).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
              {f === 'all' ? 'All' : CHIP[f].label.split(' ·')[0]} <span className="opacity-70">{counts[f]}</span>
            </button>
          ))}
          {!emailReady && <span className="text-xs text-rose-700 self-center">Email isn't set up, so requests can't be sent.</span>}
          {counts.scheduled > 0 && (
            moveOpen ? (
              <span className="inline-flex flex-wrap items-center gap-2 text-xs">
                <label htmlFor="sp-move-at" className="font-semibold text-slate-700">Move all {counts.scheduled} scheduled to</label>
                <input id="sp-move-at" type="datetime-local" value={moveAt} onChange={e => setMoveAt(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <button type="button" onClick={moveScheduled} disabled={moving} className="rounded-md bg-sky-700 text-white font-semibold px-3 py-1.5 disabled:opacity-50">{moving ? 'Moving…' : 'Move'}</button>
                <button type="button" onClick={() => setMoveOpen(false)} className="text-slate-500 underline underline-offset-2">Cancel</button>
              </span>
            ) : (
              <button type="button" onClick={() => setMoveOpen(true)} className="text-xs font-semibold text-sky-800 underline underline-offset-2 self-center">Change time for all {counts.scheduled} scheduled</button>
            )
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">
        {loading && <p className="text-sm text-slate-500">Loading photos…</p>}
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {!loading && !error && !shown.length && (
          <p className="text-sm text-slate-500">{players.length ? 'No players in this group.' : 'No player has added a photo for this event yet.'}</p>
        )}
        {counts.yes > 0 && filter !== 'yes' && (
          <button type="button" onClick={() => setFilter('yes')} className="mb-4 w-full text-left rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 hover:bg-emerald-100">
            <strong>{counts.yes} famil{counts.yes === 1 ? 'y has' : 'ies have'} said yes.</strong> Tap to see the cards that are cleared to post, with the handles to tag.
          </button>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {shown.map(p => {
            const st = state(p)
            const on = picked.has(p.id)
            return (
              <div key={p.id} className={`bg-white rounded-xl border overflow-hidden flex flex-col ${on ? 'border-teal-500 ring-2 ring-teal-500' : 'border-slate-200'}`}>
                <button type="button" onClick={() => toggle(p)} disabled={!askable(p)} className="relative block aspect-[720/1140] bg-slate-100 disabled:cursor-default" aria-pressed={on} aria-label={`Pick ${p.playerName}`}>
                  <img src={p.cardUrl || p.photoUrl} alt={`${p.playerName}'s player card`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  {askable(p) && (
                    <span className={`absolute top-2 left-2 h-7 w-7 rounded-md border-2 flex items-center justify-center ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white/90 border-white text-transparent'}`}><Check size={16} /></span>
                  )}
                </button>
                <div className="p-3 flex-1 flex flex-col gap-1.5 min-w-0">
                  {p.cardUrl && <button type="button" onClick={() => setPreview(p.id)} className="self-start inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"><Eye size={13} /> Preview posts</button>}
                  <div className="font-semibold text-slate-900 text-sm truncate">{p.playerName}{p.jersey ? ` #${p.jersey}` : ''}</div>
                  <div className="text-xs text-slate-500 truncate">{p.teamName || p.clubName}</div>
                  <span className={`self-start text-[11px] font-semibold rounded-full px-2 py-0.5 ${CHIP[st].cls}`}>
                    {CHIP[st].label}{st === 'scheduled' ? ` · ${when(p.schedAt)}` : st === 'asked' ? ` · ${day(p.askAt)}` : (st === 'yes' || st === 'no') ? ` · ${day(p.okAt)}` : ''}
                  </span>
                  {st === 'scheduled' && <button type="button" onClick={() => unschedule(p)} className="self-start text-[11px] text-slate-500 underline underline-offset-2">Cancel scheduled email</button>}
                  {st === 'yes' && p.okName && <div className="text-[11px] text-slate-500 truncate">By {p.okName}</div>}
                  {st === 'yes' && p.instagram && <a href={`https://instagram.com/${p.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-teal-700 truncate">Tag {p.instagram}</a>}
                  {st === 'yes' && p.clubInstagram && <a href={`https://instagram.com/${p.clubInstagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-teal-700 truncate">Club IG {p.clubInstagram}</a>}
                  {st === 'yes' && p.clubFacebook && <a href={/\s/.test(p.clubFacebook) ? `https://www.facebook.com/search/top?q=${encodeURIComponent(p.clubFacebook)}` : `https://facebook.com/${p.clubFacebook}`} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-teal-700 truncate">Club FB: {p.clubFacebook}</a>}
                  {!p.emails.length && st === 'new' && <div className="text-[11px] text-rose-700">No parent email on the waiver</div>}
                  {st === 'yes' && (
                    <div className="mt-auto pt-1 flex gap-3 text-xs">
                      {p.cardUrl && <a href={p.cardUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 font-semibold"><Download size={12} /> Card</a>}
                      <a href={p.photoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-500"><Download size={12} /> Photo only</a>
                    </div>
                  )}
                  {st === 'yes' && p.cardUrl && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <span className="text-slate-500 w-full">Posts:</span>
                      {POST_STYLES.map(ps => (
                        <a key={ps.id} href={p.cardUrl.replace(/\/card\.png$/, `/post/${ps.id}.png?dl=1`)} className="inline-flex items-center gap-1 text-teal-700 font-semibold"><Download size={11} /> {ps.label}</a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {preview && (() => {
        // Full-size look at one player's posts, like the email shows them (Bo: "let me
        // preview on the page by just clicking"). Arrows step through the players in view.
        const list = shown.filter(x => x.cardUrl)
        const i = list.findIndex(x => x.id === preview)
        const p = list[i] || players.find(x => x.id === preview)
        if (!p) return null
        const go = (n: number) => { const q = list[(i + n + list.length) % list.length]; if (q) setPreview(q.id) }
        const on = picked.has(p.id)
        return (
          <div className="fixed inset-0 z-30 bg-slate-900/70 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Posts for ${p.playerName}`} onClick={() => setPreview(null)}>
            <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-4 sm:p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                {list.length > 1 && <button type="button" onClick={() => go(-1)} aria-label="Previous player" className="h-9 w-9 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50"><ChevronLeft size={18} /></button>}
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 truncate">{p.playerName}{p.jersey ? ` #${p.jersey}` : ''}</h2>
                  <p className="text-xs text-slate-500 truncate">{[p.teamName || p.clubName, CHIP[state(p)].label].filter(Boolean).join(' · ')}{list.length > 1 && i >= 0 ? ` · ${i + 1} of ${list.length}` : ''}</p>
                </div>
                {list.length > 1 && <button type="button" onClick={() => go(1)} aria-label="Next player" className="h-9 w-9 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50"><ChevronRight size={18} /></button>}
                <div className="ml-auto flex items-center gap-2">
                  {askable(p) && <button type="button" onClick={() => toggle(p)} className={`hidden sm:inline-flex text-sm font-semibold rounded-lg px-3 py-2 items-center gap-1.5 ${on ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}><Check size={15} /> {on ? 'Picked' : 'Add to picks'}</button>}
                  {askable(p) && emailReady && (
                    // Straight to the Ask dialog for just this family, with the posts ticked here.
                    <button type="button" disabled={!styleList.length} onClick={() => { setPicked(new Set([p.id])); setPreview(null); setSendAt(tomorrowMorning()); setConfirm(true) }}
                      className="text-sm font-semibold rounded-lg px-3 py-2 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40"><Send size={15} /> Ask {p.playerName.split(' ')[0]}&apos;s family</button>
                  )}
                  <button type="button" onClick={() => setPreview(null)} aria-label="Close" className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"><X size={20} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {POST_STYLES.map(ps => {
                  const src = p.cardUrl.replace(/\/card\.png$/, `/post/${ps.id}.png`)
                  const inEmail = styles.has(ps.id)
                  return (
                    <figure key={ps.id} className="m-0">
                      <a href={src} target="_blank" rel="noreferrer"><img src={`${src}?w=540`} alt={`${ps.label} post for ${p.playerName}`} className={`w-full aspect-[4/5] object-cover rounded-xl bg-slate-100 ring-offset-2 ${inEmail ? 'ring-2 ring-teal-600' : ''}`} loading="lazy" /></a>
                      <figcaption className="flex items-center justify-between gap-2 text-xs mt-1.5">
                        <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer min-w-0">
                          <input type="checkbox" checked={inEmail} onChange={() => toggleStyle(ps.id)} className="h-4 w-4 accent-teal-600" />
                          <span className="truncate">{ps.label}</span>
                        </label>
                        <span className="inline-flex items-center gap-2.5 shrink-0">
                          <button type="button" onClick={() => setReel({ src, style: ps.id, label: ps.label, token: /\/pass\/([^/]+)\/card\.png/.exec(p.cardUrl)?.[1], fileName: `${p.playerName.split(' ')[0] || 'player'}-${ps.id}-reel`.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} className="inline-flex items-center gap-1 text-teal-700 font-semibold"><Film size={12} /> Reel</button>
                          <a href={`${src}?dl=1`} className="inline-flex items-center gap-1 text-teal-700"><Download size={12} /> Save</a>
                        </span>
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500 mt-3">Tick the posts to put in the email, then Ask {p.playerName.split(' ')[0]}&apos;s family. You&apos;ll still choose Send now or Schedule, or send yourself a test, before anything goes out. Click a post to open it full size, or Reel to turn it into an 8-, 15- or 30-second video with music. Save is for planning only: post it only once the family says Yes.</p>
            </div>
          </div>
        )
      })()}

      {reel && (
        <ReelMaker src={reel.src} style={reel.style} label={reel.label} fileName={reel.fileName} token={reel.token}
          event={event.name || 'Game day'} sub={[event.dates, event.location].filter(Boolean).join(' · ')} days={event.daysOut}
          onClose={() => setReel(null)} />
      )}

      {confirm && (
        <div className="fixed inset-0 z-20 bg-slate-900/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
            <h2 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2"><Mail size={18} /> Ask {pickedList.length} famil{pickedList.length === 1 ? 'y' : 'ies'}</h2>
            <p className="text-sm text-slate-600 mt-1">Each parent on the waiver gets this email with a Yes / No link and the posts you pick below, built from their own player's card.</p>
            <fieldset className="mt-3">
              <legend className="text-xs font-semibold text-slate-700 mb-1.5">Posts to show {styleList.length === 1 ? '(one: "here\'s what the post will look like")' : `(${styleList.length}: "the kind of post we're planning")`}</legend>
              <div className="grid grid-cols-4 gap-2">
                {POST_STYLES.map(s => {
                  const on = styles.has(s.id)
                  const src = pickedList[0]?.cardUrl ? pickedList[0].cardUrl.replace(/\/card\.png$/, `/post/${s.id}.png?w=540`) : ''
                  return (
                    <label key={s.id} className={`relative cursor-pointer rounded-lg border-2 overflow-hidden ${on ? 'border-teal-600' : 'border-slate-200 opacity-50'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleStyle(s.id)} className="sr-only" />
                      {src ? <img src={src} alt={`${s.label} post for ${pickedList[0]?.playerName}`} className="w-full aspect-[4/5] object-cover bg-slate-100" loading="lazy" /> : <div className="w-full aspect-[4/5] bg-slate-100" />}
                      <span className="block text-[11px] font-semibold text-center py-1 text-slate-700">{s.label}</span>
                      {on && <span className="absolute top-1 right-1 h-5 w-5 rounded bg-teal-600 text-white flex items-center justify-center"><Check size={13} /></span>}
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Previews show {pickedList[0]?.playerName.split(' ')[0] || 'the first player'}'s card; each family sees their own. To give different players different posts, ask them in separate batches.</p>
            </fieldset>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
              <p className="font-semibold">Subject: {pickedList[0]?.playerName.split(' ')[0] || 'Alex'} made the cut for this tournament</p>
              <p>Hi {pickedList[0]?.parentName.split(' ')[0] || 'there'},</p>
              <p><strong>{pickedList[0]?.playerName.split(' ')[0] || 'Alex'} made the cut!</strong> Out of every player card for this tournament, {pickedList[0]?.playerName.split(' ')[0] || 'Alex'}'s is one of our favorites.</p>
              <p>All week we're counting down on Instagram by spotlighting players who'll be on the field, and we'd love {pickedList[0]?.playerName.split(' ')[0] || 'Alex'} to be one of them.</p>
              <p className="text-slate-500">[{styleList.length === 1 ? `Here's what ${pickedList[0]?.playerName.split(' ')[0] || 'Alex'}'s post will look like: the ${POST_STYLES.find(s => s.id === styleList[0])?.label} post` : `Here's the kind of post we're planning: ${styleList.length} example posts`}]</p>
              <p>Before anything goes up, we need a parent or guardian's OK. It takes about ten seconds: <span className="text-teal-700 font-semibold">[Yes or no: answer here]</span></p>
              <p>Saying yes? Add your Instagram handle on that page, plus your club's Instagram and Facebook if you know them. We'll tag you and your club and send it as a Collab post. Then please like, share and repost it!</p>
              <p className="text-slate-500">A yes doesn't guarantee a post this time: we're asking more families than we have posts for, so the card may be saved for future events instead. Rather not? Choose No or ignore the email, and it won't be posted.</p>
            </div>
            <p className="text-xs text-slate-500 mt-2">Send me a test emails you the real letter for {pickedList[0]?.playerName || 'the first player'}. Its link works but saves nothing, and the family isn't contacted.</p>
            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <div className="flex gap-2" role="group" aria-label="When to send">
                <button type="button" onClick={() => setLater(false)} aria-pressed={!later} className={`flex-1 text-sm rounded-md px-3 py-1.5 border ${!later ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-600'}`}>Send now</button>
                <button type="button" onClick={() => setLater(true)} aria-pressed={later} className={`flex-1 text-sm rounded-md px-3 py-1.5 border ${later ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-600'}`}>Schedule</button>
              </div>
              {later && (
                <div className="mt-3">
                  <label htmlFor="sp-send-at" className="block text-xs font-medium text-slate-600 mb-1">Send on</label>
                  <input id="sp-send-at" type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <p className="text-xs text-slate-500 mt-1">Goes out within 15 minutes of that time. You'll get an email when it's sent. To spread them over the week, schedule a few players at a time on different days.</p>
                </div>
              )}
            </div>
            {pickedResend && <p className="text-xs text-amber-700 mt-2">Some of these were already asked. They'll get the email again.</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={sendTest} disabled={testing || sending || !styleList.length} className="mr-auto text-sm rounded-lg border border-teal-600 text-teal-700 px-4 py-2 disabled:opacity-50">{testing ? 'Sending test…' : `Send me a test (${pickedList[0]?.playerName.split(' ')[0] || ''})`}</button>
              <button type="button" onClick={() => setConfirm(false)} className="text-sm rounded-lg border border-slate-300 px-4 py-2 text-slate-700">Cancel</button>
              <button type="button" onClick={send} disabled={sending || !styleList.length} className="text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2 disabled:opacity-50">{sending ? (later ? 'Scheduling…' : 'Sending…') : `${later ? 'Schedule' : 'Send'} ${pickedList.length} email${pickedList.length === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
