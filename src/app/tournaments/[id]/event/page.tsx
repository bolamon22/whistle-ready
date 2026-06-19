import Link from 'next/link'
import { cloneElement } from 'react'
import { createClient } from '@libsql/client'
import { Trophy, MapPin, CalendarDays, ClipboardList, ScrollText, Utensils, ListChecks, Phone, Mail, ExternalLink, Hotel, Zap, Award, DollarSign } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import FieldMap from '@/components/FieldMap'
import EventInfoNav from '@/components/EventInfoNav'
import EventTabs from '@/components/EventTabs'
import EventSection from '@/components/EventSection'
import CountdownBlock from '@/components/CountdownBlock'
import FaqBlock from '@/components/FaqBlock'
import ExpandableContent from '@/components/ExpandableContent'
import ScheduleBlock from '@/components/ScheduleBlock'
import StandingsBlock from '@/components/StandingsBlock'
import { SECTION_LABELS } from '@/lib/eventSections'
import { resolveBlocks, isBuiltin } from '@/lib/eventBlocks'
import { OrgHeader, OrgFooter, buildNav } from '@/app/o/[slug]/_chrome'

export const dynamic = 'force-dynamic'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

const fmtDay = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) }
const yr = (d: string) => (d ? d.split('-')[0] : '')
function fmtRange(s: string, e: string) {
  if (s && e && s !== e) return `${fmtDay(s)} – ${fmtDay(e)}, ${yr(e)}`
  if (s) return `${fmtDay(s)}, ${yr(s)}`
  return 'Dates TBA'
}
const fmtDayShort = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function fmtRangeShort(s: string, e: string) {
  if (!s) return 'TBA'
  if (e && e !== s) {
    const [sy, sm] = s.split('-'); const [ey, em] = e.split('-')
    if (sy === ey && sm === em) return `${fmtDayShort(s)}–${parseInt(e.split('-')[2])}`
    return `${fmtDayShort(s)} – ${fmtDayShort(e)}`
  }
  return fmtDayShort(s)
}
function shortLocation(loc: string) {
  if (!loc) return ''
  const m = loc.match(/([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s*\d{5})?/)
  if (m) return `${m[1].trim()}, ${m[2]}`
  return loc.split(',')[0].trim()
}

export default async function TournamentEventPage({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, sport, startDate, endDate, location, logoUrl, orgId, teamRegEnabled, registrationDivisions FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  }
  const t = tRes.rows[0] as any

  let c: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] }); if (r.rows.length) c = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  let sponsors: any[] = []
  let org: any = { name: '', slug: '', logoUrl: '', contactEmail: '' }
  let navPages: any[] = []; let hasGallery = false; let contact: any = {}; let socials: any = {}; let orgLogo = ''
  if (t.orgId) {
    try { const oRes = await client.execute({ sql: 'SELECT id, name, slug, contactEmail, logoUrl FROM "Organization" WHERE id = ?', args: [t.orgId] }); if (oRes.rows.length) org = oRes.rows[0] } catch {}
    try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${t.orgId}`] }); if (s.rows.length) { const oc = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (Array.isArray(oc.sponsors)) sponsors = oc.sponsors; orgLogo = oc.logo || ''; navPages = Array.isArray(oc.pages) ? oc.pages : []; hasGallery = Array.isArray(oc.gallery) && oc.gallery.length > 0; contact = oc.contact || {}; socials = oc.socials || {} } } catch {}
  }
  const headerLogo = orgLogo || org.logoUrl || ''
  if (!t.logoUrl) t.logoUrl = headerLogo
  const orgForChrome = { name: org.name, logoUrl: headerLogo, contactEmail: org.contactEmail }
  const nav = org.slug ? buildNav(org.slug, navPages, hasGallery) : []
  const registerHref = Number(t.teamRegEnabled) ? `/tournaments/${params.id}/register` : undefined
  const base = `/tournaments/${params.id}`

  const setupDivisions: string[] = (() => { try { const d = JSON.parse(t.registrationDivisions || '[]'); return Array.isArray(d) ? d.filter(Boolean) : [] } catch { return [] } })()
  const manualDivisions: string[] = String(c.divisionsText || '').split('\n').map((x: string) => x.trim()).filter(Boolean)
  const divisions: string[] = setupDivisions.length ? setupDivisions : manualDivisions
  const locations: any[] = Array.isArray(c.locations) ? c.locations : []
  const contacts: any[] = Array.isArray(c.contacts) ? c.contacts : []

  // Built-in section content (singletons), keyed by type.
  const sectionMap: Record<string, JSX.Element | null> = {
    overview: c.overview ? (
      <EventSection id="overview" title="Overview">
        <ExpandableContent html={mdToHtml(c.overview)} />
      </EventSection>
    ) : null,
    fees: (c.feesText || divisions.length > 0) ? (
      <EventSection id="fees" title="Fees & divisions">
        <div className="grid sm:grid-cols-2 gap-4">
          {c.feesText && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <h3 className="font-bold text-slate-900 mb-2">Tournament fees</h3>
              <div className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{c.feesText}</div>
            </div>
          )}
          {divisions.length > 0 && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <h3 className="font-bold text-slate-900 mb-2.5">Divisions</h3>
              <div className="flex flex-wrap gap-1.5">{divisions.map((d, i) => <span key={i} className="bg-teal-50 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">{d}</span>)}</div>
              {c.ageChartUrl && <a href={c.ageChartUrl} target="_blank" rel="noreferrer" className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 mt-3">Age &amp; eligibility chart <ExternalLink size={13} /></a>}
            </div>
          )}
        </div>
      </EventSection>
    ) : null,
    locations: locations.length > 0 ? (
      <EventSection id="locations" title="Locations & field maps">
        <div className="grid sm:grid-cols-2 gap-5">
          {locations.map((l, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {l.fieldMapUrl
                ? <FieldMap src={l.fieldMapUrl} label={l.name} />
                : l.address
                  ? <iframe title={`Map of ${l.name || 'venue'}`} src={`https://www.google.com/maps?q=${encodeURIComponent(l.address)}&output=embed`} className="w-full h-44 border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                  : null}
              <div className="p-4">
                <h3 className="font-bold text-slate-900">{l.name}</h3>
                {l.address && <p className="text-sm text-slate-500 mt-0.5">{l.address}</p>}
                {(l.mapUrl || l.address) && <a href={l.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 mt-3"><MapPin size={13} /> Get directions</a>}
              </div>
            </div>
          ))}
        </div>
      </EventSection>
    ) : null,
    hotels: (c.hotelsUrl || c.hotels) ? (
      <EventSection id="hotels" title="Hotels">
        {c.hotelsUrl && <a href={c.hotelsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-2.5 rounded-full mb-4"><Hotel size={15} /> Book hotels</a>}
        {c.hotels && <div className="prose-body" dangerouslySetInnerHTML={{ __html: mdToHtml(c.hotels) }} />}
      </EventSection>
    ) : null,
    rules: c.rules ? (
      <Link href={`${base}/rules`} className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:bg-slate-50/60 transition-colors">
        <ScrollText size={18} className="text-slate-400 shrink-0" />
        <div className="flex-1">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Rules &amp; policies</h2>
          <p className="text-sm text-slate-500">Read the full tournament rules, format and policies</p>
        </div>
        <span className="text-teal-700 text-sm font-semibold inline-flex items-center gap-1 shrink-0">View <ExternalLink size={14} /></span>
      </Link>
    ) : null,
    contacts: contacts.length > 0 ? (
      <EventSection id="contacts" title="Contacts">
        <div className="grid sm:grid-cols-2 gap-4">
          {contacts.map((ct, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="font-bold text-slate-900">{ct.name}</div>
              {ct.role && <div className="text-sm text-slate-500">{ct.role}</div>}
              <div className="mt-2 flex flex-col gap-1 text-sm">
                {ct.phone && <a href={`tel:${ct.phone}`} className="text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><Phone size={13} /> {ct.phone}</a>}
                {ct.email && <a href={`mailto:${ct.email}`} className="text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><Mail size={13} /> {ct.email}</a>}
              </div>
            </div>
          ))}
        </div>
      </EventSection>
    ) : null,
    sponsors: sponsors.length > 0 ? (
      <EventSection id="sponsors" title="Sponsors & partners">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
          {sponsors.map((s, i) => {
            const img = s.logoUrl ? <img src={s.logoUrl} alt={s.name || ''} className="h-12 object-contain" /> : <span className="text-slate-600 font-medium">{s.name}</span>
            return s.url ? <a key={i} href={s.url} target="_blank" rel="noreferrer">{img}</a> : <div key={i}>{img}</div>
          })}
        </div>
      </EventSection>
    ) : null,
  }

  // Custom block content (repeatable), rendered from the block's props.
  const customContent = (b: any): JSX.Element | null => {
    const p = b.props || {}
    if (b.type === 'custom') return (p.body && String(p.body).trim()) ? (
      <EventSection id={b.id} title={p.title || 'Section'} defaultOpen={!p.collapsed}>
        <div className="prose-body" dangerouslySetInnerHTML={{ __html: mdToHtml(p.body) }} />
      </EventSection>
    ) : null
    if (b.type === 'cta') return (p.label && p.url) ? (
      <div className="flex justify-center py-2">
        <a href={p.url} target="_blank" rel="noreferrer" className={p.style === 'secondary'
          ? 'inline-flex items-center gap-1.5 border-2 border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold px-6 py-3 rounded-full'
          : 'inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-full shadow-lg shadow-teal-600/20'}>
          {p.label} <ExternalLink size={16} />
        </a>
      </div>
    ) : null
    if (b.type === 'faq') {
      const items = (Array.isArray(p.items) ? p.items : []).filter((it: any) => it && it.q)
      return items.length ? (
        <EventSection id={b.id} title={p.title || 'Details'} defaultOpen={!p.collapsed}>
          <FaqBlock items={items} />
        </EventSection>
      ) : null
    }
    if (b.type === 'image') return p.url ? (
      <figure>
        {p.link
          ? <a href={p.link} target="_blank" rel="noreferrer"><img src={p.url} alt={p.caption || ''} className="w-full rounded-2xl border border-slate-200" /></a>
          : <img src={p.url} alt={p.caption || ''} className="w-full rounded-2xl border border-slate-200" />}
        {p.caption && <figcaption className="text-center text-sm text-slate-500 mt-2">{p.caption}</figcaption>}
      </figure>
    ) : null
    if (b.type === 'schedule') return <EventSection id={b.id} title={p.title || 'Schedule'}><ScheduleBlock /></EventSection>
    if (b.type === 'standings') return <EventSection id={b.id} title={p.title || 'Standings'}><StandingsBlock /></EventSection>
    if (b.type === 'countdown') return t.startDate ? <CountdownBlock title={p.title} target={t.startDate} /> : null
    return null
  }

  const isPageMode = (b: any) => (b.type === 'custom' || b.type === 'faq') && b.props && b.props.display === 'page'
  const rendered = resolveBlocks(c)
    .filter((b: any) => !b.hidden)
    .map((b: any) => {
      let el: any = isBuiltin(b.type) ? sectionMap[b.type] : customContent(b)
      if (el && isBuiltin(b.type) && b.type !== 'rules') el = cloneElement(el, { defaultOpen: !(b.props && b.props.collapsed) })
      return { b, el, page: isPageMode(b) }
    })
    .filter((x: any) => x.el)

  const navLabel = (b: any) => isBuiltin(b.type) ? (SECTION_LABELS[b.type] || b.type) : ((b.props && b.props.title) || (b.type === 'faq' ? 'Details' : 'Section'))
  const panelIds = new Set(rendered.filter((x: any) => !x.page && x.b.type !== 'rules' && x.el).map((x: any) => x.b.id))
  const infoItems = [
    ...rendered
      .filter((x: any) => x.b.type !== 'cta' && x.b.type !== 'countdown' && x.b.type !== 'image')
      .map((x: any) => ({ href: x.b.type === 'rules' ? `${base}/rules` : (x.page ? `${base}/p/${x.b.id}` : `#${x.b.id}`), label: navLabel(x.b) })),
    { href: `${base}/vendor-request`, label: 'Vendor Request' },
  ]

  const actions = [
    Number(t.teamRegEnabled) ? { href: `${base}/register`, label: 'Register', icon: <ClipboardList size={15} />, primary: true } : null,
    { href: `${base}/player-waiver`, label: 'Player Waiver', icon: <ScrollText size={15} /> },
    { href: `${base}/today`, label: 'Game Day', icon: <Zap size={15} /> },
  ].filter(Boolean) as any[]

  const eyebrow = ((t.sport ? String(t.sport) + ' ' : '') + 'tournament')
  const minFee = (() => { const m = String(c.feesText || '').match(/\$\s?[\d,]+/g); if (!m) return ''; const nums = m.map((x: string) => parseInt(x.replace(/[^\d]/g, ''))).filter((n: number) => n > 0); return nums.length ? `from $${Math.min(...nums).toLocaleString()}` : '' })()
  const quickFacts = [
    t.startDate && { icon: <CalendarDays size={22} />, label: 'DATES', value: fmtRangeShort(t.startDate, t.endDate) },
    t.location && { icon: <MapPin size={22} />, label: 'LOCATION', value: shortLocation(t.location), href: panelIds.has('locations') ? '#locations' : undefined },
    divisions.length > 0 && { icon: <Award size={22} />, label: 'DIVISIONS', value: `${divisions.length} division${divisions.length > 1 ? 's' : ''}`, href: panelIds.has('fees') ? '#fees' : undefined },
    minFee && { icon: <DollarSign size={22} />, label: 'TEAM FEE', value: minFee, href: registerHref || (panelIds.has('fees') ? '#fees' : undefined) },
    (c.hotelsUrl || c.hotels) && { icon: <Hotel size={22} />, label: 'HOTELS', value: 'Book hotels', href: c.hotelsUrl || (panelIds.has('hotels') ? '#hotels' : undefined) },
    { icon: <ListChecks size={22} />, label: 'SCHEDULE', value: 'View games', href: `${base}/public` },
  ].filter(Boolean) as any[]
  const factCols = ({ 1: 'sm:grid-cols-2', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6' } as any)[quickFacts.length] || 'sm:grid-cols-4' 

  // Tabbed content: fact-linked sections (reached via the facts bar) stay OUT of
  // the tab strip to avoid duplicating the facts; everything else is a tab.
  const FACT_LINKED = ['locations', 'fees', 'hotels']
  const eventPanels: Record<string, JSX.Element> = {}
  rendered.forEach((x: any) => { if (!x.page && x.b.type !== 'rules' && x.el) eventPanels[x.b.id] = x.el })
  const eventTabs = rendered
    .filter((x: any) => (x.b.type === 'rules' || x.page) ? true : !FACT_LINKED.includes(x.b.type))
    .map((x: any) => ({
      id: x.b.id,
      label: navLabel(x.b),
      href: x.b.type === 'rules' ? `${base}/rules` : (x.page ? `${base}/p/${x.b.id}` : undefined),
    }))
  const firstPanelTab = eventTabs.find((t: any) => !t.href)
  const eventDefaultId = eventPanels['overview'] ? 'overview' : (firstPanelTab ? firstPanelTab.id : (eventTabs[0] ? eventTabs[0].id : 'overview'))

  return (
    <div className="min-h-screen bg-slate-50">
      {org.slug && <OrgHeader org={orgForChrome} slug={org.slug} nav={nav} registerHref={registerHref} />}
      <section className="relative text-white bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a]">
        {c.heroImage && <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${c.heroImage})` }} aria-hidden />}
        {c.heroImage && <div className="absolute inset-0 bg-[#0b1f3a]/55" aria-hidden />}
        <div className="relative max-w-4xl mx-auto px-6 py-16">
          <div className="flex items-center gap-4">
            {t.logoUrl && <img src={t.logoUrl} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-contain bg-white/95 p-1.5 shrink-0" />}
            <div>
              <div className="text-teal-300 text-[11px] sm:text-xs font-semibold tracking-[0.18em] uppercase">{eyebrow}</div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.04] mt-1">{t.name}</h1>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            {actions.map((a, i) => (
              <Link key={i} href={a.href} className={`inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full transition-colors ${a.primary ? 'bg-[#16b886] hover:bg-[#13a87b] text-[#04241b] shadow-lg shadow-emerald-900/20' : 'bg-white/95 hover:bg-white text-[#0b1f3a]'}`}>{a.icon} {a.label}</Link>
            ))}
            <EventInfoNav items={infoItems} />
          </div>
        </div>
      </section>

      {quickFacts.length > 0 && (
        <div className="bg-white border-b border-slate-200">
          <div className={`max-w-4xl mx-auto px-6 grid grid-cols-2 ${factCols} divide-x divide-slate-100`}>
            {quickFacts.map((f: any, i: number) => {
              const inner = (
                <>
                  <span className="text-teal-600 inline-flex">{f.icon}</span>
                  <div className="text-[11px] tracking-wide text-slate-400 font-semibold mt-1.5">{f.label}</div>
                  <div className={`text-sm font-bold mt-0.5 line-clamp-2 ${f.href ? 'text-teal-700' : 'text-slate-900'}`}>{f.value}</div>
                </>
              )
              return f.href
                ? <a key={i} href={f.href} {...(String(f.href).startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className="px-4 py-5 text-center block hover:bg-slate-50 transition-colors">{inner}</a>
                : <div key={i} className="px-4 py-5 text-center">{inner}</div>
            })}
          </div>
        </div>
      )}

      <EventTabs tabs={eventTabs} panels={eventPanels} defaultId={eventDefaultId} />
      {org.slug && <OrgFooter org={orgForChrome} contact={contact} socials={socials} />}
    </div>
  )
}
