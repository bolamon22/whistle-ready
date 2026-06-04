'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

const ROLE_COLORS: Record<string, string> = {
  admin:       'bg-red-100 text-red-700',
  director:    'bg-purple-100 text-purple-700',
  assigner:    'bg-indigo-100 text-indigo-700',
  coach:       'bg-blue-100 text-blue-700',
  ref:         'bg-green-100 text-green-700',
  scorekeeper: 'bg-yellow-100 text-yellow-700',
  parent:      'bg-pink-100 text-pink-700',
  viewer:      'bg-gray-100 text-gray-600',
}

export default function ProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  const [clubLinks, setClubLinks] = useState<{ id: string; clubName: string; tournamentId: string; tournamentName?: string }[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (session) {
      setName(session.user.name || '')
      setEmail(session.user.email || '')
      fetch('/api/profile').then(r => r.json()).then(d => { if (d.photoUrl) setPhotoUrl(d.photoUrl) })
      Promise.all([
        fetch('/api/club-director/links').then(r => r.json()),
        fetch('/api/tournaments').then(r => r.json()),
      ]).then(([links, tournaments]) => {
        if (Array.isArray(links)) {
          setClubLinks(links.map((l: { id: string; clubName: string; tournamentId: string }) => ({
            ...l,
            tournamentName: tournaments.find((t: { id: string; name: string }) => t.id === l.tournamentId)?.name,
          })))
        }
      })
    }
  }, [status, session])

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) { toast.error('Upload failed'); setUploadingPhoto(false); return }
    // Save to profile immediately
    const saveRes = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoUrl: data.url }),
    })
    setUploadingPhoto(false)
    if (saveRes.ok) { setPhotoUrl(data.url); toast.success('Photo updated!') }
    else toast.error('Failed to save photo')
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { toast.error(data.error || 'Failed to save'); return }
    await update({ name: data.name, email: data.email })
    toast.success('Profile updated!')
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
    setChangingPw(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const data = await res.json()
    setChangingPw(false)
    if (!res.ok) { toast.error(data.error || 'Failed to change password'); return }
    toast.success('Password changed! Please sign in again.')
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    setTimeout(() => signOut({ callbackUrl: '/login' }), 1500)
  }

  if (status === 'loading') return <div className="p-10 text-center text-gray-400">Loading…</div>

  const role = session?.user?.role ?? 'viewer'
  const roleColor = ROLE_COLORS[role] || ROLE_COLORS.viewer
  const initials = (session?.user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Toaster />

      {/* Profile header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5 flex items-center gap-5">
        <div className="relative flex-shrink-0">
          {photoUrl ? (
            <img src={photoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-sky-100 text-sky-700 text-2xl font-bold flex items-center justify-center">
              {initials}
            </div>
          )}
          <label className="absolute bottom-0 right-0 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-50 shadow-sm">
            {uploadingPhoto ? (
              <span className="text-xs">…</span>
            ) : (
              <span className="text-sm">📷</span>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
          </label>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">{session?.user?.name}</h1>
          <p className="text-sm text-gray-500">{session?.user?.email}</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${roleColor}`}>
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </span>
          {photoUrl && (
            <button onClick={async () => {
              await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoUrl: '' }) })
              setPhotoUrl('')
              toast.success('Photo removed')
            }} className="block text-xs text-red-400 hover:text-red-600 mt-1">Remove photo</button>
          )}
        </div>
      </div>

      {/* Edit profile */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Edit Profile</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <button type="submit" disabled={saving}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold rounded-xl px-5 py-2 text-sm">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Club links */}
      {clubLinks.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Club Links</h2>
          <p className="text-sm text-gray-500 mb-4">Tournaments and clubs you're linked to as a Club Director</p>
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
        </div>
      )}

      {/* Change password */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Change Password</h2>
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input required type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input required type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input required type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <button type="submit" disabled={changingPw}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl px-5 py-2 text-sm">
            {changingPw ? 'Changing…' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
