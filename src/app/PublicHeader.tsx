'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import LandingNav from './LandingNav'

// The public site header for signed-out visitors on public pages (privacy,
// terms, sms). Signed-in people already have the app's NavBar there.
//
// On an ORG'S OWN DOMAIN these pages are that org's policies, not Whistle
// Ready's, and the header has to say so. LandingNav sells tournament software
// -- "Features", "Run a tournament" -- which is the wrong thing to show someone
// who came to sunshineeventsgroup.com to read Sunshine Events Group's text
// message program. It is also what a carrier checks: the business named on a
// toll-free submission has to match the site it points at (30445, 30492).

export type HeaderOrg = { name: string; logoUrl: string; domain: string }

export default function PublicHeader({ org }: { org?: HeaderOrg | null }) {
  const { status } = useSession()
  if (status === 'authenticated') return null
  if (!org) return <LandingNav />
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-200">
      <div className="max-w-3xl mx-auto px-5 sm:px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-slate-900 text-lg">
          {!!org.logoUrl && <img src={org.logoUrl} alt="" className="w-9 h-9 rounded-lg object-contain" />}
          {org.name}
        </Link>
      </div>
    </header>
  )
}
