'use client'

import OrgLogoMark from '@/app/OrgLogoMark'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'

interface Feature {
  key: string
  label: string
  group: string
}

type RolePermissions = Record<string, Record<string, boolean>>

const ROLES = ['director', 'club_director', 'assigner', 'coach', 'staff', 'parent']

const ROLE_LABELS: Record<string, string> = {
  director:      'Tournament Dir.',
  club_director: 'Club Director',
  assigner:      'Assigner',
  coach:         'Coach',
  staff:         'Staff',
  parent:        'Parent',
}

const ROLE_COLORS: Record<string, string> = {
  director:      'bg-purple-100 text-purple-700',
  club_director: 'bg-violet-100 text-violet-700',
  assigner:      'bg-indigo-100 text-indigo-700',
  coach:         'bg-blue-100 text-blue-700',
  staff:         'bg-teal-100 text-teal-700',
  parent:        'bg-pink-100 text-pink-700',
}

export default function PermissionsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [features, setFeatures] = useState<Feature[]>([])
  const [roles, setRoles] = useState<RolePermissions>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated' && session.user.role !== 'admin') { router.push('/'); return }
    if (status === 'authenticated') load()
  }, [status])

  const load = async () => {
    const res = await fetch('/api/admin/permissions')
    const data = await res.json()
    setFeatures(data.features)
    setRoles(data.roles)
  }

  const toggle = (role: string, feature: string) => {
    setRoles(prev => ({
      ...prev,
      [role]: { ...prev[role], [feature]: !prev[role]?.[feature] },
    }))
    setDirty(true)
  }

  const toggleAll = (role: string, value: boolean) => {
    setRoles(prev => ({
      ...prev,
      [role]: Object.fromEntries(features.map(f => [f.key, value])),
    }))
    setDirty(true)
  }

  const toggleFeatureAll = (featureKey: string, value: boolean) => {
    setRoles(prev => {
      const updated = { ...prev }
      ROLES.forEach(r => {
        updated[r] = { ...updated[r], [featureKey]: value }
      })
      return updated
    })
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/admin/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles }),
    })
    setSaving(false)
    if (res.ok) { toast.success('Permissions saved!'); setDirty(false) }
    else toast.error('Failed to save')
  }

  if (status === 'loading' || !features.length) return <div className="p-10 text-center text-gray-400">Loading…</div>

  // Group features
  const groups = Array.from(new Set(features.map(f => f.group)))

  return (
    <div className="max-w-6xl mx-auto py-8">
      <Toaster />

      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/users" className="text-sm text-blue-600 hover:underline mb-1 block">← Back to Users</Link>
          <div className="flex items-center gap-3"><OrgLogoMark /><h1 className="text-2xl font-bold text-gray-800">Role Permissions</h1></div>
          <p className="text-sm text-gray-500 mt-0.5">Check the boxes to grant access. Admin always has full access.</p>
        </div>
        <button onClick={save} disabled={saving || !dirty}
          className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
          {saving ? 'Saving…' : dirty ? '💾 Save Changes' : '✓ Saved'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-gray-500 font-semibold w-48">Feature</th>
                {ROLES.map(role => (
                  <th key={role} className="px-3 py-3 text-center min-w-[90px]">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[role]}`}>
                        {ROLE_LABELS[role] ?? role}
                      </span>
                      <div className="flex gap-1">
                        <button onClick={() => toggleAll(role, true)}
                          title="Enable all"
                          className="text-[10px] text-green-600 hover:text-green-800 border border-green-200 hover:border-green-400 px-1 rounded">All</button>
                        <button onClick={() => toggleAll(role, false)}
                          title="Disable all"
                          className="text-[10px] text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-1 rounded">None</button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <>
                  <tr key={`group-${group}`} className="bg-gray-50">
                    <td colSpan={ROLES.length + 1} className="px-5 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                      {group}
                    </td>
                  </tr>
                  {features.filter(f => f.group === group).map((feature, i) => {
                    const allOn = ROLES.every(r => roles[r]?.[feature.key])
                    const allOff = ROLES.every(r => !roles[r]?.[feature.key])
                    return (
                      <tr key={feature.key} className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">{feature.label}</span>
                            <button
                              onClick={() => toggleFeatureAll(feature.key, !allOn)}
                              title={allOn ? 'Disable for all roles' : 'Enable for all roles'}
                              className="text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-400 px-1.5 py-0.5 rounded transition-colors">
                              {allOn ? '✕ all' : allOff ? '+ all' : '±'}
                            </button>
                          </div>
                        </td>
                        {ROLES.map(role => (
                          <td key={role} className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={!!roles[role]?.[feature.key]}
                              onChange={() => toggle(role, feature.key)}
                              className="w-4 h-4 rounded border-gray-300 text-sky-600 cursor-pointer focus:ring-sky-500"
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dirty && (
        <div className="fixed bottom-6 right-6 bg-white border border-sky-200 shadow-lg rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-sm text-gray-600">You have unsaved changes</span>
          <button onClick={save} disabled={saving}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-1.5 text-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
