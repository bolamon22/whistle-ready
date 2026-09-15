import Link from 'next/link'
import { ArrowRight, ExternalLink, Camera } from 'lucide-react'
import type { Photographer } from '@/lib/photographers'
import { packagePrice, displayName } from '@/lib/photographers'

// One photographer tile, shared by the /photographers index and the gallery page.
//
// It lives in a component rather than being written twice because the gallery is
// where the tiles actually earn their keep: someone scrolling event photos is one
// click from the person who took them, at the exact moment they are thinking
// "I want one of my kid".
//
// Two links on purpose. The card itself opens the booking page, which is the
// action we want. The portfolio link goes to the photographer's own site, which
// is what makes them agree to be listed at all -- and it has to be a separate
// anchor, because <a> inside <a> is invalid and the browser will silently break
// one of them.
type Props = {
  photographers: Photographer[]
  /** Link base — '' on a custom domain, /o/<slug> otherwise. */
  base: string
  title?: string
  subtitle?: string
  /** Cap the number shown; the rest live behind "See all". */
  limit?: number
}

function href(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

export function PhotographerCard({ p, base }: { p: Photographer; base: string }) {
  const priced = p.packages.filter(x => x.price > 0)
  const from = priced.length ? Math.min(...priced.map(x => x.price)) : 0
  return (
    <div className="group relative bg-white border border-slate-200 rounded-2xl p-5 transition-all hover:border-teal-300 hover:shadow-lg hover:shadow-teal-600/5">
      <div className="flex items-start gap-4">
        {p.avatarUrl
          ? <img src={p.avatarUrl} alt="" className="w-14 h-14 rounded-xl object-cover bg-slate-100 shrink-0" />
          : <div className="w-14 h-14 rounded-xl bg-slate-900 text-teal-300 flex items-center justify-center font-extrabold shrink-0">{displayName(p).slice(0, 2).toUpperCase()}</div>}
        <div className="min-w-0 flex-1">
          {/* Stretched link: the whole card is the click target for booking, without
              nesting the portfolio anchor inside it. */}
          <h3 className="font-bold text-slate-900 truncate">
            <Link href={`${base}/photographers/${p.slug}`} className="before:absolute before:inset-0">
              {displayName(p)}
            </Link>
          </h3>
          <p className="text-[13px] text-slate-500 mt-0.5 truncate">
            {[p.name && p.name !== displayName(p) ? p.name : '', p.location].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {p.bio && <p className="text-[13.5px] text-slate-500 mt-3 leading-relaxed line-clamp-2">{p.bio}</p>}

      {p.samples.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 mt-4">
          {p.samples.slice(0, 4).map((u, i) => (
            <div key={i} className="aspect-square rounded-lg bg-slate-200 bg-cover bg-center" style={{ backgroundImage: `url(${u})` }} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-4 pt-3.5 border-t border-slate-100">
        <span className="text-[13px] text-slate-500 min-w-0 truncate">
          {from > 0
            ? <>Packages from <strong className="text-slate-900">{packagePrice({ ...p.packages[0], price: from })}</strong></>
            : `${p.packages.length} package${p.packages.length === 1 ? '' : 's'}`}
        </span>
        <span className="flex items-center gap-3 shrink-0">
          {p.website && (
            <a href={href(p.website)} target="_blank" rel="noreferrer"
              className="relative z-10 text-[13px] font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
              Portfolio <ExternalLink size={12} />
            </a>
          )}
          <span className="text-[13.5px] font-bold text-teal-700 inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
            Book <ArrowRight size={14} />
          </span>
        </span>
      </div>
    </div>
  )
}

export default function PhotographerTiles({ photographers, base, title, subtitle, limit }: Props) {
  const live = photographers.filter(p => p.active)
  if (live.length === 0) return null
  const shown = limit ? live.slice(0, limit) : live

  return (
    <section>
      {(title || subtitle) && (
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            {title && (
              <h2 className="text-xl font-bold tracking-tight text-slate-900 inline-flex items-center gap-2">
                <Camera size={18} className="text-teal-600" /> {title}
              </h2>
            )}
            {subtitle && <p className="text-sm text-slate-500 mt-1.5 max-w-[58ch]">{subtitle}</p>}
          </div>
          {limit && live.length > shown.length && (
            <Link href={`${base}/photographers`} className="text-[14px] font-semibold text-teal-700 hover:text-teal-900 whitespace-nowrap">
              See all {live.length} &rarr;
            </Link>
          )}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {shown.map(p => <PhotographerCard key={p.slug} p={p} base={base} />)}
      </div>
    </section>
  )
}
