import Link from 'next/link'
import { createClient } from '@libsql/client'
import { ClipboardList, ScrollText, Utensils, ListChecks, CalendarDays, MapPin, Zap } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav } from '@/app/o/[slug]/_chrome'
import EventInfoNav from '@/components/EventInfoNav'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

const fmtDay = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) }
const yr = (d: string) => (d ? d.split('-')[0] : '')
function fmtRange(s: string, e: string) {
  if (s && e && s !== e) return `${fmtDay(s)} – ${fmtDay(e)}, ${yr(e)}`
  if (s) return `${fmtDay(s)}, ${yr(s)}`
  return 'Dates TBA'
}

// Wraps a tournament-scoped public page (forms, waiver, vendor) in the org site
// header + the same event hero (logo, name, dates, action buttons) so these
// pages look and behave like a section of the event page.
export default async function EventChrome({ tournamentId, children }: { tournamentId: string; children: React.ReactNode }) {
  const client = db()
  const base = `/tournaments/${tournamentId}`
  const eyebrow = ((t.sport ? String(t.sport) + ' ' : '') + 'tournament')
  let t: any = {}
  try { const r = await client.execute({ sql: 'SELECT id, name, startDate, endDate, location, logoUrl, orgId, teamRegEnabled, registrationDivisions FROM "Tournament" WHERE id = ?', args: [tournamentId] }); if (r.rows.length) t = r.rows[0] } catch {}
  let cs: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${tournamentId}`] }); if (r.rows.length) cs = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  let org: any = { name: '', slug: '', logoUrl: '', contactEmail: '' }
  let navPages: any[] = []; let hasGallery = false; let contact: any = {}; let socials: any = {}; let orgLogo = ''; let sponsors: any[] = []
  if (t.orgId) {
    try { const o = await client.execute({ sql: 'SELECT id, name, slug, contactEmail, logoUrl FROM "Organization" WHERE id = ?', args: [t.orgId] }); if (o.rows.length) org = o.rows[0] } catch {}
    try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${t.orgId}`] }); if (s.rows.length) { const oc = JSON.parse(((s.rows[0] as any).value as string) || '{}'); orgLogo = oc.logo || ''; navPages = Array.isArray(oc.pages) ? oc.pages : []; hasGallery = Array.isArray(oc.gallery) && oc.gallery.length > 0; contact = oc.contact || {}; socials = oc.socials || {}; if (Array.isArray(oc.sponsors)) sponsors = oc.sponsors } } catch {}
  }
  const headerLogo = orgLogo || org.logoUrl || ''
  const heroLogo = t.logoUrl || headerLogo
  const orgForChrome = { name: org.name, logoUrl: headerLogo, contactEmail: org.contactEmail }
  const nav = org.slug ? buildNav(org.slug, navPages, hasGallery) : []
  const registerHref = Number(t.teamRegEnabled) ? `${base}/register` : undefined

  const divs = (() => { try { const d = JSON.parse(t.registrationDivisions || '[]'); return Array.isArray(d) ? d.filter(Boolean) : [] } catch { return [] } })()
  const infoItems = [
    cs.overview && { href: `${base}/event#overview`, label: 'Overview' },
    (cs.feesText || divs.length) && { href: `${base}/event#fees`, label: 'Fees & divisions' },
    (Array.isArray(cs.locations) && cs.locations.length) && { href: `${base}/event#locations`, label: 'Locations & field maps' },
    (cs.hotelsUrl || cs.hotels) && { href: `${base}/event#hotels`, label: 'Hotels' },
    cs.rules && { href: `${base}/rules`, label: 'Rules & policies' },
    (Array.isArray(cs.contacts) && cs.contacts.length) && { href: `${base}/event#contacts`, label: 'Contacts' },
    sponsors.length && { href: `${base}/event#sponsors`, label: 'Sponsors & partners' },
    { href: `${base}/vendor-request`, label: 'Vendor Request' },
  ].filter(Boolean) as { href: string; label: string }[]

  const actions = [
    Number(t.teamRegEnabled) ? { href: `${base}/register`, label: 'Register', icon: <ClipboardList size={15} />, primary: true } : null,
    { href: `${base}/player-waiver`, label: 'Player Waiver', icon: <ScrollText size={15} /> },
    { href: `${base}/today`, label: 'Game Day', icon: <Zap size={15} /> },
  ].filter(Boolean) as any[]

  return (
    <>
      {org.slug && <OrgHeader org={orgForChrome} slug={org.slug} nav={nav} registerHref={registerHref} />}
      {t.name && (
        <section className="relative bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white mx-3 sm:mx-5 mt-4 rounded-3xl shadow-xl">
          {cs.heroImage && <div className="absolute inset-0 bg-center bg-cover rounded-3xl" style={{ backgroundImage: `url(${cs.heroImage})` }} aria-hidden />}
          {cs.heroImage && <div className="absolute inset-0 bg-[#0b1f3a]/55 rounded-3xl" aria-hidden />}
          <div className="relative max-w-4xl mx-auto px-6 py-8">
            <Link href={`${base}/event`} className="flex items-center gap-4 w-fit">
              {heroLogo && <img src={heroLogo} alt="" className="w-16 h-16 rounded-xl object-contain bg-white/95 p-1.5" />}
              <div>
                <div className="text-teal-300 text-[10px] sm:text-[11px] font-semibold tracking-[0.18em] uppercase">{eyebrow}</div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">{t.name}</h1>
              </div>
            </Link>
            <div className="mt-6 flex flex-wrap gap-2">
              {actions.map((a, i) => (
                <Link key={i} href={a.href} className={`inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full transition-colors ${a.primary ? 'bg-[#16b886] hover:bg-[#13a87b] text-[#04241b] shadow-lg shadow-emerald-900/20' : 'bg-white/95 hover:bg-white text-[#0b1f3a]'}`}>{a.icon} {a.label}</Link>
              ))}
              <EventInfoNav items={infoItems} />
            </div>
          </div>
        </section>
      )}
      {children}
      {org.slug && <OrgFooter org={orgForChrome} contact={contact} socials={socials} />}
    </>
  )
}
