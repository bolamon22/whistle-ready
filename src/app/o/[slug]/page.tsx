import Link from 'next/link'
import { createClient } from '@libsql/client'
import { MapPin, CalendarDays, ArrowRight, Trophy, Instagram } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from './_chrome'
import { fetchInstagram } from './_instagram'
import type { Metadata } from 'next'
import { SITE_URL, abs, clip, stripMd } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'

// Cache policy for published pages.
//
// Jul 20 2026: these pages read Turso via @libsql/client, which uses fetch() under the
// hood, and Next caches fetch responses in its Data Cache. A `dynamic` export does NOT
// disable that, so pages re-rendered on every request while replaying a stale DB
// response — and since nothing expired, they stayed stale indefinitely (an org hero
// image and gallery went missing until it was noticed).
//
// `revalidate` is the fix rather than turning caching off: content is served from cache
// for this many seconds then re-fetched, so staleness is always bounded. Saving in the
// admin also calls revalidatePath() for an immediate refresh. Don't swap this back to
// dynamic/no-store — that made every visit re-run every query (~14s page loads).
export const revalidate = 30

interface Tourn { id: string; name: string; tagline?: string; startDate: string; endDate: string; location: string; logoUrl: string; sport: string; teamRegEnabled: number }

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const fmtDay = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
const yr = (d: string) => (d ? d.split('-')[0] : '')
function fmtRange(s: string, e: string) {
  if (s && e && s !== e) return `${fmtDay(s)} – ${fmtDay(e)}, ${yr(e)}`
  if (s) return `${fmtDay(s)}, ${yr(s)}`
  return 'Dates TBA'
}
function initials(name: string) {
  return name.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0].toUpperCase()).join('') || name.slice(0, 2).toUpperCase()
}

const ACCENTS = ['#0e7490', '#b45309', '#9f1239', '#1d4ed8', '#6d28d9', '#047857']
function accentFor(str: string) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return ACCENTS[h % ACCENTS.length] }

function daysAway(startDate: string): number | null {
  if (!startDate) return null
  const [y, m, d] = startDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const diff = Math.ceil((new Date(y, m - 1, d).getTime() - Date.now()) / 86400000)
  return diff > 0 ? diff : null
}

// The soonest event gets a wide featured card — it's the best conversion target, and
// identical small cards gave a 3-months-away event the same weight as a 5-months-away
// one. Whatever is next automatically takes this slot as dates pass.
function FeaturedCard({ t }: { t: Tourn }) {
  const accent = accentFor(t.name)
  const days = daysAway(t.startDate)
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {t.teamRegEnabled ? (
            <Link href={`/tournaments/${t.id}/register`} className="relative z-20 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 px-5 py-2 rounded-lg transition-colors">Register</Link>
          ) : null}
          <span className="text-sm font-semibold text-teal-700 inline-flex items-center gap-1">Event details <ArrowRight size={14} /></span>
          {days !== null && <span className="text-xs text-slate-400 ml-auto">{days} day{days === 1 ? '' : 's'} away</span>}
        </div>
      </div>
    </div>
  )
}

function Card({ t }: { t: Tourn }) {
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
        <div className="mt-1.5 flex items-center gap-3 text-xs font-semibold">
          {t.teamRegEnabled ? <Link href={`/tournaments/${t.id}/register`} className="relative z-20 text-teal-700 hover:text-teal-900">Register →</Link> : null}
          <span className="text-slate-400 group-hover:text-slate-600 transition-colors">Details</span>
        </div>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db()
  let org: any = null
  try { const r = await client.execute({ sql: 'SELECT id, name, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) org = r.rows[0] } catch {}
  if (!org) return { title: 'Organization' }
  let about = ''
  try { const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (cr.rows.length) { const c = JSON.parse(((cr.rows[0] as any).value as string) || '{}'); about = c.hero?.subtext || c.about?.body || ''; if (c.logo) org.logoUrl = c.logo } } catch {}
  const title = `${org.name} — Tournaments, schedules & team registration`
  const description = clip(stripMd(about) || `${org.name}: upcoming tournaments, live schedules, standings and online team registration — all in one place.`)
  const url = abs(`/o/${params.slug}`)
  const images = org.logoUrl ? [org.logoUrl] : []
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url, images }, twitter: { title, description, images } }
}

export default async function OrgSite({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
        <div>
          <Trophy size={40} className="mx-auto text-slate-300" />
          <h1 className="mt-3 text-xl font-bold text-slate-800">Site not found</h1>
          <p className="text-slate-500 mt-1 text-sm">No organization matches “{params.slug}”.</p>
        </div>
      </div>
    )
  }
  const org = orgRes.rows[0] as any

  let content: any = {}
  try {
    const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}')
  } catch (e: any) {
    // Don't fail silently: a bad read here blanks the hero, gallery and sponsors.
    console.error('[org page] failed to read orgSite content:', org.id, e?.message || e)
  }
  const hero = content.hero || {}
  const about = content.about || {}
  const sponsors: any[] = Array.isArray(content.sponsors) ? content.sponsors : []
  const contact = content.contact || {}
  const socials = content.socials || {}
  if (content.logo) org.logoUrl = content.logo
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const ig = content.instagram || {}

  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  let forms: any = {}
  try { const fr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (fr.rows.length) forms = JSON.parse(((fr.rows[0] as any).value as string) || '{}') } catch {}
  const base = orgBase(params.slug)
  const workHref = (forms.staff?.enabled !== false) ? `${base}/work` : undefined
  const nav = buildNav(base, pages, gallery.length > 0, workHref)

  const tRes = await client.execute({
    sql: 'SELECT id, name, startDate, endDate, location, logoUrl, sport, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate',
    args: [org.id as string],
  })
  const all = (tRes.rows as any[]).map(r => ({ ...r, teamRegEnabled: Number(r.teamRegEnabled) })) as Tourn[]
  try { const tg = await client.execute({ sql: 'SELECT id, tagline FROM "Tournament" WHERE orgId = ?', args: [org.id as string] }); const tm: Record<string, string> = {}; (tg.rows as any[]).forEach(r => { if (r.tagline) tm[String(r.id)] = String(r.tagline) }); all.forEach(t => { (t as any).tagline = tm[String(t.id)] || '' }) } catch {}
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = all.filter(t => (t.endDate || t.startDate || '') >= today).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
  const past = all.filter(t => (t.endDate || t.startDate || '') < today).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
  const registerHref = upcoming[0] ? `/tournaments/${upcoming[0].id}/register` : undefined

  const igItems = await fetchInstagram(ig.token || '', 8)

  const orgUrl = abs(`/o/${params.slug}`)
  const orgLd = { '@context': 'https://schema.org', '@type': 'SportsOrganization', name: org.name, url: orgUrl, ...(org.logoUrl ? { logo: abs(org.logoUrl) } : {}), sameAs: [socials.facebook, socials.instagram, socials.website].filter(Boolean) }
  const eventsLd = upcoming.length ? { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: upcoming.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/tournaments/${t.id}/event`), name: t.name })) } : null
  return (
    <div className="min-h-screen bg-slate-50">
      <JsonLd data={eventsLd ? [orgLd, eventsLd] : orgLd} />
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} registerHref={registerHref} />

      {/* Hero */}
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
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mt-4 leading-[1.05] max-w-3xl">{hero.headline || org.name}</h1>
          <p className="text-slate-200 mt-4 max-w-2xl text-lg sm:text-xl">{hero.subtext || 'Upcoming events, schedules, standings and team registration — all in one place.'}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {registerHref && <Link href={registerHref} className="bg-teal-500 hover:bg-teal-400 text-white font-semibold px-7 py-3.5 rounded-full transition-colors shadow-lg shadow-teal-500/20">Register a team</Link>}
            <a href="#tournaments" className="bg-white/10 hover:bg-white/20 backdrop-blur text-white font-semibold px-7 py-3.5 rounded-full transition-colors border border-white/20">See all events</a>
          </div>
        </div>
      </section>

      {/* Tournaments: the soonest event leads with a featured card; the rest follow
          in a compact grid. */}
      <main id="tournaments" className="max-w-6xl mx-auto px-6 py-14">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-6">Upcoming tournaments</h2>
        {upcoming.length === 0
          ? <p className="text-slate-500">No upcoming tournaments posted yet — check back soon.</p>
          : (
            <div className="space-y-4">
              <FeaturedCard t={upcoming[0]} />
              {upcoming.length > 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {upcoming.slice(1).map(t => <Card key={t.id} t={t} />)}
                </div>
              )}
            </div>
          )}

        {past.length > 0 && (
          <div className="mt-10">
            <Link href={`${base}/results`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-900">Past tournament results <ArrowRight size={15} /></Link>
          </div>
        )}
      </main>

      {/* About — light, constrained prose. The old version was three paragraphs of
          small white text on a full-black band: the heaviest thing on the page, and it
          broke the light slate/teal standard. The copy is unchanged (it's editable in
          the website editor); only the presentation slimmed down. */}
      {about.body && (
        <section className="bg-white border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-14">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-4">{about.heading || 'About'}</h2>
            <p className="text-slate-600 whitespace-pre-line leading-relaxed max-w-3xl">{about.body}</p>
          </div>
        </section>
      )}

      {/* Gallery mosaic: one lead photo, a few supporting, and a "+N photos" tile as
          the invitation — a strip of identical thumbnails invited nobody. */}
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

      {/* Sponsors: a quiet strip, not a wall of huge tiles that outweighed the events. */}
      {sponsors.length > 0 && (
        <section className="bg-white border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center gap-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 shrink-0">Partners</h2>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {sponsors.map((s, i) => {
                const inner = s.logoUrl
                  ? <img src={s.logoUrl} alt={s.name || ''} title={s.name || ''} className="h-12 max-w-[140px] object-contain opacity-70 hover:opacity-100 transition-opacity" />
                  : <span className="text-slate-500 font-semibold whitespace-nowrap">{s.name}</span>
                return s.url
                  ? <a key={i} href={s.url} target="_blank" rel="noreferrer">{inner}</a>
                  : <div key={i}>{inner}</div>
              })}
            </div>
          </div>
        </section>
      )}

      {/* Instagram feed across the bottom */}
      {igItems.length > 0 && (
        <section className="bg-white border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Instagram size={20} className="text-pink-600" />
              <a href={ig.username ? `https://instagram.com/${ig.username.replace(/^@/, '')}` : (socials.instagram || '#')} target="_blank" rel="noreferrer" className="font-bold text-slate-900 hover:text-pink-600 transition-colors">
                {ig.username ? `@${ig.username.replace(/^@/, '')}` : 'Follow us on Instagram'}
              </a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {igItems.map(m => (
                <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-slate-100">
                  <img src={m.image} alt={m.caption?.slice(0, 80) || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Closing register band — the page ends on a conversion moment instead of
          trailing off after the Instagram grid. */}
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
      <OrgFooter org={org} contact={contact} socials={socials} />
    </div>
  )
}
