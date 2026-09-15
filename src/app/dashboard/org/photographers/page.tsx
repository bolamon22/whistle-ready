'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, ChevronDown, ChevronUp, Plus, Trash2, Save, ExternalLink, ImagePlus, Camera } from 'lucide-react'
import GalleryPicker from '@/components/GalleryPicker'
import { DEFAULT_PACKAGES, slugify } from '@/lib/photographers'
import { mediaConfig, commitmentLines } from '@/lib/mediaForm'
import { Instagram } from 'lucide-react'

type Pkg = { id: string; name: string; price: number; note: string }
type Ph = {
  slug: string; name: string; business: string; location: string; bio: string
  avatarUrl: string; coverUrl: string; website: string; instagram: string; bookingEmail: string
  eventIds: string[]; packages: Pkg[]; samples: string[]; active: boolean
}

const BLANK: Ph = {
  slug: '', name: '', business: '', location: '', bio: '',
  avatarUrl: '', coverUrl: '', website: '', instagram: '', bookingEmail: '',
  eventIds: [], packages: DEFAULT_PACKAGES.map(p => ({ ...p })), samples: [], active: true,
}

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500'
const lbl = 'block text-[12px] font-semibold text-slate-600 mb-1'

async function upload(file: File): Promise<string | null> {
  try {
    const fd = new FormData(); fd.append('file', file, file.name || 'upload.jpg')
    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!r.ok) return null
    const d = await r.json().catch(() => ({})); return d.url || null
  } catch { return null }
}

export default function PhotographersAdmin() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [list, setList] = useState<Ph[]>([])
  const [events, setEvents] = useState<{ id: string; name: string }[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // POST /api/org-forms REPLACES the record, so the untouched vendor/player/staff
  // config has to be carried along or it is wiped.
  const [forms, setForms] = useState<any>({})
  const [media, setMedia] = useState(() => mediaConfig({}))
  const [savingMedia, setSavingMedia] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    const role = (session?.user as any)?.role
    if (role !== 'director' && role !== 'admin') { router.replace('/'); return }
    fetch('/api/photographers').then(r => r.ok ? r.json() : []).then(d => {
      setList(Array.isArray(d) ? d.map((x: any) => ({ ...BLANK, ...x, packages: Array.isArray(x.packages) && x.packages.length ? x.packages : BLANK.packages, eventIds: Array.isArray(x.eventIds) ? x.eventIds : [], samples: Array.isArray(x.samples) ? x.samples : [] })) : [])
    }).catch(() => {}).finally(() => setLoading(false))
    fetch('/api/org-forms').then(r => r.ok ? r.json() : {}).then((d: any) => {
      setForms(d && typeof d === 'object' ? d : {})
      setMedia(mediaConfig((d || {}).media))
    }).catch(() => {})
    fetch('/api/tournaments').then(r => r.ok ? r.json() : []).then(t => {
      setEvents(Array.isArray(t) ? t.map((x: any) => ({ id: String(x.id), name: String(x.name || '') })) : [])
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const upd = (i: number, patch: Partial<Ph>) => setList(v => v.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const updPkg = (i: number, j: number, patch: Partial<Pkg>) =>
    setList(v => v.map((x, k) => (k === i ? { ...x, packages: x.packages.map((p, m) => (m === j ? { ...p, ...patch } : p)) } : x)))

  const move = (from: number, to: number) => setList(v => {
    if (to < 0 || to >= v.length || from === to) return v
    const a = [...v]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a
  })

  async function save() {
    setSaving(true)
    try {
      // The slug is the public URL, so fill it in from the name rather than
      // letting a blank one collapse everyone onto the same page.
      const clean = list.map(p => ({ ...p, slug: slugify(p.slug || p.business || p.name) }))
      const r = await fetch('/api/photographers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean) })
      if (r.ok) { setList(clean); toast.success('Saved') }
      else toast.error((await r.json().catch(() => ({}))).error || 'Could not save')
    } catch { toast.error('Could not save') } finally { setSaving(false) }
  }

  async function saveMedia() {
    setSavingMedia(true)
    try {
      const next = { ...forms, media: { ...(forms.media || {}), notifyEmail: media.notifyEmail, commitments: media.commitments } }
      const r = await fetch('/api/org-forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      if (r.ok) { setForms(next); toast.success('Saved') }
      else toast.error((await r.json().catch(() => ({}))).error || 'Could not save')
    } catch { toast.error('Could not save') } finally { setSavingMedia(false) }
  }
  const setCom = (patch: Partial<typeof media.commitments>) => setMedia(m => ({ ...m, commitments: { ...m.commitments, ...patch } }))

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Loading…</div>

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <Toaster position="top-right" />
      <div className="max-w-3xl mx-auto">
        <Link href="/dashboard/org/site" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-4"><ChevronLeft size={15} /> Back to site</Link>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Photographers</h1>
            <p className="text-sm text-slate-500">Who appears on your Book photo & video page.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setList(v => [...v, { ...BLANK, packages: DEFAULT_PACKAGES.map(p => ({ ...p })) }]); setOpen(list.length) }}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-white inline-flex items-center gap-1.5"><Plus size={14} /> Add</button>
            <button onClick={save} disabled={saving}
              className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 inline-flex items-center gap-1.5"><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>

        {/* The trade. A credential is free because it buys content and reach — saying
            that in numbers beats chasing people for photos after the event. */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-semibold text-slate-800">What we ask photographers for</h2>
            <button onClick={saveMedia} disabled={savingMedia}
              className="text-xs font-semibold border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              {savingMedia ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-4">Shown on the Shoot with us page and repeated in the application and the confirmation email.</p>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Minimum photos</label>
              <input className={input} type="number" min={0} value={media.commitments.minPhotos}
                onChange={e => setCom({ minPhotos: Math.max(0, Number(e.target.value) || 0) })} />
            </div>
            <div>
              <label className={lbl}>Within (days)</label>
              <input className={input} type="number" min={0} value={media.commitments.withinDays}
                onChange={e => setCom({ withinDays: Math.max(0, Number(e.target.value) || 0) })} />
            </div>
            <div>
              <label className={lbl}>Your Instagram</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                <input className={`${input} pl-6`} value={media.commitments.socialHandle} placeholder="seglacrosse"
                  onChange={e => setCom({ socialHandle: e.target.value.replace(/^@/, '') })} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-3">
            <label className="text-sm text-slate-600 inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-teal-600" checked={media.commitments.tagRequired}
                onChange={e => setCom({ tagRequired: e.target.checked })} /> Tag us in their posts
            </label>
            <label className="text-sm text-slate-600 inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-teal-600" checked={media.commitments.collabRequired}
                onChange={e => setCom({ collabRequired: e.target.checked })} /> Accept Instagram Collab invites
            </label>
          </div>

          <div className="mt-3">
            <label className={lbl}>Anything else <span className="font-normal text-slate-400">one per line</span></label>
            <textarea className={`${input} min-h-[56px]`} value={media.commitments.extra.join('\n')}
              onChange={e => setCom({ extra: e.target.value.split('\n') })}
              placeholder="Send us one clip for reels&#10;Credit the event in captions" />
          </div>

          <div className="mt-3">
            <label className={lbl}>Where credential applications land</label>
            <input className={input} value={media.notifyEmail} placeholder="Defaults to your org contact email"
              onChange={e => setMedia(m => ({ ...m, notifyEmail: e.target.value }))} />
          </div>

          {commitmentLines(media.commitments).length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">They will see</div>
              <ul className="space-y-1">
                {commitmentLines(media.commitments).map((c, i) => (
                  <li key={i} className="text-[13.5px] text-slate-600 flex gap-2">
                    <span className="text-teal-600">&bull;</span><span>{c}</span>
                  </li>
                ))}
              </ul>
              {media.commitments.socialHandle && (
                <p className="text-xs text-slate-400 mt-2.5 inline-flex items-center gap-1.5">
                  <Instagram size={12} /> A Collab post runs on both grids and shares its likes &mdash; their name, your reach.
                </p>
              )}
            </div>
          )}
        </div>

        {list.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
            <Camera size={30} className="mx-auto mb-2" />No photographers yet. Add one.
          </div>
        )}

        <div className="space-y-3">
          {list.map((p, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 p-3">
                <div className="flex flex-col text-slate-300">
                  <button onClick={() => move(i, i - 1)} disabled={i === 0} className="hover:text-slate-600 disabled:opacity-30"><ChevronUp size={14} /></button>
                  <button onClick={() => move(i, i + 1)} disabled={i === list.length - 1} className="hover:text-slate-600 disabled:opacity-30"><ChevronDown size={14} /></button>
                </div>
                {p.avatarUrl
                  ? <img src={p.avatarUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  : <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400"><ImagePlus size={15} /></div>}
                <button onClick={() => setOpen(open === i ? null : i)} className="flex-1 text-left min-w-0">
                  <span className="block font-semibold text-slate-800 truncate">{p.business || p.name || 'Untitled'}</span>
                  <span className="block text-xs text-slate-400 truncate">/photographers/{p.slug || slugify(p.business || p.name) || '…'}{p.active ? '' : ' · hidden'}</span>
                </button>
                <label className="text-xs text-slate-500 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <input type="checkbox" className="accent-teal-600" checked={p.active} onChange={e => upd(i, { active: e.target.checked })} /> Live
                </label>
                <button onClick={() => { setList(v => v.filter((_, j) => j !== i)); setOpen(null) }} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                <button onClick={() => setOpen(open === i ? null : i)} className="text-slate-400 p-1"><ChevronDown size={16} className={`transition-transform ${open === i ? 'rotate-180' : ''}`} /></button>
              </div>

              {open === i && (
                <div className="px-3 pb-4 border-t border-slate-100 pt-4 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><label className={lbl}>Business name</label><input className={input} value={p.business} onChange={e => upd(i, { business: e.target.value })} placeholder="Coyote Magic Photography" /></div>
                    <div><label className={lbl}>Person</label><input className={input} value={p.name} onChange={e => upd(i, { name: e.target.value })} placeholder="Larry Palumbo" /></div>
                    <div><label className={lbl}>Booking email <span className="font-normal text-slate-400">requests go here</span></label><input className={input} value={p.bookingEmail} onChange={e => upd(i, { bookingEmail: e.target.value })} /></div>
                    <div><label className={lbl}>Location</label><input className={input} value={p.location} onChange={e => upd(i, { location: e.target.value })} placeholder="Wellington, FL" /></div>
                    <div><label className={lbl}>Website</label><input className={input} value={p.website} onChange={e => upd(i, { website: e.target.value })} /></div>
                    <div><label className={lbl}>Instagram <span className="font-normal text-slate-400">handle</span></label><input className={input} value={p.instagram} onChange={e => upd(i, { instagram: e.target.value })} placeholder="coyotemagiclax" /></div>
                  </div>
                  <div>
                    <label className={lbl}>URL <span className="font-normal text-slate-400">what people will share &mdash; changing it breaks old links</span></label>
                    <div className="flex items-center gap-1 text-sm text-slate-400">
                      <span className="whitespace-nowrap">/photographers/</span>
                      <input className={input} value={p.slug} onChange={e => upd(i, { slug: slugify(e.target.value) })}
                        placeholder={slugify(p.business || p.name) || 'coyote-magic-photography'} />
                    </div>
                  </div>
                  <div><label className={lbl}>Bio</label><textarea className={`${input} min-h-[70px]`} value={p.bio} onChange={e => upd(i, { bio: e.target.value })} placeholder="One short paragraph — who they are and what they shoot." /></div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Headshot / logo</label>
                      <div className="flex items-center gap-2">
                        <label className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const u = await upload(f); u ? upd(i, { avatarUrl: u }) : toast.error('Upload failed') }} /></label>
                        <GalleryPicker label="Library" triggerClassName="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1" onPick={u => upd(i, { avatarUrl: u })} />
                        {p.avatarUrl && <button onClick={() => upd(i, { avatarUrl: '' })} className="text-xs text-slate-400 hover:text-red-600">Clear</button>}
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>Cover photo</label>
                      <div className="flex items-center gap-2">
                        <label className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const u = await upload(f); u ? upd(i, { coverUrl: u }) : toast.error('Upload failed') }} /></label>
                        <GalleryPicker label="Library" triggerClassName="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1" onPick={u => upd(i, { coverUrl: u })} />
                        {p.coverUrl && <button onClick={() => upd(i, { coverUrl: '' })} className="text-xs text-slate-400 hover:text-red-600">Clear</button>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Sample photos <span className="font-normal text-slate-400">up to 6, from your gallery</span></label>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.samples.map((u, j) => (
                        <span key={j} className="relative">
                          <img src={u} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                          <button onClick={() => upd(i, { samples: p.samples.filter((_, m) => m !== j) })}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-red-600 text-xs leading-none">×</button>
                        </span>
                      ))}
                      {p.samples.length < 6 && <GalleryPicker label="+ Add" triggerClassName="text-xs border border-dashed border-slate-300 rounded-lg w-14 h-14 text-slate-500 hover:bg-slate-50 inline-flex items-center justify-center" onPick={u => upd(i, { samples: [...p.samples, u] })} />}
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Packages <span className="font-normal text-slate-400">leave a price at 0 to show &ldquo;Ask&rdquo;</span></label>
                    <div className="space-y-2">
                      {p.packages.map((pk, j) => (
                        <div key={j} className="flex gap-2">
                          <input className={`${input} flex-1`} value={pk.name} placeholder="Player package" onChange={e => updPkg(i, j, { name: e.target.value })} />
                          <input className={`${input} w-24 tabular-nums`} type="number" min={0} step={25} value={pk.price} onChange={e => updPkg(i, j, { price: Math.max(0, Number(e.target.value) || 0) })} />
                          <button onClick={() => upd(i, { packages: p.packages.filter((_, m) => m !== j) })} className="w-9 text-slate-400 hover:text-red-600"><Trash2 size={14} className="mx-auto" /></button>
                        </div>
                      ))}
                      <button onClick={() => upd(i, { packages: [...p.packages, { id: `pkg-${p.packages.length + 1}`, name: '', price: 0, note: '' }] })}
                        className="text-sm font-semibold text-teal-700 hover:text-teal-900">+ Add a package</button>
                    </div>
                    <div className="space-y-2 mt-2">
                      {p.packages.map((pk, j) => (
                        <input key={j} className={input} value={pk.note} placeholder={`What "${pk.name || 'this package'}" includes`} onChange={e => updPkg(i, j, { note: e.target.value })} />
                      ))}
                    </div>
                  </div>

                  {events.length > 0 && (
                    <div>
                      <label className={lbl}>Events they shoot <span className="font-normal text-slate-400">none ticked = offered at every event</span></label>
                      <div className="flex flex-wrap gap-2">
                        {events.map(ev => {
                          const on = p.eventIds.includes(ev.id)
                          return (
                            <button key={ev.id} type="button"
                              onClick={() => upd(i, { eventIds: on ? p.eventIds.filter(x => x !== ev.id) : [...p.eventIds, ev.id] })}
                              className={`text-xs rounded-full px-3 py-1.5 border ${on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
                              {ev.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {p.slug && (
                    <a href={`/o/${(session?.user as any)?.orgSlug || ''}/photographers/${p.slug}`} target="_blank" rel="noreferrer"
                      className="text-xs text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><ExternalLink size={12} /> Preview page</a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {list.length > 0 && (
          <div className="flex justify-end mt-4">
            <button onClick={save} disabled={saving}
              className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 inline-flex items-center gap-1.5"><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
