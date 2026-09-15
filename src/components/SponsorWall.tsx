// The partner wall — who backs the event, shown so it looks bought rather than decorative.
//
// Replaces two separate ad-hoc renders (a washed-out strip on the org home page, a
// bare flex-wrap on the event page) that shared the same failure: 48px logos, no
// names, no roles, no link and no hierarchy, so a county sports commission looked
// identical to an apparel brand and nothing told a visitor the spot was for sale.
//
// Every logo gets the same white card and the same padding on purpose. The list
// mixes dark circular badges with pale marks and one screenshot-with-text; only a
// consistent neutral box stops that reading as clip art.
//
// Server component — no state, no client JS.
import Link from 'next/link'
import { Sponsor, splitSponsors } from '@/lib/sponsors'

type Props = {
  sponsors: Sponsor[]
  /** 'full' = event page (presenting slot + grid). 'compact' = home page strip. */
  variant?: 'full' | 'compact'
  /** Where the sponsorship call to action goes. Omit to hide it entirely. */
  inquireHref?: string
  /** The line above the button. */
  ctaLine?: string
  /** The button itself. */
  ctaLabel?: string
  title?: string
  subtitle?: string
}

function Mark({ s, size }: { s: Sponsor; size: number }) {
  // A sponsor with no logo still deserves a slot — fall back to the name set in
  // the same box so the grid doesn't develop a hole.
  if (!s.logoUrl) {
    return (
      <span className="flex items-center justify-center text-center font-bold text-slate-700 leading-tight px-1" style={{ height: size }}>
        {s.name}
      </span>
    )
  }
  return (
    <span className="flex items-center justify-center w-full" style={{ height: size }}>
      <img src={s.logoUrl} alt={s.name} className="max-w-full object-contain" style={{ maxHeight: size }} />
    </span>
  )
}

function Card({ s, size }: { s: Sponsor; size: number }) {
  const inner = (
    <>
      <Mark s={s} size={size} />
      <span className="block">
        <span className="block font-bold text-[13.5px] leading-tight text-slate-900">{s.name}</span>
        {s.role && <span className="block mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{s.role}</span>}
      </span>
    </>
  )
  const cls = 'flex flex-col items-center gap-3 text-center bg-white border border-slate-200 rounded-2xl px-4 py-5 transition-all hover:border-teal-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-600/10'
  return s.url
    ? <a href={s.url} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
    : <div className={cls}>{inner}</div>
}

/**
 * The ask, as its own strip under the wall rather than a dashed cell inside it.
 *
 * As a grid cell it had two problems: an empty dashed box next to real paying
 * logos reads as a gap rather than an invitation, and with four partners it wrapped
 * onto a row of its own and just looked like something was missing. A strip always
 * sits where it is meant to, and "Advertise with us" is a button a business
 * recognises instead of a placeholder tile.
 */
function SponsorCta({ href, line, label }: { href: string; line: string; label: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
      <div className="min-w-0">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-teal-600">Sponsorship</div>
        <p className="text-[15px] font-semibold text-slate-900 mt-1 leading-snug">{line}</p>
      </div>
      <Link href={href}
        className="inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[14px] rounded-full px-5 py-2.5 whitespace-nowrap transition-colors shrink-0 shadow-sm shadow-teal-600/20">
        {label} <span aria-hidden>&rarr;</span>
      </Link>
    </div>
  )
}

export default function SponsorWall({
  sponsors, variant = 'full', inquireHref,
  ctaLine = 'Put your brand in front of every family here.',
  ctaLabel = 'Advertise with us',
  title, subtitle,
}: Props) {
  if (!sponsors.length) return null
  const { presenting, official } = splitSponsors(sponsors)
  const compact = variant === 'compact'
  const grid = 'grid gap-3.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'

  return (
    <div>
      {(title || subtitle) && (
        <div className="mb-5">
          {title && <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>}
          {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-[58ch]">{subtitle}</p>}
        </div>
      )}

      {/* Presenting slots read as a row, not a card in the grid — that difference is
          the whole reason the tier is sellable. Skipped in compact. */}
      {!compact && presenting.map((s, i) => {
        const body = (
          <>
            <span className="flex items-center justify-center shrink-0 w-[120px]">
              <Mark s={s} size={86} />
            </span>
            <span className="block">
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-teal-600 mb-1.5">Presenting sponsor</span>
              <span className="block text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">{s.name}</span>
              {s.blurb
                ? <span className="block text-[13.5px] text-slate-500 mt-1.5 max-w-[48ch] leading-relaxed">{s.blurb}</span>
                : s.role ? <span className="block text-[13.5px] text-slate-500 mt-1.5">{s.role}</span> : null}
            </span>
          </>
        )
        const cls = 'flex items-center gap-5 sm:gap-6 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 sm:p-6 mb-3.5'
        return s.url
          ? <a key={i} href={s.url} target="_blank" rel="noreferrer" className={`${cls} transition-colors hover:border-teal-200`}>{body}</a>
          : <div key={i} className={cls}>{body}</div>
      })}

      {!compact && presenting.length > 0 && official.length > 0 && (
        <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 mt-6 mb-3">Official partners</div>
      )}

      <div className={grid}>
        {/* Compact keeps everyone equal — the home page isn't where a tier gets sold. */}
        {(compact ? sponsors : official).map((s, i) => <Card key={i} s={s} size={compact ? 52 : 62} />)}
      </div>

      {inquireHref && <SponsorCta href={inquireHref} line={ctaLine} label={ctaLabel} />}
    </div>
  )
}
