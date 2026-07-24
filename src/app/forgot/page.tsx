'use client'

import { useState } from 'react'
import Link from 'next/link'

// "Forgot password" — always shows the same success message whether or not the
// email exists (the API is deliberately non-committal to prevent probing).
export default function ForgotPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {}
    setLoading(false)
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-sm text-gray-500 mt-2">Enter your email and we&apos;ll send you a link to choose a new one.</p>
        </div>

        {sent ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <p className="text-sm text-gray-300 leading-relaxed">If <span className="font-semibold text-white">{email}</span> has an account, a reset link is on its way. It works once and expires in 1 hour — check spam if you don&apos;t see it.</p>
            <Link href="/login" className="inline-block mt-4 text-sm text-blue-400 hover:underline font-medium">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@email.com" autoComplete="email" />
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl py-3 text-sm transition-colors">
              {loading ? 'Sending…' : 'Email me a reset link'}
            </button>
            <p className="text-center text-sm text-gray-500 pt-2">
              <Link href="/login" className="text-blue-400 hover:underline font-medium">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
