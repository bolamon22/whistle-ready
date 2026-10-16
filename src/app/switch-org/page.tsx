'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { safeNext, switchOrg } from '@/lib/switchOrg'

// A link into an event of another organization this login works in (an emailed
// "can't work" alert from Sunshine while working in your own organization): middleware
// sends it here with ?to=<org>&next=<page>, this switches (lib/orgMembers) and opens
// the page. Nobody lands here otherwise.
export default function SwitchOrgPage() {
  const { status, update } = useSession()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (status === 'unauthenticated') { window.location.replace('/login'); return }
    if (status !== 'authenticated' || started.current) return
    started.current = true
    const q = new URLSearchParams(window.location.search)
    const to = q.get('to') || ''
    const next = safeNext(q.get('next'))
    if (!to) { window.location.replace(next); return }
    switchOrg(update, to).then(ok => {
      if (ok) window.location.replace(next)
      else setFailed(true)
    })
  }, [status, update])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {failed ? (
          <>
            <p className="text-base font-bold text-slate-900">That event isn’t in your organizations</p>
            <p className="mt-1 text-sm text-slate-600">Ask whoever runs it to add you, or go back to your own events.</p>
            <a href="/" className="mt-4 inline-flex h-10 items-center rounded-full bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800">Go home</a>
          </>
        ) : (
          <>
            <span aria-hidden className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <p className="text-sm font-semibold text-slate-700" role="status">Switching organization…</p>
          </>
        )}
      </div>
    </div>
  )
}
