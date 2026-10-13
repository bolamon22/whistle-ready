'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, Check, ChevronDown, Pencil } from 'lucide-react'

// The admin pages' tabs, under the app header. Light, like the rest of the app,
// since the Oct 13 2026 header redesign (it was a dark bar with its own brand and
// a Back link). Users is called Logins now, to match the People menu.

interface Org { id: string; name: string; slug: string; subscriptionTier: string }

const TIER_DOT: Record<string, string> = {
  starter: 'bg-slate-400',
  pro: 'bg-blue-500',
  enterprise: 'bg-purple-500',
}

const TABS = [
  { href: '/admin', label: 'Platform dashboard' },
  { href: '/admin/orgs', label: 'Organizations' },
  { href: '/admin/users', label: 'Logins' },
  { href: '/admin/permissions', label: 'Permissions' },
  { href: '/admin/roadmap', label: 'Roadmap' },
  { href: '/admin/payment-providers', label: 'Payment providers' },
]

export default function SuperAdminBar() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/admin/orgs').then(r => r.json()).then(d => setOrgs(Array.isArray(d) ? d : [])).catch(() => {})
    // Read current preview-org cookie
    const match = document.cookie.match(/(?:^|; )preview-org=([^;]*)/)
    setActiveOrgId(match ? decodeURIComponent(match[1]) : null)
  }, [])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

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

  return (
    <div data-admin-tabs className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-2">
      <span className="hidden flex-shrink-0 pr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 md:block">Admin</span>

      <nav aria-label="Admin" className="flex min-w-0 flex-1 items-center overflow-x-auto">
        {TABS.map(t => {
          const active = t.href === '/admin' ? pathname === '/admin' : pathname === t.href || pathname.startsWith(t.href + '/')
          return (
            <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
              className={`flex h-12 flex-shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors ${active ? 'border-teal-600 font-bold text-teal-700' : 'border-transparent font-semibold text-slate-600 hover:text-slate-900'}`}>
              {t.label}
            </Link>
          )
        })}
      </nav>

      {/* Which organization the admin pages and the app show */}
      <div className="relative flex-shrink-0" ref={dropRef}>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true"
          className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 hover:border-slate-300">
          <span aria-hidden className={`h-2 w-2 flex-shrink-0 rounded-full ${activeOrg ? TIER_DOT[activeOrg.subscriptionTier] ?? 'bg-slate-400' : 'bg-emerald-500'}`} />
          <span className="hidden font-medium text-slate-600 sm:inline">Viewing</span>
          <span className="max-w-[130px] truncate font-bold text-slate-900 sm:max-w-[200px]">{activeOrg ? activeOrg.name : 'All organizations'}</span>
          <ChevronDown size={13} aria-hidden className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Switch organization</p>
            <button type="button" onClick={() => switchOrg(null)} aria-current={!activeOrgId ? 'true' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50 ${!activeOrgId ? 'bg-teal-50' : ''}`}>
              <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">Platform view</span>
                <span className="block text-xs text-slate-600">Every organization</span>
              </span>
              {!activeOrgId && <Check size={16} aria-hidden className="flex-shrink-0 text-teal-700" />}
            </button>
            <div className="mx-1 my-1 h-px bg-slate-200" />
            <div className="max-h-[50vh] overflow-y-auto">
              {orgs.map(org => {
                const on = activeOrgId === org.id
                return (
                  <div key={org.id} className={`flex items-center rounded-xl ${on ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                    <button type="button" onClick={() => switchOrg(org.id)} aria-current={on ? 'true' : undefined} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                      <span aria-hidden className={`h-2 w-2 flex-shrink-0 rounded-full ${TIER_DOT[org.subscriptionTier] ?? 'bg-slate-400'}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{org.name}</span>
                        <span className="block text-xs capitalize text-slate-600">{org.subscriptionTier}</span>
                      </span>
                      {on && <Check size={16} aria-hidden className="ml-auto flex-shrink-0 text-teal-700" />}
                    </button>
                    <button type="button" onClick={() => switchOrg(org.id, '/')} title="Open its tournaments" aria-label={`Open ${org.name}'s tournaments`}
                      className="flex-shrink-0 rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900">
                      <ArrowRight size={15} aria-hidden />
                    </button>
                    <Link href={`/admin/orgs/${org.id}`} onClick={() => setOpen(false)} title="Edit organization" aria-label={`Edit ${org.name}`}
                      className="mr-1 flex-shrink-0 rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900">
                      <Pencil size={14} aria-hidden />
                    </Link>
                  </div>
                )
              })}
              {orgs.length === 0 && <p className="px-3 py-3 text-sm text-slate-600">No organizations yet</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
