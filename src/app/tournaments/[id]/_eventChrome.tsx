import { createClient } from '@libsql/client'
import { sponsorList, sponsorsForEvent } from '@/lib/sponsors'
import { OrgHeader, OrgFooter, buildNav, orgBase } from '@/app/o/[slug]/_chrome'
import { buildHeroProps } from '@/lib/eventHero'
import EventHero from './_eventHero'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

// Wraps a tournament-scoped public page (schedule, forms, waivers, rules) in the
// org site header + the event page's own hero, so each reads as a section of
// the event rather than a separate site. The hero is the SAME component the
// event page renders (_eventHero) fed by the same derivation (lib/eventHero);
// this file only loads the data.
//
// `active` is the fact-strip cell for the page being shown -- 'schedule' on the
// public schedule, 'waiver' on the player waiver -- so the strip also works as
// the event's section nav.
export default async function EventChrome({ tournamentId, active, children }: { tournamentId: string; active?: string; children: React.ReactNode }) {
  const client = db()
  const base = `/tournaments/${tournamentId}`
  let t: any = {}
  try { const r = await client.execute({ sql: 'SELECT id, name, startDate, endDate, location, logoUrl, orgId, teamRegEnabled, registrationDivisions, registrationPricing, sport FROM "Tournament" WHERE id = ?', args: [tournamentId] }); if (r.rows.length) t = r.rows[0] } catch {}
  let cs: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${tournamentId}`] }); if (r.rows.length) cs = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  let org: any = { name: '', slug: '', logoUrl: '', contactEmail: '' }
  let navPages: any[] = []; let hasGallery = false; let contact: any = {}; let socials: any = {}; let orgLogo = ''; let sponsors: any[] = []; let wantsSponsors = false
  if (t.orgId) {
    try { const o = await client.execute({ sql: 'SELECT id, name, slug, contactEmail, logoUrl FROM "Organization" WHERE id = ?', args: [t.orgId] }); if (o.rows.length) org = o.rows[0] } catch {}
    try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${t.orgId}`] }); if (s.rows.length) { const oc = JSON.parse(((s.rows[0] as any).value as string) || '{}'); orgLogo = oc.logo || ''; navPages = Array.isArray(oc.pages) ? oc.pages : []; hasGallery = Array.isArray(oc.gallery) && oc.gallery.length > 0; contact = oc.contact || {}; socials = oc.socials || {}; if (Array.isArray(oc.sponsors)) sponsors = oc.sponsors; wantsSponsors = oc.sponsorPitch?.show === true } } catch {}
  }
  const headerLogo = orgLogo || org.logoUrl || ''
  const heroLogo = t.logoUrl || headerLogo
  const orgForChrome = { name: org.name, logoUrl: headerLogo, contactEmail: org.contactEmail }
  const nav = org.slug ? buildNav(orgBase(org.slug), navPages, hasGallery) : []

  const divs = (() => { try { const d = JSON.parse(t.registrationDivisions || '[]'); return Array.isArray(d) ? d.filter(Boolean) : [] } catch { return [] } })()
  const infoItems = [
    cs.overview && { href: `${base}/event#overview`, label: 'Overview' },
    Number(t.teamRegEnabled) && { href: `${base}/event#fees`, label: 'Tournament fees' },
    divs.length && { href: `${base}/event#divisions`, label: 'Divisions' },
    (Array.isArray(cs.locations) && cs.locations.length) && { href: `${base}/event#locations`, label: 'Location' },
    (cs.hotelsUrl || cs.hotels) && { href: `${base}/event#hotels`, label: 'Hotels' },
    cs.rules && { href: `${base}/rules`, label: 'Rules' },
    (Array.isArray(cs.contacts) && cs.contacts.length) && { href: `${base}/event#contacts`, label: 'Contacts' },
    // Counted the same way the section is rendered, or an event with no partners
    // of its own still advertises a link to an empty section.
    (sponsorsForEvent(sponsorList(sponsors), tournamentId).length > 0 || wantsSponsors) && { href: `${base}/event#sponsors`, label: 'Sponsors & partners' },
    // On the event page these two sit in the side rail. These pages have no
    // rail, and the old hero's buttons for them are gone -- so the menu carries
    // them or nothing does.
    { href: `${base}/coach-waiver`, label: 'Coach waiver' },
    { href: `${base}/today`, label: 'Game day hub' },
    { href: `${base}/vendor-request`, label: 'Vendor Request' },
    { href: `${base}/work`, label: 'Work at our event' },
  ].filter(Boolean) as { href: string; label: string }[]

  // The facts link into the event page's sections; the menu above already
  // knows which of those exist, so it is the one source for both.
  const sectionHref = (sid: string) => infoItems.find(i => i.href === `${base}/event#${sid}`)?.href
  const hero = buildHeroProps({
    t, c: cs, base, divisions: divs, infoItems, sectionHref,
    logoUrl: heroLogo, active, homeHref: `${base}/event`,
  })

  return (
    <>
      {org.slug && <OrgHeader org={orgForChrome} homeHref={orgBase(org.slug) || '/'} nav={nav} registerHref={hero.registerHref} />}
      {t.name && <EventHero {...hero} />}
      {children}
      {org.slug && <OrgFooter org={orgForChrome} contact={contact} socials={socials} base={orgBase(org.slug)} pages={navPages} />}
    </>
  )
}
