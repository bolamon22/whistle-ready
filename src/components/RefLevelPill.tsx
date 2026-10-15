import { REF_LEVELS, refLevelOf } from '@/lib/refLevel'

// A ref's level (lib/refLevel) as a solid red / yellow / green "L1"-"L3" pill. Solid with
// the number on it, so it doesn't read as the tinted game-count pills on the board,
// which use the same three colors for how busy someone is.
// `small` fits the compact board's one-line chips.
export default function RefLevelPill({ level, small = false, className = '' }: { level: unknown; small?: boolean; className?: string }) {
  const l = REF_LEVELS.find(x => x.value === refLevelOf(level))
  if (!l) return null
  return (
    <span title={`Ref ${l.label.toLowerCase()} of 3`} aria-label={`Ref ${l.label.toLowerCase()}`}
      className={`inline-flex shrink-0 items-center justify-center rounded font-extrabold ${small ? 'px-0.5 text-[8px] leading-3' : 'px-1 text-[10px] leading-4'} ${l.pill} ${className}`}>
      L{l.value}
    </span>
  )
}
