'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { BellRing, X } from 'lucide-react'
import { pushSupport, currentSubscription } from '@/lib/pushClient'
import { isStaffThemeRoute } from '@/app/ThemeShell'

// A small, dismissible card on staff phones that don't have game-day alerts on
// yet, so nobody has to remember to go find the setting. Phones only; snoozes
// for a week when closed; never on the live scorer (a full-screen tool) or on
// public pages; never for coaches, parents or club directors.
const SNOOZE = 'wr-alerts-nudge'
const EXTERNAL = ['coach', 'parent', 'club_director', 'viewer']

export default function AlertsNudge() {
  const pathname = usePathname() || ''
  const { data: session, status } = useSession()
  const [show, setShow] = useState<'' | 'enable' | 'install'>('')
  const role = String((session?.user as { role?: string } | undefined)?.role || '')

  useEffect(() => {
    setShow('')
    if (status !== 'authenticated' || EXTERNAL.includes(role)) return
    if (!isStaffThemeRoute(pathname) || /\/scorekeeper\/?$/.test(pathname) || pathname.startsWith('/dashboard/alerts')) return
    if (!window.matchMedia?.('(pointer: coarse)').matches) return   // phones and tablets only
    try { if (Date.now() < Number(localStorage.getItem(SNOOZE) || 0)) return } catch { /* show */ }
    const sup = pushSupport()
    if (sup.needsInstall) { setShow('install'); return }
    if (!sup.supported || (typeof Notification !== 'undefined' && Notification.permission === 'denied')) return
    let live = true
    ;(async () => {
      const sub = await currentSubscription()
      const d = await fetch(`/api/staff-alerts${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ''}`).then(r => r.ok ? r.json() : null).catch(() => null)
      if (live && d && !d.subscribed) setShow('enable')
    })()
    return () => { live = false }
  }, [pathname, status, role])

  if (!show) return null
  const snooze = () => { try { localStorage.setItem(SNOOZE, String(Date.now() + 7 * 86400000)) } catch {} ; setShow('') }
  return (
    <div className="fixed left-3 right-20 bottom-4 z-40 sm:left-auto sm:right-24 sm:w-80 rounded-2xl bg-white border border-amber-200 shadow-xl p-3 flex items-start gap-2.5" role="status">
      <BellRing size={20} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900">Get game-day alerts</p>
        <p className="text-xs text-slate-600">{show === 'install' ? 'Add Whistle Ready to your Home Screen so field requests buzz your phone.' : 'Field requests can buzz this phone.'}</p>
        <Link href="/dashboard/alerts" onClick={() => setShow('')} className="inline-block mt-1.5 text-sm font-bold text-teal-700">{show === 'install' ? 'Show me how →' : 'Turn on →'}</Link>
      </div>
      <button type="button" onClick={snooze} aria-label="Not now" className="p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
    </div>
  )
}
