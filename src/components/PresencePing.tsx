'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'

// Tells the server "this person is on" every 2 minutes while a tab is visible,
// and right away when they come back to it. Feeds the "who's on" pill and the
// "last on" times on the staff schedule. Renders nothing.
const EVERY_MS = 2 * 60_000

export default function PresencePing() {
  const { status } = useSession()
  useEffect(() => {
    if (status !== 'authenticated') return
    let last = 0
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - last < 30_000) return
      last = now
      fetch('/api/presence', { method: 'POST', keepalive: true }).catch(() => {})
    }
    ping()
    const t = setInterval(ping, EVERY_MS)
    document.addEventListener('visibilitychange', ping)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping) }
  }, [status])
  return null
}
