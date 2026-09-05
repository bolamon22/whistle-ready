'use client'

// The housing company's board — reached only by the private code link the org
// shares (no account, no login; rotate the code to kill old links). Everything
// on it reads/writes through /api/housing/board with the code as the key.

import { useEffect, useState } from 'react'
import HousingBoard, { HousingCounts } from '@/components/HousingBoard'

export default function HousingBoardPage({ params }: { params: { code: string } }) {
  const [events, setEvents] = useState<any[]>([])
  const [orgName, setOrgName] = useState('')

  // orgName rides the same payload the board fetches; one tiny extra call keeps
  // the header independent of the board's load/error state
  useEffect(() => {
    fetch(`/api/housing/board?code=${encodeURIComponent(params.code)}`)
      .then(r => r.ok ? r.json() : null).then(d => { if (d?.orgName) setOrgName(d.orgName) }).catch(() => {})
  }, [params.code])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-[#0f1f3d] px-5 sm:px-9 py-5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-teal-400 mb-1">{(orgName || 'WHISTLE READY').toUpperCase()} · TEAM HOUSING</p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white">Hotel booking board</h1>
            <p className="text-xs text-slate-400 mt-1">Update each club as blocks get set — changes save as you go. This link is private to you.</p>
          </div>
          <HousingCounts events={events} />
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-9 py-6">
        <HousingBoard code={params.code} onData={setEvents} />
        <p className="text-[11.5px] text-slate-400 mt-5">Changes save as you make them — {orgName || 'the organizer'} sees updates instantly in Whistle Ready.</p>
      </div>
    </div>
  )
}
