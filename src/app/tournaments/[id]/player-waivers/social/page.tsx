'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ArrowLeft, Send, Check, Download, Mail } from 'lucide-react'

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

  useEffect(() => {
    setLoading(true)
    fetch(`/api/tournaments/${id}/social-photos`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Could not load photos'); return }
      setPlayers(Array.isArray(j.players) ? j.players : [])
      setEmailReady(j.emailReady !== false)
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
      const r = await fetch(`/api/tournaments/${id}/social-photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testId: p.id }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.sent) { toast.error(j.error || j.errors?.[0] || j.skipped?.[0] || 'Could not send the test'); return }
      toast.success(`Test sent to ${j.to}. Check your inbox.`)
    } catch { toast.error('Could not send the test') }
    finally { setTesting(false) }
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
      const r = await fetch(`/api/tournaments/${id}/social-photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...picked], resend: pickedResend, ...(later ? { sendAt: new Date(sendAt).toISOString() } : {}) }) })
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
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-20 bg-slate-900/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
            <h2 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2"><Mail size={18} /> Ask {pickedList.length} famil{pickedList.length === 1 ? 'y' : 'ies'}</h2>
            <p className="text-sm text-slate-600 mt-1">Each parent on the waiver gets this email with their player's card and a Yes / No link:</p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
              <p className="font-semibold">Subject: {pickedList[0]?.playerName.split(' ')[0] || 'Alex'} made the cut for this tournament</p>
              <p>Hi {pickedList[0]?.parentName.split(' ')[0] || 'there'},</p>
              <p><strong>{pickedList[0]?.playerName.split(' ')[0] || 'Alex'} made the cut!</strong> Out of every player card for this tournament, {pickedList[0]?.playerName.split(' ')[0] || 'Alex'}'s is one of our favorites.</p>
              <p>All week we're counting down on Instagram by spotlighting players who'll be on the field, and we'd love {pickedList[0]?.playerName.split(' ')[0] || 'Alex'} to be one of them.</p>
              <p>Before anything goes up, we need a parent or guardian's OK. It takes about ten seconds: <span className="text-teal-700 font-semibold">[Yes or no: answer here]</span></p>
              <p>Saying yes? Add your Instagram handle on that page, plus your club's Instagram and Facebook if you know them. We'll tag you and your club and send it as a Collab post. Then please like, share and repost it!</p>
              <p className="text-slate-500">Rather not? Choose No or ignore the email, and it won't be posted.</p>
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
              <button type="button" onClick={sendTest} disabled={testing || sending} className="mr-auto text-sm rounded-lg border border-teal-600 text-teal-700 px-4 py-2 disabled:opacity-50">{testing ? 'Sending test…' : `Send me a test (${pickedList[0]?.playerName.split(' ')[0] || ''})`}</button>
              <button type="button" onClick={() => setConfirm(false)} className="text-sm rounded-lg border border-slate-300 px-4 py-2 text-slate-700">Cancel</button>
              <button type="button" onClick={send} disabled={sending} className="text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2 disabled:opacity-50">{sending ? (later ? 'Scheduling…' : 'Sending…') : `${later ? 'Schedule' : 'Send'} ${pickedList.length} email${pickedList.length === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
