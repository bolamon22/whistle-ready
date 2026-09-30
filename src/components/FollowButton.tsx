'use client'
import { Check, UserPlus } from 'lucide-react'

// THE follow control, everywhere on the public schedule. It replaced three: an
// amber star on game rows, a yellow pill in search results, and a green "Get
// Notified" button that saved an email address to the visitor's own browser and
// told them they were signed up.
//
// Instagram's shape in the app's teal: solid until you follow, quiet grey with
// a check once you have. `compact` is the icon-only form for a dense row (a
// standings table, a game line) where a labelled button would crowd the scores.

export default function FollowButton({
  team, following, onToggle, compact = false, className = '', disabled = false,
}: {
  team: string
  following: boolean
  onToggle: (team: string) => void
  compact?: boolean
  className?: string
  disabled?: boolean
}) {
  const label = following ? `Following ${team}. Tap to unfollow.` : `Follow ${team}`
  if (compact) {
    return (
      <button type="button" onClick={() => onToggle(team)} disabled={disabled} aria-pressed={following} aria-label={label} title={label}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full border transition-colors flex-shrink-0 disabled:opacity-50 ${
          following ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200' : 'bg-teal-600 border-teal-600 text-white hover:bg-teal-700'} ${className}`}>
        {following ? <Check size={13} strokeWidth={2.5} /> : <UserPlus size={13} strokeWidth={2.25} />}
      </button>
    )
  }
  return (
    <button type="button" onClick={() => onToggle(team)} disabled={disabled} aria-pressed={following} aria-label={label}
      className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold leading-none rounded-lg px-3.5 py-2 border transition-colors whitespace-nowrap active:scale-[.97] disabled:opacity-50 ${
        following ? 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200' : 'bg-teal-600 border-teal-600 text-white hover:bg-teal-700'} ${className}`}>
      {following ? <><Check size={13} strokeWidth={2.5} /> Following</> : 'Follow'}
    </button>
  )
}
