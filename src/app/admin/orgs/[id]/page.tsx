'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { FEATURE_GROUPS, PLANS, PLAN_KEYS, type GroupKey, type OrgPlan, type PlanKey, isCustomized, planDefaults } from '@/lib/orgPlans'

interface Org {
  id: string; name: string; slug: string; logoUrl: string
  contactEmail: string; contactPhone: string; website: string
  achBankName: string; achRoutingNumber: string; achAccountNumber: string
  paypalEmail: string; zelleHandle: string; checkPayableTo: string; checkAddress: string
  subscriptionTier: string; subscriptionStatus: string
  /** lib/orgArchive */
  archivedAt?: string | null; archivedBy?: string | null
}

/** What deleting it would take away (lib/orgDelete). */
interface Impact {
  org: { id: string; name: string; slug: string }
  events: number; games: number; registrations: number; staffPool: number; logins: number; forms: number
  payments: number; elsewhere: number; blocked: string | null
}

const STATUSES = ['active', 'inactive', 'suspended']
const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function OrgEditPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [form, setForm] = useState<Partial<Org>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  // Team & owner
  const [teamUsers, setTeamUsers] = useState<any[]>([])
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [newOwner, setNewOwner] = useState(false)
  const [teamBusy, setTeamBusy] = useState(false)
  // Plan and feature switches (lib/orgPlans), saved as soon as they change.
  const [plan, setPlan] = useState<(OrgPlan & { by?: string; at?: string }) | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  // Archive and delete (Bo, Oct 18 2026: "I need to be able to delete orgs or archive
  // ones that actually have a history"). lib/orgArchive, lib/orgDelete.
  const [closing, setClosing] = useState(false)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [confirmName, setConfirmName] = useState('')
  // Roles by this organization's names for them: the director is its plan's owner
  // (Tournament Director, or Head Assigner on the Assigner plan).
  const roleName = (r: string) => r === 'director' ? PLANS[plan?.plan ?? 'tournament'].owner
    : r === 'field_director' ? 'Field Director' : r === 'admin' ? 'Admin' : r.charAt(0).toUpperCase() + r.slice(1)

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as any)?.role !== 'admin') { router.replace('/'); return }
    fetch(`/api/admin/orgs/${id}`)
      .then(r => r.json())
      .then(data => { setForm(data); setLoading(false) })
      .catch(() => setLoading(false))
    loadTeam()
    fetch(`/api/admin/orgs/${id}/plan`).then(r => r.ok ? r.json() : null).then(d => { if (d?.plan) setPlan(d) }).catch(() => {})
  }, [session, status, id])

  async function savePlan(next: OrgPlan) {
    const before = plan
    setPlan(next); setPlanBusy(true)
    try {
      const res = await fetch(`/api/admin/orgs/${id}/plan`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d?.plan) { setPlan(d); toast.success('Plan saved. Signed-in people get it within a minute.') }
      else { setPlan(before); toast.error(d.error || 'Plan not saved') }
    } catch { setPlan(before); toast.error('Plan not saved') } finally { setPlanBusy(false) }
  }
  const pickPlan = (k: PlanKey) => { if (plan?.plan !== k) savePlan(planDefaults(k)) }
  const flip = (g: GroupKey) => { if (plan) savePlan({ plan: plan.plan, features: { ...plan.features, [g]: !plan.features[g] } }) }

  async function loadTeam() {
    try { const d = await fetch(`/api/admin/orgs/${id}/users`).then(r => r.ok ? r.json() : null); if (d) { setTeamUsers(d.users || []); setOwnerUserId(d.ownerUserId ?? null) } } catch {}
  }
  async function addMember() {
    if (!newEmail.trim()) return
    setTeamBusy(true)
    try {
      const res = await fetch(`/api/admin/orgs/${id}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail.trim(), role: newRole, makeOwner: newOwner }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { toast.success('User added to org'); setNewEmail(''); setNewOwner(false); loadTeam() }
      else toast.error(d.error || 'Failed')
    } catch { toast.error('Failed') } finally { setTeamBusy(false) }
  }
  async function makeOwner(email: string) {
    setTeamBusy(true)
    try { const res = await fetch(`/api/admin/orgs/${id}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, makeOwner: true }) }); if (res.ok) { toast.success('Owner updated'); loadTeam() } else toast.error('Failed') } catch { toast.error('Failed') } finally { setTeamBusy(false) }
  }
  async function removeMember(userId: string) {
    if (!window.confirm('Remove this user from the organization?')) return
    setTeamBusy(true)
    try { const res = await fetch(`/api/admin/orgs/${id}/users?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }); if (res.ok) loadTeam(); else toast.error('Failed') } catch { toast.error('Failed') } finally { setTeamBusy(false) }
  }

  async function setArchivedTo(archived: boolean) {
    if (archived && !window.confirm(`Archive ${form.name}? Its people can't open it and its public pages go offline until you restore it.`)) return
    setClosing(true)
    try {
      const res = await fetch(`/api/admin/orgs/${id}/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'That didn’t save. Please try again.'); return }
      setForm(f => ({ ...f, archivedAt: d.archivedAt ?? null, archivedBy: archived ? String(session?.user?.name || session?.user?.email || '') : null }))
      toast.success(archived ? 'Archived' : 'Restored')
    } catch { toast.error('That didn’t save. Please try again.') } finally { setClosing(false) }
  }
  async function loadImpact() {
    setClosing(true)
    try {
      const res = await fetch(`/api/admin/orgs/${id}/delete`)
      const d = await res.json().catch(() => null)
      if (res.ok && d?.org) setImpact(d); else toast.error(d?.error || 'Couldn’t check what it has. Please try again.')
    } catch { toast.error('Couldn’t check what it has. Please try again.') } finally { setClosing(false) }
  }
  async function deleteIt(e: React.FormEvent) {
    e.preventDefault()
    setClosing(true)
    try {
      const res = await fetch(`/api/admin/orgs/${id}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: confirmName }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'It wasn’t deleted. Please try again.'); return }
      toast.success(`${form.name} deleted`)
      router.push('/admin/orgs')
    } catch { toast.error('It wasn’t deleted. Please try again.') } finally { setClosing(false) }
  }

  function set(field: keyof Org, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setDirty(true)
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Upload failed')
      set('logoUrl', data.url)
      toast.success('Logo uploaded!')
    } catch { toast.error('Logo upload failed') }
    finally { setLogoUploading(false) }
  }

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/admin/orgs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) { toast.success('Saved!'); setDirty(false) }
    else toast.error(data.error || 'Save failed')
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/orgs" className="text-sm text-gray-500 hover:text-gray-700">← Organizations</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{form.name || 'Edit Organization'}</h1>
            <p className="text-sm text-gray-400 font-mono mt-0.5">{form.slug}</p>
          </div>
          <button onClick={save} disabled={saving || !dirty}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : dirty ? '💾 Save Changes' : '✓ Saved'}
          </button>
        </div>

        {form.archivedAt && (
          <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span><b>Archived</b> {new Date(form.archivedAt).toLocaleDateString()}{form.archivedBy ? ` by ${form.archivedBy}` : ''}. Its people can’t open it, and its public site and event pages are offline.</span>
            <button type="button" onClick={() => setArchivedTo(false)} disabled={closing} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 border border-amber-300 hover:bg-amber-100 disabled:opacity-50">Restore</button>
          </div>
        )}

        <div className="space-y-6">
          {/* Branding */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Branding</h2>
            <div className="flex items-start gap-6">
              {/* Logo */}
              <div className="flex flex-col items-center gap-2">
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="logo" className="h-20 w-20 object-contain rounded-xl border border-slate-200 bg-white p-1" />
                  : <div className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">Logo</div>
                }
                <label className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded-lg transition-colors">
                  {logoUploading ? 'Uploading…' : 'Upload Logo'}
                  <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                    onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]) }} />
                </label>
                {form.logoUrl && (
                  <button type="button" onClick={() => set('logoUrl', '')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
              {/* Name + Slug */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Organization Name</label>
                  <input value={form.name || ''} onChange={e => set('name', e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Slug</label>
                  <input value={form.slug || ''} onChange={e => set('slug', e.target.value)} className={`${inp} font-mono`} />
                </div>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input type="email" value={form.contactEmail || ''} onChange={e => set('contactEmail', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                <input type="tel" value={form.contactPhone || ''} onChange={e => set('contactPhone', e.target.value)} className={inp} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
                <input type="url" value={form.website || ''} onChange={e => set('website', e.target.value)} className={inp} placeholder="https://" />
              </div>
            </div>
          </section>

          {/* Payment */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Payment Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">PayPal Email</label>
                <input type="email" value={form.paypalEmail || ''} onChange={e => set('paypalEmail', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Zelle Handle</label>
                <input value={form.zelleHandle || ''} onChange={e => set('zelleHandle', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Check Payable To</label>
                <input value={form.checkPayableTo || ''} onChange={e => set('checkPayableTo', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Check Mailing Address</label>
                <input value={form.checkAddress || ''} onChange={e => set('checkAddress', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ACH Bank Name</label>
                <input value={form.achBankName || ''} onChange={e => set('achBankName', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ACH Routing #</label>
                <input value={form.achRoutingNumber || ''} onChange={e => set('achRoutingNumber', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ACH Account #</label>
                <input value={form.achAccountNumber || ''} onChange={e => set('achAccountNumber', e.target.value)} className={inp} />
              </div>
            </div>
          </section>

          {/* Plan: what this organization uses (lib/orgPlans) */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm" aria-labelledby="plan-h">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 id="plan-h" className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Plan</h2>
              {plan && isCustomized(plan) && <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Changed for this organization</span>}
            </div>
            {!plan ? <p className="text-sm text-slate-400">Loading…</p> : (
              <>
                <div role="radiogroup" aria-label="Plan" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PLAN_KEYS.map(k => {
                    const on = plan.plan === k
                    return (
                      <button key={k} type="button" role="radio" aria-checked={on} disabled={planBusy} onClick={() => pickPlan(k)}
                        className={`text-left rounded-xl border-2 p-3 transition-colors disabled:opacity-60 ${on ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <span className="flex items-center gap-2">
                          <span aria-hidden className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${on ? 'border-blue-600 bg-blue-600 shadow-[inset_0_0_0_2px_white]' : 'border-slate-300'}`} />
                          <span className="text-sm font-bold text-slate-900">{PLANS[k].label}</span>
                        </span>
                        <span className="block mt-1 pl-6 text-xs text-slate-600">{PLANS[k].desc}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-4 mb-2 text-xs text-slate-500">Officials are always on. Switch anything else on or off for this organization:</p>
                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                  {FEATURE_GROUPS.map(g => {
                    const on = !!plan.features[g.key]
                    return (
                      <li key={g.key} className="flex items-center justify-between gap-4 px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800">{g.label}</span>
                          <span className="block text-xs text-slate-500">{g.desc}</span>
                        </span>
                        <button type="button" role="switch" aria-checked={on} aria-label={g.label} disabled={planBusy} onClick={() => flip(g.key)}
                          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-blue-600' : 'bg-slate-300'}`}>
                          <span aria-hidden className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {plan.at && <p className="mt-2 text-[11px] text-slate-400">Last changed {new Date(plan.at).toLocaleString()}{plan.by ? ` by ${plan.by}` : ''}</p>}
              </>
            )}
            <div className="mt-5 max-w-xs">
              <label className="block text-xs font-medium text-slate-600 mb-1">Subscription status</label>
              <select value={form.subscriptionStatus || 'active'} onChange={e => set('subscriptionStatus', e.target.value)} className={inp}>
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </section>

          {/* Team & owner */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Team &amp; owner</h2>

            <div className="flex flex-wrap items-end gap-3 mb-2">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Add user by email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="person@example.com" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className={inp}>
                  {['director', 'scheduler', 'assigner', 'field_director', 'coach', 'staff'].map(r => <option key={r} value={r}>{roleName(r)}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2 whitespace-nowrap">
                <input type="checkbox" checked={newOwner} onChange={e => setNewOwner(e.target.checked)} className="accent-blue-600 w-4 h-4" /> Make primary owner
              </label>
              <button onClick={addMember} disabled={teamBusy || !newEmail.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">Add</button>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">The user must already have an account. The primary owner runs the organization as its {PLANS[plan?.plan ?? 'tournament'].owner}. Someone who already works for another organization keeps it and switches between the two from the logo at the top left.</p>

            {teamUsers.length === 0 ? (
              <p className="text-sm text-slate-400">No users assigned to this org yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {teamUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{u.name}{u.id === ownerUserId && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Owner</span>}</p>
                      <p className="text-xs text-slate-400 truncate">{u.email} · {roleName(u.role)}{u.member ? ' · home is another organization' : ''}</p>
                    </div>
                    {u.role !== 'admin' && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {u.id !== ownerUserId && <button onClick={() => makeOwner(u.email)} disabled={teamBusy} className="text-xs font-medium text-blue-600 hover:text-blue-800">Make owner</button>}
                      <button onClick={() => removeMember(u.id)} disabled={teamBusy} className="text-xs font-medium text-red-500 hover:text-red-700">Remove</button>
                    </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Close or delete (lib/orgArchive, lib/orgDelete) */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm" aria-labelledby="close-h">
            <h2 id="close-h" className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Close or delete</h2>
            {form.slug === 'sunshine-events-group' ? (
              <p className="text-sm text-slate-500">Sunshine Events Group can’t be archived or deleted.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-lg">
                    <p className="text-sm font-semibold text-slate-800">{form.archivedAt ? 'Archived' : 'Archive'}</p>
                    <p className="mt-0.5 text-xs text-slate-500">For an organization with history. Everything is kept, but its people can’t open it, its public site and event pages go offline, and scheduled emails and posts that come due don’t go out. Restore opens it again.</p>
                  </div>
                  <button type="button" onClick={() => setArchivedTo(!form.archivedAt)} disabled={closing}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{form.archivedAt ? 'Restore' : 'Archive'}</button>
                </div>
                <div className="border-t border-slate-100 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-lg">
                      <p className="text-sm font-semibold text-red-700">Delete</p>
                      <p className="mt-0.5 text-xs text-slate-500">For test organizations. Deletes its events and everything in them, its Staff Pool and its settings. Its logins stay, without this organization. This can’t be undone.</p>
                    </div>
                    {!impact && <button type="button" onClick={loadImpact} disabled={closing}
                      className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Delete…</button>}
                  </div>
                  {impact && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-900">Deleting {impact.org.name} takes away:</p>
                      <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-red-900 sm:grid-cols-2">
                        <li>{impact.events} event{impact.events === 1 ? '' : 's'} and {impact.games} game{impact.games === 1 ? '' : 's'}</li>
                        <li>{impact.registrations} team registration{impact.registrations === 1 ? '' : 's'}</li>
                        <li>{impact.staffPool} Staff Pool {impact.staffPool === 1 ? 'person' : 'people'}</li>
                        <li>{impact.forms} form submission{impact.forms === 1 ? '' : 's'} (waivers, applications)</li>
                        <li>{impact.logins} login{impact.logins === 1 ? '' : 's'} lose{impact.logins === 1 ? 's' : ''} it (the login{impact.logins === 1 ? '' : 's'} stay)</li>
                        <li>{impact.payments} payment{impact.payments === 1 ? '' : 's'} on record</li>
                      </ul>
                      {impact.blocked ? (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-red-800">{impact.blocked}</p>
                          <button type="button" onClick={() => setImpact(null)} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
                        </div>
                      ) : (
                        <form onSubmit={deleteIt} className="mt-3 flex flex-wrap items-end gap-2">
                          <label className="min-w-[220px] flex-1">
                            <span className="mb-1 block text-xs font-medium text-red-900">Type <b>{impact.org.name}</b> to delete it</span>
                            <input value={confirmName} onChange={e => setConfirmName(e.target.value)} autoComplete="off" className={inp} aria-label="Organization name" />
                          </label>
                          <button type="submit" disabled={closing || confirmName.trim().replace(/\s+/g, ' ').toLowerCase() !== impact.org.name.trim().replace(/\s+/g, ' ').toLowerCase()}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">{closing ? 'Deleting…' : 'Delete for good'}</button>
                          <button type="button" onClick={() => { setImpact(null); setConfirmName('') }} className="px-2 py-2 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Sticky save bar */}
        {dirty && (
          <div className="fixed bottom-6 right-6 bg-white border border-blue-200 shadow-lg rounded-2xl px-5 py-3 flex items-center gap-3">
            <span className="text-sm text-gray-600">Unsaved changes</span>
            <button onClick={save} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-1.5 text-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
