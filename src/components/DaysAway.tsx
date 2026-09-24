'use client'
import { useEffect, useState } from 'react'
import { daysUntil } from '@/lib/eventDays'

// "N days away", counted in the VIEWER's time zone rather than the server's.
//
// The org homepage is a server component, so anything it computes from Date.now()
// uses Vercel's clock, which is UTC. After 8pm Eastern the server's calendar has
// already rolled over to tomorrow and the badge read a day short. Counting in the
// browser instead is the only way the number matches the calendar the reader is
// actually looking at. Renders nothing until mounted so the server and client
// markup can't disagree during hydration.
export default function DaysAway({ startDate, className = '' }: { startDate: string; className?: string }) {
  const [days, setDays] = useState<number | null>(null)
  useEffect(() => { setDays(daysUntil(startDate)) }, [startDate])
  if (days === null || days <= 0) return null
  return <span className={className}>{days} day{days === 1 ? '' : 's'} away</span>
}
