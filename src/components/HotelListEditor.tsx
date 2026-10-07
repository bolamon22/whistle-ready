'use client'

import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, ArrowUp, ArrowDown, Link2, ExternalLink, ImagePlus, Star, X, Loader2 } from 'lucide-react'
import {
  EMPTY_HOTEL, MAX_HOTELS, MAX_HOTEL_PHOTOS, parseReserveTravel, reserveTravelHotelUrl, reserveTravelProperty, hotelsPath, photoUrl,
  type EventHotel,
} from '@/lib/eventHotels'
import { uploadHotelPhoto, HOTEL_PHOTO_ACCEPT } from '@/lib/photoClient'
import GalleryPicker from '@/components/GalleryPicker'

// Builder › Hotels: the block hotels families see on the event's own pages
// (lib/eventHotels has the why). Pasting the housing company's ReserveTravel
// search link adds one row per block hotel in it, each already pointing at that
// hotel's booking page for the event dates; staff type the name, rate, distance
// and deadline the housing company gave them, and add the photos the hotel or the
// housing company sends (several at once; the first is the main photo).

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1'
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

export default function HotelListEditor({ tournamentId, hotels, onChange, bookingUrl }: {
  tournamentId: string
  hotels: EventHotel[]
  onChange: (next: EventHotel[]) => void
  /** The event's booking link, offered as the link to read hotels from. */
  bookingUrl: string
}) {
  const [link, setLink] = useState('')
  // A photo upload in progress: which hotel, how far along. Rows can't move or be
  // removed meanwhile, so the photos land on the hotel they were picked for.
  const [busy, setBusy] = useState<{ row: number; done: number; total: number } | null>(null)
  // The list as it is now, for when an upload finishes after other edits.
  const latest = useRef(hotels)
  latest.current = hotels
  // Blank box: read the booking link above, when it is a ReserveTravel search link.
  const bookingHasHotels = !!parseReserveTravel(bookingUrl)?.properties.length
  const source = link.trim() || (bookingHasHotels ? bookingUrl : '')

  const set = (i: number, patch: Partial<EventHotel>) => onChange(hotels.map((h, j) => (j === i ? { ...h, ...patch } : h)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= hotels.length) return
    const next = [...hotels]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }

  const photosOf = (h?: EventHotel) => (Array.isArray(h?.photos) ? h!.photos : [])
  const setPhotos = (i: number, photos: string[]) => set(i, { photos })

  async function addPhotos(i: number, picked: File[]) {
    const room = MAX_HOTEL_PHOTOS - photosOf(latest.current[i]).length
    const files = picked.slice(0, Math.max(0, room))
    if (picked.length > files.length) toast(`Up to ${MAX_HOTEL_PHOTOS} photos a hotel. Adding the first ${files.length}.`, { duration: 5000 })
    if (!files.length) return
    setBusy({ row: i, done: 0, total: files.length })
    // Three at a time, kept in the order they were picked.
    const urls: (string | null)[] = files.map(() => null)
    const errors: string[] = []
    let next = 0, done = 0
    const worker = async () => {
      while (next < files.length) {
        const k = next++
        try { urls[k] = await uploadHotelPhoto(files[k]) } catch (e: any) { errors.push(String(e?.message || files[k].name)) }
        done++
        setBusy({ row: i, done, total: files.length })
      }
    }
    try {
      await Promise.all([worker(), worker(), worker()])
    } finally {
      setBusy(null)
    }
    const added = urls.filter((u): u is string => !!u)
    if (added.length) {
      onChange(latest.current.map((h, j) => (j === i ? { ...h, photos: [...photosOf(h), ...added].slice(0, MAX_HOTEL_PHOTOS) } : h)))
      toast.success(`Added ${added.length} photo${added.length === 1 ? '' : 's'}. Save Changes to put ${added.length === 1 ? 'it' : 'them'} on the page.`, { duration: 5000 })
    }
    if (errors.length) toast.error(`${errors.length} photo${errors.length === 1 ? '' : 's'} didn't upload: ${errors.slice(0, 3).join('; ')}`, { duration: 8000 })
  }

  function addFromLibrary(i: number, url: string) {
    const u = photoUrl(url)
    if (!u) { toast.error("That picture can't be used here. Upload the file instead."); return }
    const have = photosOf(latest.current[i])
    if (have.includes(u)) { toast('That photo is already on this hotel'); return }
    if (have.length >= MAX_HOTEL_PHOTOS) { toast(`Up to ${MAX_HOTEL_PHOTOS} photos a hotel`); return }
    setPhotos(i, [...have, u])
  }

  function addFromLink() {
    const l = parseReserveTravel(source)
    if (!l || !l.properties.length) {
      toast.error('No hotels in that link. Open the booking link, then copy the address from the browser bar (it starts reservetravel.com).', { duration: 7000 })
      return
    }
    const have = new Set(hotels.map(h => reserveTravelProperty(h.url)).filter(Boolean))
    const fresh = l.properties.filter(p => !have.has(p)).slice(0, Math.max(0, MAX_HOTELS - hotels.length))
    if (!fresh.length) { toast('Those hotels are already listed'); return }
    onChange([...hotels, ...fresh.map(p => ({ ...EMPTY_HOTEL, url: reserveTravelHotelUrl(l, p) }))])
    toast.success(`Added ${fresh.length} hotel${fresh.length === 1 ? '' : 's'}. Type each one's name and rate.`, { duration: 5000 })
    setLink('')
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1">Hotels to list</label>
      <p className="text-xs text-slate-500 mb-2">
        Families see these on the event page and at its hotel link, each with a button straight to that hotel&apos;s booking page.
        With hotels listed, the booking link above becomes &ldquo;See more hotels.&rdquo; Add photos the hotel or the housing company sends you.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input className={inputCls} value={link} onChange={e => setLink(e.target.value)} placeholder="Paste the housing company's reservetravel.com link to add its hotels" />
        <button type="button" onClick={addFromLink} disabled={!source}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Link2 size={14} /> Add from link
        </button>
      </div>
      {!link.trim() && bookingHasHotels && <p className="text-[11px] text-slate-400 -mt-2 mb-3">Leave it blank to use the booking link above.</p>}

      <div className="space-y-3">
        {hotels.map((h, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-400 w-5">{i + 1}.</span>
              <input className={`${inputCls} bg-white`} value={h.name} onChange={e => set(i, { name: e.target.value })} placeholder="Hotel name (required to show)" />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || !!busy} aria-label="Move up" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp size={15} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === hotels.length - 1 || !!busy} aria-label="Move down" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown size={15} /></button>
              <button type="button" onClick={() => onChange(hotels.filter((_, j) => j !== i))} disabled={!!busy} aria-label="Remove hotel" className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={15} /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pl-7">
              <div>
                <label className={labelCls}>Rate / night</label>
                <input className={`${inputCls} bg-white`} value={h.rate} onChange={e => set(i, { rate: e.target.value })} placeholder="$199" inputMode="decimal" />
              </div>
              <div>
                <label className={labelCls}>Miles to fields</label>
                <input className={`${inputCls} bg-white`} value={h.miles} onChange={e => set(i, { miles: e.target.value })} placeholder="1.1" inputMode="decimal" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Book by</label>
                <input type="date" className={`${inputCls} bg-white`} value={h.bookBy} onChange={e => set(i, { bookBy: e.target.value })} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls}>Booking link</label>
                <div className="flex gap-2">
                  <input className={`${inputCls} bg-white`} value={h.url} onChange={e => set(i, { url: e.target.value.trim() })} placeholder="https://… (leave blank to use the booking link above)" />
                  {/^https?:\/\//i.test(h.url) && <a href={h.url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center px-2.5 border border-slate-300 rounded-lg text-slate-500 hover:bg-white" aria-label="Open booking link"><ExternalLink size={14} /></a>}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls}>Note (optional)</label>
                <input className={`${inputCls} bg-white`} value={h.note} onChange={e => set(i, { note: e.target.value })} placeholder="Breakfast included · free parking" />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls}>Photos <span className="normal-case font-normal tracking-normal text-slate-400">· the first one is the main photo</span></label>
                <div className="flex flex-wrap items-center gap-2">
                  {photosOf(h).map((src, k, all) => (
                    <div key={src + k} className="relative w-20 h-14 rounded-lg overflow-hidden border border-slate-200 bg-white">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      {k === 0
                        ? <span className="absolute left-1 bottom-1 rounded bg-teal-600 text-white text-[9px] font-bold uppercase tracking-wide px-1 py-px">Main</span>
                        : <button type="button" onClick={() => setPhotos(i, [src, ...all.filter((_, j) => j !== k)])} aria-label="Make this the main photo" title="Make this the main photo" className="absolute left-1 bottom-1 rounded bg-black/55 hover:bg-black/75 text-white p-0.5"><Star size={11} /></button>}
                      <button type="button" onClick={() => setPhotos(i, all.filter((_, j) => j !== k))} aria-label="Remove photo" title="Remove photo" className="absolute right-1 top-1 rounded-full bg-black/55 hover:bg-black/75 text-white p-0.5"><X size={11} /></button>
                    </div>
                  ))}
                  {photosOf(h).length < MAX_HOTEL_PHOTOS && (
                    <>
                      <label className={`inline-flex items-center gap-1.5 h-14 px-3 text-sm border border-dashed border-slate-300 rounded-lg bg-white text-slate-600 ${busy ? 'opacity-60 pointer-events-none' : 'hover:bg-slate-50 cursor-pointer'}`}>
                        {busy?.row === i
                          ? <><Loader2 size={14} className="animate-spin" /> Uploading {Math.min(busy.done + 1, busy.total)} of {busy.total}…</>
                          : <><ImagePlus size={15} /> Upload photos</>}
                        <input type="file" accept={HOTEL_PHOTO_ACCEPT} multiple className="hidden" disabled={!!busy}
                          onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) addPhotos(i, files) }} />
                      </label>
                      <GalleryPicker label="From library" onPick={url => addFromLibrary(i, url)}
                        triggerClassName="inline-flex items-center gap-1.5 h-14 px-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-50" />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {hotels.length < MAX_HOTELS && (
          <button type="button" onClick={() => onChange([...hotels, { ...EMPTY_HOTEL }])}
            className="inline-flex items-center gap-1.5 text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50">
            <Plus size={14} /> Add a hotel
          </button>
        )}
        {hotels.some(h => h.name.trim()) && (
          <a href={hotelsPath(tournamentId)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1">
            Open the families&apos; hotel page <ExternalLink size={13} />
          </a>
        )}
      </div>
      {hotels.some(h => !h.name.trim()) && <p className="text-[11px] text-amber-700 mt-2">Hotels without a name stay hidden until you type one.</p>}
    </div>
  )
}
