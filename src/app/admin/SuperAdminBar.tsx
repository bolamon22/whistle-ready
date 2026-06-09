'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface Org { id: string; name: string; slug: string; subscriptionTier: string }

const TIER_DOT: Record<string, string> = {
  starter: 'bg-slate-400',
  pro: 'bg-blue-500',
  enterprise: 'bg-purple-500',
}

export default function SuperAdminBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/admin/orgs').then(r => r.json()).then(d => setOrgs(Array.isArray(d) ? d : []))
    // Read current preview-org cookie
    const match = document.cookie.match(/(?:^|; )preview-org=([^;]*)/)
    setActiveOrgId(match ? decodeURIComponent(match[1]) : null)
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function switchOrg(orgId: string | null, navigate?: string) {
    await fetch('/api/admin/preview-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    setActiveOrgId(orgId)
    setOpen(false)
    window.dispatchEvent(new CustomEvent('preview-org-changed'))
    if (navigate) router.push(navigate)
    else router.refresh()
  }

  const activeOrg = orgs.find(o => o.id === activeOrgId)
  const navLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/orgs', label: 'Organizations' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/permissions', label: 'Permissions' },
    { href: '/admin/roadmap', label: 'Roadmap' },
  ]

  return (
    <div className="w-full bg-[#0a0a1a] border-b border-white/10 text-white text-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-11">

        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-black tracking-widest text-white/40 uppercase">GameDay</span>
          <span className="w-px h-4 bg-white/20" />
          <span className="text-xs font-semibold text-white/80">Super Admin</span>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1">
          {navLinks.map(l => (
            <Link key={l.href} href={l.href}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                (l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href))
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}>
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Org switcher */}
        <div className="relative shrink-0" ref={dropRef}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium">
            {activeOrg ? (
              <>
                <span className={`w-2 h-2 rounded-full shrink-0 ${TIER_DOT[activeOrg.subscriptionTier] ?? 'bg-slate-400'}`} />
                <span className="max-w-[140px] truncate">{activeOrg.name}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <span>All Orgs (Platform)</span>
              </>
            )}
            <svg className="w-3 h-3 text-white/50 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Switch Organization</p>
              </div>
              {/* Platform view */}
              <button
                onClick={() => switchOrg(null)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs hover:bg-white/10 transition-colors ${!activeOrgId ? 'bg-white/10' : ''}`}>
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <div className="text-left">
                  <p className="font-semibold text-white">Platform View</p>
                  <p className="text-white/40">See all orgs</p>
                </div>
                {!activeOrgId && <span className="ml-auto text-green-400 text-[10px] font-bold">ACTIVE</span>}
              </button>
              <div className="border-t border-white/10" />
              {orgs.map(org => (
                <div key={org.id} className={`flex items-center group ${activeOrgId === org.id ? 'bg-white/10' : ''}`}>
                  <button
                    onClick={() => switchOrg(org.id)}
                    className="flex items-center gap-3 px-3 py-2.5 text-xs hover:bg-white/10 transition-colors flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${TIER_DOT[org.subscriptionTier] ?? 'bg-slate-400'}`} />
                    <div className="text-left min-w-0">
                      <p className="font-semibold text-white truncate">{org.name}</p>
                      <p className="text-white/40 capitalize">{org.subscriptionTier}</p>
                    </div>
                    {activeOrgId === org.id && <span className="ml-auto text-blue-400 text-[10px] font-bold shrink-0">ACTIVE</span>}
                  </button>
                  <button
                    onClick={() => switchOrg(org.id, '/')}
                    title="View portal"
                    className="px-2 py-2.5 text-white/20 hover:text-white/80 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                    →
                  </button>
                  <Link
                    href={`/admin/orgs/${org.id}`}
                    onClick={() => setOpen(false)}
                    title="Edit org"
                    className="px-2 py-2.5 text-white/20 hover:text-white/80 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                    ✏️
                  </Link>
                </div>
              ))}
              {orgs.length === 0 && (
                <p className="px-3 py-3 text-white/30 text-xs">No organizations yet</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
