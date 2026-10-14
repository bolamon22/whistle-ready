'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Check, GraduationCap, Mail } from 'lucide-react'
import { trainingVideo, trainingLetter, type TrainingVideo } from '@/lib/training'

// A Staff Pool person's training videos, in their profile on the Staff Pool and the Staff
// roster: which of theirs they've watched, when they were last sent videos, and Send to
// just them (Bo, Oct 14 2026: "send them the staff videos from their user and ... let me
// know if they watched them"). Reads /api/training?workerId=; sends with
// /api/training/send to this one person only. It never passes a role or an event: those
// pick everyone in the group or on the event.

type Data = {
  roles: string[]
  assigned: string[]
  watched: Record<string, { plays: number; first: string; last: string }>
  lastSent: { at: string; by: string } | null
  hasEmail: boolean
}

const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) }

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
  const load = useCallback(() => {
    fetch(`/api/training?workerId=${encodeURIComponent(workerId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setD)
      .catch(() => setHidden(true))   // a role that can't send videos sees nothing here
  }, [workerId])
  useEffect(() => { load() }, [load])
  if (hidden || !d || !d.assigned.length) return null

  const first = name.trim().split(/\s+/)[0] || name
  const vids = d.assigned.map(id => trainingVideo(id)).filter(Boolean) as TrainingVideo[]
  const todo = vids.filter(v => !d.watched[v.id])
  const done = vids.length - todo.length
  const toSend = todo.length ? todo : vids

  async function send() {
    const what = todo.length ? `the ${todo.length} video${todo.length === 1 ? '' : 's'} ${first} hasn’t watched` : `all ${vids.length} videos again`
    if (!confirm(`Email ${what} to ${name}?\n\nOnly ${first} gets this email.`)) return
    // The suggested letter, worded for their job (the first one that has its own line).
    const job = d!.roles.find(r => r !== 'assigner') || d!.roles[0] || ''
    const letter = trainingLetter({ eventName, dates: eventDates, roles: job ? [job] : [], sender: String(session?.user?.name || ''), count: toSend.length })
    setBusy(true)
    const r = await fetch('/api/training/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds: toSend.map(v => v.id), workerIds: [workerId], subject: letter.subject, body: letter.body }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok || !j.sent) { toast.error(j.error || `That didn’t go through for ${first}. Try again.`); return }
    toast.success(`Sent ${toSend.length} video${toSend.length === 1 ? '' : 's'} to ${first}`)
    load()
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <GraduationCap size={13} aria-hidden /> Training videos
          <span className={`font-semibold ${done === vids.length ? 'text-emerald-300' : done ? 'text-slate-200' : 'text-amber-200'}`}>{done} of {vids.length} watched</span>
        </p>
        <button type="button" onClick={send} disabled={busy || !d.hasEmail}
          title={d.hasEmail ? `Email only ${first}` : 'No email on file'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/40 px-3 py-1.5 text-xs font-semibold text-teal-200 transition-colors hover:border-teal-300 hover:text-white disabled:opacity-50">
          <Mail size={13} aria-hidden />
          {busy ? 'Sending…' : todo.length ? `Send the ${todo.length} not watched` : 'Send them again'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {vids.map(v => {
          const w = d.watched[v.id]
          return (
            <span key={v.id} title={w ? `Watched${w.plays > 1 ? ` ${w.plays} times` : ''}, last ${when(w.last)}` : 'Not watched yet'}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${w ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-slate-300'}`}>
              {w && <Check size={12} aria-hidden />}{v.title}
            </span>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {!d.hasEmail ? 'No email on file, so videos can’t be sent. Add one with Edit.'
          : d.lastSent ? `Last sent ${when(d.lastSent.at)}${d.lastSent.by ? ` by ${d.lastSent.by}` : ''}.`
          : 'No videos sent yet.'}
      </p>
    </div>
  )
}
