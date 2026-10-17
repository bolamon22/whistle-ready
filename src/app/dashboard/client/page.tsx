'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { CalendarDays, Wallet, Phone, Mail, Eye, ChevronRight, Sparkles, Check } from 'lucide-react'
import { dateRange } from '@/components/nav/navConfig'
import { telHref } from '@/lib/contactTypes'

// The tournament director's home (lib/clientEvents, Bo Oct 17 2026): on the Assigner
// plan, the head assigner's customer. Their events, each with how far its officials are
// assigned and the way into its schedule and Staff pay; who to call at the head
// assigner's; and a small "Powered by Whistle Ready" card, because "it will help us
// market to club directors or tournament directors."

type Ev = { id: string; name: string; startDate: string; endDate: string; location: string; logoUrl: string; games: number; staffed: number; open: number }
type Home = {
  as: 'client' | 'director' | 'admin'
  org: { name: string; logoUrl: string; contactEmail: string; contactPhone: string; website: string } | null
  assigners: { name: string; email: string }[]
  events: Ev[]
}

export default function ClientHome() {
  const { data: session } = useSession()
  const [d, setD] = useState<Home | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    fetch('/api/client/events').then(r => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setFailed(true))
  }, [])
  const first = String(session?.user?.name || '').split(' ')[0]

  if (failed) return <p className="p-10 text-center text-slate-400">This page is for a head assigner&apos;s tournament directors.</p>
  if (!d) return <p className="p-10 text-center text-slate-400">Loading…</p>
  const orgName = d.org?.name || 'Your assigner'

  return (
    <div className="mx-auto max-w-3xl px-1 py-2 sm:py-4">
      <p className="text-sm font-medium text-slate-400">Tournament Director</p>
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-slate-900">Hi{first ? `, ${first}` : ''}</h1>

      {d.as !== 'client' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <Eye size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
          <p>This is what your tournament directors see. Each one sees only the events you pick for them on <b>Your team</b>; here you see every event.</p>
        </div>
      )}

      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Your events</h2>
      {d.events.length === 0 && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No events yet. {orgName} picks the events you see here.
        </div>
      )}
      <div className="mb-6 space-y-3">
        {d.events.map(e => {
          const pct = e.games ? Math.round((e.staffed / e.games) * 100) : 0
          return (
            <div key={e.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <Link href={`/dashboard/client/${e.id}`} className="flex items-start gap-3">
                {e.logoUrl
                  ? <img src={e.logoUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
                  : <span aria-hidden className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-lg font-bold text-teal-700">{e.name.charAt(0)}</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-slate-900">{e.name}</p>
                  <p className="text-sm text-slate-500">{[dateRange(e), e.location].filter(Boolean).join(' · ')}</p>
                  {e.games > 0 ? (
                    <div className="mt-2">
                      <p className="text-sm text-slate-600">{e.staffed} of {e.games} games have every referee</p>
                      <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-teal-500" style={{ width: `${pct}%` }} /></span>
                    </div>
                  ) : <p className="mt-2 text-sm text-slate-400">No games yet</p>}
                </div>
                <ChevronRight size={18} className="mt-1 flex-shrink-0 text-slate-300" aria-hidden />
              </Link>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href={`/dashboard/client/${e.id}`} className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  <CalendarDays size={16} className="text-teal-600" aria-hidden />Schedule
                </Link>
                <Link href={`/dashboard/client/${e.id}?tab=pay`} className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  <Wallet size={16} className="text-teal-600" aria-hidden />Staff pay
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Your assigner</h2>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="font-bold text-slate-900">{orgName}</p>
        {d.assigners.length > 0 && <p className="text-sm text-slate-500">{d.assigners.map(a => a.name).join(', ')}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {d.org?.contactPhone && telHref(d.org.contactPhone) && (
            <a href={telHref(d.org.contactPhone)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-teal-300"><Phone size={14} className="text-teal-600" aria-hidden />{d.org.contactPhone}</a>
          )}
          {(d.org?.contactEmail || d.assigners[0]?.email) && (
            <a href={`mailto:${d.org?.contactEmail || d.assigners[0]?.email}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-teal-300"><Mail size={14} className="text-teal-600" aria-hidden />{d.org?.contactEmail || d.assigners[0]?.email}</a>
          )}
        </div>
      </div>

      <PoweredBy orgName={orgName} name={String(session?.user?.name || '')} email={String(session?.user?.email || '')} />
    </div>
  )
}

/** "Powered by Whistle Ready": what the rest of the app does, and a one-tap "tell me
 *  more" that sends the organizer inquiry (api/inquiry) with who they are. */
function PoweredBy({ orgName, name, email }: { orgName: string; name: string; email: string }) {
  const [open, setOpen] = useState(false)
  const [org, setOrg] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  async function send() {
    setState('sending')
    try {
      const r = await fetch('/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || email, email, org: org.trim(), message: `Tournament director whose officials ${orgName} assigns in Whistle Ready. Wants to hear about running the tournament on Whistle Ready.` }) })
      setState(r.ok ? 'sent' : 'error')
    } catch { setState('error') }
  }
  return (
    <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <img src="/whistle-ready-icon.png" alt="" className="h-10 w-10 flex-shrink-0 rounded-xl object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-700">Powered by Whistle Ready</p>
          <p className="mt-1 text-sm text-slate-700">Run your whole tournament here too: team registration and payments, scheduling, live scores and game-day tools, all in one place.</p>
          {state === 'sent' ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700"><Check size={16} aria-hidden />Thanks! We&apos;ll be in touch.</p>
          ) : !open ? (
            <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
              <Sparkles size={15} aria-hidden />Tell me more
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={org} onChange={e => setOrg(e.target.value)} placeholder="Your tournament or organization" aria-label="Your tournament or organization"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
              <button type="button" onClick={send} disabled={!org.trim() || state === 'sending'}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {state === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          )}
          {state === 'error' && <p className="mt-2 text-xs text-red-600">That didn&apos;t send. Please try again.</p>}
        </div>
      </div>
    </div>
  )
}
