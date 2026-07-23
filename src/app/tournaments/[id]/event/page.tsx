import Link from 'next/link'
import { cloneElement } from 'react'
import { createClient } from '@libsql/client'
import { Trophy, MapPin, CalendarDays, ClipboardList, ScrollText, Utensils, ListChecks, Phone, Mail, ExternalLink, Hotel, Zap, Award, DollarSign } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import FieldMap from '@/components/FieldMap'
import EventInfoNav from '@/components/EventInfoNav'
import PublicChirp from '@/components/PublicChirp'
import EventSection from '@/components/EventSection'
import CountdownBlock from '@/components/CountdownBlock'
import FaqBlock from '@/components/FaqBlock'
import ExpandableContent from '@/components/ExpandableContent'
import ScheduleBlock from '@/components/ScheduleBlock'
import StandingsBlock from '@/components/StandingsBlock'
import { SECTION_LABELS } from '@/lib/eventSections'
import { parsePricing, baseFee, feeScheduleLines } from '@/lib/regPricing'
import { resolveBlocks, isBuiltin } from '@/lib/eventBlocks'
import { OrgHeader, OrgFooter, buildNav, orgBase } from '@/app/o/[slug]/_chrome'
import type { Metadata } from 'next'
import { abs, clip, stripMd } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { resolveRules } from '@/lib/rules'

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
    if (sy === ey && sm === em) return `${fmtDayShort(s)}–${parseInt(e.split('-')[2])}, ${ey}`
    if (sy === ey) return `${fmtDayShort(s)} – ${fmtDayShort(e)}, ${ey}`
    return `${fmtDayShort(s)}, ${sy} – ${fmtDayShort(e)}, ${ey}`
  }
  return `${fmtDayShort(s)}, ${s.split('-')[0]}`
}
function shortLocation(loc: string) {
  if (!loc) return ''
  const m = loc.match(/([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s*\d{5})?/)
  if (m) return `${m[1].trim()}, ${m[2]}`
  return loc.split(',')[0].trim()
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const client = db()
  let t: any = null
  try { const r = await client.execute({ sql: 'SELECT id, name, sport, startDate, endDate, location, logoUrl, orgId FROM "Tournament" WHERE id = ?', args: [params.id] }); if (r.rows.length) t = r.rows[0] } catch {}
  if (!t) return { title: 'Tournament' }
  let overview = ''; let orgName = ''
  try { const c = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] }); if (c.rows.length) { const cc = JSON.parse(((c.rows[0] as any).value as string) || '{}'); overview = cc.overview || '' } } catch {}
  try { if (t.orgId) { const o = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE id = ?', args: [t.orgId] }); if (o.rows.length) orgName = (o.rows[0] as any).name } } catch {}
  const loc = shortLocation(t.location || '')
  const when = fmtRange(t.startDate, t.endDate)
  const sportName = t.sport || 'Lacrosse'
  const title = `${t.name} — ${when}${loc ? ` · ${loc}` : ''}`
  const description = clip(stripMd(overview) || `${t.name}: ${sportName} tournament${loc ? ` in ${loc}` : ''}${when ? `, ${when}` : ''}. Schedule, divisions and online team registration${orgName ? ` from ${orgName}` : ''}.`)
  const url = abs(`/tournaments/${params.id}/event`)
  const images = t.logoUrl ? [t.logoUrl] : []
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url, images, type: 'website' }, twitter: { title, description, images } }
}

export default async function TournamentEventPage({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, sport, startDate, endDate, location, logoUrl, orgId, teamRegEnabled, registrationDivisions, registrationPricing, venues FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  }
  const t = tRes.rows[0] as any

  let c: any = {}
  // Note: this catch is intentionally quiet (a missing/!unreadable row just means the
  // event page shows its tournament-derived sections), but log it — a silent failure
  // here previously made an event-content bug much harder to track down.
  try {
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] })
    if (r.rows.length) c = JSON.parse(((r.rows[0] as any).value as string) || '{}')
  } catch (e: any) {
    console.error('[event page] failed to read tournamentSite content:', params.id, e?.message || e)
  }
  let sponsors: any[] = []
  let org: any = { name: '', slug: '', logoUrl: '', contactEmail: '' }
  let navPages: any[] = []; let hasGallery = false; let contact: any = {}; let socials: any = {}; let orgLogo = ''
  if (t.orgId) {
    try { const oRes = await client.execute({ sql: 'SELECT id, name, slug, contactEmail, logoUrl FROM "Organization" WHERE id = ?', args: [t.orgId] }); if (oRes.rows.length) org = oRes.rows[0] } catch {}
    try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${t.orgId}`] }); if (s.rows.length) { const oc = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (Array.isArray(oc.sponsors)) sponsors = oc.sponsors; orgLogo = oc.logo || ''; navPages = Array.isArray(oc.pages) ? oc.pages : []; hasGallery = Array.isArray(oc.gallery) && oc.gallery.length > 0; contact = oc.contact || {}; socials = oc.socials || {} } } catch {}
  }
  let ruleSets: any[] = []
  try { if (t.orgId) { const rr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgRules:${t.orgId}`] }); if (rr.rows.length) { const v = JSON.parse(((rr.rows[0] as any).value as string) || '{}'); ruleSets = Array.isArray(v.sets) ? v.sets : [] } } } catch {}
  c.rules = resolveRules(c, ruleSets).body
  const headerLogo = orgLogo || org.logoUrl || ''
  if (!t.logoUrl) t.logoUrl = headerLogo
  const orgForChrome = { name: org.name, logoUrl: headerLogo, contactEmail: org.contactEmail }
  const nav = org.slug ? buildNav(orgBase(org.slug), navPages, hasGallery) : []
  const registerHref = Number(t.teamRegEnabled) ? `/tournaments/${params.id}/register` : undefined
  const base = `/tournaments/${params.id}`

  const setupDivisions: string[] = (() => { try { const d = JSON.parse(t.registrationDivisions || '[]'); return Array.isArray(d) ? d.filter(Boolean) : [] } catch { return [] } })()
  const divisions: string[] = setupDivisions
  const pricing = parsePricing(t.registrationPricing)
  const feeLines: string[] = Number(t.teamRegEnabled) ? feeScheduleLines(pricing) : []
  // Venues are the single source of truth for "where we play". A venue appears on the
  // public page once it has an address (that's the opt-in). We fall back to the legacy
  // event-page `locations` list for tournaments not migrated yet, so nothing vanishes.
  const venueLocations: any[] = (() => {
    try {
      const raw = JSON.parse((t as any).venues || '[]')
      const list = Array.isArray(raw) ? raw : (raw.venues || [])
      return (Array.isArray(list) ? list : [])
        .filter((v: any) => v && (v.address || v.fieldMapUrl))
        .map((v: any) => ({ name: v.name || '', address: v.address || '', mapUrl: v.mapUrl || '', fieldMapUrl: v.fieldMapUrl || '' }))
    } catch { return [] }
  })()
  const legacyLocations: any[] = (Array.isArray(c.locations) ? c.locations : []).filter((l: any) => l && (l.name || l.address))
  const locations: any[] = venueLocations.length > 0 ? venueLocations : legacyLocations
  const contacts: any[] = Array.isArray(c.contacts) ? c.contacts : []

  // Built-in section content (singletons), keyed by type.
  const sectionMap: Record<string, JSX.Element | null> = {
    overview: c.overview ? (
      <EventSection id="overview" title="Overview">
        <ExpandableContent html={mdToHtml(c.overview)} />
      </EventSection>
    ) : null,
    fees: feeLines.length > 0 ? (
      <EventSection id="fees" title="Team fees">
        {/* Volume tiers as cards so the multi-team discount is legible at a glance —
            "save $100/team" sells 7+ far better than a bullet list did. */}
        {(() => {
          const tiers = pricing.tiers || []
          const first = tiers[0]?.price || 0
          const cards = tiers.map((tier, i) => {
            const prevMax = i === 0 ? 0 : (tiers[i - 1].max ?? 0)
            const label = tier.max === null ? `${prevMax + 1}+ teams` : `${prevMax + 1}–${tier.max} teams`
            return { label, price: tier.price, save: first - tier.price, last: i === tiers.length - 1 }
          })
          const flatNote = (pricing.flats || []).map((f: any) => `${f.label || 'Flat rate'}: $${(f.price || 0).toLocaleString()}/team`).join(' · ')
          const dateNotes = feeLines.filter(l => / off\/team /.test(l))
          return (
            <>
              <div className={`grid grid-cols-2 ${cards.length >= 3 ? 'sm:grid-cols-3' : ''} gap-3`}>
                {cards.map((cd, i) => (
                  <div key={i} className={`relative rounded-xl p-4 text-center border ${cd.last && cd.save > 0 ? 'border-2 border-teal-500' : 'border-slate-200 bg-white'}`}>
                    {cd.last && cd.save > 0 && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-teal-50 text-teal-700 text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap border border-teal-200">Best value</span>}
                    <div className="text-xs text-slate-500">{cd.label}</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${(cd.price || 0).toLocaleString()}</div>
                    <div className={`text-[11px] mt-0.5 ${cd.save > 0 ? 'text-teal-700 font-medium' : 'text-slate-400'}`}>{cd.save > 0 ? `save $${cd.save.toLocaleString()}/team` : 'per team'}</div>
                  </div>
                ))}
              </div>
              {(flatNote || dateNotes.length > 0) && (
                <div className="mt-3 space-y-0.5">
                  {flatNote && <p className="text-xs text-slate-500">{flatNote}</p>}
                  {dateNotes.map((l, i) => <p key={i} className="text-xs text-teal-700">{l}</p>)}
                </div>
              )}
              {registerHref && <a href={registerHref} className="text-sm font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 mt-3">Register a team <ExternalLink size={13} /></a>}
            </>
          )
        })()}
      </EventSection>
    ) : null,
    divisions: divisions.length > 0 ? (
      <EventSection id="divisions" title="Divisions">
        {/* Grouped Boys / Girls when names allow it; anything else falls into a third
            group so nothing disappears for non-standard division names. */}
        {(() => {
          const groups: [string, string[]][] = [
            ['Boys', divisions.filter(d => /^boys\b/i.test(d)).map(d => d.replace(/^boys\s*/i, ''))],
            ['Girls', divisions.filter(d => /^girls\b/i.test(d)).map(d => d.replace(/^girls\s*/i, ''))],
          ]
          const other = divisions.filter(d => !/^(boys|girls)\b/i.test(d))
          if (other.length) groups.push(['Divisions', other])
          const shown = groups.filter(([, list]) => list.length > 0)
          const chip = (d: string, i: number) => <span key={i} className="bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full border border-teal-100">{d}</span>
          return (
            <div>
              {shown.map(([label, list]) => (
                <div key={label} className="mb-3 last:mb-0">
                  {shown.length > 1 && <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mb-1.5">{label}</div>}
                  <div className="flex flex-wrap gap-1.5">{list.map(chip)}</div>
                </div>
              ))}
              {c.ageChartUrl && <a href={c.ageChartUrl} target="_blank" rel="noreferrer" className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 mt-3">Age &amp; eligibility chart <ExternalLink size={13} /></a>}
            </div>
          )
        })()}
      </EventSection>
    ) : null,
    locations: locations.length > 0 ? (
      <EventSection id="locations" title="Location">
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
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Rules</h2>
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

  // The hero carries ONE dominant action (Register) plus the Event info menu. Player
  // waiver and Game Day moved to the "For players" rail card — three equal buttons in
  // the hero buried the only one that converts.
  const eyebrow = [
    (t.sport ? String(t.sport) : 'Tournament'),
    t.startDate ? fmtRangeShort(t.startDate, t.endDate) : '',
    shortLocation(t.location || ''),
  ].filter(Boolean).join(' · ')
  const minFee = (() => { if (!Number(t.teamRegEnabled)) return ''; const b = baseFee(pricing); return b > 0 ? `from $${b.toLocaleString()}` : '' })()
  const quickFacts = [
    t.startDate && { icon: <CalendarDays size={22} />, label: 'DATES', value: fmtRangeShort(t.startDate, t.endDate) },
    t.location && { icon: <MapPin size={22} />, label: 'LOCATION', value: shortLocation(t.location), href: panelIds.has('locations') ? '#locations' : undefined },
    divisions.length > 0 && { icon: <Award size={22} />, label: 'DIVISIONS', value: `${divisions.length} division${divisions.length > 1 ? 's' : ''}`, href: panelIds.has('divisions') ? '#divisions' : undefined },
    minFee && { icon: <DollarSign size={22} />, label: 'TEAM FEE', value: minFee, href: registerHref || (panelIds.has('fees') ? '#fees' : undefined) },
    (c.hotelsUrl || c.hotels) && { icon: <Hotel size={22} />, label: 'HOTELS', value: 'Book hotels', href: c.hotelsUrl || (panelIds.has('hotels') ? '#hotels' : undefined) },
    { icon: <ListChecks size={22} />, label: 'SCHEDULE', value: 'View games', href: `${base}/public` },
  ].filter(Boolean) as any[]
  const factCols = ({ 1: 'sm:grid-cols-2', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6' } as any)[quickFacts.length] || 'sm:grid-cols-4' 

  // All in-page sections, stacked in order. Previously these were tab panels, which
  // meant only ONE section rendered at a time — a coach had to click through to see
  // divisions, then fees, then location, and the rest wasn't in the HTML at all (bad
  // for search/AI crawlers). The tab strip also duplicated the Event info dropdown.
  // Stacking shows everything on one scroll; the fact-bar cards and Event info menu
  // now scroll to a section (#id) instead of swapping panels.
  const stackedSections = rendered.filter((x: any) => !x.page && x.b.type !== 'rules' && x.el)

  // Two-column body: the story reads down the left (overview, fees, divisions, custom
  // blocks, FAQ); everything actionable lives in a right rail (map, hotels, contacts,
  // player links). Rail sections render as compact cards — the 28px EventSection
  // headings are wrong at rail width — but visibility still follows the block builder:
  // a hidden Location block hides the rail card too.
  const RAIL_TYPES = new Set(['locations', 'hotels', 'contacts'])
  const mainSections = stackedSections.filter((x: any) => !RAIL_TYPES.has(x.b.type))
  const railVisible = new Set(stackedSections.filter((x: any) => RAIL_TYPES.has(x.b.type)).map((x: any) => x.b.type))
  const hasRules = rendered.some((x: any) => x.b.type === 'rules')

  const eventUrl = abs(`${base}/event`)
  const faqItems = resolveBlocks(c).filter((b: any) => b.type === 'faq').flatMap((b: any) => Array.isArray(b.props?.items) ? b.props.items : []).filter((it: any) => it && it.q && it.a)
  const sportName = t.sport || 'Lacrosse'
  const sportsEventLd: any = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: t.name, sport: sportName, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', url: eventUrl, ...(t.startDate ? { startDate: t.startDate } : {}), ...(t.endDate ? { endDate: t.endDate } : {}), ...(t.logoUrl ? { image: abs(t.logoUrl) } : {}), ...(t.location ? { location: { '@type': 'Place', name: shortLocation(t.location) || t.location, address: t.location } } : {}), ...(org.name ? { organizer: { '@type': 'Organization', name: org.name, ...(org.slug ? { url: abs(`/o/${org.slug}`) } : {}) } } : {}), ...(Number(t.teamRegEnabled) ? { offers: { '@type': 'Offer', url: abs(`${base}/register`), availability: 'https://schema.org/InStock', category: 'Team registration' } } : {}) }
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [...(org.slug ? [{ '@type': 'ListItem', position: 1, name: org.name, item: abs(`/o/${org.slug}`) }] : []), { '@type': 'ListItem', position: org.slug ? 2 : 1, name: t.name, item: eventUrl }] }
  const faqLd = faqItems.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems.slice(0, 20).map((it: any) => ({ '@type': 'Question', name: String(it.q), acceptedAnswer: { '@type': 'Answer', text: stripMd(String(it.a)) } })) } : null
  return (
    <div className="min-h-screen bg-slate-50">
      <JsonLd data={[sportsEventLd, breadcrumbLd, ...(faqLd ? [faqLd] : [])]} />
      {org.slug && <OrgHeader org={orgForChrome} homeHref={orgBase(org.slug) || '/'} nav={nav} registerHref={registerHref} />}
      <section className="relative text-white bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a]">
        {c.heroImage && <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${c.heroImage})` }} aria-hidden />}
        {/* Bottom-weighted scrim: the title sits low, so darkness concentrates where
            the text is and any hero photo stays visible up top. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#040c18]/90 via-[#040c18]/45 to-[#040c18]/15" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-10">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            {t.logoUrl && <img src={t.logoUrl} alt="" className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl object-contain bg-white/95 p-1.5 shrink-0 ring-2 ring-white/40" />}
            <div className="flex-1 min-w-0">
              <div className="text-teal-300 text-[11px] sm:text-xs font-semibold tracking-[0.16em] uppercase">{eyebrow}</div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.04] mt-1">{t.name}</h1>
            </div>
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

      {quickFacts.length > 0 && (
        <div className="max-w-6xl mx-auto px-6 relative -mt-6">
          <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm grid grid-cols-2 ${factCols} divide-x divide-slate-100 overflow-hidden`}>
            {quickFacts.map((f: any, i: number) => {
              const inner = (
                <>
                  <div className="text-[10px] tracking-[0.08em] text-slate-400 font-semibold uppercase">{f.label}</div>
                  <div className={`text-sm font-bold mt-1 line-clamp-2 ${f.href ? 'text-teal-700' : 'text-slate-900'}`}>{f.value}</div>
                </>
              )
              return f.href
                ? <a key={i} href={f.href} {...(String(f.href).startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className="px-4 py-4 text-center block hover:bg-slate-50 transition-colors">{inner}</a>
                : <div key={i} className="px-4 py-4 text-center">{inner}</div>
            })}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-10 items-start">
        <div className="space-y-12 min-w-0">
          {mainSections.map((x: any) => (
            <div key={x.b.id}>{x.el}</div>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          {railVisible.has('locations') && locations.length > 0 && (
            <div id="locations" className="scroll-mt-28">
              {locations.map((l, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-4 last:mb-0">
                  {l.fieldMapUrl
                    ? <FieldMap src={l.fieldMapUrl} label={l.name} />
                    : l.address
                      ? <iframe title={`Map of ${l.name || 'venue'}`} src={`https://www.google.com/maps?q=${encodeURIComponent(l.address)}&output=embed`} className="w-full h-36 border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                      : null}
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900 text-sm">{l.name}</h3>
                    {l.address && <p className="text-xs text-slate-500 mt-0.5">{l.address}</p>}
                    {(l.mapUrl || l.address) && <a href={l.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 mt-2"><MapPin size={12} /> Get directions</a>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {railVisible.has('hotels') && (c.hotelsUrl || c.hotels) && (
            <div id="hotels" className="bg-white border border-slate-200 rounded-2xl p-4 scroll-mt-28">
              <h3 className="font-bold text-slate-900 text-sm">Where to stay</h3>
              {c.hotels
                ? <div className="text-xs text-slate-500 mt-1 prose-body [&_p]:m-0" dangerouslySetInnerHTML={{ __html: mdToHtml(c.hotels) }} />
                : <p className="text-xs text-slate-500 mt-1">Room blocks for traveling teams.</p>}
              {c.hotelsUrl && <a href={c.hotelsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-lg mt-3"><Hotel size={13} /> Book hotels</a>}
            </div>
          )}

          {railVisible.has('contacts') && contacts.length > 0 && (
            <div id="contacts" className="bg-white border border-slate-200 rounded-2xl p-4 scroll-mt-28">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Questions?</h3>
              <div className="space-y-3">
                {contacts.map((ct, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center text-xs font-semibold shrink-0">
                      {String(ct.name || '?').split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{ct.name}{ct.role ? <span className="text-slate-400 font-normal"> · {ct.role}</span> : null}</div>
                      {ct.phone && <a href={`tel:${ct.phone}`} className="text-xs text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Phone size={11} /> {ct.phone}</a>}
                      {ct.email && <a href={`mailto:${ct.email}`} className="block text-xs text-teal-700 hover:text-teal-900 truncate">{ct.email}</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="font-bold text-slate-900 text-sm mb-2">For players &amp; parents</h3>
            <div className="flex flex-col gap-1.5">
              <Link href={`${base}/player-waiver`} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><ScrollText size={12} /> Player waiver</Link>
              {hasRules && <Link href={`${base}/rules`} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><ScrollText size={12} /> Rules &amp; policies</Link>}
              <Link href={`${base}/public`} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><ListChecks size={12} /> Schedule &amp; live scores</Link>
              <Link href={`${base}/today`} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><Zap size={12} /> Game day hub</Link>
            </div>
          </div>
        </aside>
      </div>

      {registerHref && (
        <div className="bg-[#0b1f3a]">
          <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold">Ready to compete{t.location ? ` in ${shortLocation(t.location)}` : ''}?</p>
              <p className="text-slate-400 text-sm mt-0.5">Spots are confirmed once registration and payment are complete.</p>
            </div>
            <Link href={registerHref} className="inline-flex items-center gap-1.5 text-sm font-semibold px-6 py-3 rounded-xl bg-[#16b886] hover:bg-[#13a87b] text-[#04241b] shrink-0 transition-colors">
              <ClipboardList size={15} /> Register a team
            </Link>
          </div>
        </div>
      )}
      {org.slug && <OrgFooter org={orgForChrome} contact={contact} socials={socials} />}
      <PublicChirp tournamentId={params.id} tournamentName={t.name} />
    </div>
  )
}
