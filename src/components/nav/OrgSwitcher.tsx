'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Check, ChevronDown } from 'lucide-react'
import { ROLE_LABELS } from './navConfig'
import { switchOrg } from '@/lib/switchOrg'

// The organization switcher (lib/orgMembers): for a login that works in more than
// one organization, the logo at the left of the top bar opens the list of them, with
// the role held in each. Picking one switches the whole app to it. A login in one
// organization never sees this: its logo stays a plain link home.

export type MyOrg = { orgId: string | null; name: string; logoUrl: string; role: string; home: boolean; plan: string }

/** The signed-in login's organizations, loaded once when it has more than one. */
export function useMyOrgs(): { orgs: MyOrg[]; active: string | null } {
  const { data: session } = useSession()
  const switchable = !!session?.user?.switchable
  const [state, setState] = useState<{ orgs: MyOrg[]; active: string | null }>({ orgs: [], active: null })
  useEffect(() => {
    if (!switchable) { setState({ orgs: [], active: null }); return }
    let live = true
    fetch('/api/me/orgs').then(r => (r.ok ? r.json() : null))
      .then(d => { if (live && d && Array.isArray(d.orgs)) setState({ orgs: d.orgs, active: d.active ?? null }) })
      .catch(() => {})
    return () => { live = false }
  }, [switchable])
  return state
}

const orgName = (o: MyOrg) => o.orgId ? o.name : `${ROLE_LABELS[o.role] ?? 'Your'} portal`
const roleLine = (o: MyOrg) => [ROLE_LABELS[o.role] ?? o.role, o.plan && o.plan !== 'Tournament' ? `${o.plan} plan` : ''].filter(Boolean).join(' · ')

function Mark({ o, size }: { o: MyOrg; size: string }) {
  return o.logoUrl
    ? <img src={o.logoUrl} alt="" className={`${size} flex-shrink-0 rounded-[10px] border border-slate-200 bg-white object-contain p-[3px]`} />
    : <span aria-hidden className={`${size} flex flex-shrink-0 items-center justify-center rounded-[10px] bg-slate-700 text-sm font-bold text-white`}>{orgName(o).charAt(0) || '?'}</span>
}

/** The list itself, for the desktop popover and the phone menu. */
function OrgList({ orgs, active, onDone }: { orgs: MyOrg[]; active: string | null; onDone?: () => void }) {
  const { update } = useSession()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  async function pick(o: MyOrg) {
    const key = o.orgId ?? ''
    if (o.orgId === active) { onDone?.(); window.location.href = '/'; return }
    setBusy(key); setFailed(false)
    const ok = await switchOrg(update, o.orgId)
    if (ok) window.location.href = '/'
    else { setBusy(null); setFailed(true) }
  }
  return (
    <>
      <ul aria-label="Your organizations">
        {orgs.map(o => {
          const on = o.orgId === active
          return (
            <li key={o.orgId ?? 'home'}>
              <button type="button" onClick={() => pick(o)} disabled={busy !== null} aria-current={on ? 'true' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60 ${on ? 'bg-teal-50' : ''}`}>
                <Mark o={o} size="h-8 w-8" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-slate-900">{orgName(o)}</span>
                  <span className="text-xs text-slate-600">{busy === (o.orgId ?? '') ? 'Switching…' : roleLine(o)}</span>
                </span>
                {on && <Check size={16} aria-label="Working here now" className="flex-shrink-0 text-teal-700" />}
              </button>
            </li>
          )
        })}
      </ul>
      {failed && <p role="alert" className="px-3 pt-1 text-xs font-medium text-red-700">That didn’t switch. Try again.</p>}
    </>
  )
}

/** The logo and name at the left of the bar, opening the list. Renders nothing for a
 *  login with one organization (the bar keeps its plain logo link). */
export function OrgBrand({ org, orgs, active, open, setOpen }: {
  org: { id?: string; name?: string; logoUrl?: string } | null
  orgs: MyOrg[]
  active: string | null
  open: boolean
  setOpen: (o: boolean) => void
}) {
  if (orgs.length < 2) return null
  const cur = orgs.find(o => o.orgId === active) ?? orgs.find(o => o.orgId === org?.id) ?? null
  const name = cur ? orgName(cur) : org?.name || 'Organization'
  const logo = org?.logoUrl || cur?.logoUrl || ''
  return (
    <div data-nav-pop="org" className="relative flex min-w-0 flex-1 xl:flex-none xl:flex-shrink-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        aria-label={`${name}: switch organization`}
        className="flex min-w-0 items-center gap-2 rounded-xl py-1 pl-0.5 pr-1.5 hover:bg-slate-50">
        {logo
          ? <img src={logo} alt="" className="h-9 w-9 flex-shrink-0 rounded-[10px] border border-slate-200 bg-white object-contain p-[3px]" />
          : <span aria-hidden className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-slate-700 text-sm font-bold text-white">{name.charAt(0)}</span>}
        <span className="min-w-0 truncate text-[15px] font-extrabold tracking-tight text-slate-900 xl:hidden min-[1400px]:block min-[1400px]:max-w-[200px]">{name}</span>
        <ChevronDown size={15} aria-hidden className={`flex-shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Your organizations</p>
          <OrgList orgs={orgs} active={cur?.orgId ?? active} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

/** The same list at the top of the phone menu. */
export function OrgSheetList({ orgs, active, onDone }: { orgs: MyOrg[]; active: string | null; onDone?: () => void }) {
  if (orgs.length < 2) return null
  return (
    <div className="border-b border-slate-200 pb-2">
      <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Your organizations</p>
      <div className="-mx-2"><OrgList orgs={orgs} active={active} onDone={onDone} /></div>
    </div>
  )
}
