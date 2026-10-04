'use client'

// "Send this to your families" — the three messages a club director has to get
// out before an event, already written, ready to send FROM them (Bo, Oct 4 2026).
// Reached from the pre-event checklist email, one anchored button per row; the
// regId in the URL is the key, same trust model as /confirm/[regId].
//
// The cards themselves are components/FamilyMessages, shared with the club
// director portal so the two can never look different.

import { useEffect, useState } from 'react'
import FamilyMessages from '@/components/FamilyMessages'
import type { FamilyMessage } from '@/lib/familyMessages'

type Data = { clubName: string; eventName: string; dates: string; messages: FamilyMessage[] }

export default function ShareWithFamiliesPage({ params }: { params: { regId: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  // Which message the checklist email sent them here for (#waivers, #coaches,
  // #hotel). The browser cannot honour the anchor itself: the cards do not
  // exist until the fetch lands, so without this the per-row buttons would all
  // drop the director at the top of the page.
  const [target, setTarget] = useState('')

  useEffect(() => {
    fetch(`/api/registrations/${params.regId}/share`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Failed to load'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
    setTarget((typeof window !== 'undefined' ? window.location.hash : '').replace('#', ''))
  }, [params.regId])

  useEffect(() => {
    if (!data || !target) return
    const el = document.getElementById(target)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [data, target])

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-extrabold tracking-[0.14em] text-teal-700 mb-1">SEND TO YOUR FAMILIES</p>
        <h1 className="text-2xl font-extrabold text-slate-900">
          {data ? `${data.clubName} — ${data.eventName}` : 'Messages for your families'}
        </h1>
        <p className="text-sm text-slate-600 mt-2 mb-5">
          These are written for you. Edit anything you like, then copy it or open it straight in your email.
          It sends from you, to your own list — we never email your families ourselves.
        </p>

        {error && <div className="bg-white border border-slate-200 rounded-2xl p-5 text-sm text-slate-600">{error}</div>}
        {!data && !error && <p className="text-sm text-slate-400">Loading…</p>}

        {data && <FamilyMessages messages={data.messages} highlight={target} />}

        <p className="text-center text-xs text-slate-400 mt-6">
          Questions? Just reply to the email that brought you here.
        </p>
      </div>
    </div>
  )
}
