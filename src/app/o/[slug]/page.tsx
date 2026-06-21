import Link from 'next/link'
import { createClient } from '@libsql/client'
import { MapPin, CalendarDays, ArrowRight, Trophy, Instagram } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, PageRec } from './_chrome'
import { fetchInstagram } from './_instagram'
import type { Metadata } from 'next'
import { SITE_URL, abs, clip, stripMd } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'

export const dynamic = 'force-dynamic'

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

function Card({ t }: { t: Tourn }) {
  const accent = accentFor(t.name)
  return (
    <div className="group bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col">
      <div className="h-2" style={{ backgroundColor: accent }} />
      <div className="p-5 flex items-start gap-4">
        {t.logoUrl
          ? <img src={t.logoUrl} alt="" className="w-24 h-24 rounded-2xl object-contain bg-white border border-slate-100 flex-shrink-0" />
          : <div className="w-24 h-24 rounded-2xl text-white flex items-center justify-center font-bold text-2xl flex-shrink-0" style={{ backgroundColor: accent }}>{initials(t.name)}</div>}
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900 text-lg leading-tight">{t.name}</h3>
          {t.tagline && <p className="text-sm text-slate-500 mt-1 truncate">{t.tagline}</p>}
          <p className="text-sm font-medium text-teal-700 bg-teal-50 rounded-full px-2.5 py-1 mt-2 inline-flex items-center gap-1"><CalendarDays size={14} /> {fmtRange(t.startDate, t.endDate)}</p>
          {t.location && <p className="text-sm text-slate-500 mt-1.5 inline-flex items-center gap-1"><MapPin size={14} /> {t.location}</p>}
        </div>
      </div>
      <div className="mt-auto border-t border-slate-100 flex">
        <Link href={`/tournaments/${t.id}/event`} className="flex-1 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 py-3.5 transition-colors inline-flex items-center justify-center gap-1">
          Details <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
        {t.teamRegEnabled ? (
          <Link href={`/tournaments/${t.id}/register`} className="flex-[1.4] text-center text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 py-3.5 transition-colors">Register</Link>
        ) : null}
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
  } catch { /* no content yet */ }
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
  const workHref = (forms.staff?.enabled !== false) ? `/o/${params.slug}/work` : undefined
  const nav = buildNav(params.slug, pages, gallery.length > 0, workHref)

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
      <OrgHeader org={org} slug={params.slug} nav={nav} registerHref={registerHref} />

      {/* Hero */}
      <section className="relative overflow-hidden text-white">
        {hero.imageUrl
          ? <>
              <img src={hero.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/70 to-[#0b1220]/30" />
            </>
          : <div className="absolute inset-0 bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a]" />}
        <div className="relative max-w-6xl mx-auto px-6 py-28 sm:py-36 flex flex-col items-start">
          <p className="text-teal-300 font-semibold tracking-[0.2em] text-xs uppercase">{hero.eyebrow || 'Tournaments'}</p>
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight mt-3 leading-[1.05] max-w-3xl">{hero.headline || org.name}</h1>
          <p className="text-slate-200 mt-5 max-w-2xl text-lg sm:text-xl">{hero.subtext || 'Upcoming events, schedules, standings and team registration — all in one place.'}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {registerHref && <Link href={registerHref} className="bg-teal-500 hover:bg-teal-400 text-white font-semibold px-7 py-3.5 rounded-full transition-colors shadow-lg shadow-teal-500/20">Register a team</Link>}
            <a href="#tournaments" className="bg-white/10 hover:bg-white/20 backdrop-blur text-white font-semibold px-7 py-3.5 rounded-full transition-colors border border-white/20">View tournaments</a>
          </div>
        </div>
      </section>

      {/* Tournaments */}
      <main id="tournaments" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-6">Upcoming tournaments</h2>
        {upcoming.length === 0
          ? <p className="text-slate-500">No upcoming tournaments posted yet — check back soon.</p>
          : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map(t => <Card key={t.id} t={t} />)}</div>}

        {past.length > 0 && (
          <div className="mt-10">
            <Link href={`/o/${params.slug}/results`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-900">Past tournament results <ArrowRight size={15} /></Link>
          </div>
        )}
      </main>

      {/* About */}
      {about.body && (
        <section className="bg-[#0b1220] text-slate-200">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-5">{about.heading || 'About'}</h2>
            <p className="text-slate-300 whitespace-pre-line leading-relaxed text-lg">{about.body}</p>
          </div>
        </section>
      )}

      {/* Gallery teaser */}
      {gallery.length > 0 && (
        <section className="bg-white border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <div className="flex items-end justify-between mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Gallery</h2>
              <Link href={`/o/${params.slug}/gallery`} className="text-sm font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1">View all <ArrowRight size={15} /></Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {gallery.slice(0, 6).map((ph, i) => (
                <Link key={i} href={`/o/${params.slug}/gallery`} className="block rounded-xl overflow-hidden border border-slate-200 aspect-square">
                  <img src={ph.url} alt={ph.caption || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Sponsors */}
      {sponsors.length > 0 && (
        <section className="bg-slate-50 border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-14">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 text-center">Sponsors &amp; partners</h2>
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {sponsors.map((s, i) => {
                const inner = s.logoUrl
                  ? <img src={s.logoUrl} alt={s.name || ''} title={s.name || ''} className="max-h-20 max-w-full object-contain" />
                  : <span className="text-slate-600 font-bold text-lg whitespace-nowrap">{s.name}</span>
                const tile = <div className="bg-white border border-slate-200 rounded-2xl h-28 flex items-center justify-center px-5">{inner}</div>
                return s.url
                  ? <a key={i} href={s.url} target="_blank" rel="noreferrer" className="block rounded-2xl hover:shadow-md transition-shadow">{tile}</a>
                  : <div key={i}>{tile}</div>
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

      <OrgFooter org={org} contact={contact} socials={socials} />
    </div>
  )
}
