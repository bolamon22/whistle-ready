'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'

interface Org {
  id: string; name: string; slug: string; logoUrl: string
  contactEmail: string; contactPhone: string; website: string
  achBankName: string; achRoutingNumber: string; achAccountNumber: string
  paypalEmail: string; zelleHandle: string; checkPayableTo: string; checkAddress: string
  subscriptionTier: string; subscriptionStatus: string
}

const TIERS = ['starter', 'pro', 'enterprise']
const STATUSES = ['active', 'inactive', 'suspended']
const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function OrgEditPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [form, setForm] = useState<Partial<Org>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as any)?.role !== 'admin') { router.replace('/'); return }
    fetch(`/api/admin/orgs/${id}`)
      .then(r => r.json())
      .then(data => { setForm(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session, status, id])

  function set(field: keyof Org, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setDirty(true)
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

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/admin/orgs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) { toast.success('Saved!'); setDirty(false) }
    else toast.error(data.error || 'Save failed')
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/orgs" className="text-sm text-gray-500 hover:text-gray-700">← Organizations</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{form.name || 'Edit Organization'}</h1>
            <p className="text-sm text-gray-400 font-mono mt-0.5">{form.slug}</p>
          </div>
          <button onClick={save} disabled={saving || !dirty}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : dirty ? '💾 Save Changes' : '✓ Saved'}
          </button>
        </div>

        <div className="space-y-6">
          {/* Branding */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Branding</h2>
            <div className="flex items-start gap-6">
              {/* Logo */}
              <div className="flex flex-col items-center gap-2">
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="logo" className="h-20 w-20 object-contain rounded-xl border border-slate-200 bg-white p-1" />
                  : <div className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">Logo</div>
                }
                <label className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded-lg transition-colors">
                  {logoUploading ? 'Uploading…' : 'Upload Logo'}
                  <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                    onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]) }} />
                </label>
                {form.logoUrl && (
                  <button type="button" onClick={() => set('logoUrl', '')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
              {/* Name + Slug */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Organization Name</label>
                  <input value={form.name || ''} onChange={e => set('name', e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Slug</label>
                  <input value={form.slug || ''} onChange={e => set('slug', e.target.value)} className={`${inp} font-mono`} />
                </div>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input type="email" value={form.contactEmail || ''} onChange={e => set('contactEmail', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                <input type="tel" value={form.contactPhone || ''} onChange={e => set('contactPhone', e.target.value)} className={inp} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
                <input type="url" value={form.website || ''} onChange={e => set('website', e.target.value)} className={inp} placeholder="https://" />
              </div>
            </div>
          </section>

          {/* Payment */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Payment Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">PayPal Email</label>
                <input type="email" value={form.paypalEmail || ''} onChange={e => set('paypalEmail', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Zelle Handle</label>
                <input value={form.zelleHandle || ''} onChange={e => set('zelleHandle', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Check Payable To</label>
                <input value={form.checkPayableTo || ''} onChange={e => set('checkPayableTo', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Check Mailing Address</label>
                <input value={form.checkAddress || ''} onChange={e => set('checkAddress', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ACH Bank Name</label>
                <input value={form.achBankName || ''} onChange={e => set('achBankName', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ACH Routing #</label>
                <input value={form.achRoutingNumber || ''} onChange={e => set('achRoutingNumber', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ACH Account #</label>
                <input value={form.achAccountNumber || ''} onChange={e => set('achAccountNumber', e.target.value)} className={inp} />
              </div>
            </div>
          </section>

          {/* Subscription */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Subscription</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tier</label>
                <select value={form.subscriptionTier || 'starter'} onChange={e => set('subscriptionTier', e.target.value)} className={inp}>
                  {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select value={form.subscriptionStatus || 'active'} onChange={e => set('subscriptionStatus', e.target.value)} className={inp}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* Sticky save bar */}
        {dirty && (
          <div className="fixed bottom-6 right-6 bg-white border border-blue-200 shadow-lg rounded-2xl px-5 py-3 flex items-center gap-3">
            <span className="text-sm text-gray-600">Unsaved changes</span>
            <button onClick={save} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-1.5 text-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
