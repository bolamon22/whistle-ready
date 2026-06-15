'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import WhistleMark from '../WhistleMark'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
          <div className="flex justify-center mb-3"><WhistleMark className="w-16 h-11" /></div>
          <h1 className="text-3xl font-bold text-white">Whistle Ready</h1>
          <p className="text-sm text-gray-500 mt-1">Tournament staff sign-in</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@email.com" autoComplete="email" />
          <input required type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••" autoComplete="current-password" />

          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/40 rounded-xl px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl py-3 text-sm transition-colors">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-blue-400 hover:underline font-medium">Create one</Link>
        </p>
      </div>
    </div>
  )
}
