'use client'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ExternalLink, FileCheck2, FileText, Lock, Upload } from 'lucide-react'

// The W-9 card on a staff member's portal (Bo, Oct 11 2026: a ref asked for "a place
// to upload the W-9" rather than emailing it). Server side: /api/staff-portal/w9 and
// lib/staffW9 (encrypted, director-only). Photos are shrunk to a JPEG here first, so a
// 4 MB phone picture goes up as a few hundred KB that is still easy to read.

type Status = { onFile: boolean; uploadedAt: string | null; name: string | null }
const MAX_BYTES = 2 * 1024 * 1024   // W9_MAX_BYTES in lib/staffW9 (server-only file)
const MAX_SIDE = 2200                // ~200 dpi across a letter page
const IRS_FORM = 'https://www.irs.gov/pub/irs-pdf/fw9.pdf'

function photoToJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k))
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)   // a see-through PNG turns white, not black
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      c.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')) }
    img.src = url
  })
}

const fmtDay = (iso: string | null) => {
  const d = iso ? new Date(iso) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}

export default function StaffW9Card() {
  const [st, setSt] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/staff-portal/w9', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.onFile === 'boolean') setSt({ onFile: d.onFile, uploadedAt: d.uploadedAt ?? null, name: d.name ?? null }) })
      .catch(() => {})
  }, [])

  async function upload(file: File) {
    setError('')
    let body: Blob = file
    let name = file.name || 'W-9'
    if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
      if (file.size > MAX_BYTES) { setError('That PDF is over 2 MB. Upload a photo of the signed form instead.'); return }
    } else if (/^image\//.test(file.type) || !file.type) {
      try { body = await photoToJpeg(file); name = name.replace(/\.[^.]+$/, '') + '.jpg' }
      catch { setError('That photo couldn’t be read. Upload a PDF, or a JPG or PNG photo.'); return }
    } else {
      setError('Upload the W-9 as a PDF or a photo (JPG or PNG).'); return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', body, name)
      const r = await fetch('/api/staff-portal/w9', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'That didn’t upload. Please try again.'); return }
      setSt({ onFile: true, uploadedAt: j.uploadedAt ?? new Date().toISOString(), name: j.name ?? name })
      toast.success('W-9 uploaded. Thank you!')
    } catch {
      setError('That didn’t upload. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  if (!st) return null
  const picker = (
    <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" data-testid="w9-input"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
  )
  const privacy = (
    <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1.5"><Lock size={11} className="shrink-0" /> Stored encrypted. Only our tournament directors can open it.</p>
  )
  const err = error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>

  if (st.onFile) return (
    <div className="rounded-2xl border border-gray-200 bg-white card p-4 mb-5" data-testid="w9-card">
      {picker}
      <div className="flex items-center gap-3">
        <FileCheck2 size={20} className="text-emerald-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-800">W-9 on file</p>
          <p className="text-xs text-gray-500 truncate">{[st.uploadedAt ? `Uploaded ${fmtDay(st.uploadedAt)}` : '', st.name || ''].filter(Boolean).join(' · ') || 'Thank you'}</p>
        </div>
        <button onClick={() => input.current?.click()} disabled={busy}
          className="shrink-0 text-xs font-semibold text-teal-700 hover:text-teal-900 disabled:opacity-50">{busy ? 'Uploading…' : 'Replace'}</button>
      </div>
      {err}
      {privacy}
    </div>
  )

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 card p-4 mb-5" data-testid="w9-card">
      {picker}
      <div className="flex items-start gap-3">
        <FileText size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800">W-9 needed</p>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">We need a completed W-9 before your first paycheck. Upload the signed form as a PDF or a photo.</p>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <button onClick={() => input.current?.click()} disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60">
          <Upload size={15} /> {busy ? 'Uploading…' : 'Upload W-9'}
        </button>
        <a href={IRS_FORM} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900">
          Blank W-9 from the IRS <ExternalLink size={12} />
        </a>
      </div>
      {err}
      {privacy}
    </div>
  )
}
