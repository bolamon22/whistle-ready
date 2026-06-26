'use client'

import { useEffect, useState } from 'react'

// Shows a "SANDBOX / PREVIEW" badge on every non-production deploy so a test
// copy is never mistaken for the live site. Auto-hides on production
// (whistle-ready.vercel.app or NEXT_PUBLIC_VERCEL_ENV === 'production').
export default function EnvBadge() {
  const [show, setShow] = useState(false)
  const [label, setLabel] = useState('SANDBOX PREVIEW')

  useEffect(() => {
    const h = window.location.hostname
    const vEnv = process.env.NEXT_PUBLIC_VERCEL_ENV
    const isLocal = h === 'localhost' || h.startsWith('127.') || h.startsWith('192.168.')
    const isProd = vEnv === 'production' || h === 'whistle-ready.vercel.app' || h === 'whistleready.app' || h === 'www.whistleready.app'
    if (isProd) return
    setLabel(isLocal ? 'LOCAL DEV' : 'SANDBOX PREVIEW')
    setShow(true)
  }, [])

  if (!show) return null
  return (
    <div className="fixed bottom-3 right-3 z-[200] pointer-events-none select-none">
      <div className="flex items-center gap-1.5 bg-amber-500 text-black text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg border border-amber-600">
        <span className="w-2 h-2 rounded-full bg-black/70" />
        {label} — not the live site
      </div>
    </div>
  )
}
