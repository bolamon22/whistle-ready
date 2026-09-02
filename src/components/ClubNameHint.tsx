'use client'
import { useEffect, useState } from 'react'
import { findNearMatch } from '@/lib/names'

/** Club names the organizer already has on file (all events), for the near-duplicate hint. */
export function useKnownClubs(tournamentId: string | undefined | null): string[] {
  const [clubs, setClubs] = useState<string[]>([])
  useEffect(() => {
    if (!tournamentId) return
    let alive = true
    fetch(`/api/tournaments/${tournamentId}/clubs`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && Array.isArray(d.clubs)) setClubs(d.clubs) })
      .catch(() => {})
    return () => { alive = false }
  }, [tournamentId])
  return clubs
}

/**
 * Sits under a Club Name input. When the typed name is only cosmetically
 * different from one already on file (case, spacing, "Lacrosse" vs "Lax"…),
 * offers that spelling so the club doesn't get a second identity.
 */
export default function ClubNameHint({ value, known, onUse }: { value: string; known: string[]; onUse: (name: string) => void }) {
  const match = findNearMatch(value, known)
  if (!match) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
      <span>Already on file as <span className="font-semibold">&ldquo;{match}&rdquo;</span> &mdash; same club?</span>
      <button type="button" onClick={() => onUse(match)} className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">
        Use that spelling
      </button>
    </div>
  )
}
