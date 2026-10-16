'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { PREVIEW_ROLES } from '@/lib/roleScope'

// The role the app shows, and an admin's View as (lib/previewView): a role, and the
// organization being looked at, so an admin sees what that organization's director
// (or scheduler, assigner...) sees: its plan's pages and its data. All of it lives in
// this browser's cookies, which the server reads too, so two browser windows with
// their own cookies (a private window) can show two views side by side.

interface RoleContextType {
  effectiveRole: string
  isPreview: boolean
  /** The organization an admin's View as is looking at; null for none. */
  previewOrgId: string | null
  /** View as this role in the organization already being viewed; null = back to admin. */
  setPreviewRole: (role: string | null) => void
  /** View as a role in an organization (null: no organization, the role alone), or
   *  with a null role go back to admin and to the organization viewed before. */
  setPreview: (orgId: string | null, role: string | null) => Promise<void>
  /** Feature groups the organization's plan has off (lib/orgPlans): pass to roleCanAccess. */
  planOff: string[]
}

const RoleContext = createContext<RoleContextType>({
  effectiveRole: 'viewer',
  isPreview: false,
  previewOrgId: null,
  setPreviewRole: () => {},
  setPreview: async () => {},
  planOff: [],
})

const NO_GROUPS: string[] = []
const VIEW_TTL = 60 * 60 * 8          // seconds, as preview-org (lib/previewView)
const BEFORE_KEY = 'wr-view-before'   // the organization viewed before View as, to go back to
const STAMP_KEY = 'wr-view-stamp'     // tells this browser's other tabs the view changed

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return m[1] }
}

function store(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* private mode, blocked storage */ }
}
function recall(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

async function postOrg(orgId: string | null) {
  await fetch('/api/admin/preview-org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId }),
  })
}

type View = { role: string | null; orgId: string | null; plan: string[] | null }
function readView(): View {
  const role = readCookie('preview-role')
  const plan = readCookie('preview-plan')
  return {
    role: role && (PREVIEW_ROLES as readonly string[]).includes(role) ? role : null,
    orgId: readCookie('preview-org') || null,
    plan: plan === null ? null : plan.split(',').filter(Boolean),
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  // Read at once on the client, so a page checking the role on its first render
  // already has the view (the server has no cookies here, and isPreview waits for the
  // session anyway, so the first render matches the server's).
  const [view, setView] = useState<View>(readView)
  const realRole = session?.user?.role ?? 'viewer'
  const isAdmin = realRole === 'admin'

  // The cookies are the source of truth (middleware and the API read them). Read on
  // mount, again when the Viewing picker changes the organization, and every other
  // tab of this browser reloads when one of them changes the view, so no tab shows
  // one view's menus over another view's data.
  useEffect(() => {
    const load = () => setView(readView())
    load()
    const onStorage = (e: StorageEvent) => { if (e.key === STAMP_KEY) window.location.reload() }
    window.addEventListener('preview-org-changed', load)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('preview-org-changed', load); window.removeEventListener('storage', onStorage) }
  }, [])

  // An organization picked before the plan rode along with it has no preview-plan
  // cookie yet: ask for it once.
  useEffect(() => {
    if (!isAdmin || !view.orgId || view.plan !== null) return
    postOrg(view.orgId).then(() => setView(readView())).catch(() => {})
  }, [isAdmin, view.orgId, view.plan])

  function go(home: boolean) {
    store(STAMP_KEY, String(Date.now()))
    // The server answers as the view too (pages and API data), so the page is
    // fetched again. A new organization starts at home: the page open now may be
    // another organization's event.
    if (home || window.location.pathname.startsWith('/unauthorized')) window.location.href = '/'
    else window.location.reload()
  }

  const setPreview = async (orgId: string | null, role: string | null) => {
    const current = readCookie('preview-org') || null
    if (role) {
      if (!readCookie('preview-role')) store(BEFORE_KEY, current ?? '')
      if (orgId !== current) await postOrg(orgId).catch(() => {})
      document.cookie = `preview-role=${encodeURIComponent(role)}; path=/; max-age=${VIEW_TTL}; SameSite=Lax`
      go(orgId !== current)
      return
    }
    // Back to admin, and to the organization viewed before (blank: all of them).
    const before = recall(BEFORE_KEY)
    if (before !== null && (before || null) !== current) await postOrg(before || null).catch(() => {})
    store(BEFORE_KEY, null)
    document.cookie = 'preview-role=; path=/; max-age=0; SameSite=Lax'
    go(false)
  }

  const setPreviewRole = (role: string | null) => { void setPreview(role ? view.orgId : null, role) }

  const isPreview = isAdmin && view.role !== null
  const effectiveRole = isPreview ? view.role! : realRole
  const previewOrgId = isAdmin ? view.orgId : null
  // The plan of the organization this login works in. An admin is held to none,
  // except in View as of an organization: then that organization's.
  const planOff = isPreview
    ? (view.orgId ? view.plan ?? NO_GROUPS : NO_GROUPS)
    : !isAdmin && Array.isArray(session?.user?.planOff) ? session!.user.planOff! : NO_GROUPS

  return (
    <RoleContext.Provider value={{ effectiveRole, isPreview, previewOrgId, setPreviewRole, setPreview, planOff }}>
      {children}
    </RoleContext.Provider>
  )
}

export const useRole = () => useContext(RoleContext)
