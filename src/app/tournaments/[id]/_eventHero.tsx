import Link from 'next/link'
import { ClipboardList, Calendar, MapPin, Layers, Ticket, BedDouble, CalendarDays, Activity, Trophy, type LucideIcon } from 'lucide-react'
import EventInfoNav from '@/components/EventInfoNav'
import { TONE_CLASS_DARK, type BadgeTone } from '@/lib/regStatus'
import type { HeroFact } from '@/lib/eventHero'

// THE header for every public page of an event: the photo hero and the fact
// strip under it. It used to exist three times -- the event page had this one,
// the forms/waiver/rules pages had an older gradient hero via _eventChrome, and
// the schedule page drew a third of its own -- so the look forked every time
// one was touched. Markup lives here only. Callers work out the props.
//
// The fact strip doubles as the event's section nav, so `active` marks the cell
// for the page being shown.
//
// Two layouts of the same facts (Bo, Oct 3). From sm up: one line per cell, a
// small mark ahead of each value, no label row -- the values say what they are,
// and the one that didn't ("from $1,495") carries its subject in the words. On
// a phone the old row swiped sideways and four of its seven cells started
// off-screen with nothing to say so; now the facts (dates, place, divisions)
// read as one line and the four things you can do sit under it as tabs that
// all fit. The tab for what matters now -- the schedule, once it is out -- is
// filled teal; when it is the current page it takes the underline instead.

const ICONS: Record<HeroFact['icon'], LucideIcon> = {
  'calendar': Calendar, 'map-pin': MapPin, 'layers': Layers, 'ticket': Ticket,
  'bed-double': BedDouble, 'clipboard-list': ClipboardList, 'calendar-days': CalendarDays,
  'activity': Activity, 'trophy': Trophy,
}

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
  /** Key of the cell a phone should push right now (lib/eventHero decides). */
  featured?: string
  /** Where the logo and title link to. Omitted on the event page itself. */
  homeHref?: string
}

// From sm to xl the cells sit in a grid that wraps to two rows; from xl up they
// share one row, each sized to its words -- seven equal columns clip "Team fee
// from $1,495" at that size. Tailwind only ships classes it can see, so the
// grids are spelled out per count rather than built from it. Seven cells
// between sm and xl is four and three, and the last cell takes the spare column
// so nothing sits empty bottom-right at iPad width, where the organizer runs the app.
const FACT_COLS: Record<number, string> = {
  1: 'sm:grid-cols-2', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  // Two rows need a rule between them; divide-x only draws the vertical ones.
  6: 'sm:grid-cols-3 lg:grid-cols-6 sm:max-lg:[&>*:nth-child(n+4)]:border-t sm:max-lg:[&>*:nth-child(n+4)]:border-t-slate-100',
  7: 'sm:grid-cols-4 sm:max-xl:[&>*:last-child]:col-span-2 sm:max-xl:[&>*:nth-child(n+5)]:border-t sm:max-xl:[&>*:nth-child(n+5)]:border-t-slate-100',
}

export default function EventHero({
  name, logoUrl, heroImage, eyebrow, badge, registerHref, infoItems, facts, active, featured, homeHref,
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
          {/* sm and up: one row of cells (two rows between sm and xl). */}
          <div className={`hidden sm:grid xl:flex bg-white border border-slate-200 rounded-2xl shadow-sm divide-x divide-slate-100 overflow-hidden ${FACT_COLS[facts.length] || 'sm:grid-cols-4'}`}>
            {facts.map(f => {
              const isActive = f.key === active
              const Icon = ICONS[f.icon]
              const cls = `xl:flex-[1_1_auto] px-3 py-3.5 text-center block transition-colors ${
                isActive ? 'bg-teal-50/70 shadow-[inset_0_-3px_0_#14b8a6]' : f.href ? 'hover:bg-slate-50' : ''}`
              const inner = (
                <span className={`inline-flex items-center justify-center gap-1.5 text-sm font-bold leading-tight line-clamp-2 xl:whitespace-nowrap ${isActive ? 'text-teal-800' : f.href ? 'text-teal-700' : 'text-slate-900'}`} title={f.label}>
                  <Icon size={15} className={`shrink-0 ${isActive ? 'text-teal-700' : f.href ? 'text-teal-600' : 'text-slate-400'}`} aria-hidden />
                  <span>{f.value}</span>
                </span>
              )
              return f.href && !isActive
                ? <a key={f.key} href={f.href} {...(f.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className={cls}>{inner}</a>
                : <div key={f.key} className={cls} {...(isActive ? { 'aria-current': 'page' as const } : {})}>{inner}</div>
            })}
          </div>

          {/* Phone: the facts as one line, the actions as tabs that all fit. */}
          <div className="sm:hidden bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {facts.some(f => f.kind === 'fact') && (
              <div className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12.5px] font-semibold text-slate-900 whitespace-nowrap overflow-hidden ${facts.some(f => f.kind === 'action') ? 'border-b border-slate-100' : ''}`}>
                {facts.filter(f => f.kind === 'fact').map((f, i) => {
                  const Icon = ICONS[f.icon]
                  const item = (
                    <>
                      <Icon size={13} className="shrink-0 text-slate-400" aria-hidden />
                      <span className="truncate">{f.short}</span>
                    </>
                  )
                  return (
                    <span key={f.key} className="contents">
                      {i > 0 && <span className="text-slate-300 px-0.5" aria-hidden>·</span>}
                      {f.href
                        ? <a href={f.href} className="inline-flex items-center gap-1.5 min-w-0">{item}</a>
                        : <span className="inline-flex items-center gap-1.5 min-w-0">{item}</span>}
                    </span>
                  )
                })}
              </div>
            )}
            {facts.some(f => f.kind === 'action') && (
              <div className="flex">
                {facts.filter(f => f.kind === 'action').map((f, i) => {
                  const isActive = f.key === active
                  const isFeatured = !isActive && f.key === featured
                  const Icon = ICONS[f.icon]
                  const cls = `flex-1 min-w-0 flex flex-col items-center justify-center gap-[3px] px-1 pt-2 pb-[7px] text-[11px] font-bold leading-tight transition-colors ${
                    i > 0 && !isFeatured ? 'border-l border-slate-100' : ''} ${
                    isActive ? 'bg-teal-50/70 shadow-[inset_0_-3px_0_#14b8a6] text-teal-800'
                    : isFeatured ? 'bg-teal-700 text-white'
                    : 'text-teal-700 hover:bg-slate-50'}`
                  const inner = (
                    <>
                      <Icon size={18} className={`shrink-0 ${isActive ? 'text-teal-700' : isFeatured ? 'text-teal-200' : 'text-teal-600'}`} aria-hidden />
                      <span className="whitespace-nowrap">{f.short}</span>
                    </>
                  )
                  return f.href && !isActive
                    ? <a key={f.key} href={f.href} {...(f.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className={cls}>{inner}</a>
                    : <div key={f.key} className={cls} {...(isActive ? { 'aria-current': 'page' as const } : {})}>{inner}</div>
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
