'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, Upload, Trash2, Link2, ExternalLink, ImageIcon, FileText, Map, Megaphone, Library, Check } from 'lucide-react'

type Asset = { id: string; name: string; url: string; category: string; mime?: string; createdAt?: string }

const CATEGORIES: { key: string; label: string; icon: any; hint: string }[] = [
  { key: 'logos', label: 'Logos', icon: ImageIcon, hint: 'Org logo variants, sponsor & partner marks, team crests, sanctioning bodies' },
  { key: 'documents', label: 'Documents', icon: FileText, hint: 'Rules PDFs, waivers, refund/weather policy, parking & sponsor packets' },
  { key: 'maps', label: 'Maps', icon: Map, hint: 'Field/venue maps and parking maps' },
  { key: 'promo', label: 'Promo', icon: Megaphone, hint: 'Event flyers, banners, and social share (OG) images' },
]
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]))
const uid = () => (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)))
const isImg = (a: Asset) => (a.mime || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(a.url)

// Downscale large images before upload (logos/promo). Non-images pass through.
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.size < 400 * 1024) return resolve(file)
    const img = new Image()
    img.onload = () => {
      const maxDim = 1600
      let { width, height } = img
      if (width > maxDim || height > maxDim) { const s = maxDim / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s) }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d'); if (!ctx) return resolve(file)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(b => resolve(b || file), 'image/jpeg', 0.85)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

function AssetsInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role
  const sp = useSearchParams()
  const qOrg = sp.get('org') || ''
  const apiQ = qOrg ? `?org=${encodeURIComponent(qOrg)}` : ''
  const [orgName, setOrgName] = useState(sp.get('name') || '')
  const [items, setItems] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [uploadCat, setUploadCat] = useState('logos')
  const [copied, setCopied] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (role !== 'director' && role !== 'admin') { router.replace('/'); return }
    ;(async () => {
      try {
        if (!qOrg) { const o = await fetch('/api/org').then(r => r.ok ? r.json() : null); if (o) setOrgName(o.name) }
        const d = await fetch(`/api/org-assets${apiQ}`).then(r => r.ok ? r.json() : { items: [] })
        setItems(Array.isArray(d.items) ? d.items : [])
      } catch {} finally { setLoading(false) }
    })()
  }, [status, session, role])

  async function persist(next: Asset[]) {
    setItems(next)
    try {
      const res = await fetch(`/api/org-assets${apiQ}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: next }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Save failed') }
    } catch { toast.error('Save failed') }
  }

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    const added: Asset[] = []
    try {
      for (const file of Array.from(files)) {
        try {
          const blob = await compressImage(file)
          const fd = new FormData(); fd.append('file', blob, file.name)
          const r = await fetch('/api/upload', { method: 'POST', body: fd })
          const d = await r.json()
          if (d.url) added.push({ id: uid(), name: file.name.replace(/\.[^.]+$/, ''), url: d.url, category: uploadCat, mime: file.type, createdAt: new Date().toISOString() })
        } catch {}
      }
      if (added.length) { await persist([...added, ...items]); toast.success(`${added.length} added`) }
      else toast.error('Upload failed')
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const rename = (id: string, name: string) => setItems(s => s.map(x => x.id === id ? { ...x, name } : x))
  const recat = (id: string, category: string) => { const next = items.map(x => x.id === id ? { ...x, category } : x); persist(next) }
  const del = (id: string) => { if (!window.confirm('Delete this asset?')) return; persist(items.filter(x => x.id !== id)) }
  function copyLink(a: Asset) { const abs = a.url.startsWith('http') ? a.url : `${location.origin}${a.url}`; navigator.clipboard?.writeText(abs); setCopied(a.id); setTimeout(() => setCopied(''), 1500) }

  const shown = items.filter(a => (filter === 'all' || a.category === filter) && (!search.trim() || (a.name || '').toLowerCase().includes(search.toLowerCase())))
  const counts = CATEGORIES.reduce((m, c) => { m[c.key] = items.filter(a => a.category === c.key).length; return m }, {} as Record<string, number>)

  if (status === 'loading' || loading) return <div className="p-10 text-center text-slate-400">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Toaster position="top-right" />
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Home</Link>
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><Library size={22} className="text-teal-600" /> Brand &amp; media library{orgName ? <span className="text-slate-300 font-normal">· {orgName}</span> : null}</h1>
      <p className="text-sm text-slate-500 mb-5">Upload logos, documents, maps, and promo graphics once and reuse them anywhere across your event pages — every image and file picker can pull from here.</p>

      {/* Upload */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Add to</label>
            <select value={uploadCat} onChange={e => setUploadCat(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50">
            <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload files'}
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={e => onFiles(e.target.files)} />
          <p className="text-xs text-slate-400 flex-1 min-w-[200px]">{CATEGORIES.find(c => c.key === uploadCat)?.hint}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setFilter('all')} className={`text-xs rounded-full px-3 py-1.5 border ${filter === 'all' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>All <span className="opacity-70">· {items.length}</span></button>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)} className={`text-xs rounded-full px-3 py-1.5 border inline-flex items-center gap-1 ${filter === c.key ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}><c.icon size={12} /> {c.label} <span className="opacity-70">· {counts[c.key]}</span></button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="ml-auto border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
      </div>

      {/* Grid */}
      {shown.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          {items.length === 0 ? 'No assets yet — upload your logos, documents, maps, and promo graphics above.' : 'Nothing matches that filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {shown.map(a => (
            <div key={a.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
              <a href={a.url} target="_blank" rel="noreferrer" className="aspect-[4/3] bg-slate-50 flex items-center justify-center overflow-hidden border-b border-slate-100">
                {isImg(a) ? <img src={a.url} alt={a.name} className="w-full h-full object-contain p-2" /> : <FileText size={36} className="text-slate-300" />}
              </a>
              <div className="p-2.5 flex flex-col gap-2 flex-1">
                <input value={a.name} onChange={e => rename(a.id, e.target.value)} onBlur={() => persist(items)} className="text-sm font-medium text-slate-800 w-full border-0 border-b border-transparent hover:border-slate-200 focus:border-teal-400 focus:outline-none px-0 py-0.5" />
                <div className="flex items-center justify-between gap-1 mt-auto">
                  <select value={a.category} onChange={e => recat(a.id, e.target.value)} className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-600">
                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => copyLink(a)} title="Copy link" className="text-slate-400 hover:text-teal-600">{copied === a.id ? <Check size={15} className="text-green-600" /> : <Link2 size={15} />}</button>
                    <a href={a.url} target="_blank" rel="noreferrer" title="Open" className="text-slate-400 hover:text-teal-600"><ExternalLink size={15} /></a>
                    <button onClick={() => del(a.id)} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AssetsPage() {
  return <Suspense fallback={<div className="p-10 text-center text-slate-400">Loading…</div>}><AssetsInner /></Suspense>
}
