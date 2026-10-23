'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import PublicSchedule from '../../public/page'

// The full schedule inside game day mode (Bo, Oct 23 2026): every division, pool,
// schedule and bracket, under the Game day screen's compact header instead of the
// full site's photo hero and fact strip. The body is the public schedule page itself
// (/tournaments/<id>/public), so the two never drift apart; links into it work the
// same here (?division=&team=&tab=).

export default function GameDaySchedulePage() {
  const params = useParams() as any
  const id = String(params?.id || '')
  const [name, setName] = useState('')
  useEffect(() => {
    if (!id) return
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => d?.name && setName(String(d.name))).catch(() => { })
  }, [id])

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="sticky top-0 z-30 bg-[#0b1f3a] text-white">
        <div className="max-w-6xl mx-auto px-3 h-12 flex items-center gap-2">
          <Link href={`/tournaments/${id}/today`} data-testid="gd-back" className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-teal-200 shrink-0 pr-1 py-2">
            <ChevronLeft size={16} /> Game day
          </Link>
          <div className="flex-1 min-w-0 text-center text-[13px] font-semibold truncate">{name || 'Schedule'}</div>
          <Link href={`/tournaments/${id}/public?full=1`} className="text-[12px] text-slate-200 border border-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-0.5 shrink-0">Full site <ChevronRight size={12} /></Link>
        </div>
      </div>
      <PublicSchedule />
    </div>
  )
}
