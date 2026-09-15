// The sponsor pitch — the half of the section that asks for the money.
//
// A logo wall alone never answers the only question a prospective sponsor has:
// how many people see it, and where does my logo actually appear? Both live on
// the event page under the wall, so the businesses that already paid lead and the
// ask follows from seeing them.
//
// Team and club counts are passed in live from the registrations table; anything
// else (spectators, site visits) is typed by the org in Org -> Site, because we
// can't count it and won't invent it.
//
// Server component — no state, no client JS.
import Link from 'next/link'
import { SponsorPitch as PitchConfig, SponsorStat } from '@/lib/sponsors'
import { priceLabel, SponsorTier } from '@/lib/vendorForm'

type Props = {
  pitch: PitchConfig
  /** Live counts first, then whatever the org typed in. */
  stats: SponsorStat[]
  inquireHref: string
  contactEmail?: string
  eventName?: string
  /** The org's real sponsorship levels (Org -> Forms). Shown instead of the
   *  fallback note, because named packages with prices answer the question the
   *  note only talks around. */
  tiers?: SponsorTier[]
  /** Overrides the fallback note when there are no tiers yet. */
  note?: string
}

export default function SponsorPitch({ pitch, stats, inquireHref, contactEmail, eventName, tiers = [], note }: Props) {
  if (!pitch.show) return null
  // "…every family at the event." reads badly once we know the event's name.
  const headline = eventName ? pitch.headline.replace(/\bthe event\b/i, eventName) : pitch.headline

  return (
    <div className="mt-10 pt-8 border-t border-slate-200">
      <div className="grid gap-7 md:grid-cols-[1.05fr_.95fr] md:gap-10 items-start">
        <div>
          <h3 className="text-xl sm:text-[22px] font-extrabold tracking-tight text-slate-900 leading-tight">{headline}</h3>
          {pitch.sub && <p className="text-[14.5px] text-slate-600 mt-2.5">{pitch.sub}</p>}

          {stats.length > 0 && (
            <div className="flex flex-wrap gap-2.5 mt-5">
              {stats.map((s, i) => (
                <div key={i} className="bg-teal-50 border border-teal-100 rounded-xl px-3.5 py-2.5 min-w-[88px]">
                  <span className="block text-lg font-extrabold leading-none text-teal-700 tabular-nums">{s.value}</span>
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-teal-600 mt-1">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {pitch.benefits.length > 0 && (
            <ul className="mt-5 space-y-2">
              {pitch.benefits.map((b, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] text-slate-600">
                  <span className="mt-[3px] w-[15px] h-[15px] rounded-full bg-teal-100 border border-teal-300 shrink-0 flex items-center justify-center">
                    <span className="block w-[7px] h-[3px] border-l-2 border-b-2 border-teal-600 -rotate-45 -mt-[3px]" />
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          <Link href={inquireHref}
            className="inline-flex items-center gap-2 mt-6 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[14.5px] rounded-full px-6 py-3 shadow-lg shadow-teal-600/25 transition-colors">
            {pitch.ctaLabel} &rarr;
          </Link>
          {contactEmail && (
            <p className="text-xs text-slate-400 mt-3">
              Or email <a href={`mailto:${contactEmail}`} className="underline hover:text-slate-600">{contactEmail}</a> &mdash; we&rsquo;ll send the details.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
          {tiers.length > 0 ? (
            <>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">Sponsorship levels</div>
              <div>
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 border-b border-slate-200 last:border-0">
                    <span className="font-semibold text-[14px] text-slate-800">{t.name}</span>
                    <span className="font-bold text-[14px] text-teal-700 tabular-nums whitespace-nowrap">
                      {t.price > 0 ? priceLabel(t.price) : "Let's talk"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">Not quite right? Tell us what you&rsquo;re after and we&rsquo;ll build one that fits.</p>
            </>
          ) : (
            <>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">How it works</div>
              <p className="text-[13.5px] text-slate-600 leading-relaxed whitespace-pre-line">{note}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
