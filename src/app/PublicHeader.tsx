'use client'

import { useSession } from 'next-auth/react'
import LandingNav from './LandingNav'

// The public site header for signed-out visitors on public pages (privacy,
// terms). Signed-in people already have the app's NavBar there.
export default function PublicHeader() {
  const { status } = useSession()
  if (status === 'authenticated') return null
  return <LandingNav />
}
