import Link from 'next/link'
import { Facebook, Instagram, Globe } from 'lucide-react'

export type PageLink = { title: string; slug: string }

export function OrgHeader({ org, slug, pages, registerHref }: { org: any; slug: string; pages: PageLink[]; registerHref?: string }) {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <Link href={`/o/${slug}`} className="flex items-center gap-3 flex-shrink-0">
          {org.logoUrl && <img src={org.logoUrl} alt="" className="w-9 h-9 rounded-lg object-contain bg-white border border-slate-100" />}
          <span className="font-bold text-slate-900 text-lg">{org.name}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600 ml-auto mr-2">
          <Link href={`/o/${slug}`} className="hover:text-teal-700">Tournaments</Link>
          {pages.map(p => <Link key={p.slug} href={`/o/${slug}/${p.slug}`} className="hover:text-teal-700">{p.title}</Link>)}
        </nav>
        {registerHref && <Link href={registerHref} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg transition-colors flex-shrink-0">Register a team</Link>}
      </div>
      {pages.length > 0 && (
        <div className="md:hidden border-t border-slate-100">
          <div className="max-w-6xl mx-auto px-6 py-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-slate-600">
            <Link href={`/o/${slug}`} className="hover:text-teal-700">Tournaments</Link>
            {pages.map(p => <Link key={p.slug} href={`/o/${slug}/${p.slug}`} className="hover:text-teal-700">{p.title}</Link>)}
          </div>
        </div>
      )}
    </header>
  )
}

export function OrgFooter({ org, contact, socials }: { org: any; contact: any; socials: any }) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-slate-500">
        <div>
          <span className="font-semibold text-slate-700">{org.name}</span>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {(contact.email || org.contactEmail) && <a href={`mailto:${contact.email || org.contactEmail}`} className="hover:text-teal-700">{contact.email || org.contactEmail}</a>}
            {contact.phone && <a href={`tel:${contact.phone}`} className="hover:text-teal-700">{contact.phone}</a>}
            {contact.hours && <span>{contact.hours}</span>}
            {contact.address && <span>{contact.address}</span>}
          </div>
          {(socials.facebook || socials.instagram || socials.website) && (
            <div className="flex gap-3 mt-2 text-slate-400">
              {socials.facebook && <a href={socials.facebook} target="_blank" rel="noreferrer" className="hover:text-teal-700" aria-label="Facebook"><Facebook size={18} /></a>}
              {socials.instagram && <a href={socials.instagram} target="_blank" rel="noreferrer" className="hover:text-teal-700" aria-label="Instagram"><Instagram size={18} /></a>}
              {socials.website && <a href={socials.website} target="_blank" rel="noreferrer" className="hover:text-teal-700" aria-label="Website"><Globe size={18} /></a>}
            </div>
          )}
        </div>
        <span className="text-xs text-slate-400">Powered by Whistle Ready</span>
      </div>
    </footer>
  )
}
