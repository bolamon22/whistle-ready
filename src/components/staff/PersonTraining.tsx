'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Check, AlertCircle, GraduationCap, Mail, X } from 'lucide-react'
import { trainingVideo, trainingLetter, type TrainingVideo } from '@/lib/training'

// A Staff Pool person's training videos, in their profile on the Staff Pool and the Staff
// roster: which of theirs they've watched, every time they were sent videos, and Send to
// just them (Bo, Oct 14 2026: "send them the staff videos from their user and ... let me
// know if they watched them"). Reads /api/training?workerId=; sends with
// /api/training/send to this one person only. It never passes a role or an event: those
// pick everyone in the group or on the event.
//
// Oct 15 2026: Bo sent Haylee Lamon her videos, got no copy, and couldn't tell whether
// anything went (nothing had: the send was refused). Send now asks here instead of a
// browser box, says who it went to and when, can copy the sender, and the profile keeps
// every send to them, failures included (lib/trainingSends).

type Send = { at: string; by: string; videoIds: string[]; ok: boolean; error: string }
type Data = {
  roles: string[]
  assigned: string[]
  watched: Record<string, { plays: number; first: string; last: string }>
  lastSent: { at: string; by: string } | null
  hasEmail: boolean
  email?: string
  sends?: Send[]
}
type Result = { ok: boolean; text: string }

const day = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
const stamp = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
const time = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
const COPY_KEY = 'wr-training-copy-me'

export default function PersonTraining({ workerId, name, eventName, eventDates }: {
  workerId: string
  name: string
  eventName?: string          // the Staff roster's event, for the letter ("Thanks for working ...")
  eventDates?: string
}) {
  const { data: session } = useSession()
  const [d, setD] = useState<Data | null>(null)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [copyMe, setCopyMe] = useState(true)
  const [result, setResult] = useState<Result | null>(null)
  const [all, setAll] = useState(false)
  const load = useCallback(() => {
    fetch(`/api/training?workerId=${encodeURIComponent(workerId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setD)
      .catch(() => setHidden(true))   // a role that can't send videos sees nothing here
  }, [workerId])
  useEffect(() => { load() }, [load])
  useEffect(() => { try { const v = localStorage.getItem(COPY_KEY); if (v !== null) setCopyMe(v === '1') } catch { /* no storage */ } }, [])
  if (hidden || !d || !d.assigned.length) return null

  const first = name.trim().split(/\s+/)[0] || name
  const vids = d.assigned.map(id => trainingVideo(id)).filter(Boolean) as TrainingVideo[]
  const todo = vids.filter(v => !d.watched[v.id])
  const done = vids.length - todo.length
  const toSend = todo.length ? todo : vids
  const sends = d.sends || []
  const what = todo.length ? `the ${todo.length} video${todo.length === 1 ? '' : 's'} ${first} hasn’t watched` : `all ${vids.length} videos again`
  // When each video was last emailed to them, for its chip.
  const sentOn = (id: string) => sends.find(s => s.ok && s.videoIds.includes(id))?.at || ''
  const lastOk = sends.find(s => s.ok) || d.lastSent

  async function send() {
    // The suggested letter, worded for their job (the first one that has its own line).
    const job = d!.roles.find(r => r !== 'assigner') || d!.roles[0] || ''
    const letter = trainingLetter({ eventName, dates: eventDates, roles: job ? [job] : [], sender: String(session?.user?.name || ''), count: toSend.length })
    try { localStorage.setItem(COPY_KEY, copyMe ? '1' : '0') } catch { /* no storage */ }
    setBusy(true); setResult(null)
    const r = await fetch('/api/training/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds: toSend.map(v => v.id), workerIds: [workerId], meCopy: copyMe, subject: letter.subject, body: letter.body }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false); setAsking(false)
    const mine = Array.isArray(j.results) ? j.results.find((x: { email: string }) => x.email && x.email.toLowerCase() === (d!.email || '').toLowerCase()) || j.results[0] : null
    if (!r?.ok || !mine?.ok) {
      const why = mine?.error || j.error || 'The email service didn’t take it.'
      setResult({ ok: false, text: `Not sent. ${why} Nothing went to ${first}.` })
    } else {
      setResult({ ok: true, text: `Sent ${toSend.length} video${toSend.length === 1 ? '' : 's'} to ${mine.email} at ${time(j.at || new Date().toISOString())}.${copyMe ? (j.copied ? ' A copy went to you.' : ' Your copy didn’t go out.') : ''}` })
    }
    load()
  }

  const shown = all ? sends : sends.slice(0, 3)
  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <GraduationCap size={13} aria-hidden /> Training videos
          <span className={`font-semibold ${done === vids.length ? 'text-emerald-300' : done ? 'text-slate-200' : 'text-amber-200'}`}>{done} of {vids.length} watched</span>
        </p>
        {!asking && (
          <button type="button" onClick={() => { setAsking(true); setResult(null) }} disabled={busy || !d.hasEmail}
            title={d.hasEmail ? `Email only ${first}` : 'No email on file'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/40 px-3 py-1.5 text-xs font-semibold text-teal-200 transition-colors hover:border-teal-300 hover:text-white disabled:opacity-50">
            <Mail size={13} aria-hidden />
            {todo.length ? `Send the ${todo.length} not watched` : 'Send them again'}
          </button>
        )}
      </div>

      {asking && (
        <div className="mb-3 rounded-xl border border-teal-400/30 bg-teal-400/10 p-3" role="group" aria-label={`Send videos to ${first}`}>
          <p className="text-sm text-slate-100">Email {what} to <b className="font-semibold break-words">{d.email || name}</b>? Only {first} gets it.</p>
          {lastOk && <p className="mt-1 text-xs text-amber-200">Last emailed {stamp(lastOk.at)}{lastOk.by ? ` by ${lastOk.by}` : ''}.</p>}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={copyMe} onChange={e => setCopyMe(e.target.checked)} className="h-4 w-4 accent-teal-500" />
              Send me a copy
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAsking(false)} disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white">Cancel</button>
              <button type="button" onClick={send} disabled={busy}
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-60">
                {busy ? 'Sending…' : `Send ${toSend.length} video${toSend.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <p role="status" className={`mb-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs ${result.ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>
          {result.ok ? <Check size={14} className="mt-px shrink-0" aria-hidden /> : <AlertCircle size={14} className="mt-px shrink-0" aria-hidden />}
          <span className="flex-1">{result.text}</span>
          <button type="button" onClick={() => setResult(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={13} /></button>
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {vids.map(v => {
          const w = d.watched[v.id]
          const sent = sentOn(v.id)
          return (
            <span key={v.id} title={w ? `Watched${w.plays > 1 ? ` ${w.plays} times` : ''}, last ${day(w.last)}` : `Not watched yet${sent ? `. Emailed ${day(sent)}` : ''}`}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${w ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-slate-300'}`}>
              {w && <Check size={12} aria-hidden />}{v.title}
            </span>
          )
        })}
      </div>

      {!d.hasEmail ? (
        <p className="mt-2 text-xs text-slate-400">No email on file, so videos can’t be sent. Add one with Edit.</p>
      ) : sends.length ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Emailed to {first}</p>
          <ul className="mt-1 space-y-1">
            {shown.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-slate-300">
                <span className="text-slate-200">{stamp(s.at)}</span>
                <span className="text-slate-500">·</span>
                <span>{s.videoIds.length} video{s.videoIds.length === 1 ? '' : 's'}</span>
                {s.by && <><span className="text-slate-500">·</span><span>{s.by}</span></>}
                <span className="text-slate-500">·</span>
                {s.ok
                  ? <span className="font-semibold text-emerald-300" title="Our email service took it. Delivery and opens show in SendGrid's Activity feed.">Sent</span>
                  : <span className="font-semibold text-red-300">Not sent{s.error ? `: ${s.error}` : ''}</span>}
              </li>
            ))}
          </ul>
          {sends.length > 3 && (
            <button type="button" onClick={() => setAll(a => !a)} className="mt-1 text-xs font-semibold text-teal-300 hover:text-teal-200">{all ? 'Show fewer' : `Show all ${sends.length}`}</button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          {d.lastSent ? `Last sent ${day(d.lastSent.at)}${d.lastSent.by ? ` by ${d.lastSent.by}` : ''}.` : 'No videos sent yet.'}
        </p>
      )}
    </div>
  )
}
