'use client'
import { useState } from 'react'
import { Images, X, FileText } from 'lucide-react'

type Item = { url: string; name?: string; category: string; img: boolean }

const CAT_LABEL: Record<string, string> = { photos: 'Photos', logos: 'Logos', documents: 'Documents', maps: 'Maps', promo: 'Promo' }
const CAT_ORDER = ['photos', 'logos', 'promo', 'maps', 'documents']
const looksImg = (url: string, mime?: string) => (mime || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url || '')

// Reusable "Choose from your library" control. Pulls BOTH the photo gallery
// (action shots) and the brand & media library (logos, documents, maps, promo)
// so any image/file field can reference a stored asset. `accept` defaults to
// 'image' (hides documents); pass 'any' for file fields like field maps.
export default function GalleryPicker({ onPick, label = 'Choose from library', triggerClassName, accept = 'image' }: { onPick: (url: string) => void; label?: string; triggerClassName?: string; accept?: 'image' | 'any' }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [cat, setCat] = useState('all')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    setOpen(true); setLoading(true); setErr(''); setCat('all')
    try {
      const [site, assets] = await Promise.all([
        fetch('/api/org-site').then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch('/api/org-assets').then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      ])
      const photos: Item[] = (Array.isArray(site.gallery) ? site.gallery : []).map((p: any) => ({ url: p.url, name: p.caption, category: 'photos', img: true }))
      const lib: Item[] = (Array.isArray(assets.items) ? assets.items : []).map((a: any) => ({ url: a.url, name: a.name, category: a.category || 'logos', img: looksImg(a.url, a.mime) }))
      let all = [...lib, ...photos]
      if (accept === 'image') all = all.filter(i => i.img)
      setItems(all)
      if (!all.length) setErr('Nothing in your library yet — add logos under the Brand & media library, or photos under Website → Photo gallery.')
    } catch { setErr('Could not load your library.') } finally { setLoading(false) }
  }

  const cats = CAT_ORDER.filter(k => items.some(i => i.category === k))
  const shown = cat === 'all' ? items : items.filter(i => i.category === cat)

  return (
    <>
      <button type="button" onClick={load} className={triggerClassName || 'text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5'}><Images size={15} /> {label}</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">Choose from your library</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            {!loading && !err && cats.length > 1 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                <button onClick={() => setCat('all')} className={`text-xs rounded-full px-2.5 py-1 border ${cat === 'all' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>All</button>
                {cats.map(k => <button key={k} onClick={() => setCat(k)} className={`text-xs rounded-full px-2.5 py-1 border ${cat === k ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{CAT_LABEL[k] || k}</button>)}
              </div>
            )}
            <div className="p-4 overflow-y-auto">
              {loading ? <p className="text-slate-400 text-center py-10">Loading…</p>
                : err ? <p className="text-slate-500 text-center py-10">{err}</p>
                  : <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {shown.map((it, i) => (
                        <button key={it.url + i} type="button" onClick={() => { onPick(it.url); setOpen(false) }} className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:ring-2 hover:ring-teal-400 transition flex flex-col items-center justify-center bg-slate-50" title={it.name || ''}>
                          {it.img ? <img src={it.url} alt={it.name || ''} className="w-full h-full object-contain p-1" /> : <><FileText size={28} className="text-slate-300" /><span className="text-[10px] text-slate-500 px-1 truncate w-full text-center mt-1">{it.name}</span></>}
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
