'use client'

import OrgLogoMark from '@/app/OrgLogoMark'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'

interface Provider {
  id: string; provider: string; enabled: boolean; mode: string
  connected: boolean; displayInfo: Record<string, string>
}

const PROVIDERS = [
  {
    key: 'stripe',
    name: 'Stripe',
    icon: '💳',
    color: 'indigo',
    desc: 'Credit & debit cards. Already active — update keys here.',
    fields: [
      { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_live_…' },
      { key: 'secretKey', label: 'Secret Key', placeholder: 'sk_live_…', secret: true },
      { key: 'webhookSecret', label: 'Webhook Secret', placeholder: 'whsec_…', secret: true },
      { key: 'accountId', label: 'Connect Account ID (optional)', placeholder: 'acct_…' },
    ],
    oauthConnect: false,
  },
  {
    key: 'quickbooks',
    name: 'QuickBooks',
    icon: '🏦',
    color: 'green',
    desc: 'ACH bank transfers (~1% fee) + invoice sync to QuickBooks.',
    fields: [],
    oauthConnect: true,
    oauthLabel: 'Connect QuickBooks',
    oauthUrl: '/api/oauth/quickbooks',
    setupFields: [
      { key: 'clientId', label: 'QBO Client ID', placeholder: 'From developer.intuit.com' },
      { key: 'clientSecret', label: 'QBO Client Secret', placeholder: 'From developer.intuit.com', secret: true },
    ],
  },
  {
    key: 'paypal',
    name: 'PayPal',
    icon: '🅿️',
    color: 'blue',
    desc: 'Accept PayPal payments in the registration modal.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'From developer.paypal.com' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'From developer.paypal.com', secret: true },
    ],
    oauthConnect: false,
  },
]

function PaymentProvidersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [migrated, setMigrated] = useState(false)
  const [mode, setMode] = useState<Record<string, string>>({})

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as any)?.role !== 'admin') { router.replace('/'); return }
    loadProviders()
    // Handle OAuth callbacks
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success === 'quickbooks') toast.success('QuickBooks connected!')
    if (error) toast.error(`Connection failed: ${error.replace(/_/g, ' ')}`)
  }, [session, status])

  async function loadProviders() {
    try {
      const res = await fetch('/api/payment-providers')
      const data = await res.json()
      if (Array.isArray(data)) setProviders(data)
    } catch {
      // Table may not exist yet — that's fine, show the page with the migration button
    } finally {
      setLoading(false)
    }
  }

  function startEdit(providerKey: string) {
    setEditing(providerKey)
    setFormValues({})
    const existing = providers.find(p => p.provider === providerKey)
    setMode(prev => ({ ...prev, [providerKey]: existing?.mode || 'live' }))
  }

  async function saveProvider(providerKey: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/payment-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerKey, config: formValues, mode: mode[providerKey] || 'live' }),
      })
      if (!res.ok) throw new Error()
      toast.success('Saved!')
      setEditing(null)
      await loadProviders()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  async function disconnectProvider(id: string, name: string) {
    if (!confirm(`Disconnect ${name}? This will remove all stored credentials.`)) return
    await fetch(`/api/payment-providers/${id}`, { method: 'DELETE' })
    toast.success('Disconnected')
    await loadProviders()
  }

  async function toggleEnabled(p: Provider) {
    await fetch(`/api/payment-providers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !p.enabled }),
    })
    await loadProviders()
  }

  if (loading) return <div className="p-8 text-slate-400 text-center">Loading…</div>

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link href="/admin/users" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        </div>
        <div className="flex items-center gap-3"><OrgLogoMark /><h1 className="text-2xl font-bold text-slate-900 mb-1">Payment Providers</h1></div>
        <p className="text-slate-500 text-sm mb-8">
          Connect payment methods for your organization. Each future organization will connect their own credentials here.
        </p>

        {/* Run migration button (first-time setup) */}
        {!migrated && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-amber-800">First-time setup</p>
            <p className="text-xs text-amber-600">Run the database migration once to create the payment providers table.</p>
          </div>
          <button
            onClick={async () => {
              const res = await fetch('/api/admin/migrate', { method: 'PUT' })
              const d = await res.json()
              if (d.ok) { toast.success(d.message, { duration: 6000 }); setMigrated(true) }
              else toast.error(d.error, { duration: 6000 })
            }}
            className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 whitespace-nowrap">
            Run Migration
          </button>
        </div>
        )}

        <div className="space-y-4">
          {PROVIDERS.map(def => {
            const connected = providers.find(p => p.provider === def.key)
            const isEditing = editing === def.key
            const colorMap: Record<string, string> = {
              indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
              green: 'bg-green-100 text-green-700 border-green-200',
              blue: 'bg-blue-100 text-blue-700 border-blue-200',
            }
            const accentCls = colorMap[def.color] || colorMap.indigo

            return (
              <div key={def.key} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${connected?.enabled ? 'border-slate-200' : 'border-slate-200 opacity-75'}`}>
                {/* Header row */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{def.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-slate-800">{def.name}</h2>
                        {connected ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${accentCls}`}>
                            {connected.enabled ? '● Connected' : '○ Disabled'}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-slate-100 text-slate-500 border-slate-200">Not connected</span>
                        )}
                        {connected && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${connected.mode === 'live' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                            {connected.mode === 'live' ? 'Live' : 'Test/Sandbox'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{def.desc}</p>
                      {connected && Object.entries(connected.displayInfo).map(([k, v]) => v ? (
                        <span key={k} className="text-xs text-slate-400 mr-3">{k}: {v}</span>
                      ) : null)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {connected && (
                      <button onClick={() => toggleEnabled(connected)} className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg">
                        {connected.enabled ? 'Disable' : 'Enable'}
                      </button>
                    )}
                    {connected && !isEditing && (
                      <button onClick={() => disconnectProvider(connected.id, def.name)} className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-2.5 py-1 rounded-lg">
                        Disconnect
                      </button>
                    )}
                    {!isEditing && (
                      <button onClick={() => startEdit(def.key)} className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700">
                        {connected ? 'Update Keys' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Edit form */}
                {isEditing && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 space-y-3">
                    {/* Mode toggle */}
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-medium text-slate-600">Mode:</label>
                      <select
                        value={mode[def.key] || 'live'}
                        onChange={e => setMode(prev => ({ ...prev, [def.key]: e.target.value }))}
                        className="text-xs border border-slate-300 rounded-lg px-2 py-1">
                        <option value="live">Live</option>
                        <option value="test">Test / Sandbox</option>
                      </select>
                    </div>

                    {/* OAuth connect button */}
                    {def.oauthConnect && def.setupFields && (
                      <>
                        <p className="text-xs text-slate-500">Enter your QBO app credentials, then click Connect to authorize via OAuth.</p>
                        {def.setupFields.map(f => (
                          <div key={f.key}>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
                            <input
                              type={f.secret ? 'password' : 'text'}
                              placeholder={f.placeholder}
                              value={formValues[f.key] || ''}
                              onChange={e => setFormValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={async () => {
                              // Save QBO client creds first, then redirect to OAuth
                              if (formValues.clientId && formValues.clientSecret) {
                                await fetch('/api/payment-providers', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ provider: 'quickbooks_creds', config: { clientId: formValues.clientId, clientSecret: formValues.clientSecret }, mode: mode[def.key] || 'live' }),
                                })
                              }
                              window.location.href = def.oauthUrl!
                            }}
                            className="flex-1 bg-green-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-green-700">
                            🔗 {def.oauthLabel}
                          </button>
                          <button onClick={() => setEditing(null)} className="px-4 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                        </div>
                      </>
                    )}

                    {/* Direct credential fields */}
                    {!def.oauthConnect && def.fields.map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
                        <input
                          type={f.secret ? 'password' : 'text'}
                          placeholder={f.placeholder}
                          value={formValues[f.key] || ''}
                          onChange={e => setFormValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    ))}

                    {!def.oauthConnect && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => saveProvider(def.key)} disabled={saving} className="flex-1 bg-slate-800 text-white rounded-xl py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-60">
                          {saving ? 'Saving…' : 'Save Credentials'}
                        </button>
                        <button onClick={() => setEditing(null)} className="px-4 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
          <strong>Multi-tenant note:</strong> Each organization that uses Whistle Ready will connect their own credentials here.
          Credentials are AES-256 encrypted before storage. Add <code className="bg-blue-100 px-1 rounded">ENCRYPTION_KEY</code> to your Vercel env vars for production security.
        </div>
      </div>
    </div>
  )
}

import { Suspense } from 'react'
export default function PaymentProvidersPageWrapper() {
  return <Suspense fallback={<div className="p-8 text-slate-400 text-center">Loading…</div>}><PaymentProvidersPage /></Suspense>
}
