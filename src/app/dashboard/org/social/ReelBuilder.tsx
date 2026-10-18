'use client'
// Reel maker for the social scheduler: photos + a music track + a headline →
// a 9:16 MP4 Reel, made in the browser and dropped straight into the post.
//
// Same recording approach as src/components/ReelMaker.tsx (canvas →
// captureStream + Web Audio → MediaRecorder, MP4 where the browser can), so no
// video work runs on Vercel. Cuts land on the beat of the chosen track.
//
// Music: our own tracks in public/social-music (synthesized in-house, so there
// are no rights to clear and nothing for Instagram/Facebook to mute), the
// user's own MP3, or none — in which case an Instagram song can be added on the
// post itself (Reels only).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { upload as blobUpload } from '@vercel/blob/client'
import { normalizeReel } from '@/lib/normalizeReel'
import { X, Play, Pause, Upload, Film, Music, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import type { IdeaEvent } from '@/lib/socialIdeas'
import { REEL_SONGS } from '@/lib/reelSongs'
import { groupTracks, orgSongId } from '@/lib/reelMusic'
import { useOrgMusic } from '@/components/useOrgMusic'

// The track list is shared with the player-post Reels (lib/reelSongs).
export const REEL_TRACKS = REEL_SONGS

const W = 1080, H = 1920, END = 2.6
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p), 3)
type Photo = { url: string; img: HTMLImageElement }
type Ending = { title: string; line: string; cta: string } | null
export type ReelResult = { url: string; mediaType: 'video'; thumbnailUrl: string; durationSec: number; width: number; height: number }

function pickMime(): { mime: string; ext: string } {
  // Instagram wants H.264 + AAC in an MP4. Ask for that explicitly first; a bare
  // 'video/mp4' is the last resort (some browsers put other codecs in it).
  const opts = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
  ]
  for (const o of opts) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(o.mime)) return o
  return { mime: '', ext: '' }
}
/** Which codecs an MP4 actually holds — looks for the 'avc1'/'mp4a' sample
 *  entries (vs 'vp09'/'Opus'), which every MP4 carries in its header boxes. */
async function mp4Codecs(blob: Blob): Promise<{ h264: boolean; aac: boolean }> {
  const u = new Uint8Array(await blob.arrayBuffer())
  const has = (tag: string) => { const c = [...tag].map(ch => ch.charCodeAt(0)); for (let i = 0; i < u.length - 4; i++) if (u[i] === c[0] && u[i + 1] === c[1] && u[i + 2] === c[2] && u[i + 3] === c[3]) return true; return false }
  return { h264: has('avc1') || has('avc3'), aac: has('mp4a') }
}
function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load a photo')); i.src = url })
}
function fmtRange(a: string, b: string) {
  const d = (k: string) => new Date(k + 'T12:00:00')
  const A = d(a), B = d(b || a)
  const m = (x: Date) => x.toLocaleDateString('en-US', { month: 'short' })
  return !b || a === b ? `${m(A)} ${A.getDate()}` : A.getMonth() === B.getMonth() ? `${m(A)} ${A.getDate()}–${B.getDate()}` : `${m(A)} ${A.getDate()}–${m(B)} ${B.getDate()}`
}

/** One frame of the Reel at time t (seconds). */
function drawFrame(ctx: CanvasRenderingContext2D, t: number, photos: Photo[], per: number, headline: string, sub: string, ending: Ending, total: number) {
  ctx.save()
  ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, W, H)
  const showEnd = !!ending && t >= total - END
  const idx = Math.min(photos.length - 1, Math.floor(t / per))
  const drawPhoto = (i: number, alpha: number) => {
    const p = photos[i]; if (!p) return
    const local = clamp((t - i * per) / (per + 0.4))
    const zoom = 1.04 + 0.1 * (i % 2 ? 1 - local : local)
    const s = Math.max(W / p.img.width, H / p.img.height) * zoom
    const w = p.img.width * s, h = p.img.height * s
    const panX = (i % 3 - 1) * 40 * (local - 0.5)
    ctx.globalAlpha = alpha
    ctx.drawImage(p.img, (W - w) / 2 + panX, (H - h) / 2, w, h)
    ctx.globalAlpha = 1
  }
  if (!showEnd) {
    drawPhoto(idx, 1)
    // quick crossfade into the next photo over the last 0.18 s
    const into = (t - idx * per) - (per - 0.18)
    if (into > 0 && idx + 1 < photos.length) drawPhoto(idx + 1, clamp(into / 0.18))
    // readable top: dark gradient behind the headline
    const g = ctx.createLinearGradient(0, 0, 0, 760)
    g.addColorStop(0, 'rgba(0,0,0,0.72)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 760)
    const gb = ctx.createLinearGradient(0, H - 520, 0, H)
    gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = gb; ctx.fillRect(0, H - 520, W, 520)
    // beat flash on each cut
    const sinceCut = t - idx * per
    if (idx > 0 && sinceCut < 0.12) { ctx.fillStyle = `rgba(255,255,255,${0.22 * (1 - sinceCut / 0.12)})`; ctx.fillRect(0, 0, W, H) }
    if (headline) {
      const a = easeOut((t - 0.15) / 0.5)
      ctx.globalAlpha = a
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 24
      let size = 120
      ctx.font = `${size}px Anton, Impact, sans-serif`
      const lines = wrap(ctx, headline.toUpperCase(), W - 140)
      while (lines.length > 3 && size > 70) { size -= 10; ctx.font = `${size}px Anton, Impact, sans-serif`; lines.splice(0, lines.length, ...wrap(ctx, headline.toUpperCase(), W - 140)) }
      lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 300 + i * size * 1.02 + (1 - a) * 40))
      if (sub) {
        ctx.font = '600 46px "Barlow Condensed", Arial, sans-serif'; ctx.fillStyle = '#5eead4'
        ctx.fillText(sub.toUpperCase(), W / 2, 300 + Math.min(lines.length, 3) * size * 1.02 + 30 + (1 - a) * 40)
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1
    }
  } else if (ending) {
    const k = t - (total - END)
    drawPhoto(photos.length - 1, 1)
    ctx.fillStyle = `rgba(4,8,16,${0.55 + 0.35 * easeOut(k / 0.4)})`; ctx.fillRect(0, 0, W, H)
    const a = easeOut(k / 0.45)
    ctx.textAlign = 'center'; ctx.globalAlpha = a
    ctx.fillStyle = '#ffffff'; ctx.font = '128px Anton, Impact, sans-serif'
    const lines = wrap(ctx, ending.title.toUpperCase(), W - 140)
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 820 + i * 132 - (1 - a) * 30))
    const y = 820 + Math.min(lines.length, 3) * 132 + 20
    ctx.fillStyle = '#5eead4'; ctx.font = '600 60px "Barlow Condensed", Arial, sans-serif'
    ctx.fillText(ending.line.toUpperCase(), W / 2, y)
    if (ending.cta) { ctx.fillStyle = '#e2e8f0'; ctx.font = '600 44px "Barlow Condensed", Arial, sans-serif'; ctx.fillText(ending.cta, W / 2, y + 90) }
    ctx.globalAlpha = 1
  }
  // fade to black at the very end
  if (t > total - 0.3) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - (total - 0.3)) / 0.3)})`; ctx.fillRect(0, 0, W, H) }
  ctx.restore()
}
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const out: string[] = []; let cur = ''
  for (const w of words) { const nx = cur ? `${cur} ${w}` : w; if (ctx.measureText(nx).width > max && cur) { out.push(cur); cur = w } else cur = nx }
  if (cur) out.push(cur)
  return out
}

export default function ReelBuilder({ initialPhotos, events, site, onDone, onClose }: { initialPhotos: string[]; events: IdeaEvent[]; site?: string; onDone: (m: ReelResult) => void; onClose: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [headline, setHeadline] = useState('')
  const [sub, setSub] = useState('')
  const [eventId, setEventId] = useState<string>(events[0]?.id || '')
  const [withEnd, setWithEnd] = useState(events.length > 0)
  const [track, setTrack] = useState<string>('game-day')        // track id | 'own' | 'none'
  const [ownFile, setOwnFile] = useState<File | null>(null)
  const [pace, setPace] = useState<'fast' | 'normal' | 'slow'>('normal')
  const [state, setState] = useState<'edit' | 'recording' | 'uploading'>('edit')
  const [progress, setProgress] = useState('')
  const [previewing, setPreviewing] = useState<string>('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const audioEl = useRef<HTMLAudioElement | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const ownInput = useRef<HTMLInputElement>(null)
  const site_ = (site || 'sunshineeventsgroup.com').replace(/^https?:\/\//, '').replace(/\/$/, '')

  // Fonts + the photos that were already on the post.
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600&display=swap'
    document.head.appendChild(link)
    Promise.all([document.fonts.load('68px Anton'), document.fonts.load('600 34px "Barlow Condensed"')]).catch(() => {})
    ;(async () => {
      const loaded: Photo[] = []
      for (const url of initialPhotos.slice(0, 10)) { try { loaded.push({ url, img: await loadImg(url) }) } catch {} }
      if (loaded.length) setPhotos(loaded)
    })()
    return () => { cancelAnimationFrame(raf.current); audioEl.current?.pause(); link.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The org's own music list (lib/reelMusic; tracks are added in the player Reel maker).
  const music = useOrgMusic()
  const trackSrc = (id: string) => music.tracks.find(t => orgSongId(t.id) === id)?.url || `/social-music/${id}.mp3`
  const bpm = REEL_TRACKS.find(x => x.id === track)?.bpm || 120   // org tracks: 120 (cuts every half second)
  const beat = 60 / bpm
  const beatsPer = pace === 'fast' ? 2 : pace === 'normal' ? 4 : 6
  const per = Math.max(0.9, beat * beatsPer)                       // seconds per photo, on the beat
  const ev = events.find(e => e.id === eventId)
  const ending: Ending = withEnd && ev ? { title: ev.name, line: [fmtRange(ev.start, ev.end), ev.location.split(',').slice(0, 2).join(',').trim()].filter(Boolean).join(' · '), cta: `Register at ${site_}` } : null
  const total = Math.max(3.5, photos.length * per + (ending ? END : 0))
  const tooLong = total > 90

  // Live preview loop.
  useEffect(() => {
    if (state !== 'edit') return
    const c = canvas.current; if (!c) return
    const ctx = c.getContext('2d')!
    const t0 = performance.now()
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) % (total + 0.5)
      if (photos.length) drawFrame(ctx, Math.min(t, total), photos, per, headline, sub, ending, total)
      else { ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.font = '600 54px Arial'; ctx.fillText('Add photos to start', W / 2, H / 2) }
      raf.current = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf.current)
  }, [photos, per, headline, sub, ending?.title, ending?.line, total, state])

  async function addFiles(files: File[]) {
    const room = 10 - photos.length
    const take = files.filter(f => f.type.startsWith('image/')).slice(0, room)
    if (files.length > take.length) toast(room <= 0 ? 'Up to 10 photos per Reel' : 'Only photos here — up to 10')
    const added: Photo[] = []
    for (const f of take) { const url = URL.createObjectURL(f); try { added.push({ url, img: await loadImg(url) }) } catch {} }
    setPhotos(p => [...p, ...added])
  }
  const move = (i: number, d: number) => setPhotos(p => { const j = i + d; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n })

  function previewTrack(id: string) {
    audioEl.current?.pause()
    if (previewing === id) { setPreviewing(''); return }
    const src = id === 'own' && ownFile ? URL.createObjectURL(ownFile) : trackSrc(id)
    const a = new Audio(src); audioEl.current = a; a.onended = () => setPreviewing('')
    a.play().then(() => setPreviewing(id)).catch(() => toast.error("Couldn't play that track"))
  }

  async function make() {
    const c = canvas.current
    if (!c || !photos.length) { toast.error('Add at least one photo'); return }
    const { mime } = pickMime()
    if (!mime || !('captureStream' in c)) { toast.error("This browser can't record an MP4. Use Chrome or Safari."); return }
    audioEl.current?.pause(); setPreviewing('')
    cancelAnimationFrame(raf.current)
    setState('recording'); setProgress('Recording… 0%')
    const ctx = c.getContext('2d')!
    drawFrame(ctx, 0, photos, per, headline, sub, ending, total)
    const tracks: MediaStreamTrack[] = [...((c as any).captureStream(30) as MediaStream).getVideoTracks()]
    let audioCtx: AudioContext | null = null
    try {
      if (track !== 'none') {
        audioCtx = new AudioContext()
        const raw = track === 'own' && ownFile ? await ownFile.arrayBuffer() : await fetch(trackSrc(track)).then(r => r.arrayBuffer())
        const buf = await audioCtx.decodeAudioData(raw)
        const srcNode = audioCtx.createBufferSource(); srcNode.buffer = buf; srcNode.loop = buf.duration < total
        const gain = audioCtx.createGain()
        const now = audioCtx.currentTime
        gain.gain.setValueAtTime(0.95, now); gain.gain.setValueAtTime(0.95, now + Math.max(0, total - 0.9)); gain.gain.linearRampToValueAtTime(0, now + total)
        const dest = audioCtx.createMediaStreamDestination()
        srcNode.connect(gain).connect(dest)
        tracks.push(...dest.stream.getAudioTracks())
        srcNode.start()
      }
    } catch { toast.error("Couldn't load that music — making the Reel without it") }
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    const done = new Promise<Blob>(res => { rec.onstop = () => res(new Blob(chunks, { type: 'video/mp4' })) })
    rec.start(250)
    const t0 = performance.now()
    await new Promise<void>(res => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000
        drawFrame(ctx, Math.min(t, total), photos, per, headline, sub, ending, total)
        setProgress(`Recording… ${Math.min(100, Math.round((t / total) * 100))}% — keep this tab open`)
        if (t < total) raf.current = requestAnimationFrame(tick); else res()
      }
      tick()
    })
    rec.stop()
    const blob = await done
    audioCtx?.close().catch(() => {})
    // Instagram only takes H.264 video (+ AAC sound). Some browsers honor
    // 'video/mp4' with other codecs inside, so check the file's sample entries
    // before uploading something that would fail at publish time.
    const codecs = await mp4Codecs(blob)
    if (!codecs.h264 || (track !== 'none' && !codecs.aac)) {
      toast.error("This browser saved the video in a format Instagram won't accept. Make the Reel in Chrome on a computer, or Safari.", { duration: 8000 })
      setState('edit'); return
    }
    // Cover frame for the calendar and the Reel's cover.
    setState('uploading'); setProgress('Saving cover…')
    try {
      drawFrame(ctx, Math.min(per * 0.6, total), photos, per, headline, sub, ending, total)
      const poster = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.86))
      let thumbnailUrl = ''
      if (poster) {
        const fd = new FormData(); fd.append('file', new File([poster], 'reel-cover.jpg', { type: 'image/jpeg' }))
        const r = await fetch('/api/upload', { method: 'POST', body: fd }); const d = await r.json().catch(() => ({}))
        if (r.ok && d.url && !String(d.url).startsWith('data:')) thumbnailUrl = d.url
      }
      setProgress('Uploading Reel… 0%')
      const name = `reel-${(headline || ev?.name || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.mp4`
      const up = await blobUpload(name, new File([blob], name, { type: 'video/mp4' }), {
        access: 'public', handleUploadUrl: '/api/social/upload-video', multipart: true,   // one PUT over ~16 MB fails
        onUploadProgress: (p: { percentage: number }) => setProgress(`Uploading Reel… ${Math.round(p.percentage)}%`),
      })
      // MediaRecorder can only emit a fragmented MP4, which Instagram rejects (2207082):
      // re-mux server-side to a progressive MP4. Falls back to the original URL on failure.
      setProgress('Finishing video…')
      const vurl = await normalizeReel(up.url)
      onDone({ url: vurl, mediaType: 'video', thumbnailUrl, durationSec: total, width: W, height: H })
      toast.success(`Reel ready · ${Math.round(total)}s`)
    } catch (e: any) {
      toast.error(String(e?.message || 'Upload failed'))
      setState('edit')
    }
  }

  const busy = state !== 'edit'
  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs font-bold ${on ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-300 text-slate-500 hover:text-slate-900'}`
  // Portal to <body>: the scheduler's drawer is transformed, which would trap a
  // fixed overlay inside its 460 px.
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/70 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Make a Reel">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[920px] max-h-full overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div><div className="font-extrabold text-sm flex items-center gap-1.5"><Film size={15} /> Make a Reel</div><div className="text-[11px] text-slate-500">Photos + music + headline → a vertical video, cut on the beat</div></div>
          <button onClick={() => { if (!busy) onClose() }} disabled={busy} className="w-8 h-8 rounded-lg border border-slate-300 grid place-items-center text-slate-500 disabled:opacity-40" aria-label="Close"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 p-4">
          <div className="flex flex-col items-center gap-2">
            <canvas ref={canvas} width={W} height={H} className="w-[220px] md:w-[280px] aspect-[9/16] rounded-xl bg-slate-900 shadow" />
            <div className="text-[11px] text-slate-500 tabular-nums">{photos.length} photo{photos.length === 1 ? '' : 's'} · {total.toFixed(1)} s{tooLong ? ' — over 90 s, trim some photos' : ''}</div>
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">Photos <span className="normal-case tracking-normal font-semibold text-slate-400">· in order, up to 10</span></div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <div key={p.url + i} className="relative flex-none w-16">
                    <img src={p.url} alt="" className="w-16 h-[86px] rounded-lg object-cover" />
                    <span className="absolute top-0.5 left-0.5 rounded bg-black/65 text-white text-[9px] font-bold px-1">{i + 1}</span>
                    <button type="button" disabled={busy} onClick={() => setPhotos(ps => ps.filter((_, k) => k !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-300 grid place-items-center text-slate-500 hover:text-rose-600" aria-label={`Remove photo ${i + 1}`}><X size={11} /></button>
                    <div className="flex justify-between mt-0.5">
                      <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="w-6 h-5 rounded border border-slate-200 grid place-items-center text-slate-500 disabled:opacity-30" aria-label="Move left"><ArrowLeft size={11} /></button>
                      <button type="button" disabled={busy || i === photos.length - 1} onClick={() => move(i, 1)} className="w-6 h-5 rounded border border-slate-200 grid place-items-center text-slate-500 disabled:opacity-30" aria-label="Move right"><ArrowRight size={11} /></button>
                    </div>
                  </div>
                ))}
                {photos.length < 10 && <button type="button" disabled={busy} onClick={() => photoInput.current?.click()} className="flex-none w-16 h-[86px] rounded-lg border-[1.5px] border-dashed border-slate-300 text-slate-500 hover:text-teal-700 hover:border-teal-400 grid place-items-center text-[10px] font-bold"><span className="flex flex-col items-center gap-0.5"><Upload size={14} />Add</span></button>}
              </div>
              <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) addFiles(fs); e.target.value = '' }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Headline<input value={headline} disabled={busy} onChange={e => setHeadline(e.target.value)} maxLength={60} placeholder="One week to go" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal font-normal text-slate-800" /></label>
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Small line<input value={sub} disabled={busy} onChange={e => setSub(e.target.value)} maxLength={50} placeholder="Oct 24–25 · Wellington" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal font-normal text-slate-800" /></label>
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">Ending</div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <button type="button" disabled={busy} onClick={() => setWithEnd(false)} className={chip(!withEnd)}>No end card</button>
                {events.slice(0, 6).map(e => <button key={e.id} type="button" disabled={busy} onClick={() => { setWithEnd(true); setEventId(e.id) }} className={chip(withEnd && eventId === e.id)}>{e.name}</button>)}
              </div>
              {ending && <div className="text-[11px] text-slate-500 mt-1">Shows {ending.title} · {ending.line} · {ending.cta} for the last {END} s.</div>}
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">Pace</div>
              <div className="flex gap-1.5">{(['fast', 'normal', 'slow'] as const).map(p => <button key={p} type="button" disabled={busy} onClick={() => setPace(p)} className={chip(pace === p) + ' capitalize'}>{p}</button>)}<span className="text-[11px] text-slate-500 self-center ml-1 tabular-nums">{per.toFixed(1)} s per photo</span></div>
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">Music</div>
              <div className="flex flex-col gap-1">
                {groupTracks(music.tracks).map(g => (
                  <div key={g.label} className="flex flex-col gap-1">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1">{g.label}</div>
                    {g.tracks.map(t => { const id = orgSongId(t.id); return (
                      <div key={id} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${track === id ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200'}`}>
                        <button type="button" onClick={() => previewTrack(id)} className="w-7 h-7 rounded-full bg-slate-800 text-white grid place-items-center flex-none" aria-label={previewing === id ? 'Pause' : 'Play'}>{previewing === id ? <Pause size={11} /> : <Play size={11} fill="currentColor" />}</button>
                        <button type="button" disabled={busy} onClick={() => setTrack(id)} className="flex-1 min-w-0 text-left text-xs font-bold truncate">{t.title}</button>
                        {track === id && <Check size={14} className="text-teal-700" />}
                      </div>
                    ) })}
                  </div>
                ))}
                {music.tracks.length > 0 && <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1">Built-in</div>}
                {REEL_TRACKS.map(tk => (
                  <div key={tk.id} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${track === tk.id ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200'}`}>
                    <button type="button" onClick={() => previewTrack(tk.id)} className="w-7 h-7 rounded-full bg-slate-800 text-white grid place-items-center flex-none" aria-label={previewing === tk.id ? 'Pause' : 'Play'}>{previewing === tk.id ? <Pause size={11} /> : <Play size={11} fill="currentColor" />}</button>
                    <button type="button" disabled={busy} onClick={() => setTrack(tk.id)} className="flex-1 min-w-0 text-left"><span className="text-xs font-bold">{tk.title}</span><span className="text-[11px] text-slate-500"> · {tk.mood} · {tk.bpm} BPM</span></button>
                    {track === tk.id && <Check size={14} className="text-teal-700" />}
                  </div>
                ))}
                <div className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${track === 'own' ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200'}`}>
                  <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 grid place-items-center flex-none"><Music size={12} /></span>
                  <button type="button" disabled={busy} onClick={() => ownInput.current?.click()} className="flex-1 min-w-0 text-left text-xs"><span className="font-bold">{ownFile ? ownFile.name : 'Your own MP3'}</span><span className="text-[11px] text-slate-500"> · only use music you have the rights to</span></button>
                  {ownFile && <button type="button" onClick={() => previewTrack('own')} className="text-[11px] font-bold text-teal-700">{previewing === 'own' ? 'Stop' : 'Play'}</button>}
                  {track === 'own' && <Check size={14} className="text-teal-700" />}
                </div>
                <input ref={ownInput} type="file" accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/wav,audio/x-m4a" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setOwnFile(f); setTrack('own') } e.target.value = '' }} />
                <button type="button" disabled={busy} onClick={() => setTrack('none')} className={`text-left rounded-xl border px-3 py-1.5 text-xs ${track === 'none' ? 'border-teal-500 bg-teal-50/60 font-bold' : 'border-slate-200 text-slate-600'}`}>No music — I'll add an Instagram song on the post</button>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Built-in tracks are made in-house for Whistle Ready, so there's nothing to license and nothing for Instagram or Facebook to mute.</div>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex items-center gap-3 flex-wrap">
          <button onClick={make} disabled={busy || !photos.length || tooLong} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm px-4 py-2.5 disabled:opacity-50 inline-flex items-center gap-1.5"><Film size={14} /> {busy ? 'Working…' : `Make the Reel · ${Math.round(total)} s`}</button>
          {busy && <span className="text-xs font-bold text-teal-700">{progress}</span>}
          {!busy && <span className="text-[11px] text-slate-500">It records in real time, so a {Math.round(total)} s Reel takes about {Math.round(total)} s. Keep this tab in front while it records.</span>}
        </div>
      </div>
    </div>
  , document.body)
}
