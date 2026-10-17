'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { Users, UserPlus, Trash2, Link2, ChevronLeft } from 'lucide-react'
import AssignerPayAccess from '@/components/AssignerPayAccess'
import FieldDirectorEvents, { type FieldDirectorEvent } from '@/components/FieldDirectorEvents'
import { DEFAULT_ASSIGNER_GROUPS, type PayGroup } from '@/lib/payGroups'
import { useRole } from '@/lib/role-context'
import { useOrg } from '@/lib/org-context'
import { PLANS } from '@/lib/orgPlans'

const ROLES = ['director', 'scheduler', 'assigner', 'field_director', 'coach', 'staff']
const ROLE_LABEL: Record<string, string> = { director: 'Director', scheduler: 'Scheduler', assigner: 'Assigner', field_director: 'Field Director', client: 'Tournament Director', coach: 'Coach', staff: 'Staff' }

export default function OrgTeamPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  // The role the app shows: an admin's View as of a director opens this page too
  // (lib/previewView), with that organization's people.
  const { effectiveRole: role } = useRole()
  // On the Assigner plan the director is called the Head Assigner (lib/orgPlans).
  const org = useOrg()
  const roleName = (r: string) => (r === 'director' && org?.plan === 'assigner' ? PLANS.assigner.owner : ROLE_LABEL[r])
  // On the Assigner plan the head assigner can add the tournament directors they work
  // for (lib/clientEvents, Bo Oct 17 2026: "that is their customer"). Anyone who is
  // one already keeps the choice in their own menu whatever the plan.
  const roles = org?.plan === 'assigner' ? [...ROLES.slice(0, 4), 'client', ...ROLES.slice(4)] : ROLES
  const rolesFor = (r: string) => (roles.includes(r) ? roles : [...roles, r].filter(x => ROLE_LABEL[x]))
  const [users, setUsers] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [busy, setBusy] = useState(false)
  const [lastLink, setLastLink] = useState('')
  // Which staff pay each assigner sees (lib/payGroups).
  const [payAccess, setPayAccess] = useState<Record<string, { groups: PayGroup[]; custom: boolean }>>({})
  // Which events each tournament director sees (lib/clientEvents).
  const [cl, setCl] = useState<{ clients: Record<string, { orgId: string | null; events: string[] }>; events: FieldDirectorEvent[] }>({ clients: {}, events: [] })
  // Which events each field director works (lib/fieldDirector).
  const [fd, setFd] = useState<{ fieldDirectors: Record<string, { orgId: string | null; events: string[] }>; events: FieldDirectorEvent[] }>({ fieldDirectors: {}, events: [] })

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (role !== 'director') { router.replace('/'); return }
    load()
  }, [status, session, role])

  async function load() {
    try { const d = await fetch('/api/org/users').then(r => r.ok ? r.json() : null); if (d) { setUsers(d.users || []); setInvites(d.invites || []) } } catch {} finally { setLoading(false) }
    try { const p = await fetch('/api/assigner-pay').then(r => r.ok ? r.json() : null); if (p?.assigners) setPayAccess(p.assigners) } catch {}
    try { const f = await fetch('/api/field-director-events').then(r => r.ok ? r.json() : null); if (f?.fieldDirectors) setFd({ fieldDirectors: f.fieldDirectors, events: Array.isArray(f.events) ? f.events : [] }) } catch {}
    try { const c = await fetch('/api/client-events').then(r => r.ok ? r.json() : null); if (c?.clients) setCl({ clients: c.clients, events: Array.isArray(c.events) ? c.events : [] }) } catch {}
  }
  async function add() {
    if (!email.trim()) return
    setBusy(true); setLastLink('')
    try {
      const res = await fetch('/api/org/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role: newRole }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { if (d.assigned) toast.success(d.member ? 'Added. They pick your organization from the logo menu at the top left.' : 'Added to your org'); else { toast.success('Invite sent'); if (d.inviteUrl) setLastLink(d.inviteUrl) } setEmail(''); setName(''); load() }
      else toast.error(d.error || 'Failed')
    } catch { toast.error('Failed') } finally { setBusy(false) }
  }
  async function changeRole(userId: string, r: string) {
    try { const res = await fetch('/api/org/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role: r }) }); const d = await res.json().catch(() => ({})); if (res.ok) { toast.success('Role updated'); load() } else toast.error(d.error || 'Failed') } catch { toast.error('Failed') }
  }
  async function removeUser(userId: string) {
    if (!window.confirm('Remove this user from your organization?')) return
    try { const res = await fetch(`/api/org/users?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }); if (res.ok) load() } catch {}
  }
  async function cancelInvite(inviteId: string) {
    try { const res = await fetch(`/api/org/users?inviteId=${encodeURIComponent(inviteId)}`, { method: 'DELETE' }); if (res.ok) load() } catch {}
  }
  function copy(text: string) { navigator.clipboard?.writeText(text); toast.success('Link copied') }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Toaster position="top-right" />
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Home</Link>
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><Users size={22} className="text-teal-600" /> Your team</h1>
      <p className="text-sm text-slate-500 mb-5">Add staff and administrators to your organization. New people get an email to set up their account; you can change anyone's role here.</p>

      {/* Add / invite */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="person@example.com" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" /></div>
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Name (optional)</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" /></div>
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Role</label><select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">{roles.map(r => <option key={r} value={r}>{roleName(r)}</option>)}</select></div>
          <div className="flex items-end"><button onClick={add} disabled={busy || !email.trim()} className="w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><UserPlus size={15} /> Add / invite</button></div>
        </div>
        {newRole === 'client' && <p className="text-xs text-slate-500 mb-3">A tournament director you work for. Once they're added, pick their events under their name: they see only those, with the schedule, who is on each game and their phone numbers, and Staff pay, so they can pay your staff. They can't change anything else.</p>}
        {lastLink && <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2"><Link2 size={13} /><span className="truncate flex-1">{lastLink}</span><button onClick={() => copy(lastLink)} className="text-teal-600 font-semibold">Copy</button></div>}
      </div>

      {/* Members */}
      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Members <span className="text-slate-300">· {users.length}</span></h2>
      <div className="space-y-2 mb-6">
        {users.length === 0 && <p className="text-sm text-slate-400">No users yet.</p>}
        {users.map(u => (
          <div key={u.id} className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p><p className="text-xs text-slate-400 truncate">{u.email}</p></div>
              {u.role === 'admin' ? (
                <span className="flex-shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700" title="Whistle Ready admins see every organization; only an admin can change them">Admin</span>
              ) : (
              <div className="flex items-center gap-2 flex-shrink-0">
                <select value={rolesFor(u.role).includes(u.role) ? u.role : 'staff'} onChange={e => changeRole(u.id, e.target.value)} aria-label={`Role for ${u.name}`} className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">{rolesFor(u.role).map(r => <option key={r} value={r}>{roleName(r)}</option>)}</select>
                <button onClick={() => removeUser(u.id)} className="text-slate-300 hover:text-red-500" title="Remove" aria-label={`Remove ${u.name}`}><Trash2 size={15} /></button>
              </div>
              )}
            </div>
            {u.role === 'assigner' && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <AssignerPayAccess key={u.id + ':' + (payAccess[u.id]?.groups ?? []).join(',')} userId={u.id}
                  groups={payAccess[u.id]?.groups ?? DEFAULT_ASSIGNER_GROUPS} custom={payAccess[u.id]?.custom}
                  onSaved={groups => setPayAccess(p => ({ ...p, [u.id]: { groups, custom: true } }))} />
              </div>
            )}
            {u.role === 'client' && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <FieldDirectorEvents key={u.id + ':' + (cl.clients[u.id]?.events ?? []).join(',') + ':' + cl.events.length} userId={u.id} events={cl.events}
                  endpoint="/api/client-events" label="Sees" tone="amber" selected={cl.clients[u.id]?.events ?? []}
                  onSaved={events => setCl(p => ({ ...p, clients: { ...p.clients, [u.id]: { orgId: p.clients[u.id]?.orgId ?? null, events } } }))} />
              </div>
            )}
            {u.role === 'field_director' && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <FieldDirectorEvents key={u.id + ':' + (fd.fieldDirectors[u.id]?.events ?? []).join(',') + ':' + fd.events.length} userId={u.id} events={fd.events}
                  selected={fd.fieldDirectors[u.id]?.events ?? []}
                  onSaved={events => setFd(p => ({ ...p, fieldDirectors: { ...p.fieldDirectors, [u.id]: { orgId: p.fieldDirectors[u.id]?.orgId ?? null, events } } }))} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Pending invites <span className="text-slate-300">· {invites.length}</span></h2>
          <div className="space-y-2">
            {invites.map(iv => (
              <div key={iv.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-sm font-medium text-slate-700 truncate">{iv.email}</p><p className="text-xs text-slate-400">Invited{iv.name ? ` · ${iv.name}` : ''}</p></div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => copy(`${location.origin}/invite/${iv.token}`)} className="text-xs font-medium text-teal-600 hover:text-teal-800 inline-flex items-center gap-1"><Link2 size={13} /> Copy link</button>
                  <button onClick={() => cancelInvite(iv.id)} className="text-xs font-medium text-red-500 hover:text-red-700">Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
