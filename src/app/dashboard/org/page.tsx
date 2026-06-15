'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { Users, UserPlus, Trash2, Link2, ChevronLeft } from 'lucide-react'

const ROLES = ['director', 'scheduler', 'assigner', 'coach', 'staff']
const ROLE_LABEL: Record<string, string> = { director: 'Director', scheduler: 'Scheduler', assigner: 'Assigner', coach: 'Coach', staff: 'Staff' }

export default function OrgTeamPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role
  const [users, setUsers] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [busy, setBusy] = useState(false)
  const [lastLink, setLastLink] = useState('')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (role !== 'director') { router.replace('/'); return }
    load()
  }, [status, session, role])

  async function load() {
    try { const d = await fetch('/api/org/users').then(r => r.ok ? r.json() : null); if (d) { setUsers(d.users || []); setInvites(d.invites || []) } } catch {} finally { setLoading(false) }
  }
  async function add() {
    if (!email.trim()) return
    setBusy(true); setLastLink('')
    try {
      const res = await fetch('/api/org/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role: newRole }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { if (d.assigned) toast.success('Added to your org'); else { toast.success('Invite sent'); if (d.inviteUrl) setLastLink(d.inviteUrl) } setEmail(''); setName(''); load() }
      else toast.error(d.error || 'Failed')
    } catch { toast.error('Failed') } finally { setBusy(false) }
  }
  async function changeRole(userId: string, r: string) {
    try { const res = await fetch('/api/org/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role: r }) }); if (res.ok) { toast.success('Role updated'); load() } else toast.error('Failed') } catch { toast.error('Failed') }
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
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Role</label><select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">{ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
          <div className="flex items-end"><button onClick={add} disabled={busy || !email.trim()} className="w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><UserPlus size={15} /> Add / invite</button></div>
        </div>
        {lastLink && <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2"><Link2 size={13} /><span className="truncate flex-1">{lastLink}</span><button onClick={() => copy(lastLink)} className="text-teal-600 font-semibold">Copy</button></div>}
      </div>

      {/* Members */}
      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Members <span className="text-slate-300">· {users.length}</span></h2>
      <div className="space-y-2 mb-6">
        {users.length === 0 && <p className="text-sm text-slate-400">No users yet.</p>}
        {users.map(u => (
          <div key={u.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p><p className="text-xs text-slate-400 truncate">{u.email}</p></div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select value={ROLES.includes(u.role) ? u.role : 'staff'} onChange={e => changeRole(u.id, e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">{ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
              <button onClick={() => removeUser(u.id)} className="text-slate-300 hover:text-red-500" title="Remove"><Trash2 size={15} /></button>
            </div>
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
