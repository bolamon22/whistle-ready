'use client'

import OrgLogoMark from '@/app/OrgLogoMark'
import { Fragment, useEffect, useState } from 'react'
import PasswordInput from '@/components/PasswordInput'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { agoLabel, isOnline, parseDbTime } from '@/lib/presenceTime'
import toast, { Toaster } from 'react-hot-toast'
import AssignerPayAccess from '@/components/AssignerPayAccess'
import { DEFAULT_ASSIGNER_GROUPS, type PayGroup } from '@/lib/payGroups'

// staff: the Staff Pool record with this email (jobs = its roles); clubs: club names
// this login can open in the portal; players: player waivers a parent is linked to.
interface User {
  id: string; name: string; email: string; role: string; createdAt: string; lastSeenAt?: string | null; lastLoginAt?: string | null
  staff?: { workerId: string; jobs: string[]; gender: string; records: number } | null
  clubs?: string[]; players?: number
}
interface ClubLink { id: string; tournamentId: string; clubName: string }
interface Tournament { id: string; name: string }
interface Registration { clubName: string; tournamentId: string }

const ROLES = ['admin','director','club_director','assigner','scheduler','coach','staff','parent']

const ROLE_LABELS: Record<string, string> = {
  scorekeeper:   'Scorekeeper (old role)',
  viewer:        'Viewer (no role)',
  admin:         'Admin',
  director:      'Tournament Director',
  club_director: 'Club Director',
  assigner:      'Assigner',
  scheduler:     'Scheduler',
  coach:         'Coach',
  staff:         'Staff',
  parent:        'Parent',
}

const ROLE_COLORS: Record<string, string> = {
  admin:         'bg-red-100 text-red-700',
  director:      'bg-purple-100 text-purple-700',
  club_director: 'bg-violet-100 text-violet-700',
  assigner:      'bg-indigo-100 text-indigo-700',
  scheduler:     'bg-cyan-100 text-cyan-700',
  coach:         'bg-blue-100 text-blue-700',
  staff:         'bg-teal-100 text-teal-700',
  parent:        'bg-pink-100 text-pink-700',
}

// Who a login is, for the filter chips. Every event worker (ref, scorekeeper, athletic
// trainer, field ops) logs in as Staff; their job comes from their Staff Pool record,
// matched by email. Bo, Oct 13 2026: a trainer showed only as "Staff" and searching
// "trainer" found nobody.
type Who = 'all' | 'office' | 'staff' | 'clubs' | 'parents'
const WHO: { key: Who; label: string }[] = [
  { key: 'all', label: 'Everyone' }, { key: 'office', label: 'Office' }, { key: 'staff', label: 'Staff' },
  { key: 'clubs', label: 'Clubs & coaches' }, { key: 'parents', label: 'Parents' },
]
const whoOf = (role: string): Who =>
  ['admin', 'director', 'scheduler', 'assigner'].includes(role) ? 'office'
  : ['club_director', 'coach'].includes(role) ? 'clubs'
  : role === 'parent' ? 'parents' : 'staff'
const JOBS: { key: string; label: string }[] = [
  { key: 'ref', label: 'Refs' }, { key: 'scorekeeper', label: 'Scorekeepers' },
  { key: 'athletic_trainer', label: 'Athletic trainers' }, { key: 'field_ops', label: 'Field ops' },
]
const JOB_LABEL: Record<string, string> = { ref: 'Ref', scorekeeper: 'Scorekeeper', athletic_trainer: 'Athletic trainer', field_ops: 'Field ops' }
const jobLabel = (j: string, gender?: string) =>
  j === 'ref' && (gender === 'boys' || gender === 'girls') ? `Ref · ${gender}` : (JOB_LABEL[j] ?? j.replace(/_/g, ' '))
const lastOn = (u: User) => Math.max(parseDbTime(u.lastSeenAt) ?? 0, parseDbTime(u.lastLoginAt) ?? 0)
const searchText = (u: User) => [
  u.name, u.email, u.role, ROLE_LABELS[u.role] ?? '',
  ...(u.staff?.jobs ?? []).map(j => jobLabel(j, u.staff?.gender) + (j === 'ref' ? ' referee official' : '')),
  ...(u.clubs ?? []),
].join(' ').toLowerCase()
type Seen = 'any' | 'now' | 'week' | 'month' | 'never'
const SEEN: { key: Seen; label: string }[] = [
  { key: 'any', label: 'Last on: any time' }, { key: 'now', label: 'On now' }, { key: 'week', label: 'On in the last 7 days' },
  { key: 'month', label: 'On in the last 30 days' }, { key: 'never', label: 'No visit recorded' },
]
const DAY = 86_400_000
function seenMatches(u: User, f: Seen, now: number): boolean {
  if (f === 'any') return true
  if (f === 'now') return isOnline(u.lastSeenAt, now)
  const t = lastOn(u)
  if (f === 'never') return !t
  return !!t && now - t <= (f === 'week' ? 7 : 30) * DAY
}
const chip = (on: boolean) => `text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'}`

export default function AdminUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [who, setWho] = useState<Who>('all')
  const [job, setJob] = useState('all')
  const [seen, setSeen] = useState<Seen>('any')
  const [sort, setSort] = useState<'newest' | 'name' | 'last'>('newest')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [adding, setAdding] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  // Which staff pay each assigner sees (one runs boys refs, one girls refs).
  const [payAccess, setPayAccess] = useState<Record<string, { groups: PayGroup[]; custom: boolean }>>({})

  // Club linking
  const [linkingUser, setLinkingUser] = useState<User | null>(null)
  const [userLinks, setUserLinks] = useState<ClubLink[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [allClubs, setAllClubs] = useState<Registration[]>([])
  const [linkTournament, setLinkTournament] = useState('')
  const [linkClub, setLinkClub] = useState('')
  const [linkClubCustom, setLinkClubCustom] = useState('')
  const [clubsForTournament, setClubsForTournament] = useState<string[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated' && session.user.role !== 'admin') { router.push('/'); return }
    if (status === 'authenticated') load()
  }, [status])

  const load = () => {
    fetch('/api/admin/users').then(r => r.json()).then(d => { setUsers(d); setLoading(false) })
    fetch('/api/assigner-pay').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.assigners) setPayAccess(d.assigners) }).catch(() => {})
  }

  const changeRole = async (id: string, role: string) => {
    await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, role }) })
    toast.success('Role updated!')
    load()
  }

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPassword }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Failed to create user'); setAdding(false); return }
    // Set the role if not viewer
    if (newRole !== 'viewer') {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.id, role: newRole }),
      })
    }
    toast.success(`${newName} added!`)
    setShowAdd(false)
    setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('viewer')
    setAdding(false)
    load()
  }

  const doResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetting(true)
    const res = await fetch('/api/admin/users/reset-password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: resetUserId, password: resetPassword }),
    })
    setResetting(false)
    if (!res.ok) { toast.error('Failed to reset password'); return }
    toast.success('Password reset!')
    setResetUserId(null); setResetPassword('')
  }

  const openLinking = async (user: User) => {
    setLinkingUser(user)
    setLinkTournament('')
    setLinkClub('')
    setLinkClubCustom('')
    const [links, ts] = await Promise.all([
      fetch(`/api/club-director/links?userId=${user.id}`).then(r => r.json()),
      fetch('/api/tournaments').then(r => r.json()),
    ])
    // The links route answers { links, tournaments, viewing } (since Sep 15), not a
    // bare array, which left this list empty or broken.
    setUserLinks(Array.isArray(links) ? links : (links?.links ?? []))
    setTournaments(Array.isArray(ts) ? ts : [])
  }

  const loadClubsForTournament = async (tournamentId: string) => {
    setLinkTournament(tournamentId)
    setLinkClub('')
    setLinkClubCustom('')
    const regs = await fetch(`/api/registrations?tournamentId=${tournamentId}`).then(r => r.json())
    const names = Array.from(new Set(regs.map((r: { clubName: string }) => r.clubName).filter(Boolean))) as string[]
    setClubsForTournament(names.sort())
  }

  const addLink = async () => {
    const clubName = linkClubCustom.trim() || linkClub
    if (!linkingUser || !linkTournament || !clubName) return
    const res = await fetch('/api/club-director/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: linkingUser.id, tournamentId: linkTournament, clubName }),
    })
    const link = await res.json().catch(() => ({}))
    // Access is per registration now (lib/clubAccess): a club with no registration
    // at this event yet can't be linked, and the route says so.
    if (!res.ok) { toast.error(link?.error || 'Could not link that club'); return }
    setUserLinks(prev => [...prev, link])
    setLinkClub('')
    setLinkClubCustom('')
    toast.success(`Linked to ${clubName}!`)
  }

  const removeLink = async (link: ClubLink) => {
    await fetch('/api/club-director/links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: linkingUser!.id, tournamentId: link.tournamentId, clubName: link.clubName }),
    })
    setUserLinks(prev => prev.filter(l => !(l.tournamentId === link.tournamentId && l.clubName === link.clubName)))
    toast.success('Link removed.')
  }

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return
    await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    toast.success('User deleted.')
    load()
  }

  // Search and Last on narrow everything; the chip counts follow them, so "trainer"
  // shows how many staff match before you pick a chip.
  const now = Date.now()
  const q = search.trim().toLowerCase()
  const base = users.filter(u => (!q || searchText(u).includes(q)) && seenMatches(u, seen, now))
  const whoCount = (w: Who) => (w === 'all' ? base.length : base.filter(u => whoOf(u.role) === w).length)
  const staffBase = base.filter(u => whoOf(u.role) === 'staff')
  const jobMatch = (u: User, j: string) => (j === 'all' ? true : j === 'none' ? !u.staff : !!u.staff?.jobs.includes(j))
  const filtered = base
    .filter(u => who === 'all' || whoOf(u.role) === who)
    .filter(u => who !== 'staff' || jobMatch(u, job))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'last' ? (lastOn(b) - lastOn(a)) || a.name.localeCompare(b.name)
      : 0)   // newest: the order the API sends
  const filtersOn = !!q || who !== 'all' || seen !== 'any'

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Toaster />
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3"><OrgLogoMark /><h1 className="text-2xl font-bold text-gray-800">User Management</h1></div>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} registered users · <a href="/admin/permissions" className="text-sky-600 hover:underline">Manage Permissions →</a></p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="search" placeholder="Search people, jobs, clubs…" value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <button onClick={() => setShowAdd(v => !v)}
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Add User
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Who">
          {WHO.map(w => (
            <button key={w.key} type="button" aria-pressed={who === w.key} className={chip(who === w.key)}
              onClick={() => { setWho(w.key); setJob('all') }}>
              {w.label} <span className="opacity-60 font-medium">{whoCount(w.key)}</span>
            </button>
          ))}
          <span className="flex-1" />
          <select aria-label="Last on" value={seen} onChange={e => setSeen(e.target.value as Seen)}
            className={`border rounded-lg px-2 py-1 text-xs bg-white ${seen !== 'any' ? 'border-sky-400 text-sky-800' : 'border-gray-300 text-gray-600'}`}
            title="Visits are recorded from Oct 12, 2026">
            {SEEN.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as 'newest' | 'name' | 'last')}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white text-gray-600">
            <option value="newest">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="last">Last on</option>
          </select>
        </div>
        {who === 'staff' && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Job">
            <span className="text-xs text-gray-500 mr-0.5">Job</span>
            {[{ key: 'all', label: 'All staff' }, ...JOBS, { key: 'none', label: 'No staff record' }].map(j => (
              <button key={j.key} type="button" aria-pressed={job === j.key} className={chip(job === j.key)} onClick={() => setJob(j.key)}
                title={j.key === 'none' ? 'Staff logins with no Staff Pool profile under the same email, so the app does not know their job' : undefined}>
                {j.label} <span className="opacity-60 font-medium">{staffBase.filter(u => jobMatch(u, j.key)).length}</span>
              </button>
            ))}
          </div>
        )}
        {filtersOn && (
          <p className="text-xs text-gray-400">
            Showing {filtered.length} of {users.length} ·{' '}
            <button type="button" className="underline hover:text-gray-600" onClick={() => { setSearch(''); setWho('all'); setJob('all'); setSeen('any') }}>Clear filters</button>
          </p>
        )}
      </div>

      {/* Add user form */}
      {showAdd && (
        <form onSubmit={addUser} className="bg-white border border-sky-200 rounded-2xl p-5 mb-5">
          <h2 className="font-semibold text-gray-800 mb-4">Add New User</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
              <input required value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input required type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
              <PasswordInput required value={newPassword} onChange={setNewPassword}
                placeholder="Min 6 characters" autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" disabled={adding}
              className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {adding ? 'Adding…' : 'Add User'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Club linking modal */}
      {linkingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setLinkingUser(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md z-10">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Club Links</h2>
            <p className="text-sm text-gray-500 mb-4">{linkingUser.name} · can be linked to multiple clubs across multiple tournaments</p>

            {/* Current links */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Current Links ({userLinks.length})</p>
              {userLinks.length === 0 && <p className="text-sm text-gray-400 italic">No clubs linked yet</p>}
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {userLinks.map((link, i) => {
                  const t = tournaments.find(x => x.id === link.tournamentId)
                  return (
                    <div key={i} className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                      <div>
                        <span className="font-medium text-violet-800 text-sm">{link.clubName}</span>
                        <span className="text-xs text-violet-400 ml-2">· {t?.name ?? link.tournamentId}</span>
                      </div>
                      <button onClick={() => removeLink(link)} className="text-xs text-red-400 hover:text-red-600 ml-3 shrink-0">✕ Remove</button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add new link */}
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Add Another Link</p>
            <div className="space-y-2">
              <select value={linkTournament} onChange={e => loadClubsForTournament(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Select tournament…</option>
                {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {linkTournament && (
                <>
                  {clubsForTournament.length > 0 && (
                    <select value={linkClub} onChange={e => { setLinkClub(e.target.value); setLinkClubCustom('') }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="">Pick from registered clubs…</option>
                      {clubsForTournament.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <div className="relative">
                    <input
                      value={linkClubCustom}
                      onChange={e => { setLinkClubCustom(e.target.value); setLinkClub('') }}
                      placeholder={clubsForTournament.length > 0 ? 'Or type a custom club name…' : 'Type club name…'}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button onClick={addLink} disabled={!linkTournament || (!linkClub && !linkClubCustom.trim())}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2 text-sm">
                  + Add Link
                </button>
                <button onClick={() => setLinkingUser(null)}
                  className="px-4 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setResetUserId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Reset Password</h2>
            <p className="text-sm text-gray-500 mb-4">Set a new password for {users.find(u => u.id === resetUserId)?.name}</p>
            <form onSubmit={doResetPassword} className="space-y-3">
              <PasswordInput required value={resetPassword} onChange={setResetPassword}
                placeholder="New password (min 6 chars)" autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              <div className="flex gap-2">
                <button type="submit" disabled={resetting}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2 text-sm">
                  {resetting ? 'Resetting…' : 'Reset Password'}
                </button>
                <button type="button" onClick={() => { setResetUserId(null); setResetPassword('') }}
                  className="px-4 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Name</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Email</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Role</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Joined</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Last on</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(u => (
              <Fragment key={u.id}>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{u.name}</div>
                  {(u.staff || whoOf(u.role) === 'staff' || (u.clubs?.length ?? 0) > 0 || (u.players ?? 0) > 0) && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {u.staff?.jobs.map(j => (
                        <span key={j} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">{jobLabel(j, u.staff?.gender)}</span>
                      ))}
                      {u.staff && (
                        <Link href={`/staff/${u.staff.workerId}`} className="text-[11px] text-sky-600 hover:underline"
                          title={u.staff.records > 1 ? `${u.staff.records} Staff Pool profiles use this email; merge them in the Staff Pool` : 'Their Staff Pool profile'}>
                          Staff record{u.staff.records > 1 ? ` (${u.staff.records})` : ''} →
                        </Link>
                      )}
                      {!u.staff && whoOf(u.role) === 'staff' && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700"
                          title="No Staff Pool profile has this email, so the app doesn't know their job">No staff record</span>
                      )}
                      {(u.clubs ?? []).slice(0, 2).map(c => (
                        <span key={c} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">{c}</span>
                      ))}
                      {(u.clubs?.length ?? 0) > 2 && (
                        <span className="text-[11px] text-violet-600" title={(u.clubs ?? []).join(', ')}>+{(u.clubs?.length ?? 0) - 2} more</span>
                      )}
                      {(u.players ?? 0) > 0 && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-pink-50 text-pink-700">{u.players} player{u.players === 1 ? '' : 's'}</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={e => changeRole(u.id, e.target.value)}
                    className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 ${ROLE_COLORS[u.role] || ROLE_COLORS.viewer}`}
                  >
                    {(ROLES.includes(u.role) ? ROLES : [u.role, ...ROLES]).map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 whitespace-nowrap" title={u.lastLoginAt ? `Last sign-in ${agoLabel(u.lastLoginAt)}` : 'No sign-in recorded yet'}>
                  {isOnline(u.lastSeenAt)
                    ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />On now</span>
                    : <span className="text-gray-400">{agoLabel(u.lastSeenAt || u.lastLoginAt) || '—'}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1.5 justify-end flex-wrap">
                    <Link href={`/profile/${u.id}`}
                      className="text-xs text-sky-600 border border-sky-200 hover:border-sky-400 px-2.5 py-1 rounded-lg">
                      👤 Profile
                    </Link>
                    {(u.role === 'club_director' || u.role === 'coach' || u.role === 'admin') && (
                      <button onClick={() => openLinking(u)}
                        className="text-xs text-violet-600 border border-violet-200 hover:border-violet-400 px-2.5 py-1 rounded-lg">
                        🔗 Clubs
                      </button>
                    )}
                    <button onClick={() => { setResetUserId(u.id); setResetPassword('') }}
                      className="text-xs text-orange-500 border border-orange-200 hover:border-orange-400 px-2.5 py-1 rounded-lg">
                      Reset PW
                    </button>
                    {u.email !== session?.user?.email && (
                      <button onClick={() => deleteUser(u.id, u.name)}
                        className="text-xs text-red-500 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg">
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {u.role === 'assigner' && (
                <tr className="!border-t-0">
                  <td colSpan={6} className="px-4 pb-3 pt-0">
                    <div className="max-w-[calc(100vw-4rem)] sm:max-w-none">
                    <AssignerPayAccess key={u.id + ':' + (payAccess[u.id]?.groups ?? []).join(',')} userId={u.id}
                      groups={payAccess[u.id]?.groups ?? DEFAULT_ASSIGNER_GROUPS} custom={payAccess[u.id]?.custom}
                      onSaved={groups => setPayAccess(p => ({ ...p, [u.id]: { groups, custom: true } }))} />
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
