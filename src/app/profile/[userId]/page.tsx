'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

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

interface UserProfile {
  id: string; name: string; email: string; role: string; photoUrl: string | null; createdAt: string
}
interface ClubLink {
  id: string; clubName: string; tournamentId: string; tournamentName?: string
}

export default function AdminUserProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const userId = params.userId as string

  const [user, setUser] = useState<UserProfile | null>(null)
  const [clubLinks, setClubLinks] = useState<ClubLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    if (session.user.role !== 'admin') { router.push('/'); return }

    Promise.all([
      fetch(`/api/admin/users/${userId}`).then(r => r.json()),
      fetch(`/api/club-director/links?userId=${userId}`).then(r => r.json()),
      fetch('/api/tournaments').then(r => r.json()),
    ]).then(([u, links, tournaments]) => {
      setUser(u)
      if (Array.isArray(links)) {
        setClubLinks(links.map((l: ClubLink) => ({
          ...l,
          tournamentName: tournaments.find((t: { id: string; name: string }) => t.id === l.tournamentId)?.name,
        })))
      }
      setLoading(false)
    })
  }, [status, userId])

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>
  if (!user || (user as { error?: string }).error) return (
    <div className="p-10 text-center text-gray-400">User not found. <Link href="/admin/users" className="text-sky-600 underline">Back to users</Link></div>
  )

  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.viewer

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-5">
        <Link href="/admin/users" className="text-sm text-sky-600 hover:underline">← Back to User Management</Link>
      </div>

      {/* Profile header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5 flex items-center gap-5">
        <div className="flex-shrink-0">
          {user.photoUrl ? (
            <img src={user.photoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-sky-100 text-sky-700 text-2xl font-bold flex items-center justify-center">
              {initials}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">{user.name}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${roleColor}`}>
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          <p className="text-xs text-gray-400 mt-1">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="ml-auto flex flex-col gap-2">
          <Link href={`/admin/users`}
            className="text-xs text-violet-600 border border-violet-200 hover:border-violet-400 px-3 py-1.5 rounded-lg text-center">
            ✏️ Edit in User Mgmt
          </Link>
        </div>
      </div>

      {/* Club links */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Club Links</h2>
        <p className="text-sm text-gray-500 mb-4">Tournaments and clubs this user is linked to</p>
        {clubLinks.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No club links yet.</p>
        ) : (
          <div className="space-y-2">
            {clubLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                <span className="text-violet-500 text-lg">🏒</span>
                <div>
                  <div className="font-semibold text-violet-800 text-sm">{link.clubName}</div>
                  {link.tournamentName && <div className="text-xs text-violet-400">{link.tournamentName}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account info */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Account Info</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">User ID</span><span className="font-mono text-xs text-gray-600">{user.id}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-800">{user.email}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Role</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>{ROLE_LABELS[user.role] ?? user.role}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Member since</span><span className="text-gray-800">{new Date(user.createdAt).toLocaleDateString()}</span></div>
        </div>
      </div>
    </div>
  )
}
