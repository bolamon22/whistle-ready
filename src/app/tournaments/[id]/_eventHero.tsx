import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import EventInfoNav from '@/components/EventInfoNav'
import { TONE_CLASS_DARK, type BadgeTone } from '@/lib/regStatus'
import FactStripScroller from './_factStripScroller'

// THE header for every public page of an event: the photo hero and the fact
// strip under it. It used to exist three times -- the event page had this one,
// the forms/waiver/rules pages had an older gradient hero via _eventChrome, and
// the schedule page drew a third of its own -- so the look forked every time
// one was touched. Markup lives here only. Callers work out the props.
//
// The fact strip doubles as the event's section nav, so `active` marks the cell
// for the page being shown.

export type HeroFact = { key: string; label: string; value: string; href?: string }

export interface EventHeroProps {
  name: string
  logoUrl?: string
  heroImage?: string
  /** "Lacrosse · Oct 24–25, 2026 · Wellington, FL" */
  eyebrow: string
  /** Registration status or "Final results". Information, so it sits with the
   *  eyebrow and never with the buttons -- it must not read as a step. */
  badge?: { tone: BadgeTone; label: string } | null
  registerHref?: string
  infoItems: { href: string; label: string }[]
  facts: HeroFact[]
  /** Key of the fact cell for the current page. */
  active?: string
  /** Where the logo and title link to. Omitted on the event page itself. */
  homeHref?: string
}

// Tailwind only ships classes it can see, so these are spelled out rather than
// built from the count. Below sm the strip is a swipeable row instead.
const FACT_COLS: Record<number, string> = {
  1: 'sm:grid-cols-2', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6',
  // Seven across only fits from lg up. Between sm and lg it is two rows of four
  // and three, which left an empty slot bottom-right -- at iPad width, where the
  // organizer actually runs the app. The last cell takes the spare column there.
  7: 'sm:grid-cols-4 lg:grid-cols-7 sm:max-lg:[&>*:last-child]:col-span-2',
}

export default function EventHero({
  name, logoUrl, heroImage, eyebrow, badge, registerHref, infoItems, facts, active, homeHref,
}: EventHeroProps) {
  const identity = (
    <>
      {logoUrl && (
        <img src={logoUrl} alt="" className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-2xl object-contain bg-white/95 p-1.5 shrink-0 ring-2 ring-white/40" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="text-teal-300 text-[11px] sm:text-xs font-semibold tracking-[0.16em] uppercase">{eyebrow}</div>
          {badge && (
            <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${TONE_CLASS_DARK[badge.tone]}`}>{badge.label}</span>
          )}
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.04] mt-1">{name}</h1>
      </div>
    </>
  )

  return (
    <>
      <section className="relative text-white bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a]">
        {heroImage && <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${heroImage})` }} aria-hidden />}
        {/* Bottom-weighted scrim: the title sits low, so darkness concentrates
            where the text is and the photo stays visible up top. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#040c18]/90 via-[#040c18]/45 to-[#040c18]/15" aria-hidden />
        {/* No overflow-hidden here: it would clip the Event info dropdown. */}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-10">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5">
            {homeHref
              ? <Link href={homeHref} className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5 flex-1 min-w-0">{identity}</Link>
              : <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5 flex-1 min-w-0">{identity}</div>}
            <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pb-1">
              {registerHref && (
                <Link href={registerHref} className="inline-flex items-center gap-1.5 text-sm font-semibold px-6 py-3 rounded-xl bg-[#16b886] hover:bg-[#13a87b] text-[#04241b] shadow-lg shadow-emerald-900/20 transition-colors">
                  <ClipboardList size={15} /> Register a team
                </Link>
              )}
              <EventInfoNav items={infoItems} />
            </div>
          </div>
        </div>
      </section>

      {facts.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative -mt-6">
          {/* Phone: one swipeable row. Seven cells as a 2-column grid came to
              four rows -- most of a phone screen of chrome before a spectator
              reached the standings they came for. */}
          <div id="event-facts"
            className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex overflow-x-auto sm:grid sm:overflow-visible ${FACT_COLS[facts.length] || 'sm:grid-cols-4'} divide-x divide-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
            {facts.map(f => {
              const isActive = f.key === active
              const cls = `shrink-0 min-w-[112px] sm:min-w-0 px-4 py-3 sm:py-4 text-center block transition-colors ${
                isActive ? 'bg-teal-50/70 shadow-[inset_0_-3px_0_#14b8a6]' : f.href ? 'hover:bg-slate-50' : ''}`
              const inner = (
                <>
                  <div className="text-[10px] tracking-[0.08em] text-slate-400 font-semibold uppercase whitespace-nowrap">{f.label}</div>
                  <div className={`text-sm font-bold mt-1 line-clamp-2 ${isActive ? 'text-teal-800' : f.href ? 'text-teal-700' : 'text-slate-900'}`}>{f.value}</div>
                </>
              )
              return f.href && !isActive
                ? <a key={f.key} href={f.href} {...(f.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className={cls}>{inner}</a>
                : <div key={f.key} className={cls} {...(isActive ? { 'aria-current': 'page' as const, 'data-active': 'true' } : {})}>{inner}</div>
            })}
          </div>
          {active && <FactStripScroller stripId="event-facts" />}
        </div>
      )}
    </>
  )
}
