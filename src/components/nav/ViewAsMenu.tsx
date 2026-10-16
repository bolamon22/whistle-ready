'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Eye } from 'lucide-react'
import { useRole } from '@/lib/role-context'
import { useOrg } from '@/lib/org-context'
import { ROLE_LABELS, VIEW_AS_ROLES } from './navConfig'

// An admin's View as (lib/previewView; Bo, Oct 16 2026: "view it as an outside
// organization, just so I can see what they see ... so I can just switch between
// them. And have both open up on my screen"). Pick an organization and a role and
// the app shows that organization's plan, menus and data the way that role sees
// them. Three ways in: the chip in the bar on wide screens, a row in the account and
// phone menus, and the amber bar across the top while a view is on.
//
// Each browser window with its own cookies keeps its own view, so two views side by
// side means a second, private window (lib/role-context).

type OrgOption = { id: string; name: string; planLabel: string }

let orgsOnce: Promise<OrgOption[]> | null = null
function loadOrgs(): Promise<OrgOption[]> {
  if (!orgsOnce) {
    orgsOnce = fetch('/api/admin/orgs')
      .then(r => (r.ok ? r.json() : []))
      .then((d: unknown) => (Array.isArray(d) ? d : []).map((o: Record<string, unknown>) => ({
        id: String(o.id), name: String(o.name || 'Organization'), planLabel: o.planLabel ? String(o.planLabel) : '',
      })).sort((a, b) => a.name.localeCompare(b.name)))
      .catch(() => { orgsOnce = null; return [] as OrgOption[] })
  }
  return orgsOnce
}

function useOrgOptions(): OrgOption[] | null {
  const [orgs, setOrgs] = useState<OrgOption[] | null>(null)
  useEffect(() => {
    let live = true
    loadOrgs().then(o => { if (live) setOrgs(o) })
    return () => { live = false }
  }, [])
  return orgs
}

const roleName = (r: string) => ROLE_LABELS[r] ?? r

/** "Lax Club FL as Tournament Director", or the role alone. */
export function useViewLabel(): string {
  const { effectiveRole, isPreview, previewOrgId } = useRole()
  const org = useOrg()
  if (!isPreview) return ''
  const where = previewOrgId ? (org?.id === previewOrgId ? org.name : 'this organization') : ''
  return where ? `${where} as ${roleName(effectiveRole)}` : roleName(effectiveRole)
}

const SELECT = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500'

/** The organization and role pickers, Show, and Back to admin. */
export function ViewAsForm({ idPrefix }: { idPrefix: string }) {
  const { effectiveRole, isPreview, previewOrgId, setPreview } = useRole()
  const orgs = useOrgOptions()
  const [org, setOrg] = useState(previewOrgId ?? '')
  const [role, setRole] = useState(isPreview ? effectiveRole : 'director')
  const [busy, setBusy] = useState<'show' | 'back' | null>(null)
  const same = isPreview && role === effectiveRole && (org || null) === previewOrgId
  const known = !org || !orgs || orgs.some(o => o.id === org)

  async function show() { setBusy('show'); await setPreview(org || null, role) }
  async function back() { setBusy('back'); await setPreview(null, null) }

  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor={`${idPrefix}-org`} className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-700">Organization</span>
        <select id={`${idPrefix}-org`} value={org} onChange={e => setOrg(e.target.value)} disabled={busy !== null} className={SELECT}>
          <option value="">All organizations</option>
          {!known && <option value={org}>The organization viewed now</option>}
          {(orgs ?? []).map(o => <option key={o.id} value={o.id}>{o.name}{o.planLabel ? ` · ${o.planLabel}` : ''}</option>)}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-role`} className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-700">Role</span>
        <select id={`${idPrefix}-role`} value={role} onChange={e => setRole(e.target.value)} disabled={busy !== null} className={SELECT}>
          {VIEW_AS_ROLES.map(r => <option key={r} value={r}>{roleName(r)}</option>)}
        </select>
      </label>
      <div className="flex gap-2 pt-0.5">
        <button type="button" onClick={show} disabled={busy !== null || same}
          className="h-10 flex-1 rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
          {busy === 'show' ? 'Opening…' : same ? 'Showing now' : 'Show'}
        </button>
        {isPreview && (
          <button type="button" onClick={back} disabled={busy !== null}
            className="h-10 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {busy === 'back' ? 'Going back…' : 'Back to admin'}
          </button>
        )}
      </div>
      <p className="text-[11px] leading-snug text-slate-600">
        {org ? 'Shows that organization’s plan, menus and data. ' : 'The role alone, across every organization. '}
        Each browser window keeps its own view: for two side by side, open a private window, sign in there and pick the other one.
      </p>
    </div>
  )
}

/** In the bar on wide screens (2xl and up): "View as", or the view that's on. */
export function ViewAsChip({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const { isPreview } = useRole()
  const label = useViewLabel()
  return (
    <div data-nav-pop="viewas" className="relative hidden flex-shrink-0 2xl:block">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        title={isPreview ? `Viewing ${label}` : 'View as an organization and role'}
        className={`flex h-8 max-w-[260px] items-center gap-1.5 rounded-full border pl-2.5 pr-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${isPreview ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'}`}>
        <Eye size={15} aria-hidden className="flex-shrink-0" />
        <span className="truncate whitespace-nowrap">{isPreview ? label : 'View as'}</span>
        <ChevronDown size={13} aria-hidden className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">View as</p>
          <ViewAsForm idPrefix="va-chip" />
        </div>
      )}
    </div>
  )
}

/** A row in the account menu and the phone menu that opens the same pickers. */
export function ViewAsRow({ idPrefix }: { idPrefix: string }) {
  const { isPreview } = useRole()
  const label = useViewLabel()
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-slate-50">
        <span className="flex flex-shrink-0 items-center gap-2.5 whitespace-nowrap text-sm font-medium text-slate-900"><Eye size={16} aria-hidden className="text-slate-500" />View as</span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
          <span className={`truncate ${isPreview ? 'font-semibold text-amber-800' : ''}`}>{isPreview ? label : 'Off'}</span>
          <ChevronDown size={14} aria-hidden className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div className="px-3 pb-2 pt-1"><ViewAsForm idPrefix={idPrefix} /></div>}
    </div>
  )
}

/** The amber bar across the top while a view is on: what you're looking at, a way
 *  to switch, and Back to admin. */
export function ViewAsBanner({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const { isPreview, previewOrgId, setPreview } = useRole()
  const label = useViewLabel()
  const [leaving, setLeaving] = useState(false)
  if (!isPreview) return null
  return (
    <div data-nav-pop="viewas-bar" className="relative">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-amber-400 px-4 py-1.5 text-xs font-semibold text-amber-950">
        <span className="flex min-w-0 items-center gap-1.5">
          <Eye size={14} aria-hidden className="flex-shrink-0" />
          <span>Viewing <strong>{label}</strong>{previewOrgId ? ': their plan, menus and data' : ': this is how the app looks to that role'}</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-3">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="underline underline-offset-2 hover:no-underline">Switch view</button>
          <button type="button" onClick={() => { setLeaving(true); void setPreview(null, null) }} disabled={leaving}
            className="underline underline-offset-2 hover:no-underline disabled:opacity-60">{leaving ? 'Going back…' : 'Back to admin'}</button>
        </span>
      </div>
      {open && (
        <div className="absolute right-2 top-full z-50 mt-1 w-[320px] max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Switch view</p>
          <ViewAsForm idPrefix="va-bar" />
        </div>
      )}
    </div>
  )
}
