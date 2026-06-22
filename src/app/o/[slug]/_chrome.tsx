import Link from 'next/link'
import { headers } from 'next/headers'
import { isCustomOrgHost } from '@/lib/orgDomains'
import { Facebook, Instagram, Globe } from 'lucide-react'
import OrgNav from './OrgNav'

export type PageRec = { title: string; slug: string; group?: string; body?: string; heroImage?: string }
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
  const items: NavItem[] = [{ type: 'link', title: 'Tournaments', href: base || '/' }]
  if (hasGallery) items.push({ type: 'link', title: 'Gallery', href: `${base}/gallery` })
  const groupAt: Record<string, number> = {}
  for (const p of pages) {
    if (!p.title || !p.slug) continue
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

export function OrgFooter({ org, contact, socials }: { org: any; contact: any; socials: any }) {
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
        <span className="text-xs text-slate-500">Powered by Whistle Ready</span>
      </div>
    </footer>
  )
}
