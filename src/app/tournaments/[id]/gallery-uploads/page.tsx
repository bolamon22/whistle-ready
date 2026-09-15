'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import TournamentNav from '../TournamentNav'
import { Images, Check, EyeOff, Trash2, Film, Loader2, CheckSquare, Square } from 'lucide-react'

// What photographers sent in, and whether it goes on the website.
//
// The review exists because a credential is permission to be on the field, not
// permission to publish to the front of the website. These are photographs of
// other people's children; somebody looks at each frame before the public can.
//
// Built for volume rather than for one photo at a time: select-all, a keyboard-free
// two-click publish, and paging, because the realistic batch is several hundred
// after a weekend and not the six you test with.

type Item = {
  id: string
  url: string
  kind: 'photo' | 'video'
  caption: string
  credit: string
  status: 'pending' | 'published' | 'hidden'
  createdAt: string
}

const TABS: { key: 'pending' | 'published' | 'hidden'; label: string }[] = [
  { key: 'pending', label: 'Needs review' },
  { key: 'published', label: 'Live' },
  { key: 'hidden', label: 'Not used' },
]

export default function GalleryUploads() {
  const { id } = useParams() as { id: string }
  const [name, setName] = useState('Tournament')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [tab, setTab] = useState<'pending' | 'published' | 'hidden'>('pending')
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [pending, setPending] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/tournaments/${id}`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined) } }).catch(() => {})
  }, [id])

  const load = useCallback((status: string, offset = 0) => {
    setLoading(true)
    fetch(`/api/tournaments/${id}/gallery-uploads?status=${status}&offset=${offset}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return
        setItems(prev => (offset ? [...prev, ...(d.items || [])] : d.items || []))
        setTotal(d.total || 0)
        setPending(d.pending || 0)
        setNextOffset(d.nextOffset ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { setSel(new Set()); load(tab, 0) }, [tab, load])

  const toggle = (k: string) => setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const allSelected = items.length > 0 && sel.size === items.length
  const selectAll = () => setSel(allSelected ? new Set() : new Set(items.map(i => i.id)))

  async function act(action: 'publish' | 'hide' | 'delete') {
    const ids = [...sel]
    if (!ids.length) return
    if (action === 'delete' && !confirm(`Delete ${ids.length} file${ids.length === 1 ? '' : 's'}?\n\nThis removes them from the gallery for good.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tournaments/${id}/gallery-uploads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'That did not work.'); return }
      // The acted-on rows leave this tab, so drop them rather than refetching the
      // whole page and losing the reviewer's place in a long batch.
      setItems(prev => prev.filter(i => !sel.has(i.id)))
      setTotal(t => Math.max(0, t - ids.length))
      if (tab === 'pending') setPending(p => Math.max(0, p - ids.length))
      setSel(new Set())
    } catch { alert('That did not work.') } finally { setBusy(false) }
  }

  const btn = 'text-sm font-semibold rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-50'
  const n = (x: number) => x.toLocaleString('en-US')

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <TournamentNav id={id} name={name} logoUrl={logo} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 sm:mt-6 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Photos from photographers</h1>
            <p className="text-sm text-slate-500">
              {pending > 0 ? `${n(pending)} waiting on you.` : 'Nothing waiting on you.'} Nothing reaches the public gallery until you publish it.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-semibold rounded-full px-3.5 py-1.5 border ${tab === t.key ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
              {t.label}{t.key === 'pending' && pending > 0 ? ` · ${n(pending)}` : ''}
            </button>
          ))}
        </div>

        {items.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 mb-3 flex flex-wrap items-center gap-2 sticky top-2 z-10">
            <button onClick={selectAll} className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5">
              {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
              {allSelected ? 'Clear' : 'Select all'}
            </button>
            <span className="text-sm text-slate-400">{sel.size ? `${n(sel.size)} selected` : `${n(total)} total`}</span>
            <span className="flex-1" />
            {tab !== 'published' && (
              <button onClick={() => act('publish')} disabled={!sel.size || busy} className={`${btn} bg-teal-600 hover:bg-teal-700 text-white`}>
                <Check size={14} /> Publish
              </button>
            )}
            {tab !== 'hidden' && (
              <button onClick={() => act('hide')} disabled={!sel.size || busy} className={`${btn} border border-slate-300 text-slate-600 hover:bg-slate-50`}>
                <EyeOff size={14} /> {tab === 'published' ? 'Take down' : "Don't use"}
              </button>
            )}
            <button onClick={() => act('delete')} disabled={!sel.size || busy} className={`${btn} text-red-600 hover:bg-red-50`}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}

        {loading && items.length === 0 ? (
          <p className="text-slate-400 text-center py-16"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</p>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
            <Images size={32} className="mx-auto mb-2" />
            {tab === 'pending' ? 'Nothing waiting on you.' : tab === 'published' ? 'Nothing published yet.' : 'Nothing set aside.'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {items.map(m => {
                const on = sel.has(m.id)
                return (
                  <button key={m.id} onClick={() => toggle(m.id)}
                    className={`relative rounded-xl overflow-hidden border-2 text-left transition-colors ${on ? 'border-teal-500' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="aspect-square bg-slate-100">
                      {m.kind === 'video'
                        ? <div className="w-full h-full flex items-center justify-center text-slate-400"><Film size={22} /></div>
                        : <img src={m.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                    </div>
                    <span className={`absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center ${on ? 'bg-teal-600 text-white' : 'bg-white/85 text-slate-400 border border-slate-300'}`}>
                      {on ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                    {m.credit && <span className="block px-2 py-1.5 text-[10.5px] text-slate-500 truncate">{m.credit}</span>}
                  </button>
                )
              })}
            </div>
            {nextOffset !== null && (
              <div className="mt-6 text-center">
                <button onClick={() => load(tab, nextOffset)} disabled={loading}
                  className="text-sm font-semibold border border-slate-300 rounded-lg px-5 py-2.5 text-slate-700 hover:bg-white disabled:opacity-50">
                  {loading ? 'Loading…' : `Load more — ${n(total - items.length)} left`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
