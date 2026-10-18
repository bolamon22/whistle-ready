// The sections of an organization's public home page, between its header and footer.
//
// Shared by the public page (/o/[slug], a server component) and the Website editor's
// live preview (a client component), so what an organizer edits is exactly what visitors
// get. That means no database or server-only import here, ever: data comes in as props.
//
// Without `edit` the output is the published page. With it, every section becomes a
// click target with an outline, hidden sections show as a striped bar, empty ones as an
// invitation to fill them in, and links stop navigating.
import Link from 'next/link'
import { ArrowRight, Instagram, BarChart3, EyeOff, Plus } from 'lucide-react'
import { TONE_CLASS, type RegBadge } from '@/lib/regStatus'
import SponsorWall from '@/components/SponsorWall'
import type { Sponsor } from '@/lib/sponsors'
import DaysAway from '@/components/DaysAway'
import { sectionLabel, type SiteLayout } from '@/lib/siteLayout'

export interface HomeTourn { id: string; name: string; tagline?: string; startDate: string; endDate: string; location: string; logoUrl: string; teamRegEnabled: number; badge?: RegBadge | null }
export type HomeIg = { id: string; permalink: string; image: string; caption: string }
export type HomeEdit = { selected: string; focus?: string; onSelect: (key: string) => void }

const fmtDay = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
const yr = (d: string) => (d ? d.split('-')[0] : '')
export function fmtRange(s: string, e: string) {
  if (s && e && s !== e) return `${fmtDay(s)} – ${fmtDay(e)}, ${yr(e)}`
  if (s) return `${fmtDay(s)}, ${yr(s)}`
  return 'Dates TBA'
}
function initials(name: string) {
  return name.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0].toUpperCase()).join('') || name.slice(0, 2).toUpperCase()
}

const ACCENTS = ['#0e7490', '#b45309', '#9f1239', '#1d4ed8', '#6d28d9', '#047857']
function accentFor(str: string) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return ACCENTS[h % ACCENTS.length] }

// The soonest event gets a wide featured card — it's the best conversion target, and
// identical small cards gave a 3-months-away event the same weight as a 5-months-away
// one. Whatever is next automatically takes this slot as dates pass.
function FeaturedCard({ t }: { t: HomeTourn }) {
  const accent = accentFor(t.name)
  return (
    <div className="relative border-2 border-teal-500 rounded-2xl bg-white overflow-hidden flex flex-col sm:flex-row">
      <span className="absolute top-3 right-4 bg-teal-50 text-teal-700 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-teal-200 z-20">Next up</span>
      <Link href={`/tournaments/${t.id}/event`} className="absolute inset-0 z-10" aria-label={`View ${t.name} details`} />
      <div className="sm:w-40 h-28 sm:h-auto flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}14` }}>
        {t.logoUrl
          ? <img src={t.logoUrl} alt="" className="w-20 h-20 rounded-2xl object-contain bg-white border border-slate-100" />
          : <div className="w-20 h-20 rounded-2xl text-white flex items-center justify-center font-bold text-xl" style={{ backgroundColor: accent }}>{initials(t.name)}</div>}
      </div>
      <div className="p-5 flex-1 min-w-0">
        <h3 className="font-bold text-slate-900 text-xl leading-tight pr-16">{t.name}</h3>
        <p className="text-sm text-slate-500 mt-1">
          {[t.tagline, fmtRange(t.startDate, t.endDate), t.location].filter(Boolean).join(' · ')}
        </p>
        {t.badge && <span className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${TONE_CLASS[t.badge.tone]}`}>{t.badge.label}</span>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {t.teamRegEnabled ? (
            <Link href={`/tournaments/${t.id}/register`} className="relative z-20 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 px-5 py-2 rounded-lg transition-colors">Register</Link>
          ) : null}
          <span className="text-sm font-semibold text-teal-700 inline-flex items-center gap-1">Event details <ArrowRight size={14} /></span>
          <DaysAway startDate={t.startDate} className="text-xs text-slate-400 ml-auto" />
        </div>
      </div>
    </div>
  )
}

function Card({ t }: { t: HomeTourn }) {
  const accent = accentFor(t.name)
  return (
    <div className="group relative bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-300 hover:shadow-sm transition-all">
      <Link href={`/tournaments/${t.id}/event`} className="absolute inset-0 z-10" aria-label={`View ${t.name} details`} />
      {t.logoUrl
        ? <img src={t.logoUrl} alt="" className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-100 flex-shrink-0" />
        : <div className="w-14 h-14 rounded-xl text-white flex items-center justify-center font-bold text-lg flex-shrink-0" style={{ backgroundColor: accent }}>{initials(t.name)}</div>}
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-slate-900 leading-tight truncate">{t.name}</h3>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {[fmtRange(t.startDate, t.endDate), t.location].filter(Boolean).join(' · ')}
        </p>
        {t.badge && <span className={`inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${TONE_CLASS[t.badge.tone]}`}>{t.badge.label}</span>}
        <div className="mt-1.5 flex items-center gap-3 text-xs font-semibold">
          {t.teamRegEnabled ? <Link href={`/tournaments/${t.id}/register`} className="relative z-20 text-teal-700 hover:text-teal-900">Register →</Link> : null}
          <span className="text-slate-400 group-hover:text-slate-600 transition-colors">Details</span>
        </div>
      </div>
    </div>
  )
}

/** One section. On the published page a plain wrapper whose data-site-sec lets the
 *  signed-in Edit bar find it; in the editor, a click target with an outline. */
function Slot({ k, edit, hidden, empty, children }: { k: string; edit?: HomeEdit; hidden?: boolean; empty?: string; children: React.ReactNode }) {
  if (!edit) return hidden || empty ? null : <div data-site-sec={k}>{children}</div>
  const sel = edit.selected === k
  const pick = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); edit.onSelect(k) }
  if (hidden) {
    return (
      <button type="button" id={`site-sec-${k}`} onClick={pick}
        className={`w-full flex items-center gap-2 px-6 py-3 text-xs font-medium text-slate-400 text-left border-y border-slate-200 bg-[repeating-linear-gradient(135deg,#f8fafc_0_8px,#f1f5f9_8px_16px)] ${sel ? 'ring-2 ring-inset ring-teal-500 text-teal-700' : 'hover:text-slate-600'}`}>
        <EyeOff size={14} /> {sectionLabel(k)} is hidden on your site
      </button>
    )
  }
  return (
    <div id={`site-sec-${k}`} onClickCapture={pick} className="group/slot relative cursor-pointer scroll-mt-2">
      {empty
        ? <div className="bg-white border-t border-slate-200 px-6 py-10 flex justify-center">
            <span className="inline-flex items-center gap-2 border-2 border-dashed border-slate-300 rounded-xl px-5 py-3 text-sm font-semibold text-slate-500 group-hover/slot:border-teal-400 group-hover/slot:text-teal-700"><Plus size={16} /> {empty}</span>
          </div>
        : children}
      <div className={`pointer-events-none absolute inset-0 z-30 border-2 transition-colors ${sel ? 'border-teal-500' : 'border-transparent group-hover/slot:border-teal-300'}`} />
      <span className={`pointer-events-none absolute top-2 left-2 z-30 bg-teal-600 text-white text-[11px] font-bold rounded-md px-2 py-0.5 ${sel ? 'inline-block' : 'hidden group-hover/slot:inline-block'}`}>{sectionLabel(k)}</span>
    </div>
  )
}

export default function OrgHomeView(p: {
  orgName: string; hero: any; about: any; foundedYear?: string; upcoming: HomeTourn[]; hasPast: boolean; hist: { totalEvents: number; totalGames: number; champs: number } | null
  gallery: any[]; spons: Sponsor[]; spitch: { wallCtaLabel?: string; wallCtaLine?: string }
  ig: any; igItems: HomeIg[]; socials: any; base: string; registerHref?: string; layout: SiteLayout; edit?: HomeEdit
}) {
  const { hero, about, upcoming, hist, gallery, spons, spitch, ig, igItems, socials, base, registerHref, layout, edit } = p
  // A dashed outline on the exact words being typed in the editor's side panel.
  const live = (f: string) => (edit?.focus === f ? ' outline-dashed outline-2 outline-teal-300 outline-offset-4 rounded' : '')

  const sections: Record<string, () => React.ReactNode> = {
    hero: () => (
      <Slot k="hero" edit={edit} key="hero">
      <section className="relative overflow-hidden text-white">
        {hero.imageUrl
          ? <>
              <img src={hero.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/70 to-[#0b1220]/30" />
            </>
          : <div className="absolute inset-0 bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a]" />}
        <div className="relative max-w-6xl mx-auto px-6 py-20 sm:py-28 flex flex-col items-start">
          {/* "Next up" chip: the soonest event with a date creates urgency the static
              eyebrow never did, and it updates itself as dates pass. */}
          {upcoming[0]
            ? <span className="inline-flex items-center gap-1.5 bg-teal-400/15 border border-teal-300/40 text-teal-200 text-xs font-medium px-3.5 py-1 rounded-full">Next up · {upcoming[0].name}{upcoming[0].startDate ? ` · ${fmtRange(upcoming[0].startDate, upcoming[0].endDate)}` : ''}</span>
            : <p className="text-teal-300 font-semibold tracking-[0.2em] text-xs uppercase">{hero.eyebrow || 'Tournaments'}</p>}
          <h1 className={`text-4xl sm:text-6xl font-extrabold tracking-tight mt-4 leading-[1.05] max-w-3xl${live('headline')}`}>{hero.headline || p.orgName}</h1>
          <p className={`text-slate-200 mt-4 max-w-2xl text-lg sm:text-xl${live('subtext')}`}>{hero.subtext || 'Upcoming events, schedules, standings and team registration — all in one place.'}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {registerHref && <Link href={registerHref} className="bg-teal-500 hover:bg-teal-400 text-white font-semibold px-7 py-3.5 rounded-full transition-colors shadow-lg shadow-teal-500/20">Register a team</Link>}
            <a href="#tournaments" className="bg-white/10 hover:bg-white/20 backdrop-blur text-white font-semibold px-7 py-3.5 rounded-full transition-colors border border-white/20">See all events</a>
          </div>
        </div>
      </section>
      </Slot>
    ),

    // Tournaments: the soonest event leads with a featured card; the rest follow in a
    // compact grid.
    events: () => (
      <Slot k="events" edit={edit} key="events">
      <main id="tournaments" className="max-w-6xl mx-auto px-6 py-14">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-6">Upcoming tournaments</h2>
        {upcoming.length === 0
          ? <p className="text-slate-500">No upcoming tournaments posted yet — check back soon.</p>
          : (
            <div className="space-y-4">
              <FeaturedCard t={upcoming[0]} />
              {upcoming.length > 1 && (
                /* grid-cols-1 matters: Tailwind's grid-cols-* use minmax(0,1fr), which
                   lets cards shrink below their text's min-content width so `truncate`
                   can work. Without it, phones get an auto-sized column that grows to
                   fit the nowrap text and drags the whole page into horizontal scroll. */
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  {upcoming.slice(1).map(t => <Card key={t.id} t={t} />)}
                </div>
              )}
            </div>
          )}

        {p.hasPast && (
          <div className="mt-10">
            <Link href={`${base}/results`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-900">Past tournament results <ArrowRight size={15} /></Link>
          </div>
        )}
      </main>
      </Slot>
    ),

    // The track record, on the front door. A club deciding where to spend its season is
    // choosing between organizers, and the strongest thing this one can say is how much
    // it has actually run.
    stats: () => (
      <Slot k="stats" edit={edit} key="stats" empty={hist && hist.totalGames > 0 ? undefined : 'Shows once you have published results'}>
      {hist && hist.totalGames > 0 && (
        <section className="bg-gradient-to-br from-[#0b1f3a] to-[#0e7490] text-white">
          <div className="max-w-6xl mx-auto px-6 py-12">
            {/^\d{4}$/.test(String(p.foundedYear || '')) && (
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200 mb-4">
                Running lacrosse tournaments since {String(p.foundedYear).trim()}
              </p>
            )}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
              <div className="grid grid-cols-3 gap-8 sm:gap-12">
                <div>
                  <div className="text-4xl sm:text-5xl font-black tracking-tight tabular-nums">{hist.totalEvents}</div>
                  <div className="text-[13px] text-teal-100 mt-1">tournaments run</div>
                </div>
                <div>
                  <div className="text-4xl sm:text-5xl font-black tracking-tight tabular-nums">{hist.totalGames.toLocaleString('en-US')}</div>
                  <div className="text-[13px] text-teal-100 mt-1">games played</div>
                </div>
                <div>
                  <div className="text-4xl sm:text-5xl font-black tracking-tight tabular-nums">{hist.champs.toLocaleString('en-US')}</div>
                  <div className="text-[13px] text-teal-100 mt-1">champions crowned</div>
                </div>
              </div>
              <Link href={`${base}/stats`}
                className="inline-flex items-center gap-1.5 bg-white text-teal-800 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-teal-50 transition-colors flex-shrink-0">
                <BarChart3 size={15} /> See the full history <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      )}
      </Slot>
    ),

    // About — light, constrained prose. The old version was three paragraphs of small
    // white text on a full-black band: the heaviest thing on the page, and it broke the
    // light slate/teal standard.
    about: () => (
      <Slot k="about" edit={edit} key="about" empty={about.body ? undefined : 'Add an About section'}>
      {about.body && (
        <section className="bg-white border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-14">
            <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-4${live('aboutHeading')}`}>{about.heading || 'About'}</h2>
            <p className={`text-slate-600 whitespace-pre-line leading-relaxed max-w-3xl${live('aboutBody')}`}>{about.body}</p>
          </div>
        </section>
      )}
      </Slot>
    ),

    // Gallery mosaic: one lead photo, a few supporting, and a "+N photos" tile as the
    // invitation — a strip of identical thumbnails invited nobody.
    gallery: () => (
      <Slot k="gallery" edit={edit} key="gallery" empty={gallery.length ? undefined : 'Add photos'}>
      {gallery.length > 0 && (
        <section className="bg-slate-50 border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-14">
            <div className="flex items-end justify-between mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">From the fields</h2>
              <Link href={`${base}/gallery`} className="text-sm font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1">View gallery <ArrowRight size={15} /></Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 grid-rows-2 gap-2 sm:h-[340px]">
              {gallery[0] && (
                <Link href={`${base}/gallery`} className="col-span-2 row-span-2 block rounded-2xl overflow-hidden border border-slate-200">
                  <img src={gallery[0].url} alt={gallery[0].caption || ''} className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300" />
                </Link>
              )}
              {gallery.slice(1, 4).map((ph: any, i: number) => (
                <Link key={i} href={`${base}/gallery`} className="block rounded-2xl overflow-hidden border border-slate-200">
                  <img src={ph.url} alt={ph.caption || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </Link>
              ))}
              <Link href={`${base}/gallery`} className="rounded-2xl bg-[#0b1f3a] hover:bg-[#132c4e] transition-colors flex items-center justify-center">
                <span className="text-teal-300 text-sm font-semibold">+{Math.max(gallery.length - 4, 1)} photos</span>
              </Link>
            </div>
          </div>
        </section>
      )}
      </Slot>
    ),

    // Partners. Each mark gets a card and a name, and the last cell is the ask.
    sponsors: () => (
      <Slot k="sponsors" edit={edit} key="sponsors" empty={spons.length ? undefined : 'Add your sponsors'}>
      {spons.length > 0 && (
        <section className="bg-white border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <SponsorWall
              sponsors={spons}
              variant="compact"
              title="Our partners"
              subtitle="The businesses and agencies behind our events."
              inquireHref={`${base}/register/vendor#sponsor`}
              ctaLabel={spitch.wallCtaLabel}
              ctaLine={spitch.wallCtaLine || "Put your brand in front of every family at our events."}
            />
          </div>
        </section>
      )}
      </Slot>
    ),

    // Instagram feed across the bottom. The editor can't load the posts themselves (the
    // token stays on the server), so it shows where they will go.
    instagram: () => {
      const items: HomeIg[] = igItems.length ? igItems : (edit && ig.token ? Array.from({ length: 8 }, (_, i) => ({ id: `ph${i}`, permalink: '#', image: '', caption: '' })) : [])
      return (
      <Slot k="instagram" edit={edit} key="instagram" empty={items.length ? undefined : 'Connect Instagram'}>
      {items.length > 0 && (
        <section className="bg-white border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Instagram size={20} className="text-pink-600" />
              <a href={ig.username ? `https://instagram.com/${ig.username.replace(/^@/, '')}` : (socials.instagram || '#')} target="_blank" rel="noreferrer" className="font-bold text-slate-900 hover:text-pink-600 transition-colors">
                {ig.username ? `@${ig.username.replace(/^@/, '')}` : 'Follow us on Instagram'}
              </a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {items.map(m => (
                <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-slate-100">
                  {m.image ? <img src={m.image} alt={m.caption?.slice(0, 80) || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" /> : <div className="w-full h-full bg-gradient-to-br from-pink-100 to-slate-100" />}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
      </Slot>
      )
    },

    // Closing register band — the page ends on a conversion moment instead of trailing
    // off after the Instagram grid.
    register: () => (
      <Slot k="register" edit={edit} key="register" empty={registerHref && upcoming[0] ? undefined : 'Shows when an upcoming event takes registrations'}>
      {registerHref && upcoming[0] && (
        <div className="bg-[#0b1f3a]">
          <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold">Bring your team to {upcoming[0].name}</p>
              <p className="text-slate-400 text-sm mt-0.5">{[fmtRange(upcoming[0].startDate, upcoming[0].endDate), upcoming[0].location].filter(Boolean).join(' · ')}</p>
            </div>
            <Link href={registerHref} className="inline-flex items-center text-sm font-semibold px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-white shrink-0 transition-colors">Register a team</Link>
          </div>
        </div>
      )}
      </Slot>
    ),
  }

  const hidden = new Set<string>(layout.hidden)
  return (
    <>
      {layout.order.map(k => hidden.has(k)
        ? (edit ? <Slot k={k} edit={edit} hidden key={k}>{null}</Slot> : null)
        : sections[k]?.())}
    </>
  )
}
