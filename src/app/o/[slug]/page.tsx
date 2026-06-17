import Link from 'next/link'
import { createClient } from '@libsql/client'
import { MapPin, CalendarDays, ArrowRight, Trophy, Instagram } from 'lucide-react'
import { OrgHeader, OrgFooter, PageLink } from './_chrome'
import { fetchInstagram } from './_instagram'

export const dynamic = 'force-dynamic'

interface Tourn { id: string; name: string; startDate: string; endDate: string; location: string; logoUrl: string; sport: string; teamRegEnabled: number }

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

function Card({ t }: { t: Tourn }) {
  return (
    <div className="group bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col">
      <div className="p-5 flex items-start gap-4">
        {t.logoUrl
          ? <img src={t.logoUrl} alt="" className="w-16 h-16 rounded-xl object-contain bg-white border border-slate-100 flex-shrink-0" />
          : <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">{initials(t.name)}</div>}
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 leading-tight">{t.name}</h3>
          <p className="text-sm text-teal-700 font-medium mt-1 inline-flex items-center gap-1"><CalendarDays size={14} /> {fmtRange(t.startDate, t.endDate)}</p>
          {t.location && <p className="text-sm text-slate-500 mt-0.5 inline-flex items-center gap-1"><MapPin size={14} /> {t.location}</p>}
        </div>
      </div>
      <div className="mt-auto border-t border-slate-100 flex">
        <Link href={`/tournaments/${t.id}/public`} className="flex-1 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 py-3 transition-colors inline-flex items-center justify-center gap-1">
          Details <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
        {t.teamRegEnabled ? (
          <Link href={`/tournaments/${t.id}/register`} className="flex-1 text-center text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 py-3 transition-colors">Register</Link>
        ) : null}
      </div>
    </div>
  )
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

  const pages: any[] = Array.isArray(content.pages) ? content.pages : []
  const navPages: PageLink[] = pages.filter(p => p.title && p.slug).map(p => ({ title: p.title, slug: p.slug }))
  if (gallery.length > 0) navPages.unshift({ title: 'Gallery', slug: 'gallery' })

  const tRes = await client.execute({
    sql: 'SELECT id, name, startDate, endDate, location, logoUrl, sport, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate',
    args: [org.id as string],
  })
  const all = (tRes.rows as any[]).map(r => ({ ...r, teamRegEnabled: Number(r.teamRegEnabled) })) as Tourn[]
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = all.filter(t => (t.endDate || t.startDate || '') >= today).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
  const past = all.filter(t => (t.endDate || t.startDate || '') < today).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
  const registerHref = upcoming[0] ? `/tournaments/${upcoming[0].id}/register` : undefined

  const igItems = await fetchInstagram(ig.token || '', 8)

  return (
    <div className="min-h-screen bg-slate-50">
      <OrgHeader org={org} slug={params.slug} pages={navPages} registerHref={registerHref} />

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

        {past.length > 0 && <>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mt-16 mb-6">Past tournaments</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{past.map(t => <Card key={t.id} t={t} />)}</div>
        </>}
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

      {/* Sponsors marquee */}
      {sponsors.length > 0 && (
        <section className="bg-slate-50 border-t border-slate-200 overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 pt-14">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 text-center">Sponsors &amp; partners</h2>
          </div>
          <style dangerouslySetInnerHTML={{ __html: '@keyframes wrMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}.wr-marquee{animation:wrMarquee 32s linear infinite;width:max-content}' }} />
          <div className="py-12 overflow-hidden">
            <div className="wr-marquee flex items-center gap-16">
              {[...sponsors, ...sponsors].map((s, i) => {
                const img = s.logoUrl
                  ? <img src={s.logoUrl} alt={s.name || ''} title={s.name || ''} className="h-14 object-contain grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition" />
                  : <span className="text-slate-500 font-semibold whitespace-nowrap">{s.name}</span>
                return s.url
                  ? <a key={i} href={s.url} target="_blank" rel="noreferrer" className="flex-shrink-0">{img}</a>
                  : <div key={i} className="flex-shrink-0">{img}</div>
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
