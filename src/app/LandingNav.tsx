'use client'

import Link from 'next/link'
import { LogIn } from 'lucide-react'

// Shared public-site nav — used on the home landing and the /find look-up so
// the header is identical everywhere. Section links point at the home page
// (/#...) so they work no matter which page you're on.
export default function LandingNav() {
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-slate-900 text-lg">
          <img src="/whistle-ready-icon.png" alt="" className="w-9 h-9 rounded-lg object-contain" />
          Whistle Ready
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <a href="/#features" className="hover:text-slate-900 transition-colors">Features</a>
          <a href="/#who" className="hover:text-slate-900 transition-colors">Who it&apos;s for</a>
          <Link href="/find" className="hover:text-slate-900 transition-colors">Find your tournament</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors">
            <LogIn className="w-4 h-4" /> Log in
          </Link>
          <a href="/#organizations" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg transition-colors">Run a tournament</a>
        </div>
      </div>
    </header>
  )
}
