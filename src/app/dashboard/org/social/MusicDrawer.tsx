'use client'
// Music library for Reels, opened from the scheduler's header (Bo, Oct 18 2026: "add an
// area up here in the header ... rather than the only spot to add it from is when it's
// open inside. Maybe I just build the library here"). Same list the Reel makers' Song
// menus read (lib/reelMusic, components/useOrgMusic): add several MP3s at once, rename,
// re-file, play, remove.
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Music, Play, Pause, Trash2, Upload, ExternalLink } from 'lucide-react'
import { useOrgMusic } from '@/components/useOrgMusic'
import { allCategories, groupTracks, titleFromFile, type OrgTrack } from '@/lib/reelMusic'

export default function MusicDrawer({ onClose }: { onClose: () => void }) {
  const music = useOrgMusic()
  const [cat, setCat] = useState<string>('champions')
  const [queue, setQueue] = useState<string[]>([])           // file names still uploading
  const [playing, setPlaying] = useState('')
  const [confirmDel, setConfirmDel] = useState('')
  const [newCat, setNewCat] = useState<string | null>(null)   // typing a new category's name
  const [confirmCat, setConfirmCat] = useState('')
  const cats = allCategories(music.categories)
  async function addCat() {
    const label = (newCat || '').trim()
    if (!label) return
    try { const c = await music.addCategory(label); setCat(c.id); setNewCat(null); toast.success(`Added "${c.label}"`) } catch (e: any) { toast.error(e.message) }
  }
  async function removeCat(id: string) {
    try { await music.removeCategory(id); if (cat === id) setCat('champions'); setConfirmCat('') } catch (e: any) { toast.error(e.message) }
  }
  const audio = useRef<HTMLAudioElement | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => () => { audio.current?.pause() }, [])   // stop the preview when the drawer closes

  async function addFiles(files: File[]) {
    const ok = files.filter(f => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav)$/i.test(f.name))
    if (ok.length < files.length) toast.error('Only MP3, M4A, AAC or WAV files')
    setQueue(q => [...q, ...ok.map(f => f.name)])
    let added = 0
    for (const f of ok) {                                    // one at a time: each save rewrites the list
      try { await music.add(f, titleFromFile(f.name), cat); added++ }
      catch (e: any) { toast.error(`${f.name}: ${e?.message || 'upload failed'}`) }
      finally { setQueue(q => { const i = q.indexOf(f.name); return i < 0 ? q : [...q.slice(0, i), ...q.slice(i + 1)] }) }
    }
    if (added) toast.success(`Added ${added} track${added === 1 ? '' : 's'} — they're in the Song list of every Reel`)
  }
  function play(t: OrgTrack) {
    audio.current?.pause()
    if (playing === t.id) { setPlaying(''); return }
    const a = new Audio(t.url); audio.current = a; a.onended = () => setPlaying('')
    a.play().then(() => setPlaying(t.id)).catch(() => toast.error("Couldn't play that track"))
  }
  async function save(t: OrgTrack, patch: { title?: string; category?: string }) {
    if (patch.title !== undefined && (!patch.title.trim() || patch.title.trim() === t.title)) return
    try { await music.update(t.id, patch) } catch (e: any) { toast.error(e.message) }
  }
  async function del(t: OrgTrack) {
    if (playing === t.id) { audio.current?.pause(); setPlaying('') }
    try { await music.remove(t.id); setConfirmDel('') } catch (e: any) { toast.error(e.message) }
  }
  const close = () => { audio.current?.pause(); onClose() }

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-200">
        <h3 className="font-extrabold text-sm inline-flex items-center gap-2"><Music size={15} className="text-teal-700" /> Music library</h3>
        <button onClick={close} className="w-8 h-8 rounded-lg border border-slate-300 bg-white grid place-items-center text-slate-500 hover:text-slate-900" aria-label="Close"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/40 p-4 flex flex-col gap-2.5"
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files || [])) }}>
          <div className="text-sm font-bold text-teal-900">Add tracks</div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <span className="font-semibold shrink-0">File them under</span>
            <select value={newCat !== null ? '__new' : cat} onChange={e => { if (e.target.value === '__new') setNewCat(''); else { setNewCat(null); setCat(e.target.value) } }} className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold">
              {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              <option value="__new">＋ New category…</option>
            </select>
          </label>
          {newCat !== null && (
            <div className="flex gap-1.5">
              <input autoFocus value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') setNewCat(null) }} maxLength={40} placeholder="e.g. Country, Throwbacks, Walk-up songs" aria-label="New category name" className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" />
              <button type="button" onClick={addCat} disabled={!newCat.trim()} className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 disabled:opacity-40">Add</button>
              <button type="button" onClick={() => setNewCat(null)} className="text-xs text-slate-500 hover:underline px-1">Cancel</button>
            </div>
          )}
          {music.categories.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap text-[11px]">
              <span className="text-slate-500 font-semibold mr-0.5">Your categories:</span>
              {music.categories.map(c => confirmCat === c.id
                ? <span key={c.id} className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5">Remove {c.label}? Its tracks move to Other. <button type="button" onClick={() => removeCat(c.id)} className="font-bold text-rose-700 hover:underline">Remove</button> · <button type="button" onClick={() => setConfirmCat('')} className="hover:underline">Keep</button></span>
                : <span key={c.id} className="inline-flex items-center rounded-full bg-white border border-slate-300 pl-2 pr-1 py-0.5 font-semibold text-slate-700">{c.label}<button type="button" onClick={() => setConfirmCat(c.id)} aria-label={`Remove the category ${c.label}`} className="ml-0.5 text-slate-400 hover:text-rose-700"><X size={11} /></button></span>)}
            </div>
          )}
          <button type="button" onClick={() => input.current?.click()} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm py-2.5 inline-flex items-center justify-center gap-2"><Upload size={15} /> Choose MP3s (or drop them here)</button>
          <input ref={input} type="file" multiple accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/wav,audio/x-m4a,.mp3,.m4a,.wav" hidden onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) addFiles(fs) }} />
          {queue.length > 0 && <div className="text-xs text-teal-800 font-semibold">Uploading {queue.length}… {queue[0]}</div>}
          <p className="text-[11px] text-slate-500 leading-snug">
            Only music you have the rights to. Free for business use, no credit line:{' '}
            <a href="https://pixabay.com/music/search/sports/" target="_blank" rel="noreferrer" className="font-semibold text-teal-700 hover:underline inline-flex items-center gap-0.5">Pixabay Music<ExternalLink size={10} /></a>. The music is mixed into the video, so it plays on Facebook too.
          </p>
        </div>

        {!music.tracks.length && !queue.length && <p className="text-sm text-slate-500 text-center py-4">No tracks yet. Add some above; the ten built-in tracks are always there too.</p>}
        {groupTracks(music.tracks, music.categories).map(g => (
          <div key={g.label}>
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">{g.label} · {g.tracks.length}</div>
            <div className="flex flex-col gap-1.5">
              {g.tracks.map(t => (
                <div key={t.id} className={`rounded-xl border px-2 py-1.5 flex items-center gap-2 ${playing === t.id ? 'border-teal-400 bg-teal-50/50' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => play(t)} className="w-8 h-8 rounded-full bg-slate-800 text-white grid place-items-center flex-none" aria-label={playing === t.id ? `Pause ${t.title}` : `Play ${t.title}`}>{playing === t.id ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}</button>
                  <input defaultValue={t.title} key={t.title} maxLength={80} aria-label="Track name" onBlur={e => save(t, { title: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="flex-1 min-w-0 rounded-lg border border-transparent hover:border-slate-200 focus:border-teal-400 px-1.5 py-1 text-sm font-semibold focus:outline-none" />
                  <select value={t.category} onChange={e => save(t, { category: e.target.value })} aria-label="Category" className="w-[118px] flex-none rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600">
                    {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  {confirmDel === t.id
                    ? <span className="flex-none flex items-center gap-1 text-[11px]"><button type="button" onClick={() => del(t)} className="font-bold text-rose-700 hover:underline">Remove</button><button type="button" onClick={() => setConfirmDel('')} className="text-slate-500 hover:underline">Keep</button></span>
                    : <button type="button" onClick={() => setConfirmDel(t.id)} className="w-7 h-7 flex-none rounded-lg grid place-items-center text-slate-400 hover:text-rose-700 hover:bg-rose-50" aria-label={`Remove ${t.title}`}><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {music.tracks.length > 0 && <p className="text-[11px] text-slate-500">Removing a track doesn't change Reels already made with it.</p>}
      </div>
    </>
  )
}
