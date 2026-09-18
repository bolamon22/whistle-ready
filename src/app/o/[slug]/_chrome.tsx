import Link from 'next/link'
import { headers } from 'next/headers'
import { isCustomOrgHost } from '@/lib/orgDomains'
import { Facebook, Instagram, Globe } from 'lucide-react'
import OrgNav from './OrgNav'

export type PageRec = { title: string; slug: string; group?: string; body?: string; heroImage?: string; placement?: 'nav' | 'footer' }
export type NavLink = { title: string; href: string }
export type NavItem = { type: 'link'; title: string; href: string } | { type: 'group'; label: string; children: NavLink[] }

// Link base for the org's own pages. On a custom domain (sunshinelax.com) the org
// is served at the root so links are root-relative (''); on whistleready.app they
// live under /o/[slug]. Read once per request from the Host header.
export function orgBase(slug: string): string {
  try { return isCustomOrgHost(headers().get('host')) ? '' : `/o/${slug}` } catch { return `/o/${slug}` }
}

// Build the ordered nav (with dropdown groups) from the org's pages.
export function buildNav(base: string, pages: PageRec[], hasGallery: boolean, workHref?: string): NavItem[] {
  // Straight to the event list, not the top of the home page: on the home page itself
  // `base || '/'` just reloaded and appeared to do nothing, and from /gallery or /work
  // it left you scrolling for the events. Same target as the hero's "See all events".
  const items: NavItem[] = [{ type: 'link', title: 'Tournaments', href: base ? `${base}#tournaments` : '/#tournaments' }]
  if (hasGallery) items.push({ type: 'link', title: 'Gallery', href: `${base}/gallery` })
  const groupAt: Record<string, number> = {}
  for (const p of pages) {
    if (!p.title || !p.slug) continue
    if (p.placement === 'footer') continue
    const href = `${base}/${p.slug}`
    const g = (p.group || '').trim()
    if (g) {
      if (groupAt[g] === undefined) { groupAt[g] = items.length; items.push({ type: 'group', label: g, children: [] }) }
      ;(items[groupAt[g]] as any).children.push({ title: p.title, href })
    } else {
      items.push({ type: 'link', title: p.title, href })
    }
  }
  {
    let moreIdx = items.findIndex(it => it.type === 'group' && (((it as any).label || '').trim().toLowerCase() === 'more'))
    if (moreIdx === -1) { moreIdx = items.length; items.push({ type: 'group', label: 'More', children: [] }) }
    ;(items[moreIdx] as any).children.push({ title: 'Results', href: `${base}/results` })
  }
  if (workHref) items.push({ type: 'link', title: 'Work With Us', href: workHref })
  return items
}

// Link sections for the footer, from the pages placed there.
//
// WHY info pages get a second home: the header dropdown serves someone who has
// already picked this org and wants a policy — rules, refunds, weather. A page
// written to be FOUND, like "Florida Youth Lacrosse Tournaments: A Guide for
// Teams & Families", is for a stranger who hasn't, and it stretched that menu to
// three lines for an audience that never opens it. Either placement gives the
// page the same site-wide internal link; the footer is where that link stops
// costing the menu. The section heading is the page's own group, so an org names
// it whatever it likes and can grow the section later.
export function buildFooterLinks(base: string, pages: PageRec[]): { label: string; links: NavLink[] }[] {
  const out: { label: string; links: NavLink[] }[] = []
  const at: Record<string, number> = {}
  for (const p of pages) {
    if (!p.title || !p.slug || p.placement !== 'footer') continue
    const label = (p.group || '').trim() || 'Guides'
    if (at[label] === undefined) { at[label] = out.length; out.push({ label, links: [] }) }
    out[at[label]].links.push({ title: p.title, href: `${base}/${p.slug}` })
  }
  return out
}

export function OrgHeader({ org, homeHref, nav, registerHref }: { org: any; homeHref: string; nav: NavItem[]; registerHref?: string }) {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/70 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href={homeHref} className="flex items-center gap-2.5 min-w-0 flex-shrink">
          {org.logoUrl && <img src={org.logoUrl} alt="" className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-contain bg-white border border-slate-100 flex-shrink-0" />}
          <span className="font-extrabold tracking-tight text-slate-900 text-base sm:text-lg truncate">{org.name}</span>
        </Link>
        <OrgNav nav={nav} registerHref={registerHref} />
      </div>
    </header>
  )
}

export function OrgFooter({ org, contact, socials, base = '', pages = [] }: { org: any; contact: any; socials: any; base?: string; pages?: PageRec[] }) {
  // Renders nothing extra when no page is placed here, so an org that has not used
  // this keeps exactly the footer it had.
  const sections = buildFooterLinks(base, pages)
  return (
    <footer className="bg-[#0b1220] text-slate-300">
      <div className="max-w-6xl mx-auto px-6 py-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            {org.logoUrl && <img src={org.logoUrl} alt="" className="w-11 h-11 rounded-lg object-contain bg-white/95 p-1" />}
            <span className="font-extrabold text-white text-xl tracking-tight">{org.name}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
            {(contact.email || org.contactEmail) && <a href={`mailto:${contact.email || org.contactEmail}`} className="hover:text-teal-300">{contact.email || org.contactEmail}</a>}
            {contact.phone && <a href={`tel:${contact.phone}`} className="hover:text-teal-300">{contact.phone}</a>}
            {contact.hours && <span>{contact.hours}</span>}
            {contact.address && <span>{contact.address}</span>}
          </div>
          {(socials.facebook || socials.instagram || socials.website) && (
            <div className="flex gap-3 mt-4">
              {socials.facebook && <a href={socials.facebook} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" aria-label="Facebook"><Facebook size={17} /></a>}
              {socials.instagram && <a href={socials.instagram} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" aria-label="Instagram"><Instagram size={17} /></a>}
              {socials.website && <a href={socials.website} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" aria-label="Website"><Globe size={17} /></a>}
            </div>
          )}
        </div>
        {sections.length > 0 && (
          <div className="flex flex-wrap gap-x-12 gap-y-7">
            {sections.map(sec => (
              <div key={sec.label}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{sec.label}</p>
                <ul className="mt-3 space-y-2">
                  {sec.links.map(l => (
                    <li key={l.href}><Link href={l.href} className="text-sm text-slate-400 hover:text-teal-300 transition-colors">{l.title}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <span className="text-xs text-slate-500">Powered by Whistle Ready</span>
      </div>
    </footer>
  )
}
