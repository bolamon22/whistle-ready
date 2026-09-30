'use client'
import { AlertTriangle } from 'lucide-react'
import { findShortTeams, describeFinding, type BalanceGame } from '@/lib/gameBalance'

// Standing warning that some teams are scheduled fewer games than their pool.
//
// Deliberately computed from the games on every render rather than stored when
// a team is deleted: a stored flag goes stale the moment the schedule is fixed,
// and the organizer may not open the Scheduler for days. This is always true of
// the schedule as it stands right now, and it disappears by itself once the
// pool is level again.
//
// Amber, not red -- an uneven pool is something to deal with before game day,
// not an error. Red is the required-field color.
export default function ShortTeamsBanner({
  games, guarantee = 0, division, onFix, fixLabel = 'Rebalance pool games', className = '',
}: {
  games: BalanceGame[]
  /** Games-per-team promise, 0 to skip that check. */
  guarantee?: number
  /** Limit to one division; omit to check the whole tournament. */
  division?: string
  onFix?: (division: string) => void
  fixLabel?: string
  className?: string
}) {
  const findings = findShortTeams(division ? games.filter(g => g.division === division) : games, guarantee)
  if (!findings.length) return null

  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 ${className}`}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            {findings.length === 1 ? 'A pool is uneven' : `${findings.length} pools are uneven`}
            <span className="font-normal text-amber-800"> — some teams are scheduled fewer games than the rest.</span>
          </p>
          <ul className="space-y-1.5">
            {findings.map(f => (
              <li key={`${f.division}-${f.pool}`} className="text-sm text-amber-900 flex flex-wrap items-baseline gap-x-2">
                {!division && <span className="font-semibold">{f.division}:</span>}
                <span>{describeFinding(f)}</span>
                {f.belowGuarantee && (
                  <span className="text-xs font-semibold text-amber-700">Under the {guarantee}-game guarantee.</span>
                )}
                {onFix && (
                  <button onClick={() => onFix(f.division)}
                    className="text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700">
                    {fixLabel}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
