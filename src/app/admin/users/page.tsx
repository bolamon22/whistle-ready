'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'

interface User { id: string; name: string; email: string; role: string; createdAt: string }
interface ClubLink { id: string; tournamentId: string; clubName: string }
interface Tournament { id: string; name: string }
interface Registration { clubName: string; tournamentId: string }

const ROLES = ['admin','director','club_director','assigner','coach','ref','scorekeeper','parent','viewer']

const ROLE_LABELS: Record<string, string> = {
  admin:         'Admin',
  director:      'Tournament Director',
  club_director: 'Club Director',
  assigner:      'Assigner',
  coach:         'Coach',
  ref:           'Referee',
  scorekeeper:   'Scorekeeper',
  parent:        'Parent',
  viewer:        'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  admin:         'bg-red-100 text-red-700',
  director:      'bg-purple-100 text-purple-700',
  club_director: 'bg-violet-100 text-violet-700',
  assigner:      'bg-indigo-100 text-indigo-700',
  coach:         'bg-blue-100 text-blue-700',
  ref:           'bg-green-100 text-green-700',
  scorekeeper:   'bg-yellow-100 text-yellow-700',
  parent:        'bg-pink-100 text-pink-700',
  viewer:        'bg-gray-100 text-gray-600',
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [adding, setAdding] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

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
    setUserLinks(links)
    setTournaments(ts)
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
    const link = await res.json()
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

  const filtered = users.filter(u =>
    !search || [u.name, u.email, u.role].some(v => v.toLowerCase().includes(search.toLowerCase()))
  )

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Toaster />
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} registered users · <a href="/admin/permissions" className="text-sky-600 hover:underline">Manage Permissions →</a></p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="search" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <button onClick={() => setShowAdd(v => !v)}
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Add User
          </button>
        </div>
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
              <input required type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
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
              <input required type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                placeholder="New password (min 6 chars)"
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

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Name</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Email</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Role</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={e => changeRole(u.id, e.target.value)}
                    className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 ${ROLE_COLORS[u.role] || ROLE_COLORS.viewer}`}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</td>
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
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
