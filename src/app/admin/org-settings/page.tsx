'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'

const TIER_COLORS: Record<string, string> = {
  starter:    'bg-slate-100 text-slate-600 border-slate-300',
  pro:        'bg-blue-100 text-blue-700 border-blue-300',
  enterprise: 'bg-purple-100 text-purple-700 border-purple-300',
}

interface Org {
  id: string; name: string; slug: string; logoUrl: string
  contactEmail: string; contactPhone: string; website: string
  achBankName: string; achRoutingNumber: string; achAccountNumber: string
  paypalEmail: string; zelleHandle: string; checkPayableTo: string; checkAddress: string
  subscriptionTier: string; subscriptionStatus: string
}

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function OrgSettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [org, setOrg] = useState<Org | null>(null)
  const [form, setForm] = useState<Partial<Org>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrated, setMigrated] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as any)?.role !== 'admin') { router.replace('/'); return }
    fetch('/api/admin/org').then(r => r.json()).then(data => {
      if (data) { setOrg(data); setForm(data) }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session, status])

  function set(field: keyof Org, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Upload failed')
      set('logoUrl', data.url)
      toast.success('Logo uploaded!')
    } catch { toast.error('Logo upload failed') }
    finally { setLogoUploading(false) }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Saved!', { duration: 4000 })
      setOrg({ ...org!, ...form } as Org)
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  async function runMigration() {
    setMigrating(true)
    try {
      const res = await fetch('/api/admin/org-migrate', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success('Migration complete!', { duration: 6000 })
        setMigrated(true)
        // Reload org data
        const orgRes = await fetch('/api/admin/org')
        const orgData = await orgRes.json()
        if (orgData) { setOrg(orgData); setForm(orgData) }
      } else toast.error(data.error || 'Migration failed')
    } catch { toast.error('Migration failed') }
    finally { setMigrating(false) }
  }

  if (loading) return <div className="p-8 text-slate-400 text-center">Loading…</div>

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/admin/users" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        </div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Organization Settings</h1>
            <p className="text-slate-500 text-sm mt-1">Manage your org profile and payment instructions.</p>
          </div>
          {org && (
            <span className={`text-xs px-3 py-1 rounded-full border font-medium capitalize ${TIER_COLORS[org.subscriptionTier] || TIER_COLORS.starter}`}>
              {org.subscriptionTier}
            </span>
          )}
        </div>

        {/* Migration banner */}
        {!org && !migrated && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-800">First-time setup</p>
              <p className="text-xs text-amber-600">Run migration to create the Organization table and link your tournaments.</p>
            </div>
            <button onClick={runMigration} disabled={migrating}
              className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-60 whitespace-nowrap">
              {migrating ? 'Running…' : 'Run Migration'}
            </button>
          </div>
        )}

        {org && (
          <form onSubmit={save} className="space-y-6">
            {/* Org Profile */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Organization Profile</h2>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Organization Name</label>
                <input value={form.name || ''} onChange={e => set('name', e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contact Email</label>
                  <input type="email" value={form.contactEmail || ''} onChange={e => set('contactEmail', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contact Phone</label>
                  <input type="tel" value={form.contactPhone || ''} onChange={e => set('contactPhone', e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
                <input type="url" value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Organization Logo</label>
                <div className="flex items-center gap-4">
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="org logo" className="h-16 w-16 object-contain rounded-xl border border-slate-200 bg-white p-1" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">Logo</div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 font-medium">
                      {logoUploading ? 'Uploading…' : 'Upload Logo'}
                      <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                        onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]) }} />
                    </label>
                    {form.logoUrl && (
                      <button type="button" onClick={() => set('logoUrl', '')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Instructions */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Payment Instructions</h2>
              <p className="text-xs text-slate-500">These are shown inline on the public registration form when teams select a payment method.</p>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Check</p>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Payable To</label>
                  <input value={form.checkPayableTo || ''} onChange={e => set('checkPayableTo', e.target.value)} placeholder="Sunshine Events Group" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Mailing Address</label>
                  <input value={form.checkAddress || ''} onChange={e => set('checkAddress', e.target.value)} placeholder="123 Main St, City, ST 00000" className={inputCls} />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Zelle</p>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Zelle Email or Phone</label>
                  <input value={form.zelleHandle || ''} onChange={e => set('zelleHandle', e.target.value)} placeholder="payments@yourdomain.com" className={inputCls} />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">PayPal</p>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">PayPal Email</label>
                  <input type="email" value={form.paypalEmail || ''} onChange={e => set('paypalEmail', e.target.value)} placeholder="payments@yourdomain.com" className={inputCls} />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ACH / Bank Transfer</p>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
                  <input value={form.achBankName || ''} onChange={e => set('achBankName', e.target.value)} placeholder="Wells Fargo" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Routing Number</label>
                    <input value={form.achRoutingNumber || ''} onChange={e => set('achRoutingNumber', e.target.value)} placeholder="•••••••••" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
                    <input value={form.achAccountNumber || ''} onChange={e => set('achAccountNumber', e.target.value)} placeholder="•••••••••••" className={inputCls} />
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving}
              className="w-full bg-slate-800 text-white rounded-xl py-3 text-sm font-semibold hover:bg-slate-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
