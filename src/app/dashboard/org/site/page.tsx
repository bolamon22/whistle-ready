'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, Plus, Trash2, ExternalLink, ImagePlus, Save } from 'lucide-react'

type Sponsor = { name: string; logoUrl: string; url: string }
type Content = {
  hero: { headline: string; subtext: string; imageUrl: string }
  about: { heading: string; body: string }
  sponsors: Sponsor[]
  contact: { email: string; phone: string; hours: string; address: string }
  socials: { facebook: string; instagram: string; website: string }
}
const EMPTY: Content = {
  hero: { headline: '', subtext: '', imageUrl: '' },
  about: { heading: '', body: '' },
  sponsors: [],
  contact: { email: '', phone: '', hours: '', address: '' },
  socials: { facebook: '', instagram: '', website: '' },
}

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData(); fd.append('file', file)
  const r = await fetch('/api/upload', { method: 'POST', body: fd })
  if (!r.ok) return null
  const d = await r.json().catch(() => ({})); return d.url || null
}

export default function OrgSiteEditor() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role
  const sp = useSearchParams()
  const qOrg = sp.get('org') || ''
  const qSlug = sp.get('slug') || ''
  const qName = sp.get('name') || ''
  const apiQ = qOrg ? `?org=${encodeURIComponent(qOrg)}` : ''
  const [org, setOrg] = useState<{ name: string; slug: string } | null>(null)
  const [c, setC] = useState<Content>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (role !== 'director' && role !== 'admin') { router.replace('/'); return }
    ;(async () => {
      try {
        if (qOrg) { setOrg({ name: qName, slug: qSlug }) }
        else { const o = await fetch('/api/org').then(r => r.ok ? r.json() : null); if (o) setOrg({ name: o.name, slug: o.slug }) }
        const d = await fetch(`/api/org-site${apiQ}`).then(r => r.ok ? r.json() : {})
        setC({ ...EMPTY, ...d, hero: { ...EMPTY.hero, ...(d.hero || {}) }, about: { ...EMPTY.about, ...(d.about || {}) }, contact: { ...EMPTY.contact, ...(d.contact || {}) }, socials: { ...EMPTY.socials, ...(d.socials || {}) }, sponsors: Array.isArray(d.sponsors) ? d.sponsors : [] })
      } catch {} finally { setLoading(false) }
    })()
  }, [status, session, role])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/org-site${apiQ}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
      if (res.ok) toast.success('Website saved')
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Save failed') }
    } catch { toast.error('Save failed') } finally { setSaving(false) }
  }

  if (loading) return <div className="text-slate-400 text-center py-16">Loading…</div>

  const heroImg = async (f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setC(v => ({ ...v, hero: { ...v.hero, imageUrl: u } })); else toast.error('Upload failed') }
  const sponLogo = async (i: number, f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setC(v => ({ ...v, sponsors: v.sponsors.map((s, j) => j === i ? { ...s, logoUrl: u } : s) })); else toast.error('Upload failed') }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <Link href="/dashboard/org" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><ChevronLeft size={14} /> Your team</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Website</h1>
          <p className="text-sm text-slate-500">Edit your public org site{org ? <> at <code className="text-teal-700">/o/{org.slug}</code></> : ''}.</p>
        </div>
        <div className="flex items-center gap-2">
          {org && <Link href={`/o/${org.slug}`} target="_blank" className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><ExternalLink size={14} /> View site</Link>}
          <button onClick={save} disabled={saving} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {/* Hero */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-slate-800 mb-3">Hero</h2>
        <label className="label">Headline</label>
        <input className="input" value={c.hero.headline} onChange={e => setC(v => ({ ...v, hero: { ...v.hero, headline: e.target.value } }))} placeholder={org?.name || 'Your organization'} />
        <label className="label mt-3">Subtext</label>
        <input className="input" value={c.hero.subtext} onChange={e => setC(v => ({ ...v, hero: { ...v.hero, subtext: e.target.value } }))} placeholder="Upcoming events, schedules, standings and registration." />
        <label className="label mt-3">Background image (optional)</label>
        <div className="flex items-center gap-3 mt-1">
          {c.hero.imageUrl ? <img src={c.hero.imageUrl} alt="" className="h-16 w-28 object-cover rounded-lg border border-slate-200" /> : <div className="h-16 w-28 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={18} /></div>}
          <label className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={e => heroImg(e.target.files?.[0])} /></label>
          {c.hero.imageUrl && <button onClick={() => setC(v => ({ ...v, hero: { ...v.hero, imageUrl: '' } }))} className="text-sm text-slate-400 hover:text-red-600">Remove</button>}
        </div>
      </section>

      {/* About */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-slate-800 mb-3">About</h2>
        <label className="label">Heading</label>
        <input className="input" value={c.about.heading} onChange={e => setC(v => ({ ...v, about: { ...v.about, heading: e.target.value } }))} placeholder="About us" />
        <label className="label mt-3">Body</label>
        <textarea className="input min-h-[120px]" value={c.about.body} onChange={e => setC(v => ({ ...v, about: { ...v.about, body: e.target.value } }))} placeholder="Tell visitors about your organization…" />
      </section>

      {/* Sponsors */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Sponsors &amp; partners</h2>
          <button onClick={() => setC(v => ({ ...v, sponsors: [...v.sponsors, { name: '', logoUrl: '', url: '' }] }))} className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Plus size={14} /> Add</button>
        </div>
        {c.sponsors.length === 0 && <p className="text-sm text-slate-400">No sponsors yet.</p>}
        <div className="space-y-3">
          {c.sponsors.map((s, i) => (
            <div key={i} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
              {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-12 w-12 object-contain rounded-lg border border-slate-100 flex-shrink-0" /> : <div className="h-12 w-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0"><ImagePlus size={16} /></div>}
              <div className="flex-1 grid sm:grid-cols-2 gap-2">
                <input className="input" value={s.name} onChange={e => setC(v => ({ ...v, sponsors: v.sponsors.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} placeholder="Sponsor name" />
                <input className="input" value={s.url} onChange={e => setC(v => ({ ...v, sponsors: v.sponsors.map((x, j) => j === i ? { ...x, url: e.target.value } : x) }))} placeholder="https://…" />
              </div>
              <label className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">Logo<input type="file" accept="image/*" className="hidden" onChange={e => sponLogo(i, e.target.files?.[0])} /></label>
              <button onClick={() => setC(v => ({ ...v, sponsors: v.sponsors.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </section>

      {/* Contact + socials */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-3">Contact &amp; social</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">Email</label><input className="input" value={c.contact.email} onChange={e => setC(v => ({ ...v, contact: { ...v.contact, email: e.target.value } }))} placeholder="info@…" /></div>
          <div><label className="label">Phone</label><input className="input" value={c.contact.phone} onChange={e => setC(v => ({ ...v, contact: { ...v.contact, phone: e.target.value } }))} placeholder="(555) 555-5555" /></div>
          <div><label className="label">Hours</label><input className="input" value={c.contact.hours} onChange={e => setC(v => ({ ...v, contact: { ...v.contact, hours: e.target.value } }))} placeholder="Mon–Fri 9–5" /></div>
          <div><label className="label">Address</label><input className="input" value={c.contact.address} onChange={e => setC(v => ({ ...v, contact: { ...v.contact, address: e.target.value } }))} placeholder="City, State" /></div>
          <div><label className="label">Facebook URL</label><input className="input" value={c.socials.facebook} onChange={e => setC(v => ({ ...v, socials: { ...v.socials, facebook: e.target.value } }))} placeholder="https://facebook.com/…" /></div>
          <div><label className="label">Instagram URL</label><input className="input" value={c.socials.instagram} onChange={e => setC(v => ({ ...v, socials: { ...v.socials, instagram: e.target.value } }))} placeholder="https://instagram.com/…" /></div>
          <div className="sm:col-span-2"><label className="label">Website URL</label><input className="input" value={c.socials.website} onChange={e => setC(v => ({ ...v, socials: { ...v.socials, website: e.target.value } }))} placeholder="https://…" /></div>
        </div>
      </section>
    </div>
  )
}
