'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Smartphone, ChevronRight } from 'lucide-react'

// Game day mode on a phone (lib/gameDay, Bo Oct 23 2026). On the event page and the
// organization's home page (`redirect`), a phone in the event's game day window goes
// straight to the Game day screen, unless the visitor turned "Always open the schedule
// first" off there (localStorage gd-auto-off) or came back with "Full site" (?full=1,
// remembered for this visit in sessionStorage). On any public page (`bar`), a "Mobile
// view" pill at the bottom left leads back (Bo: phones on the full site need an obvious
// way back), naming the picked team once there is one. Tapping it ends the Full site
// visit, so the phone opens the schedule first again. Bottom left because the Chirp
// launcher sits at the bottom right.

export const GD_AUTO_OFF = 'gd-auto-off'
export const GD_FULL = 'gd-full'
export const gdTeamKey = (tournamentId: string) => `gd-team-${tournamentId}`

export type GameDayInfo = {
  active: boolean; inWindow?: boolean; off?: boolean; from?: string; to?: string; name?: string; heroImage?: string
  next?: { id: string; name: string; startDate: string; endDate: string } | null
}

const isBot = () => { try { return /bot|crawl|spider|slurp|preview|lighthouse/i.test(navigator.userAgent) } catch { return false } }
const read = (s: Storage | undefined, k: string) => { try { return s?.getItem(k) ?? null } catch { return null } }

export default function GameDayGate({ tournamentId, redirect = false, bar = true }: { tournamentId: string; redirect?: boolean; bar?: boolean }) {
  const [info, setInfo] = useState<GameDayInfo | null>(null)
  const [team, setTeam] = useState('')
  // Already in game day mode (the schedule under /today/schedule): no pill back to it.
  const [inside, setInside] = useState(false)

  useEffect(() => {
    if (!tournamentId) return
    try { setInside(window.location.pathname.includes('/today')) } catch { }
    let full = false
    try {
      if (new URLSearchParams(window.location.search).get('full') === '1') sessionStorage.setItem(GD_FULL, '1')
      full = read(sessionStorage, GD_FULL) === '1'
    } catch { }
    try { const t = JSON.parse(read(localStorage, gdTeamKey(tournamentId)) || 'null'); if (t?.name) setTeam(String(t.name)) } catch { }
    let gone = false
    fetch(`/api/tournaments/${tournamentId}/game-day`).then(r => r.ok ? r.json() : null).then((d: GameDayInfo | null) => {
      if (gone || !d) return
      setInfo(d)
      const phone = window.innerWidth < 768
      if (redirect && d.active && phone && !full && read(localStorage, GD_AUTO_OFF) !== '1' && !isBot()) {
        window.location.replace(`/tournaments/${tournamentId}/today`)
      }
    }).catch(() => { })
    return () => { gone = true }
  }, [tournamentId, redirect])

  if (!bar || inside || !info?.active) return null
  return (
    <Link href={`/tournaments/${tournamentId}/today`} data-testid="gameday-bar"
      onClick={() => { try { sessionStorage.removeItem(GD_FULL) } catch { } }}
      className="md:hidden fixed bottom-4 left-3 z-40 max-w-[62vw] bg-[#0b1f3a] text-white rounded-full pl-3 pr-2.5 py-2.5 shadow-lg shadow-slate-900/25 flex items-center gap-1.5 text-[13px] font-semibold">
      <Smartphone size={15} className="text-teal-300 shrink-0" />
      <span className="truncate">Mobile view{team ? <span className="font-normal text-slate-300"> · {team}</span> : null}</span>
      <ChevronRight size={14} className="text-slate-300 shrink-0" />
    </Link>
  )
}
