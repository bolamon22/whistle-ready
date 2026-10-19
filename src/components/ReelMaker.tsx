'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Download, Film, RotateCcw, Volume2, Check, ChevronUp, ChevronDown, Save, Music } from 'lucide-react'
import { REEL_SONGS, songUrl as trackUrl } from '@/lib/reelSongs'
import { allCategories, groupTracks, orgSongId, isOrgSong, titleFromFile } from '@/lib/reelMusic'
import { useOrgMusic } from './useOrgMusic'
import { CUSTOM_REELS, drawRookie, drawCountdown, type ReelData, type ReelImages } from './reelCustom'
import { FAVORITE_STYLES, POST_STYLES } from '@/lib/socialPosts'

// Length (Bo, Oct 18 2026: "choose between 8, 15 seconds ... maybe even 30 if we really
// feel like we have a good one"). Longer Reels don't stretch one graphic: they play the
// chosen look, then more of the player's looks (Bo's favorites), each with its own intro,
// dipping to black between them. 8 s = one look, 15 s = two, 30 s = four.
const LENGTHS = [{ sec: 8, looks: 1 }, { sec: 15, looks: 2 }, { sec: 30, looks: 4 }] as const
const lookKind = (s: string) => s.replace(/(-to)?-photo$/, '')
const FAV_LOOKS = FAVORITE_STYLES.map(id => POST_STYLES.find(s => s.id === id)).filter((s): s is (typeof POST_STYLES)[number] => !!s)
const MORE_LOOKS = POST_STYLES.filter(s => !FAVORITE_STYLES.includes(s.id))
/** Squad Reels close on a card naming everyone ("Ready for Monster Mash"). */
const END = 2.5

// Turns one social post (lib/socialPosts, /pass/<token>/post/<style>.png) into an
// 8-, 15- or 30-second vertical Instagram Reel with music, right in the browser (Bo, Oct 18 2026:
// "add some music ... animate them a little bit", then "make all of them").
//
// The post is drawn on a 1080×1920 canvas over a blurred copy of itself, with an
// intro that fits the look (a slam for Committed, a card flip for Rookie Card, a
// curtain for Now Showing, a count-down for Countdown...), a slow push-in, a light
// sweep, and the event's name above. MediaRecorder captures the canvas plus the
// music (any track in lib/reelSongs, all ours, or the staff member's own MP3) to MP4 where the
// browser can (Chrome, Safari), else WebM. Nothing is uploaded: the file is saved
// on the staff member's computer.

const W = 1080, H = 1920, DUR = 8


const PY = 285                      // where the 1080×1350 post sits
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p), 3)
const easeBack = (p: number) => { const c = 1.6, x = clamp(p) - 1; return 1 + (c + 1) * x * x * x + c * x * x }

type Props = { src: string; style: string; label: string; event: string; sub: string; days?: number | null; fileName: string; onClose: () => void
  /** The player's pass token: lets Rookie Card and Countdown use their hand-built Reels (components/reelCustom). */
  token?: string
  /** Song to start on (a lib/reelSongs id). */
  initialSong?: string
  /** Squad Reel (Bo, Oct 18 2026: "pick like two to four players and show different
   *  looks with them"): one segment per player, each in its own look, then an end card. */
  squad?: { token: string; first: string; style: string }[]
  /** The social scheduler: hand the finished Reel (MP4) and a cover frame straight to
   *  a post instead of saving the file. Resolves once it's uploaded. */
  onUse?: (video: Blob, poster: Blob | null, durationSec: number, opts: { igSong: boolean; day?: string; order?: number[]; saveDraft?: boolean }) => Promise<void>
  /** Scheduler: save these settings to finish later (Bo, Oct 18 2026: "save a draft here
   *  too"), and the settings a saved draft reopens with. */
  onSaveSetup?: (setup: ReelSetup) => Promise<void>
  initialSetup?: Partial<ReelSetup>
  /** Shown when a saved draft was reopened, with a way to throw it away and start fresh. */
  draftNote?: string
  onStartOver?: () => void
  /** Scheduler: the event's first day and the day the post is planned for (YYYY-MM-DD).
   *  With both, a Countdown look gets a "Posts on" day picker so its number matches the
   *  day it goes out (Bo, Oct 18 2026: a Reel made for Thursday said "2 days out" when
   *  he wanted to post it Sunday). */
  eventStart?: string
  postDay?: string }

/** A Reel maker's settings, saved as a draft to pick up later. */
export type ReelSetup = { picks: string[]; order: number[]; len: number; song: string; day: string; coverIdx: number }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function daysBetween(from: string, to: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to)
  if (!a || !b) return null
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86_400_000)
}

const loadImg = (url: string) => new Promise<HTMLImageElement | null>(res => {
  if (!url) return res(null)
  const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url
})

function draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, style: string, t: number, event: string, sub: string, days: number | null, segDur = DUR) {
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H)
  // Background: the post itself, blurred and dark, slowly drifting.
  ctx.save()
  ctx.filter = 'blur(40px) brightness(0.42) saturate(1.2)'
  const bs = 1.5 + 0.06 * t / segDur
  ctx.drawImage(img, (W - W * bs) / 2, (H - 1350 * bs) / 2 - 40 * t / segDur, W * bs, 1350 * bs)
  ctx.restore()

  const kind = style.replace(/(-to)?-photo$/, '')
  // Intro: scale / offset / flip for the post, per look.
  let sx = 1, sy = 1, dx = 0, dy = 0, rot = 0, alpha = 1, show = true
  let flash = 0
  const push = 1 + 0.05 * clamp((t - 1) / (segDur - 1))
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
  if (t > segDur - 0.35) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - (segDur - 0.35)) / 0.35)})`; ctx.fillRect(0, 0, W, H) }
  ctx.restore()
}

/** Squad Reel end card: everyone's first name under the event, over a blurred post. */
function drawEnd(ctx: CanvasRenderingContext2D, t: number, len: number, bg: HTMLImageElement, event: string, sub: string, names: string[]) {
  ctx.save()
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.filter = 'blur(44px) brightness(0.3) saturate(1.2)'
  ctx.drawImage(bg, (W - W * 1.6) / 2, (H - 1350 * 1.6) / 2, W * 1.6, 1350 * 1.6); ctx.restore()
  const a = clamp(t / 0.4), up = (1 - easeOut(t / 0.6)) * 40
  ctx.globalAlpha = a; ctx.textAlign = 'center'
  ctx.fillStyle = '#cbd5e1'; ctx.font = '600 52px "Barlow Condensed", Arial, sans-serif'
  ctx.fillText('READY FOR', W / 2, 720 + up)
  ctx.fillStyle = '#ffffff'; ctx.font = '120px Anton, Impact, sans-serif'
  ctx.fillText(event.toUpperCase(), W / 2, 860 + up, W - 100)
  ctx.fillStyle = '#cbd5e1'; ctx.font = '600 40px "Barlow Condensed", Arial, sans-serif'
  ctx.fillText(sub.toUpperCase(), W / 2, 940 + up, W - 120)
  const who = names.filter(Boolean).map(n => n.toUpperCase()).join(' · ')
  if (who) { ctx.fillStyle = '#f97316'; ctx.font = '76px Anton, Impact, sans-serif'; ctx.fillText(who, W / 2, 1120 + up, W - 100) }
  ctx.fillStyle = '#ffffff'; ctx.font = '84px Anton, Impact, sans-serif'
  ctx.globalAlpha = a * clamp((t - 0.5) / 0.5)
  ctx.fillText('SEE YOU ON THE FIELD', W / 2, 1600)
  ctx.globalAlpha = 1
  if (t > len - 0.35) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - (len - 0.35)) / 0.35)})`; ctx.fillRect(0, 0, W, H) }
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

/** Which codecs an MP4 actually holds ('avc1'/'mp4a' sample entries vs 'vp09'/'Opus').
 *  Some browsers label a VP9 file video/mp4; Instagram only takes H.264 + AAC. */
async function mp4Codecs(blob: Blob): Promise<{ h264: boolean; aac: boolean }> {
  const u = new Uint8Array(await blob.arrayBuffer())
  const has = (tag: string) => { const c = [...tag].map(ch => ch.charCodeAt(0)); for (let i = 0; i < u.length - 4; i++) if (u[i] === c[0] && u[i + 1] === c[1] && u[i + 2] === c[2] && u[i + 3] === c[3]) return true; return false }
  return { h264: has('avc1') || has('avc3'), aac: has('mp4a') }
}

export default function ReelMaker({ src, style, label, event, sub, days: daysProp = null, fileName, onClose, token, initialSong, onUse, squad, eventStart, postDay, onSaveSetup, initialSetup, draftNote, onStartOver }: Props) {
  const today = dayKey(new Date())
  // Starts on today (Bo, Oct 18 2026: the first open day was Thursday, so a Reel he
  // wanted out now said "2 days out"). Pick another day here before making the Reel.
  const [day, setDay] = useState(initialSetup?.day && initialSetup.day >= today ? initialSetup.day : today)
  // The countdown number: days from the chosen posting day to the event, when we know both.
  const dayDays = eventStart ? daysBetween(day, eventStart) : null
  const days = eventStart ? (dayDays != null && dayDays >= 0 ? dayDays : null) : daysProp
  const squadMode = !!squad && squad.length > 1
  // The Siblings look only makes sense for players linked as siblings (picked in the tray).
  const canSiblings = style === 'siblings' || !!squad?.some(s => s.style === 'siblings')
  const isCustomLook = (s: string) => s in CUSTOM_REELS
  const [len, setLen] = useState<number>(initialSetup?.len && LENGTHS.some(l => l.sec === initialSetup.len) ? initialSetup.len : squadMode ? (squad!.length <= 2 ? 15 : 30) : 8)
  // The look for each part, picked by staff (Bo: "I'd like to be able to pick the looks").
  // One player: up to 4 parts, starting from the chosen look and Bo's favorites. Squad:
  // one part per player, each starting on the look picked in the tray.
  const [picks, setPicks] = useState<string[]>(() => initialSetup?.picks?.length ? initialSetup.picks : squadMode ? squad!.map(p => p.style)
    : [style, ...FAVORITE_STYLES.filter(s => s !== style && lookKind(s) !== lookKind(style))].slice(0, 4))
  const lookCount = squadMode ? squad!.length : token ? (LENGTHS.find(l => l.sec === len)?.looks || 1) : 1
  // Squad order (Bo: "reorder them ... I might watch the video and say it should be
  // different"): indexes into `squad`; picks stay keyed by the player's original index.
  const [order, setOrder] = useState<number[]>(() => initialSetup?.order?.length === (squad || []).length && (squad || []).length ? initialSetup.order : (squad || []).map((_, i) => i))
  const slots = squadMode ? order.map(i => ({ token: squad![i].token, style: picks[i] || squad![i].style, who: squad![i].first }))
    : picks.slice(0, lookCount).map(s => ({ token: token || '', style: s, who: '' }))
  const endDur = squadMode ? END : 0
  const single = slots.length === 1 && !squadMode
  const segDur = single ? (token && isCustomLook(slots[0].style) ? CUSTOM_REELS[slots[0].style] : DUR) : (len - endDur) / slots.length
  const dur = single ? segDur : len
  const slotsKey = slots.map(x => `${x.token}:${x.style}`).join('|') + `|${len}|${days ?? ''}`
  const hasCountdown = slots.some(x => lookKind(x.style) === 'countdown')
  const qDays = days != null && days >= 0 ? `?days=${days}` : ''
  const customs = useRef<Record<string, { data: ReelData; imgs: ReelImages }>>({})
  const imgsRef = useRef<(HTMLImageElement | null)[]>([])
  const paint = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, t: number) => {
    const imgs = imgsRef.current.length ? imgsRef.current : [img]
    const n = slots.length, body = n * segDur
    if (endDur && t >= body) { drawEnd(ctx, t - body, endDur, imgs[n - 1] || img, event, sub, slots.map(x => x.who)); return }
    const i = Math.max(0, Math.min(n - 1, Math.floor(t / segDur)))
    const tl = t - i * segDur, slot = slots[i], im = imgs[i] || img
    const c = slot.token ? customs.current[slot.token + qDays] : undefined
    if (c && isCustomLook(slot.style)) (slot.style === 'rookie' ? drawRookie : drawCountdown)(ctx, tl, c.data, { ...c.imgs, post: im })
    else draw(ctx, im, slot.style, tl, event, sub, days, segDur)
    if (n > 1 || endDur) { // a quick dip to black between parts
      let a = 0
      if ((i < n - 1 || endDur) && tl > segDur - 0.3) a = clamp((tl - (segDur - 0.3)) / 0.3)
      if (i > 0 && tl < 0.25) a = Math.max(a, 1 - clamp(tl / 0.25))
      if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H) }
    }
  }
  const canvas = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const raf = useRef(0)
  const [state, setState] = useState<'loading' | 'preview' | 'recording' | 'done' | 'error'>('loading')
  const [out, setOut] = useState<{ url: string; ext: string } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [song, setSong] = useState(initialSetup?.song || initialSong || 'trap-hype')         // a lib/reelSongs id | 'own' | 'none'
  const recorded = useRef<Blob | null>(null)
  const [using, setUsing] = useState(false)
  const [ownFile, setOwnFile] = useState<File | null>(null)
  const ownUrl = useRef('')
  const fileInput = useRef<HTMLInputElement>(null)
  // 'ig' (scheduler only): record without music; the post adds an Instagram song when it publishes.
  // The org's own music list (lib/reelMusic), next to the built-ins.
  const music = useOrgMusic()
  const songUrl = song === 'none' || song === 'ig' ? '' : song === 'own' ? ownUrl.current
    : isOrgSong(song) ? (music.tracks.find(t => orgSongId(t.id) === song)?.url || '') : trackUrl(song)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveCat, setSaveCat] = useState<string>('champions')
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  async function saveToList() {
    if (!ownFile || saving) return
    setSaving(true); setErr('')
    try { const t = await music.add(ownFile, saveTitle.trim() || titleFromFile(ownFile.name), saveCat); setSong(orgSongId(t.id)) }
    catch (e: any) { setErr(String(e?.message || 'Could not save the track')) }
    finally { setSaving(false) }
  }
  async function removeFromList() {
    const t = music.tracks.find(x => orgSongId(x.id) === song)
    if (!t) return
    try { await music.remove(t.id); setSong(initialSong || 'trap-hype') } catch (e: any) { setErr(String(e?.message || 'Could not remove it')) }
    setConfirmRemove(false)
  }
  const [showVideo, setShowVideo] = useState(false)   // after recording: the real video, with sound, instead of the silent loop
  const [err, setErr] = useState('')
  // The Reel's cover (Bo, Oct 18 2026: "pick the cover photo ourselves ... it kind of just
  // defaults to the last one"). One moment per part (player or look), plus the end card,
  // or for a one-look Reel three moments through it. Defaults to the first part.
  const lookName = (id: string) => POST_STYLES.find(x => x.id === id)?.label || id
  const covers: { t: number; label: string }[] = slots.length === 1 && !endDur
    ? [0.3, 0.6, 0.9].map((f, i) => ({ t: segDur * f, label: ['Start', 'Middle', 'End'][i] }))
    : [...slots.map((x, i) => ({ t: i * segDur + segDur * 0.65, label: x.who || lookName(x.style) })),
       ...(endDur ? [{ t: slots.length * segDur + endDur * 0.6, label: 'End card' }] : [])]
  const [coverIdx, setCoverIdx] = useState(initialSetup?.coverIdx || 0)
  const [thumbs, setThumbs] = useState<string[]>([])

  // Load every part's post (and the fonts), then loop the preview. Runs again when a
  // look or the length changes.
  useEffect(() => { setCoverIdx(i => Math.min(i, Math.max(0, covers.length - 1))); setThumbs([]) }, [slotsKey])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600&display=swap'
    document.head.appendChild(link)
    setState('loading'); setOut(null); recorded.current = null; setShowVideo(false); setErr('')
    cancelAnimationFrame(raf.current)
    const q = qDays
    ;(async () => {
      try { await Promise.all([document.fonts.load('68px Anton'), document.fonts.load('600 34px "Barlow Condensed"')]) } catch {}
      const imgs = await Promise.all(slots.map(x => loadImg(x.token ? `/pass/${encodeURIComponent(x.token)}/post/${x.style}.png${q}` : src)))
      if (!alive) return
      const first = imgs.find((x): x is HTMLImageElement => !!x)
      if (!first) { setErr('Could not load the post image.'); setState('error'); return }
      // Hand-built Reels (Rookie Card, Countdown) need each player's pieces, once per player.
      const need = Array.from(new Set(slots.filter(x => x.token && isCustomLook(x.style) && !customs.current[x.token + q]).map(x => x.token)))
      await Promise.all(need.map(async tk => {
        try {
          const data = await fetch(`/pass/${encodeURIComponent(tk)}/reel${q}`).then(r => r.ok ? r.json() : null)
          if (data) {
            const [photo, clubLogo, eventLogo] = await Promise.all([loadImg(data.photo), loadImg(data.clubLogo), loadImg(data.eventLogo)])
            customs.current[tk + q] = { data, imgs: { photo, clubLogo, eventLogo } }   // keyed by day too: the countdown number is in the data
          }
        } catch { /* fall back to the generic animation */ }
      }))
      if (!alive) return
      imgsRef.current = imgs.map(x => x || first)
      imgRef.current = first; setState('preview'); loop()
      if (onUse) setThumbs(coverThumbs(first))
    })()
    return () => { alive = false; cancelAnimationFrame(raf.current); link.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsKey])

  /** Small JPEG of each cover moment, painted off screen. */
  function coverThumbs(img: HTMLImageElement): string[] {
    try {
      const big = document.createElement('canvas'); big.width = W; big.height = H
      const small = document.createElement('canvas'); small.width = 144; small.height = 256
      const bctx = big.getContext('2d')!, sctx = small.getContext('2d')!
      return covers.map(c => { paint(bctx, img, c.t); sctx.drawImage(big, 0, 0, 144, 256); return small.toDataURL('image/jpeg', 0.7) })
    } catch { return [] }
  }

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
      const node = audioCtx.createBufferSource(); node.buffer = buf; node.loop = buf.duration < dur + 0.5
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
      const srcNode = audioCtx.createBufferSource(); srcNode.buffer = buf; srcNode.loop = buf.duration < dur + 0.5  // some tracks run 25–29 s
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
      recorded.current = blob
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

  // Scheduler: check the file is one Instagram takes, grab a cover frame, hand both over.
  const [usingDraft, setUsingDraft] = useState(false)
  const [savingSetup, setSavingSetup] = useState(false)
  async function saveSetup() {
    if (!onSaveSetup || savingSetup) return
    setSavingSetup(true); setErr('')
    // A file picked from the computer can't be kept with the draft; it reopens on the default song.
    try { await onSaveSetup({ picks, order, len, song: song === 'own' ? (initialSong || 'trap-hype') : song, day, coverIdx }) }
    catch (e: any) { setErr(String(e?.message || 'Could not save the draft')) }
    finally { setSavingSetup(false) }
  }
  async function useInPost(saveDraft = false) {
    const blob = recorded.current, c = canvas.current, img = imgRef.current
    if (!blob || !onUse || using) return
    setUsing(true); setUsingDraft(saveDraft); setErr('')
    try {
      const codecs = out?.ext === 'mp4' ? await mp4Codecs(blob) : { h264: false, aac: false }
      if (!codecs.h264 || (song !== 'none' && song !== 'ig' && !codecs.aac)) {
        setErr("This browser saved the video in a format Instagram won't accept. Make the Reel in Chrome on a computer, or Safari.")
        return
      }
      let poster: Blob | null = null
      if (c && img) {
        cancelAnimationFrame(raf.current)
        paint(c.getContext('2d')!, img, Math.min(dur - 0.05, (covers[coverIdx] || covers[0])?.t ?? dur * 0.7))
        poster = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.86))
        loop()
      }
      await onUse(blob, poster, dur, { igSong: song === 'ig', ...(eventStart ? { day } : {}), ...(squadMode ? { order } : {}), ...(saveDraft ? { saveDraft: true } : {}) })
    } catch (e: any) {
      setErr(String(e?.message || 'Upload failed'))
    } finally { setUsing(false) }
  }

  return (
    <div className={`fixed inset-0 ${onUse ? 'z-[60]' : 'z-40'} bg-slate-900/80 flex items-center justify-center p-3`} role="dialog" aria-modal="true" aria-label={`${label} Reel`} onClick={() => { if (!using) onClose() }}>
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
          {draftNote && state !== 'recording' && (
            <div className="flex items-center gap-2 rounded-lg bg-pink-50 border border-pink-200 px-2.5 py-1.5 text-xs text-pink-900">
              <Save size={13} className="shrink-0" /><span className="font-semibold flex-1 min-w-0">{draftNote}</span>
              {onStartOver && <button type="button" onClick={onStartOver} disabled={using} className="font-bold hover:underline shrink-0">Start over</button>}
            </div>
          )}
          {eventStart && state !== 'recording' && (
            <div className={`flex items-center gap-2 text-sm flex-wrap rounded-lg px-2.5 py-2 ${hasCountdown ? 'bg-orange-50 text-orange-900' : 'text-slate-700'}`}>
              <span className="font-semibold shrink-0">Posts on</span>
              <input type="date" value={day} min={today} max={eventStart} disabled={playing || using} onChange={e => e.target.value && setDay(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white" />
              {day !== today && <button type="button" onClick={() => setDay(today)} className="text-xs font-bold text-teal-700 hover:underline">Today</button>}
              <span className="text-xs">{day === today ? 'Today: the post opens 10 minutes from now, ready to approve or publish.' : postDay === day ? 'The next open day.' : ''}{hasCountdown && dayDays != null && dayDays >= 0 ? <b>{dayDays === 0 ? ' Countdown shows game day.' : ` Countdown shows ${dayDays} day${dayDays === 1 ? '' : 's'} out.`}</b> : ''}</span>
              {postDay && postDay !== day && postDay > today && <button type="button" onClick={() => setDay(postDay)} className="text-xs font-bold text-teal-700 hover:underline">Next open day</button>}
            </div>
          )}
          {token && state !== 'recording' && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <span className="font-semibold shrink-0">Length</span>
              <div className="flex-1 grid grid-cols-3 gap-1">
                {LENGTHS.filter(l => !squadMode || l.sec >= (squad!.length <= 2 ? 15 : 30)).map(l => <button key={l.sec} type="button" disabled={playing || using} onClick={() => setLen(l.sec)} className={`rounded-lg border px-2 py-1.5 text-xs font-bold ${len === l.sec ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-300 text-slate-600 hover:border-teal-400'}`}>{l.sec} sec<span className="block font-normal text-[10px] text-slate-500">{squadMode ? `${squad!.length} players` : l.looks === 1 ? '1 look' : `${l.looks} looks`}</span></button>)}
              </div>
            </div>
          )}
          {(token || squadMode) && state !== 'recording' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700">{squadMode ? 'Players & looks' : slots.length > 1 ? 'Looks, in order' : 'Look'}</span>
              {slots.map((x, i) => {
                const pi = squadMode ? order[i] : i   // which pick this row edits
                // Move a part up or down: squad → swap players; one player → swap looks.
                const move = (d: number) => {
                  const j = i + d; if (j < 0 || j >= slots.length) return
                  if (squadMode) setOrder(o => { const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n })
                  else setPicks(ps => { const n = [...ps]; [n[i], n[j]] = [n[j], n[i]]; return n })
                }
                return (
                <div key={`${x.token}-${i}`} className="flex items-center gap-2 text-xs text-slate-600">
                  {slots.length > 1 && <span className="flex flex-col shrink-0">
                    <button type="button" onClick={() => move(-1)} disabled={i === 0 || playing || using} aria-label="Move up" className="h-4 w-6 grid place-items-center text-slate-500 hover:text-slate-900 disabled:opacity-25"><ChevronUp size={14} /></button>
                    <button type="button" onClick={() => move(1)} disabled={i === slots.length - 1 || playing || using} aria-label="Move down" className="h-4 w-6 grid place-items-center text-slate-500 hover:text-slate-900 disabled:opacity-25"><ChevronDown size={14} /></button>
                  </span>}
                  <span className="w-20 shrink-0 font-semibold truncate">{squadMode ? `${i + 1}. ${x.who}` : `${i + 1}.`}</span>
                  <select value={x.style} disabled={playing || using} onChange={e => setPicks(ps => { const n = [...ps]; while (n.length <= pi) n.push(x.style); n[pi] = e.target.value; return n })} className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white">
                    {canSiblings && <option value="siblings">Siblings</option>}
                    <optgroup label="Favorites">{FAV_LOOKS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>
                    <optgroup label="More looks">{MORE_LOOKS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>
                  </select>
                </div>
              )})}
            </div>
          )}
          {state !== 'recording' && state !== 'loading' && state !== 'error' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="font-semibold shrink-0">Song</span>
              <select value={song} onChange={e => { if (e.target.value === '__add') { fileInput.current?.click(); return } setSong(e.target.value) }} disabled={playing}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {onUse && <option value="ig">Instagram trending song (pick it on the post)</option>}
                {groupTracks(music.tracks, music.categories).map(g => (
                  <optgroup key={g.label} label={g.label}>{g.tracks.map(t => <option key={t.id} value={orgSongId(t.id)}>{t.title}</option>)}</optgroup>
                ))}
                <optgroup label="Built-in">{REEL_SONGS.map(x => <option key={x.id} value={x.id}>{x.title} · {x.mood}</option>)}</optgroup>
                {ownFile && <option value="own">{ownFile.name} (your file)</option>}
                <option value="none">No music</option>
                <option value="__add">＋ Add music from your computer…</option>
              </select>
            </label>
          )}
          {state !== 'recording' && state !== 'loading' && state !== 'error' && (
            // Bo, Oct 18 2026: "I don't see where to add the music" (it was a small text link).
            <label className="w-full rounded-lg border border-dashed border-teal-400 bg-teal-50/40 hover:bg-teal-50 text-teal-800 text-sm font-semibold py-2 px-3 cursor-pointer inline-flex items-center justify-center gap-2 flex-wrap text-center">
              <Music size={15} /> Add music to your list (MP3)
              <input ref={fileInput} type="file" accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/wav,audio/x-m4a" className="sr-only"
                onChange={e => { const f = e.target.files?.[0]; if (f) { if (ownUrl.current) URL.revokeObjectURL(ownUrl.current); ownUrl.current = URL.createObjectURL(f); setOwnFile(f); setSong('own'); setSaveTitle(titleFromFile(f.name)) } e.target.value = '' }} />
              <span className="text-slate-500 font-normal text-xs w-full">Download a track (e.g. from Pixabay Music), pick it here, then Save it under a category</span>
            </label>
          )}
          {song === 'own' && ownFile && state !== 'recording' && (
            // Keep it for next time: it joins the org's music list under a category.
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-2 flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-teal-900">Save it to your music list for every Reel</span>
              <div className="flex gap-1.5 flex-wrap">
                <input value={saveTitle} onChange={e => setSaveTitle(e.target.value)} maxLength={80} placeholder="Track name" aria-label="Track name" className="flex-1 min-w-[120px] rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                <select value={saveCat} onChange={e => setSaveCat(e.target.value)} aria-label="Category" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white">
                  {allCategories(music.categories).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <button type="button" onClick={saveToList} disabled={saving || playing} className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          )}
          {isOrgSong(song) && state !== 'recording' && (
            <div className="text-xs text-slate-500 self-start">
              {confirmRemove
                ? <>Remove it from the music list? Reels already made keep it. <button type="button" onClick={removeFromList} className="font-bold text-rose-700 hover:underline">Yes, remove</button> · <button type="button" onClick={() => setConfirmRemove(false)} className="font-semibold hover:underline">Keep</button></>
                : <button type="button" onClick={() => setConfirmRemove(true)} className="hover:text-rose-700 hover:underline">Remove this track from the music list</button>}
            </div>
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
          {onUse && thumbs.length > 1 && state !== 'recording' && state !== 'loading' && state !== 'error' && (
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Cover</span><span className="text-xs text-slate-500"> · the still people see in the grid before they tap play</span>
              <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                {covers.map((c, i) => (
                  <button key={i} type="button" onClick={() => setCoverIdx(i)} disabled={using} aria-pressed={coverIdx === i} title={`Use ${c.label} as the cover`}
                    className={`flex-none w-16 rounded-lg overflow-hidden border-2 text-[10px] font-bold ${coverIdx === i ? 'border-teal-500 ring-2 ring-teal-200 text-teal-800' : 'border-transparent text-slate-500 hover:border-slate-300'}`}>
                    {thumbs[i] ? <img src={thumbs[i]} alt="" className="w-full aspect-[9/16] object-cover block bg-slate-900" /> : <span className="block w-full aspect-[9/16] bg-slate-200" />}
                    <span className="block truncate px-0.5 py-0.5">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {out && state !== 'recording' && onUse && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => useInPost(false)} disabled={using} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50 text-sm">
                <Check size={16} /> {using && !usingDraft ? 'Uploading…' : 'Use in a post'}
              </button>
              {/* Straight to the calendar as a draft, caption and Collab filled in; approve it later. */}
              <button type="button" onClick={() => useInPost(true)} disabled={using} className="rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold py-2.5 px-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50 text-sm">
                <Save size={16} /> {using && usingDraft ? 'Saving…' : 'Save as draft post'}
              </button>
            </div>
          )}
          {onSaveSetup && !out && state !== 'recording' && state !== 'loading' && (
            <button type="button" onClick={saveSetup} disabled={savingSetup || playing} className="w-full rounded-lg border border-slate-300 text-slate-700 hover:border-teal-400 font-semibold py-2 inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50">
              <Save size={15} /> {savingSetup ? 'Saving…' : 'Save draft to finish later'}
            </button>
          )}
          {out && state !== 'recording' && (
            <a href={out.url} download={`${fileName}.${out.ext}`} className="w-full rounded-lg border border-teal-600 text-teal-700 font-semibold py-2.5 inline-flex items-center justify-center gap-2"><Download size={16} /> Save {out.ext.toUpperCase()}</a>
          )}
          {song === 'ig' && <p className="text-xs text-pink-700">The Reel is made without music. On the post, pick a song from Instagram's trending list; Instagram adds it when it publishes.</p>}
          <p className="text-xs text-slate-500">The preview loops silently; press Play with sound to hear it with the music. After you make the Reel, the finished video plays here with sound before you save it. To use a trending sound instead, lower it in Instagram when you post. Post only once the family says Yes.</p>
        </div>
      </div>
    </div>
  )
}
