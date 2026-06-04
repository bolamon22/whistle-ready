'use client'

import { useSession } from 'next-auth/react'
import { useRole } from '@/lib/role-context'
import Link from 'next/link'

const ROLE_HOME: Record<string, string> = {
  admin:       '/',
  director:    '/dashboard/director',
  assigner:    '/dashboard/assigner',
  coach:       '/dashboard/coach',
  ref:         '/dashboard/ref',
  scorekeeper: '/dashboard/scorekeeper',
  parent:      '/dashboard/parent',
  viewer:      '/dashboard/viewer',
}

export default function UnauthorizedPage() {
  const { data: session } = useSession()
  const { effectiveRole, isPreview, setPreviewRole } = useRole()
  const role = effectiveRole
  const home = ROLE_HOME[role] ?? '/'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {isPreview ? 'Preview: Access Restricted' : 'Access Restricted'}
        </h1>
        <p className="text-gray-500 mb-1">
          {isPreview
            ? `As a ${role}, you don't have permission to view this page.`
            : "You don't have permission to view this page."}
        </p>
        {isPreview && (
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4 mt-2">
            👁 You're previewing as <strong>{role}</strong>. This is what they'd see.
          </p>
        )}
        {session && !isPreview && (
          <p className="text-sm text-gray-400 mb-6">
            Your role is <span className="font-semibold text-gray-600">{session.user.role}</span>.
            Contact your administrator if you need access.
          </p>
        )}
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href={home}
            className="bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
            {isPreview ? `Go to ${role} Dashboard` : 'Go to My Dashboard'}
          </Link>
          {isPreview && (
            <button onClick={() => setPreviewRole(null)}
              className="border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-xl px-5 py-2.5 text-sm transition-colors">
              Exit Preview
            </button>
          )}
          {!session && (
            <Link href="/login"
              className="border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-xl px-5 py-2.5 text-sm transition-colors">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
