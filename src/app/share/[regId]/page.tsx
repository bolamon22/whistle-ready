'use client'

// "Send this to your families" — the three messages a club director has to get
// out before an event, already written, ready to send FROM them (Bo, Oct 4 2026).
// Reached from the pre-event checklist email; the regId in the URL is the key,
// same trust model as /confirm/[regId].
//
// Why a page rather than buttons in the email: an email cannot run script, so it
// cannot offer a Copy button, and a compose deep link is length-capped. Here the
// director can edit the wording first, then copy it or hand it to Gmail/Outlook.
// Nothing is ever sent for them — the button only opens a compose window.

import { useEffect, useState } from 'react'
import { composeUrls, type FamilyMessage } from '@/lib/familyMessages'

type Data = { clubName: string; eventName: string; dates: string; messages: FamilyMessage[] }

export default function ShareWithFamiliesPage({ params }: { params: { regId: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  // Edited copy per message, so a director can make it sound like them.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState('')
  // Which message the checklist email sent them here for (#waivers, #coaches,
  // #hotel). The browser cannot honour the anchor itself: the cards do not
  // exist until the fetch lands, so without this the link just drops you at the
  // top and the per-row buttons may as well not be anchored at all.
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

  const bodyOf = (m: FamilyMessage) => (edits[m.key] ?? m.body)

  async function copy(m: FamilyMessage) {
    const text = `Subject: ${m.subject}\n\n${bodyOf(m)}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(m.key)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      // Clipboard is blocked on some in-app browsers; give them something usable.
      window.prompt('Copy this message', text)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-extrabold tracking-[0.14em] text-teal-700 mb-1">SEND TO YOUR FAMILIES</p>
        <h1 className="text-2xl font-extrabold text-slate-900">
          {data ? `${data.clubName} — ${data.eventName}` : 'Messages for your families'}
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          These are written for you. Edit anything you like, then copy it or open it straight in your email.
          It sends from you, to your own list — we never email your families ourselves.
        </p>

        {error && (
          <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 text-sm text-slate-600">{error}</div>
        )}
        {!data && !error && <p className="text-sm text-slate-400 mt-6">Loading…</p>}

        {data?.messages.map(m => {
          const urls = composeUrls(m.subject, bodyOf(m))
          return (
            <div key={m.key} id={m.key}
              className={`mt-5 bg-white rounded-2xl shadow-sm p-5 scroll-mt-6 border ${target === m.key ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200'}`}>
              <h2 className="text-lg font-bold text-slate-900">{m.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{m.blurb}</p>

              <label className="block text-[11px] font-bold tracking-wide text-slate-400 mt-4 mb-1">SUBJECT</label>
              <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{m.subject}</div>

              <label htmlFor={`body-${m.key}`} className="block text-[11px] font-bold tracking-wide text-slate-400 mt-3 mb-1">MESSAGE</label>
              <textarea id={`body-${m.key}`} rows={12} value={bodyOf(m)}
                onChange={e => setEdits(x => ({ ...x, [m.key]: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500" />

              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => copy(m)}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                  {copied === m.key ? 'Copied' : 'Copy'}
                </button>
                <a href={urls.gmail} target="_blank" rel="noreferrer"
                  className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">Open in Gmail</a>
                <a href={urls.outlook} target="_blank" rel="noreferrer"
                  className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">Open in Outlook</a>
                <a href={urls.mailto}
                  className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">My email app</a>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Opens a draft with everything filled in — you add your families and hit send. Nothing goes out until you do.
              </p>
            </div>
          )
        })}

        <p className="text-center text-xs text-slate-400 mt-6">
          On an Outlook.com personal account, use Copy or My email app. Questions? Just reply to the email that brought you here.
        </p>
      </div>
    </div>
  )
}
