'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useRole } from '@/lib/role-context'
import ChatWidget from './tournaments/[id]/ChatWidget'

// The floating Chirp on every page for signed-in staff (Bo, Oct 2 2026: it used
// to live only on the tournament dashboard and Assigner). Inside a tournament it
// knows that tournament; elsewhere it answers how-to questions. What it says is
// cut to the viewer's role (View as included) by lib/chirp on the server.
//
// Not shown to coaches, parents or club directors (the staff Chirp API refuses
// them), to visitors who aren't signed in, or on the public event pages, which
// have the public Chirp in the same corner.

const EXTERNAL = ['coach', 'parent', 'club_director', 'viewer', '']
const PUBLIC_SEGMENTS = ['event', 'public', 'register', 'today']

export default function GlobalChirp() {
  const pathname = usePathname() || ''
  const { status } = useSession()
  const { effectiveRole } = useRole()
  const m = pathname.match(/^\/tournaments\/([A-Za-z0-9_-]+)(?:\/([^/]+))?/)
  const tournamentId = m && m[1] !== 'new' ? m[1] : ''
  const segment = m?.[2] || ''
  const [name, setName] = useState('')

  useEffect(() => {
    setName('')
    if (!tournamentId || status !== 'authenticated') return
    let live = true
    fetch(`/api/tournaments/${tournamentId}`).then(r => (r.ok ? r.json() : null)).then(t => { if (live && t?.name) setName(t.name) }).catch(() => {})
    return () => { live = false }
  }, [tournamentId, status])

  if (status !== 'authenticated' || EXTERNAL.includes(effectiveRole)) return null
  if (tournamentId && PUBLIC_SEGMENTS.includes(segment)) return null
  if (pathname.startsWith('/login')) return null

  // key: a new tournament starts a new conversation.
  return <ChatWidget key={tournamentId || 'app'} tournamentId={tournamentId || undefined} tournamentName={name} liftOnPhones={segment === 'builder'} />
}
