'use client'
import { useEffect, useState } from 'react'

// Live countdown to the event start date. Renders nothing time-sensitive until
// mounted (avoids hydration mismatch).
export default function CountdownBlock({ title, target }: { title?: string; target: string }) {
  const targetMs = (() => { const d = new Date(target); return isNaN(d.getTime()) ? 0 : d.getTime() })()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const diff = now && targetMs ? targetMs - now : 0
  const past = now !== null && targetMs > 0 && diff <= 0
  const d = Math.max(0, Math.floor(diff / 86400000))
  const h = Math.max(0, Math.floor((diff % 86400000) / 3600000))
  const m = Math.max(0, Math.floor((diff % 3600000) / 60000))
  const s = Math.max(0, Math.floor((diff % 60000) / 1000))
  const cell = (n: number, l: string) => (
    <div className="flex flex-col items-center">
      <span className="text-3xl sm:text-4xl font-extrabold tabular-nums">{String(n).padStart(2, '0')}</span>
      <span className="text-[11px] uppercase tracking-wide text-teal-100/80">{l}</span>
    </div>
  )
  return (
    <div className="bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white rounded-2xl px-6 py-6 text-center">
      {title && <div className="text-sm font-semibold uppercase tracking-wide text-teal-100/90 mb-3">{title}</div>}
      {now === null ? (
        <div className="text-teal-100/70 text-sm">Loading…</div>
      ) : past ? (
        <div className="text-2xl font-extrabold">It&apos;s game time!</div>
      ) : (
        <div className="flex items-center justify-center gap-4 sm:gap-6">{cell(d, 'days')}{cell(h, 'hrs')}{cell(m, 'min')}{cell(s, 'sec')}</div>
      )}
    </div>
  )
}
