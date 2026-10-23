import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// The slim header on every page inside game day mode (/tournaments/<id>/today/*):
// back to the Game day screen, the page's title, and the same page on the full site.
// Used in place of the full site's photo hero and fact strip (Bo, Oct 23 2026: every
// Game day button should stay in the mobile view). No hooks, so server pages use it too.
export default function GameDayHeader({ tournamentId, title, fullHref }: { tournamentId: string; title: string; fullHref: string }) {
  return (
    <div className="sticky top-0 z-30 bg-[#0b1f3a] text-white">
      <div className="max-w-6xl mx-auto px-3 h-12 flex items-center gap-2">
        <Link href={`/tournaments/${tournamentId}/today`} data-testid="gd-back" className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-teal-200 shrink-0 pr-1 py-2">
          <ChevronLeft size={16} /> Game day
        </Link>
        <div className="flex-1 min-w-0 text-center text-[13px] font-semibold truncate">{title}</div>
        <Link href={fullHref} className="text-[12px] text-slate-200 border border-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-0.5 shrink-0">Full site <ChevronRight size={12} /></Link>
      </div>
    </div>
  )
}
