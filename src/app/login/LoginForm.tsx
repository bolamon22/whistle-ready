'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Client half of the login page. The server page decides the branding: on an
// org's custom domain (sunshineeventsgroup.com) the org leads and Whistle
// Ready is the "powered by"; on whistleready.app it's Whistle Ready itself.
export default function LoginForm({ brandName, brandLogo }: { brandName?: string; brandLogo?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Show-password toggle (Bo) — long passwords on a phone keyboard are a guess
  // otherwise, and "Invalid email or password" doesn't say which one was wrong.
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('Invalid email or password.')
    } else {
      // Fetch session to get role then redirect
      const sessionRes = await fetch('/api/auth/session')
      const sessionData = await sessionRes.json()
      const role = sessionData?.user?.role ?? 'viewer'
      const destinations: Record<string, string> = {
        admin:          '/',
        director:       '/dashboard/director',
        club_director:  '/dashboard/club-director',
        assigner:       '/dashboard/assigner',
        scheduler:      '/dashboard/scheduler',
        coach:          '/dashboard/coach',
        ref:            '/dashboard/ref',
        scorekeeper:    '/dashboard/scorekeeper',
        parent:         '/dashboard/parent',
        viewer:         '/dashboard/viewer',
      }
      router.push(destinations[role] ?? '/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {brandName ? (
            <>
              {brandLogo
                ? <img src={brandLogo} alt={brandName} className="h-20 max-w-full mx-auto mb-4 object-contain" />
                : null}
              <h1 className="text-2xl font-bold text-white">{brandName}</h1>
              <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
            </>
          ) : (
            <>
              <img src="/whistle-ready-logo.png" alt="Whistle Ready" className="w-64 max-w-full mx-auto mb-3 rounded-2xl" />
              <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@email.com" autoComplete="email" />
          <div className="relative">
            <input required type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-4 pr-12 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••" autoComplete="current-password" />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 px-3.5 flex items-center text-gray-500 hover:text-gray-300 focus:outline-none focus:text-blue-400 rounded-r-xl">
              {showPassword ? (
                // Eye with a line through it = currently visible, tap to hide
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M2.5 12S6 5.5 12 5.5s9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="m4 20 16-16" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M2.5 12S6 5.5 12 5.5s9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/40 rounded-xl px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl py-3 text-sm transition-colors">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm mt-4">
          <Link href="/forgot" className="text-gray-400 hover:text-gray-200 hover:underline">Forgot password?</Link>
        </p>
        <p className="text-center text-sm text-gray-500 mt-4">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-blue-400 hover:underline font-medium">Create one</Link>
        </p>
        {brandName && (
          <p className="text-center text-xs text-gray-600 mt-8">Powered by <span className="font-semibold text-gray-500">Whistle Ready</span></p>
        )}
      </div>
    </div>
  )
}
