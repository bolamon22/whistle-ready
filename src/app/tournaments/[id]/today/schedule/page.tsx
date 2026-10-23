'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import GameDayHeader from '@/components/GameDayHeader'
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
      <GameDayHeader tournamentId={id} title={name || 'Schedule'} fullHref={`/tournaments/${id}/public?full=1`} />
      <PublicSchedule />
    </div>
  )
}
