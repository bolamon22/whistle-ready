import Link from 'next/link'
import { Facebook, Instagram, Globe, ChevronDown } from 'lucide-react'

export type PageRec = { title: string; slug: string; group?: string; body?: string; heroImage?: string }
export type NavLink = { title: string; href: string }
export type NavItem = { type: 'link'; title: string; href: string } | { type: 'group'; label: string; children: NavLink[] }

// Build the ordered nav (with dropdown groups) from the org's pages.
export function buildNav(slug: string, pages: PageRec[], hasGallery: boolean): NavItem[] {
  const items: NavItem[] = [{ type: 'link', title: 'Tournaments', href: `/o/${slug}` }]
  if (hasGallery) items.push({ type: 'link', title: 'Gallery', href: `/o/${slug}/gallery` })
  const groupAt: Record<string, number> = {}
  for (const p of pages) {
    if (!p.title || !p.slug) continue
    const href = `/o/${slug}/${p.slug}`
    const g = (p.group || '').trim()
    if (g) {
      if (groupAt[g] === undefined) { groupAt[g] = items.length; items.push({ type: 'group', label: g, children: [] }) }
      ;(items[groupAt[g]] as any).children.push({ title: p.title, href })
    } else {
      items.push({ type: 'link', title: p.title, href })
    }
  }
  return items
}

function flatten(nav: NavItem[]): NavLink[] {
  const out: NavLink[] = []
  for (const it of nav) {
    if (it.type === 'link') out.push({ title: it.title, href: it.href })
    else it.children.forEach(c => out.push(c))
  }
  return out
}

export function OrgHeader({ org, slug, nav, registerHref }: { org: any; slug: string; nav: NavItem[]; registerHref?: string }) {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/70">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <Link href={`/o/${slug}`} className="flex items-center gap-3 flex-shrink-0">
          {org.logoUrl && <img src={org.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-100" />}
          <span className="font-extrabold tracking-tight text-slate-900 text-lg">{org.name}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[13px] font-semibold uppercase tracking-wide text-slate-600 ml-auto mr-2">
          {nav.map((it, i) => it.type === 'link'
            ? <Link key={i} href={it.href} className="hover:text-teal-700 transition-colors">{it.title}</Link>
            : (
              <div key={i} className="relative group">
                <span className="inline-flex items-center gap-1 cursor-default hover:text-teal-700 transition-colors">{it.label} <ChevronDown size={13} /></span>
                <div className="absolute left-0 top-full pt-3 hidden group-hover:block">
                  <div className="bg-white rounded-xl shadow-xl border border-slate-200 py-2 min-w-[200px]">
                    {it.children.map((c, j) => <Link key={j} href={c.href} className="block px-4 py-2 text-slate-600 normal-case tracking-normal text-sm hover:bg-slate-50 hover:text-teal-700">{c.title}</Link>)}
                  </div>
                </div>
              </div>
            ))}
        </nav>
        {registerHref && <Link href={registerHref} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-full transition-colors flex-shrink-0 shadow-sm">Register</Link>}
      </div>
      {nav.length > 1 && (
        <div className="md:hidden border-t border-slate-100">
          <div className="max-w-6xl mx-auto px-6 py-2 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {flatten(nav).map((c, i) => <Link key={i} href={c.href} className="hover:text-teal-700">{c.title}</Link>)}
          </div>
        </div>
      )}
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
