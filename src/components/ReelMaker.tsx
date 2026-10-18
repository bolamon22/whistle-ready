'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Download, Film, RotateCcw, Volume2 } from 'lucide-react'
import { CUSTOM_REELS, drawRookie, drawCountdown, type ReelData, type ReelImages } from './reelCustom'

// Turns one social post (lib/socialPosts, /pass/<token>/post/<style>.png) into an
// 8-second vertical Instagram Reel with music, right in the browser (Bo, Oct 18 2026:
// "add some music ... animate them a little bit", then "make all of them").
//
// The post is drawn on a 1080×1920 canvas over a blurred copy of itself, with an
// intro that fits the look (a slam for Committed, a card flip for Rookie Card, a
// curtain for Now Showing, a count-down for Countdown...), a slow push-in, a light
// sweep, and the event's name above. MediaRecorder captures the canvas plus the
// music (public/reel-beat.mp3, our own track, so no rights issues) to MP4 where the
// browser can (Chrome, Safari), else WebM. Nothing is uploaded: the file is saved
// on the staff member's computer.

const W = 1080, H = 1920, DUR = 8

// Music to pick from (Bo: "can I choose different songs?"). All made from scratch for
// Whistle Ready, so Instagram won't mute them. public/reel-beat.mp3 is the original.
export const REEL_SONGS = [
  { id: 'trap', label: 'Trap Hype (original)', url: '/reel-beat.mp3' },
  { id: 'electro', label: 'Electro Drive', url: '/reel-music/electro.mp3' },
  { id: 'stadium', label: 'Stadium Stomp', url: '/reel-music/stadium.mp3' },
  { id: 'drumline', label: 'Drumline', url: '/reel-music/drumline.mp3' },
  { id: 'cinematic', label: 'Cinematic Rise', url: '/reel-music/cinematic.mp3' },
  { id: 'none', label: 'No music', url: '' },
]
const PY = 285                      // where the 1080×1350 post sits
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p), 3)
const easeBack = (p: number) => { const c = 1.6, x = clamp(p) - 1; return 1 + (c + 1) * x * x * x + c * x * x }

type Props = { src: string; style: string; label: string; event: string; sub: string; days?: number | null; fileName: string; onClose: () => void
  /** The player's pass token: lets Rookie Card and Countdown use their hand-built Reels (components/reelCustom). */
  token?: string }

const loadImg = (url: string) => new Promise<HTMLImageElement | null>(res => {
  if (!url) return res(null)
  const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url
})

function draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, style: string, t: number, event: string, sub: string, days: number | null) {
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H)
  // Background: the post itself, blurred and dark, slowly drifting.
  ctx.save()
  ctx.filter = 'blur(40px) brightness(0.42) saturate(1.2)'
  const bs = 1.5 + 0.06 * t / DUR
  ctx.drawImage(img, (W - W * bs) / 2, (H - 1350 * bs) / 2 - 40 * t / DUR, W * bs, 1350 * bs)
  ctx.restore()

  const kind = style.replace(/(-to)?-photo$/, '')
  // Intro: scale / offset / flip for the post, per look.
  let sx = 1, sy = 1, dx = 0, dy = 0, rot = 0, alpha = 1, show = true
  let flash = 0
  const push = 1 + 0.05 * clamp((t - 1) / (DUR - 1))
  if (kind === 'committed' || kind === 'main-event') {
    const p = clamp(t / 0.45); const s = 1.7 - 0.7 * easeOut(p)
    sx = sy = s; alpha = clamp(p * 2)
    if (t > 0.45 && t < 0.75) { const k = Math.sin((t - 0.45) * 60) * (0.75 - t) * 40; dx = k; dy = -k / 2 }
    flash = t > 0.4 && t < 0.9 ? 1 - (t - 0.4) / 0.5 : 0
  } else if (kind === 'premiere') {
    alpha = clamp(t / 0.9)
  } else if (kind === 'draft') {
    dx = (1 - easeOut(t / 0.7)) * W * 1.1
  } else if (kind === 'countdown') {
    show = t > 1.5; alpha = clamp((t - 1.5) / 0.3); sx = sy = 1.15 - 0.15 * easeOut((t - 1.5) / 0.5)
  } else if (kind === 'cover') {
    dy = -(1 - easeBack(t / 0.8)) * 900; rot = (1 - easeOut(t / 0.9)) * -0.14
  } else if (kind === 'rookie') {
    // Two quick spins on the vertical axis, landing face up.
    const p = clamp(t / 1.1); sx = Math.cos(p * Math.PI * 2) ; sy = 1 - 0.12 * Math.sin(p * Math.PI)
    flash = Math.abs(sx) < 0.15 && p < 1 ? 0.5 : 0
  } else if (kind === 'scout') {
    dy = (1 - easeOut(t / 0.8)) * 1100; rot = (1 - easeOut(t / 0.8)) * 0.12
  } else if (kind === 'jersey') {
    show = true
  }
  if (show) {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(W / 2 + dx, PY + 675 + dy)
    ctx.rotate(rot)
    ctx.scale(sx * push, sy * push)
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24
    if (kind === 'jersey') {
      // Wipe up from the bottom.
      const p = easeOut(t / 0.9)
      ctx.beginPath(); ctx.rect(-W / 2, 675 - 1350 * p, W, 1350 * p); ctx.clip()
    }
    ctx.drawImage(img, -W / 2, -675, W, 1350)
    ctx.shadowColor = 'transparent'
    // Light sweep across the post.
    const st = (t - 2.1) / 0.9
    if (st > 0 && st < 1) {
      ctx.save()
      ctx.beginPath(); ctx.rect(-W / 2, -675, W, 1350); ctx.clip()
      const x = -W / 2 - 400 + st * (W + 800)
      const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0)
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.rotate(0.3); ctx.fillStyle = g; ctx.fillRect(-W * 1.5, -1350 * 1.5, W * 3, 1350 * 3)
      ctx.restore()
    }
    ctx.restore()
  }
  // Countdown: the numbers race down before the post lands.
  if (kind === 'countdown' && t < 1.6) {
    const from = 10, to = Math.max(1, days ?? 1)
    const steps = Math.max(1, from - to)
    const n = t >= 1.3 ? to : Math.round(from - steps * clamp(t / 1.3))
    ctx.save()
    ctx.fillStyle = '#f97316'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = '520px Anton, Impact, sans-serif'
    ctx.globalAlpha = t > 1.4 ? clamp((1.6 - t) / 0.2) : 1
    ctx.fillText(String(n), W / 2, H / 2)
    ctx.restore()
  }
  // Now Showing: curtain bars opening.
  if (kind === 'premiere' && t < 1.4) {
    const p = easeOut(t / 1.3)
    ctx.fillStyle = '#000'; const h = (H / 2) * (1 - p)
    ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h)
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.7 * flash})`; ctx.fillRect(0, 0, W, H) }

  // Event name above, sign-off below.
  const top = clamp((t - 0.8) / 0.5)
  ctx.save()
  ctx.globalAlpha = top
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'
  ctx.font = '68px Anton, Impact, sans-serif'
  ctx.fillText(event.toUpperCase(), W / 2, 150 + (1 - top) * 30, W - 120)
  ctx.font = '600 34px "Barlow Condensed", Arial, sans-serif'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(sub.toUpperCase(), W / 2, 210 + (1 - top) * 30, W - 120)
  ctx.restore()
  const bot = clamp((t - 5.6) / 0.6)
  ctx.save()
  ctx.globalAlpha = bot
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'
  ctx.font = '84px Anton, Impact, sans-serif'
  ctx.fillText('SEE YOU ON THE FIELD', W / 2, 1765 + (1 - bot) * 50)
  ctx.restore()
  // Ease out to black at the very end so the loop isn't jarring.
  if (t > DUR - 0.35) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - (DUR - 0.35)) / 0.35)})`; ctx.fillRect(0, 0, W, H) }
  ctx.restore()
}

function pickMime(): { mime: string; ext: string } {
  const opts = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ]
  for (const o of opts) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(o.mime)) return o
  return { mime: '', ext: 'webm' }
}

export default function ReelMaker({ src, style, label, event, sub, days = null, fileName, onClose, token }: Props) {
  const isCustom = !!token && style in CUSTOM_REELS
  const dur = isCustom ? CUSTOM_REELS[style] : DUR
  const custom = useRef<{ data: ReelData; imgs: ReelImages } | null>(null)
  const paint = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, t: number) => {
    const c = custom.current
    if (c) (style === 'rookie' ? drawRookie : drawCountdown)(ctx, t, c.data, { ...c.imgs, post: img })
    else draw(ctx, img, style, t, event, sub, days)
  }
  const canvas = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const raf = useRef(0)
  const [state, setState] = useState<'loading' | 'preview' | 'recording' | 'done' | 'error'>('loading')
  const [out, setOut] = useState<{ url: string; ext: string } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [song, setSong] = useState(REEL_SONGS[0].id)
  const songUrl = REEL_SONGS.find(x => x.id === song)?.url || ''
  const [showVideo, setShowVideo] = useState(false)   // after recording: the real video, with sound, instead of the silent loop
  const [err, setErr] = useState('')

  // Load the post and the fonts, then loop the preview.
  useEffect(() => {
    let alive = true
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600&display=swap'
    document.head.appendChild(link)
    const img = new Image()
    img.onload = async () => {
      try { await Promise.all([document.fonts.load('68px Anton'), document.fonts.load('600 34px "Barlow Condensed"')]) } catch {}
      if (!alive) return
      if (isCustom) {
        try {
          const data = await fetch(`/pass/${token}/reel`).then(r => r.ok ? r.json() : null)
          if (data) {
            const [photo, clubLogo, eventLogo] = await Promise.all([loadImg(data.photo), loadImg(data.clubLogo), loadImg(data.eventLogo)])
            custom.current = { data, imgs: { photo, clubLogo, eventLogo } }
          }
        } catch { /* fall back to the generic Reel */ }
      }
      if (!alive) return
      imgRef.current = img; setState('preview'); loop()
    }
    img.onerror = () => { if (alive) { setErr('Could not load the post image.'); setState('error') } }
    img.src = src
    return () => { alive = false; cancelAnimationFrame(raf.current); link.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  function loop() {
    cancelAnimationFrame(raf.current)
    const c = canvas.current, img = imgRef.current
    if (!c || !img) return
    const ctx = c.getContext('2d')!
    const t0 = performance.now()
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) % (dur + 0.6)
      paint(ctx, img, Math.min(t, dur))
      raf.current = requestAnimationFrame(tick)
    }
    tick()
  }

  // Play the animation once from the top with the music out loud (Bo: "Can I just hear it
  // in the preview?"). Nothing is recorded.
  async function playWithSound() {
    const c = canvas.current, img = imgRef.current
    if (!c || !img || playing) return
    setShowVideo(false); setPlaying(true)
    cancelAnimationFrame(raf.current)
    const ctx = c.getContext('2d')!
    let audioCtx: AudioContext | null = null
    try {
      audioCtx = new AudioContext()
      if (!songUrl) throw new Error('no music')
      const buf = await fetch(songUrl).then(r => r.arrayBuffer()).then(b => audioCtx!.decodeAudioData(b))
      const node = audioCtx.createBufferSource(); node.buffer = buf
      const gain = audioCtx.createGain()
      gain.gain.setValueAtTime(0.9, audioCtx.currentTime)
      gain.gain.setValueAtTime(0.9, audioCtx.currentTime + dur - 0.8)
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + dur)
      node.connect(gain).connect(audioCtx.destination)
      node.start()
    } catch { /* still play the picture */ }
    const t0 = performance.now()
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      paint(ctx, img, Math.min(t, dur))
      if (t < dur + 0.4) raf.current = requestAnimationFrame(tick)
      else { audioCtx?.close().catch(() => {}); setPlaying(false); loop() }
    }
    tick()
  }

  async function record() {
    setShowVideo(false)
    const c = canvas.current, img = imgRef.current
    if (!c || !img) return
    if (typeof MediaRecorder === 'undefined' || !('captureStream' in c)) { setErr("This browser can't record video. Try Chrome."); setState('error'); return }
    cancelAnimationFrame(raf.current)
    setState('recording'); setErr('')
    const ctx = c.getContext('2d')!
    paint(ctx, img, 0)
    const video = (c as any).captureStream(30) as MediaStream
    let audioCtx: AudioContext | null = null
    const tracks = [...video.getVideoTracks()]
    try {
      audioCtx = new AudioContext()
      if (!songUrl) throw new Error('no music')
      const buf = await fetch(songUrl).then(r => r.arrayBuffer()).then(b => audioCtx!.decodeAudioData(b))
      const srcNode = audioCtx.createBufferSource(); srcNode.buffer = buf
      const gain = audioCtx.createGain()
      gain.gain.setValueAtTime(0.9, audioCtx.currentTime)
      gain.gain.setValueAtTime(0.9, audioCtx.currentTime + dur - 0.8)
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + dur)
      const dest = audioCtx.createMediaStreamDestination()
      srcNode.connect(gain).connect(dest)
      gain.connect(audioCtx.destination)        // and out the speakers, so you hear it while it records
      tracks.push(...dest.stream.getAudioTracks())
      srcNode.start()
    } catch { /* no music: still make the video */ }
    const { mime, ext } = pickMime()
    const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => {
      audioCtx?.close().catch(() => {})
      const blob = new Blob(chunks, { type: mime || 'video/webm' })
      setOut(o => { if (o) URL.revokeObjectURL(o.url); return { url: URL.createObjectURL(blob), ext } })
      setState('done')
      setShowVideo(true)
      loop()
    }
    rec.start(250)
    const t0 = performance.now()
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      paint(ctx, img, Math.min(t, dur))
      if (t < dur) raf.current = requestAnimationFrame(tick)
      else rec.stop()
    }
    tick()
  }

  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url) }, [out])

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/80 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={`${label} Reel`} onClick={onClose}>
      <div className="bg-white rounded-2xl p-4 w-full max-w-md max-h-[94vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Film size={18} className="text-teal-700" />
          <h2 className="font-bold text-slate-900">{label} · Reel</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto h-9 w-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <canvas ref={canvas} width={W} height={H} className={`w-full max-w-[300px] mx-auto rounded-xl bg-black aspect-[9/16] ${showVideo && out ? 'hidden' : 'block'}`} />
        {showVideo && out && (
          // The recorded Reel itself, with its music: what you'll post.
          <video src={out.url} controls autoPlay playsInline className="w-full max-w-[300px] mx-auto block rounded-xl bg-black aspect-[9/16]" />
        )}
        {state === 'loading' && <p className="text-sm text-slate-500 text-center mt-3">Building the post…</p>}
        {err && <p className="text-sm text-rose-700 text-center mt-3">{err}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {state !== 'recording' && state !== 'loading' && state !== 'error' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="font-semibold shrink-0">Song</span>
              <select value={song} onChange={e => setSong(e.target.value)} disabled={playing}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {REEL_SONGS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
          )}
          {state !== 'recording' && state !== 'loading' && state !== 'error' && (
            <button type="button" onClick={playWithSound} disabled={playing} className="w-full rounded-lg border border-slate-300 text-slate-700 font-semibold py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <Volume2 size={16} /> {playing ? 'Playing…' : 'Play with sound'}
            </button>
          )}
          {state === 'recording'
            ? <p className="text-sm text-slate-600 text-center">Recording with music… keep this tab open ({dur} seconds).</p>
            : <button type="button" onClick={record} disabled={state === 'loading' || state === 'error' || playing} className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-40">
                {state === 'done' ? <><RotateCcw size={16} /> Record again</> : <><Film size={16} /> Make the Reel (with music)</>}
              </button>}
          {out && state !== 'recording' && (
            <a href={out.url} download={`${fileName}.${out.ext}`} className="w-full rounded-lg border border-teal-600 text-teal-700 font-semibold py-2.5 inline-flex items-center justify-center gap-2"><Download size={16} /> Save {out.ext.toUpperCase()}</a>
          )}
          <p className="text-xs text-slate-500">The preview loops silently; press Play with sound to hear it with the music. After you make the Reel, the finished video plays here with sound before you save it. To use a trending sound instead, lower it in Instagram when you post. Post only once the family says Yes.</p>
        </div>
      </div>
    </div>
  )
}
