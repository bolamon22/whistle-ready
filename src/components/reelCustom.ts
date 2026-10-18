// Hand-built Reels for the looks that earn it (Bo, Oct 18 2026, after the Rookie Card
// sample: "go ahead" on the full treatment). Unlike the generic Reel, which animates the
// finished post image, these draw the post piece by piece on the canvas so parts can
// move on their own: the Rookie Card flies in and flips to its back; the Countdown
// races its number down and slams the tournament name in. Data comes from
// /pass/<token>/reel; images from /pass/<token>/img/<kind> (same origin, so the canvas
// can be recorded).

export type ReelData = {
  first: string; jersey: string; position: string; club: string; team: string; division: string
  event: { name: string; dates: string; location: string; startShort: string; year: string; daysOut: number | null }
}
export type ReelImages = { photo?: HTMLImageElement | null; clubLogo?: HTMLImageElement | null; eventLogo?: HTMLImageElement | null; post?: HTMLImageElement | null }

export const CUSTOM_REELS: Record<string, number> = { rookie: 9, countdown: 8, 'countdown-photo': 8 }

const W = 1080, H = 1920
const NAVY = '#13294b', ORANGE = '#f26b2a', CREAM = '#f6ead6', RED = '#b93a26', GOLD = '#f8d27a', HOT = '#f97316', TEAL = '#2dd4bf'
const ANTON = 'Anton, Impact, sans-serif'
const BAR = '"Barlow Condensed", "Arial Narrow", sans-serif'
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p), 3)
const easeInOut = (p: number) => { const x = clamp(p); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
const back = (p: number) => { const c = 1.7, x = clamp(p) - 1; return 1 + (c + 1) * x * x * x + c * x * x }

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, zoom = 1, topBias = 0.2) {
  const s = Math.max(w / img.width, h / img.height) * zoom
  const iw = img.width * s, ih = img.height * s
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) * topBias, iw, ih)
}
function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height)
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s)
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h)
}
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left', spacing = 0, maxW?: number) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
  ;(ctx as any).letterSpacing = `${spacing}px`
  if (maxW) ctx.fillText(s, x, y, maxW); else ctx.fillText(s, x, y)
  ;(ctx as any).letterSpacing = '0px'
}
/** Largest Anton size (up to max) at which s fits in maxW. */
function fitSize(ctx: CanvasRenderingContext2D, s: string, maxW: number, max: number) {
  ctx.font = `${max}px ${ANTON}`; const w = ctx.measureText(s).width
  return w > maxW ? Math.floor(max * maxW / w) : max
}
function mark(ctx: CanvasRenderingContext2D, cx: number, y: number, a: number, dark = true) {
  if (a <= 0) return
  ctx.save(); ctx.globalAlpha = a
  ctx.font = `34px ${ANTON}`
  const w1 = ctx.measureText('WHISTLE ').width, w2 = ctx.measureText('READY').width, w = w1 + w2 + 48
  rr(ctx, cx - w / 2, y - 44, w, 60, 30); ctx.fillStyle = dark ? NAVY : 'rgba(11,18,32,0.75)'; ctx.fill()
  text(ctx, 'WHISTLE ', cx - w / 2 + 24, y, `34px ${ANTON}`, '#ffffff')
  text(ctx, 'READY', cx - w / 2 + 24 + w1, y, `34px ${ANTON}`, TEAL)
  ctx.restore()
}
const dateShort = (d: ReelData) => (d.event.dates || '').replace(/,\s*\d{4}$/, '').toUpperCase()

// ── Rookie Card ─────────────────────────────────────────────────────────────────

export function drawRookie(ctx: CanvasRenderingContext2D, t: number, d: ReelData, im: ReelImages) {
  ctx.save()
  ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H)
  // Navy band sweeps in.
  ctx.save(); ctx.translate(W / 2, 1050); ctx.rotate(-8 * Math.PI / 180)
  ctx.translate(-(1 - easeOut((t - 0.1) / 0.8)) * 1900, 0)
  ctx.fillStyle = NAVY; ctx.fillRect(-840, -410, 1680, 820); ctx.restore()
  // Header.
  const ha = clamp((t - 0.3) / 0.5)
  ctx.save(); ctx.globalAlpha = ha
  const ev = (d.event.name || 'Game day').toUpperCase()
  ctx.font = `700 34px ${BAR}`; (ctx as any).letterSpacing = '9px'
  const ew = Math.min(ctx.measureText(ev).width, 760); (ctx as any).letterSpacing = '0px'
  const lx = W / 2 - (ew + (im.eventLogo ? 140 : 0)) / 2
  if (im.eventLogo) contain(ctx, im.eventLogo, lx, 110, 120, 120)
  text(ctx, ev, lx + (im.eventLogo ? 140 : 0), 185, `700 34px ${BAR}`, '#c2410c', 'left', 9, 760)
  ctx.restore()
  const tp = clamp((t - 0.6) / 0.45)
  if (tp > 0) {
    ctx.save(); ctx.globalAlpha = tp; ctx.translate(W / 2, 400); const s = 1.5 - 0.5 * back(tp); ctx.scale(s, s)
    text(ctx, 'ROOKIE CARD', 0, 0, `${fitSize(ctx, 'ROOKIE CARD', 960, 170)}px ${ANTON}`, NAVY, 'center'); ctx.restore()
  }
  // Card: fly in, then flip to the back and home again.
  const fp = easeOut((t - 1.0) / 0.9)
  const cw = 660, ch = 970, cx = W / 2, cy = 520 + ch / 2
  let ang = 0
  if (t > 3.4 && t <= 4.2) ang = Math.PI * easeInOut((t - 3.4) / 0.8)
  else if (t > 4.2 && t <= 6.0) ang = Math.PI
  else if (t > 6.0 && t <= 7.0) ang = Math.PI + Math.PI * easeInOut((t - 6.0) / 1.0)
  const sx = Math.cos(ang), showBack = sx < 0
  ctx.save()
  ctx.translate(cx, cy + (1 - fp) * 1400)
  ctx.rotate(((1 - fp) * 18 - 4 * fp) * Math.PI / 180)
  ctx.scale(Math.max(Math.abs(sx), 0.002), 1 + 0.04 * Math.sin(ang))
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 36
  if (!showBack) {
    const g = ctx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2)
    g.addColorStop(0, GOLD); g.addColorStop(0.45, ORANGE); g.addColorStop(1, RED)
    rr(ctx, -cw / 2, -ch / 2, cw, ch, 34); ctx.fillStyle = g; ctx.fill()
    ctx.shadowColor = 'transparent'
    const ix = -cw / 2 + 24, iy = -ch / 2 + 24, iw = cw - 48, ih = ch - 48
    ctx.save(); rr(ctx, ix, iy, iw, ih, 20); ctx.clip()
    ctx.fillStyle = '#0a1222'; ctx.fillRect(ix, iy, iw, ih)
    const pic = im.photo || im.post
    if (pic) cover(ctx, pic, ix, iy, iw, ih, 1.14 - 0.14 * clamp(t / 9))
    // Shine.
    const st = (t - 2.4) / 1.0
    if (st > 0 && st < 1) {
      const x = ix - 300 + st * (iw + 600)
      const sg = ctx.createLinearGradient(x - 130, 0, x + 130, 0)
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.5)'); sg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.save(); ctx.rotate(0.3); ctx.fillStyle = sg; ctx.fillRect(-2000, -2000, 4000, 4000); ctx.restore()
    }
    // Name bar.
    ctx.fillStyle = NAVY; ctx.fillRect(ix, iy + ih - 150, iw, 150)
    const nm = (d.first || 'Player').toUpperCase()
    text(ctx, nm, ix + 28, iy + ih - 72, `${fitSize(ctx, nm, 430, 76)}px ${ANTON}`, '#ffffff')
    text(ctx, [d.club, d.position].filter(Boolean).join(' · ').toUpperCase(), ix + 28, iy + ih - 30, `700 28px ${BAR}`, GOLD, 'left', 3, 440)
    if (d.jersey) text(ctx, d.jersey, ix + iw - 28, iy + ih - 40, `100px ${ANTON}`, ORANGE, 'right')
    ctx.restore()
    // RC badge pops.
    const bp = clamp((t - 2.0) / 0.35)
    if (bp > 0 && d.event.year) {
      ctx.save(); ctx.translate(ix + iw - 120, iy + 52); const s = back(bp); ctx.scale(s, s)
      rr(ctx, -100, -30, 200, 60, 30); ctx.fillStyle = GOLD; ctx.fill()
      text(ctx, `RC · ${d.event.year}`, 0, 12, `800 32px ${BAR}`, NAVY, 'center', 3); ctx.restore()
    }
  } else {
    // Back of the card. The flip uses |cos| for the width, so it already reads the right way round.
    rr(ctx, -cw / 2, -ch / 2, cw, ch, 34); ctx.fillStyle = ORANGE; ctx.fill()
    ctx.shadowColor = 'transparent'
    rr(ctx, -cw / 2 + 24, -ch / 2 + 24, cw - 48, ch - 48, 18); ctx.fillStyle = '#ffffff'; ctx.fill()
    const x0 = -cw / 2 + 70, x1 = cw / 2 - 70
    text(ctx, 'CARD BACK', x0, -ch / 2 + 110, `800 36px ${BAR}`, RED, 'left', 6)
    if (im.clubLogo) contain(ctx, im.clubLogo, x1 - 110, -ch / 2 + 50, 110, 110)
    const nm = `${(d.first || 'Player').toUpperCase()}${d.jersey ? ` #${d.jersey}` : ''}`
    text(ctx, nm, x0, -ch / 2 + 250, `${fitSize(ctx, nm, x1 - x0, 96)}px ${ANTON}`, NAVY)
    const rows = [['POSITION', d.position], ['CLUB', d.club], ['TEAM', d.team && d.team !== d.club ? d.team : ''], ['DIVISION', d.division],
      ['DEBUT', d.event.startShort ? `${d.event.startShort}${d.event.year ? `, ${d.event.year}` : ''}` : '']].filter(r => r[1])
    rows.forEach(([k, v], i) => {
      const a = clamp((t - (4.3 + i * 0.15)) / 0.35), y = -ch / 2 + 320 + i * 96
      ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - a) * 40, 0)
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x0, y, x1 - x0, 3)
      text(ctx, k, x0, y + 62, `700 28px ${BAR}`, '#64748b', 'left', 4)
      text(ctx, v, x1, y + 64, `700 40px ${BAR}`, NAVY, 'right', 0, 330)
      ctx.restore()
    })
  }
  ctx.restore()
  // Footer + mark.
  const fa = clamp((t - 7.2) / 0.6)
  if (fa > 0) {
    ctx.save(); ctx.globalAlpha = fa; ctx.translate(0, (1 - fa) * 60)
    text(ctx, dateShort(d) || ev, W / 2, 1690, `84px ${ANTON}`, NAVY, 'center')
    text(ctx, (d.event.location || '').toUpperCase(), W / 2, 1745, `700 36px ${BAR}`, '#334155', 'center', 8, 900)
    ctx.restore()
  }
  mark(ctx, W / 2, 1855, clamp((t - 7.6) / 0.5))
  ctx.restore()
}

// ── Countdown ───────────────────────────────────────────────────────────────────

export function drawCountdown(ctx: CanvasRenderingContext2D, t: number, d: ReelData, im: ReelImages) {
  ctx.save()
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H)
  const pic = im.photo || im.post
  // Photo full-bleed, darkening less as the reveal lands.
  if (pic) {
    ctx.save()
    ctx.globalAlpha = clamp((t - 0.2) / 0.8)
    cover(ctx, pic, 0, 0, W, H, 1.18 - 0.12 * clamp(t / 8), 0.25)
    ctx.restore()
  }
  const dark = 0.82 - 0.3 * easeOut((t - 2.2) / 1.0)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, `rgba(0,0,0,${dark})`); g.addColorStop(0.45, `rgba(0,0,0,${dark * 0.55})`); g.addColorStop(0.7, 'rgba(10,10,10,0.85)'); g.addColorStop(1, '#0a0a0a')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

  // The number races down from 10, each tick slamming in, then settles top-left.
  const target = d.event.daysOut
  const gameDay = target == null || target <= 0
  const from = Math.max(10, (target ?? 0) + 5)
  const steps = gameDay ? 0 : from - (target as number)
  const race = 1.9
  const settle = easeInOut((t - 2.1) / 0.6)
  let n: string
  if (gameDay) n = 'GAME DAY'
  else { const k = Math.min(steps, Math.floor(steps * clamp(t / race) ** 0.7)); n = String(from - k) }
  const tickT = gameDay ? t : ((t / race) * steps) % 1
  const slam = t < race ? 1 + 0.25 * (1 - easeOut(tickT * 3)) : 1
  const bigSize = gameDay ? fitSize(ctx, n, 960, 260) : 620
  const endSize = gameDay ? fitSize(ctx, n, 960, 220) : 300
  const size = bigSize + (endSize - bigSize) * settle
  const x = W / 2 + ((gameDay ? W / 2 : 80) - W / 2) * settle
  const y = 1080 + (1120 - 1080) * settle
  ctx.save()
  ctx.translate(x, y); ctx.scale(slam, slam)
  ctx.font = `${size}px ${ANTON}`; ctx.fillStyle = HOT
  ctx.textAlign = gameDay ? 'center' : (settle > 0.5 ? 'left' : 'center'); ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40
  ctx.fillText(n, 0, 0)
  const nw = ctx.measureText(n).width
  ctx.restore()
  // "DAYS OUT" slides in beside the number.
  if (!gameDay) {
    const a = easeOut((t - 2.5) / 0.5)
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a
      text(ctx, target === 1 ? 'DAY OUT' : 'DAYS OUT', 80 + nw + 30 + (1 - a) * 300, 1110, `130px ${ANTON}`, '#ffffff')
      ctx.restore()
    }
  }
  // Lockup up top: team logo + event logo, and dates.
  const la = clamp((t - 3.0) / 0.5)
  if (la > 0) {
    ctx.save(); ctx.globalAlpha = la
    let lx = 80
    for (const lg of [im.clubLogo, im.eventLogo]) {
      if (!lg) continue
      rr(ctx, lx, 110, 150, 150, 22); ctx.fillStyle = '#ffffff'; ctx.fill()
      contain(ctx, lg, lx + 12, 122, 126, 126); lx += 170
    }
    text(ctx, dateShort(d), W - 80, 170, `700 38px ${BAR}`, '#ffffff', 'right', 7)
    text(ctx, (d.event.location || '').toUpperCase(), W - 80, 220, `700 38px ${BAR}`, '#cbd5e1', 'right', 7, 520)
    ctx.restore()
  }
  // "<NAME> IS READY FOR" + the tournament name slams in.
  const ra = clamp((t - 3.2) / 0.4)
  if (ra > 0) {
    ctx.save(); ctx.globalAlpha = ra; ctx.translate(0, (1 - ra) * 40)
    const nm = (d.first || 'Player').toUpperCase()
    ctx.font = `700 60px ${BAR}`; (ctx as any).letterSpacing = '4px'
    const w1 = ctx.measureText(`${nm} `).width; (ctx as any).letterSpacing = '0px'
    text(ctx, `${nm} `, 80, 1290, `700 60px ${BAR}`, '#ffffff', 'left', 4)
    text(ctx, 'IS READY FOR', 80 + w1, 1290, `700 60px ${BAR}`, '#94a3b8', 'left', 4)
    ctx.restore()
  }
  const ea = clamp((t - 3.6) / 0.35)
  if (ea > 0) {
    const ev = `${(d.event.name || 'GAME DAY').toUpperCase()}.`
    const fs = fitSize(ctx, ev, W - 160, 170)
    ctx.save(); ctx.globalAlpha = ea
    ctx.translate(80, 1290 + fs + 10); const s = 1.35 - 0.35 * back(ea); ctx.scale(s, s)
    text(ctx, ev, 0, 0, `${fs}px ${ANTON}`, HOT)
    ctx.restore()
    if (t > 3.6 && t < 4.0) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - (t - 3.6) / 0.4)})`; ctx.fillRect(0, 0, W, H) }
  }
  // Sign-off.
  const sa = clamp((t - 5.4) / 0.6)
  if (sa > 0) {
    ctx.save(); ctx.globalAlpha = sa
    text(ctx, 'SEE YOU ON THE FIELD', W / 2, 1720 + (1 - sa) * 40, `80px ${ANTON}`, '#ffffff', 'center')
    ctx.restore()
  }
  mark(ctx, W / 2, 1850, clamp((t - 5.9) / 0.5), false)
  ctx.restore()
}
