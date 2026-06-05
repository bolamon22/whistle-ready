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
    { href: base,                          label: '📅 Schedule',      exact: true  },
    { href: `${base}/dashboard`,           label: '📊 Dashboard'                   },
    { href: `${base}/roster`,              label: '👥 Staff'                        },
    { href: `${base}/registrations`,       label: '📋 Registrations'               },
    { href: `${base}/player-registrations`,label: '🏃 Players'                     },
    { href: `${base}/financials`,          label: '💰 Financials'                   },
    { href: `${base}/pay-summary`,         label: '$ Pay'                           },
    { href: `${base}/availability`,        label: '🗓 Availability'                 },
    { href: `${base}/time-entries`,        label: '⏱ Time'                          },
    { href: `${base}/settings`,            label: '⚙ Settings'                     },
    { href: `${base}/builder`,             label: '🏗 Builder'                      },
    { href: `${base}/scores`,              label: '🎯 Post Scores'                  },
    { href: `${base}/assignments`,         label: '📌 Assignments'                  },
  ]

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className="mb-6">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        {logoUrl && (
          <img src={logoUrl} alt="logo"
            className="h-12 w-12 object-contain rounded-xl border border-slate-200 bg-slate-50 flex-shrink-0" />
        )}
        <div>
          <div className="text-xs text-slate-400">
            <Link href="/" className="hover:text-sky-600">Tournaments</Link>
            <span className="mx-1">/</span>
            <span className="text-slate-600 font-medium">{name}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{name}</h1>
          {stats && (
            <div className="flex items-center gap-2 mt-1">
              <span className="badge bg-slate-100 text-slate-600">{stats.games} games</span>
              <span className="badge bg-sky-100 text-sky-700">{stats.assigned} assigned</span>
              {stats.games > 0 && (
                <span className={`badge ${stats.pct >= 90 ? 'bg-emerald-100 text-emerald-700' : stats.pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                  {stats.pct}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto pb-0">
        {tabs.map(tab => (
          <Link key={tab.href} href={tab.href}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              isActive(tab.href, tab.exact)
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}>
            {tab.label}
          </Link>
        ))}
        <div className="flex-1" />
        {/* Quick links on right side of tab bar */}
        <Link href={`${base}/public`} target="_blank"
          className="px-3 py-2 text-sm text-emerald-600 hover:text-emerald-700 whitespace-nowrap border-b-2 border-transparent">
          🌐 Public
        </Link>
        <Link href={`${base}/register`} target="_blank"
          className="px-3 py-2 text-sm text-emerald-600 hover:text-emerald-700 whitespace-nowrap border-b-2 border-transparent">
          📝 Register
        </Link>
      </div>
    </div>
  )
}
