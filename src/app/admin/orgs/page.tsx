'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Org {
  id: string
  name: string
  slug: string
  contactEmail: string | null
  subscriptionTier: string
  subscriptionStatus: string
  createdAt: string
}

export default function OrgsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', contactEmail: '', tier: 'starter', ownerEmail: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') { router.push('/'); return }
  }, [session, status, router])

  useEffect(() => {
    if ((session?.user as any)?.role === 'admin') {
      fetch('/api/admin/orgs')
        .then(r => r.json())
        .then(d => { setOrgs(Array.isArray(d) ? d : []); setLoading(false) })
        .catch(() => setLoading(false))
    }
  }, [session])

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    const res = await fetch('/api/admin/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to create org')
      setCreating(false)
      return
    }
    setOrgs(prev => [{
      ...data,
      contactEmail: form.contactEmail || null,
      subscriptionTier: form.tier,
      subscriptionStatus: 'active',
      createdAt: new Date().toISOString(),
    }, ...prev])
    setForm({ name: '', slug: '', contactEmail: '', tier: 'starter', ownerEmail: '' })
    setShowForm(false)
    setCreating(false)
  }

  const TIERS = ['starter', 'pro', 'enterprise']

  if (status === 'loading') {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">← Platform Dashboard</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Organizations</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage all orgs on the platform</p>
          </div>
          <button
            onClick={() => setShowForm(s => !s)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + New Organization
          </button>
        </div>

        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Create Organization</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Org Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
                    placeholder="Sunshine Events Group"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug * (URL-safe, unique)</label>
                  <input
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: autoSlug(e.target.value) }))}
                    placeholder="sunshine-events-group"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                    placeholder="admin@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Tier</label>
                  <select
                    value={form.tier}
                    onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    {TIERS.map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Owner Email <span className="text-gray-400 font-normal">(optional — assigns an existing user as org admin)</span>
                  </label>
                  <input
                    type="email"
                    value={form.ownerEmail}
                    onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))}
                    placeholder="owner@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError('') }}
                  className="px-5 py-2 text-gray-600 text-sm hover:text-gray-900"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading organizations...</div>
          ) : orgs.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No organizations yet. Create the first one above.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tier</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orgs.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900"><Link href={`/admin/orgs/${o.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">{o.name}</Link></td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{o.slug}</td>
                    <td className="px-4 py-3 text-gray-500">{o.contactEmail || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        o.subscriptionTier === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                        o.subscriptionTier === 'pro' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {o.subscriptionTier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        o.subscriptionStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {o.subscriptionStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
