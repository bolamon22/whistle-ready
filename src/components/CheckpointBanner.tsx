'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { History, X } from 'lucide-react'

// On the Assigner board: when games that had officials moved, changed teams, were
// canceled or removed since the newest checkpoint (lib/assignCheckpoint), say so and link
// to what they had. Hidden per checkpoint once dismissed (this browser).

type Latest = { id: string; at: string; affected: number }
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })

export default function CheckpointBanner({ tournamentId }: { tournamentId: string }) {
  const [latest, setLatest] = useState<Latest | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/checkpoints`).then(r => (r.ok ? r.json() : null)).then(d => {
      const l: Latest | null = d?.latest || null
      if (!l || !l.affected) return
      try { if (localStorage.getItem('cpSeen:' + tournamentId) === l.id) setHidden(true) } catch { /* no storage */ }
      setLatest(l)
    }).catch(() => {})
  }, [tournamentId])
  if (!latest || hidden) return null
  function dismiss() {
    setHidden(true)
    try { localStorage.setItem('cpSeen:' + tournamentId, latest!.id) } catch { /* no storage */ }
  }
  return (
    <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
      <History size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
      <p className="flex-1">
        The schedule changed since {when(latest.at)}: {latest.affected} game{latest.affected === 1 ? '' : 's'} with officials moved, changed teams, were canceled or removed.{' '}
        <Link href={`/tournaments/${tournamentId}/checkpoints?cp=${encodeURIComponent(latest.id)}`} className="font-semibold underline">See who had them</Link>
      </p>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="-m-1 inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded text-amber-700 hover:bg-amber-100 sm:min-h-0 sm:min-w-0 sm:p-1"><X size={15} aria-hidden /></button>
    </div>
  )
}
