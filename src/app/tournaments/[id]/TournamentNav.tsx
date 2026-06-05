'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  id: string
  name: string
  logoUrl?: string
  stats?: { games: number; assigned: number; pct: number }
}

export default function TournamentNav({ id, name, logoUrl, stats }: Props) {
  const pathname = usePathname()
  const base = `/tournaments/${id}`

  const tabs = [
    { href: base,                    label: 'Schedule',      exact: true },
    { href: `${base}/dashboard`,     label: 'Dashboard'                  },
    { href: `${base}/roster`,        label: 'Staff'                      },
    { href: `${base}/registrations`, label: 'Registrations'              },
    { href: `${base}/settings`,      label: 'Settings'                   },
  ]

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className="bg-[#0f1f3d] mb-6">
      <div className="px-6 pt-5 pb-0">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-3">
            {logoUrl
              ? <img src={logoUrl} alt="logo" className="h-11 w-11 object-contain rounded-xl border border-white/10 bg-white/5 flex-shrink-0" />
              : <div className="h-11 w-11 rounded-xl border border-white/10 bg-white/5 flex-shrink-0" />
            }
            <div>
              <div className="text-[11px] text-slate-400 mb-0.5">
                <Link href="/" className="hover:text-teal-400 transition-colors">Tournaments</Link>
                <span className="mx-1 opacity-40">/</span>
              </div>
              <h1 className="text-lg font-bold text-white leading-tight">{name}</h1>
              {stats && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-slate-400">{stats.games} games</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-[11px] text-sky-400">{stats.assigned} assigned</span>
                  {stats.games > 0 && (
                    <span className={`text-[11px] font-semibold ${stats.pct >= 90 ? 'text-emerald-400' : stats.pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                      {stats.pct}%
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Utility links */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href={`${base}/register`} target="_blank"
              className="text-xs text-slate-300 hover:text-white border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors">
              📝 Register
            </Link>
            <Link href={`${base}/public`} target="_blank"
              className="text-xs text-slate-300 hover:text-white border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors">
              🌐 Public
            </Link>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive(tab.href, tab.exact)
                  ? 'border-teal-400 text-teal-300'
                  : 'border-transparent text-slate-400 hover:text-white hover:border-white/20'
              }`}>
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
