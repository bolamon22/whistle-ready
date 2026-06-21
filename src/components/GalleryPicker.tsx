'use client'
import { useState } from 'react'
import { Images, X } from 'lucide-react'

type GPhoto = { id?: string; url: string; caption?: string }

// Reusable "Choose from gallery" control: loads the org's photo gallery
// (from /api/org-site) in a modal and hands the chosen image URL back.
export default function GalleryPicker({ onPick, label = 'Choose from gallery', triggerClassName }: { onPick: (url: string) => void; label?: string; triggerClassName?: string }) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<GPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    setOpen(true); setLoading(true); setErr('')
    try {
      const d = await fetch('/api/org-site').then(r => r.ok ? r.json() : {})
      const g: GPhoto[] = Array.isArray(d.gallery) ? d.gallery : []
      setPhotos(g)
      if (!g.length) setErr('No photos in your gallery yet — add some under Website → Photo gallery.')
    } catch { setErr('Could not load the gallery.') } finally { setLoading(false) }
  }

  return (
    <>
      <button type="button" onClick={load} className={triggerClassName || 'text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5'}><Images size={15} /> {label}</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">Choose from photo gallery</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              {loading ? <p className="text-slate-400 text-center py-10">Loading…</p>
                : err ? <p className="text-slate-500 text-center py-10">{err}</p>
                  : <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {photos.map((p, i) => (
                        <button key={p.id || i} type="button" onClick={() => { onPick(p.url); setOpen(false) }} className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:ring-2 hover:ring-teal-400 transition" title={p.caption || ''}>
                          <img src={p.url} alt={p.caption || ''} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
