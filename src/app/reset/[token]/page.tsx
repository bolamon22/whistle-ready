'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// Landing page for the emailed reset link: choose a new password.
export default function ResetPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    const res = await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(data.error || 'This reset link is invalid or expired.'); return }
    setDone(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Choose a new password</h1>
        </div>

        {done ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <p className="text-sm text-gray-300">Password updated — taking you to sign in…</p>
            <Link href="/login" className="inline-block mt-4 text-sm text-blue-400 hover:underline font-medium">Sign in now</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="New password (6+ characters)" autoComplete="new-password" />
            <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Confirm new password" autoComplete="new-password" />

            {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/40 rounded-xl px-3 py-2">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl py-3 text-sm transition-colors">
              {loading ? 'Saving…' : 'Set new password'}
            </button>
            <p className="text-center text-sm text-gray-500 pt-2">
              Link expired? <Link href="/forgot" className="text-blue-400 hover:underline font-medium">Request a new one</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
