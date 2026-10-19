import type { CSSProperties, ReactElement } from 'react'
import { ANTON, BARLOW, MONO, SERIF, SCRIPT, fit, cut, topCrop, svgImg, mapleLeaf, ovalLeaf, LEAF_COLORS, snowflake, pumpkin, snowField, seeded, tiled } from '@/lib/postKit'
import type { PostData } from '@/lib/socialPosts'

// Seasonal post looks (Bo, Oct 18 2026: "different themes for the holidays ... fall themed
// for the Fall Classic ... a lot of different Christmas themed versions" for Jingle Brawl).
// Fall: Harvest Moon, Falling Leaves Countdown, Letterman Jacket, Under the Lights, Fall
// Foliage (with a little Thanksgiving). Christmas: Ugly Sweater, Nice List, Snow Globe, Gift
// Tag. Same contract as lib/socialPosts: 1080×1350, Satori-safe, first name and team only.

export const SEASONAL_LOOKS = new Set([
  'harvest-moon', 'fall-countdown', 'letterman', 'under-the-lights', 'fall-foliage',
  'ugly-sweater', 'nice-list', 'snow-globe', 'gift-tag',
])
/** Where the small Whistle Ready mark sits on each seasonal look. */
export const SEASONAL_MARK: Record<string, CSSProperties> = {
  'harvest-moon': { right: 30, bottom: 24 },
  'fall-countdown': { right: 30, bottom: 24 },
  letterman: { right: 40, bottom: 196 },
  'under-the-lights': { right: 30, bottom: 24 },
  'fall-foliage': { right: 30, bottom: 24 },
  'ugly-sweater': { right: 30, top: 160 },
  'nice-list': { right: 30, bottom: 24 },
  'snow-globe': { right: 30, bottom: 24 },
  'gift-tag': { right: 30, bottom: 24 },
}

const W = 1080, H = 1350

export function SeasonalBody({ style, d, width = W }: { style: string; d: PostData; width?: number }): ReactElement {
  const k = width / W
  const u = (n: number) => Math.round(n * k * 10) / 10
  const first = (d.first || 'Player').toUpperCase()
  const firstName = d.first || 'Player'
  const team = cut(d.team || d.club || '', 34)
  const event = d.tournamentName || 'Game Day'
  const EVENT = event.toUpperCase()
  const year = d.year || ''
  const num = d.jersey ? cut(d.jersey, 3) : ''
  const dateShort = (d.dates || '').replace(/,\s*\d{4}$/, '').toUpperCase()
  const where = cut(d.location || '', 34).toUpperCase()
  const when = [dateShort, where].filter(Boolean).join('  ·  ')
  const root: CSSProperties = { width: u(W), height: u(H), display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden', color: '#ffffff', fontFamily: BARLOW }
  const caps = (size: number, color: string, spacing = 0.16, weight = 700): CSSProperties => ({ fontSize: u(size), fontWeight: weight, letterSpacing: `${spacing}em`, color, display: 'flex' })
  const abs = (x: number, y: number, extra: CSSProperties = {}): CSSProperties => ({ position: 'absolute', left: u(x), top: u(y), display: 'flex', ...extra })
  // The player's photo, cropped from the top; their card when there's no photo.
  const photo = (w: number, h: number, extra: CSSProperties = {}) => d.photoSrc && d.photoW && d.photoH
    ? topCrop(d.photoSrc, w, h, d.photoW, d.photoH, u, extra)
    : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.photoSrc || d.cardSrc} width={u(w)} height={u(h)} alt="" style={{ objectFit: d.photoSrc ? 'cover' : 'contain', background: '#0a1222', ...extra }} />
    )
  const eventLogo = (size: number, tile = true) => d.logoSrc ? (
    <div style={{ display: 'flex', background: tile ? '#ffffff' : 'transparent', borderRadius: u(14), padding: tile ? u(8) : 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.logoSrc} width={u(size)} height={u(size)} alt="" style={{ objectFit: 'contain' }} />
    </div>
  ) : null
  const teamLogo = (size: number) => d.clubLogoSrc ? (
    <div style={{ display: 'flex', background: '#ffffff', borderRadius: u(14), padding: u(8) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.clubLogoSrc} width={u(size)} height={u(size)} alt="" style={{ objectFit: 'contain' }} />
    </div>
  ) : null
  const logos = (size: number, extra: CSSProperties = {}) => (d.logoSrc || d.clubLogoSrc) ? (
    <div style={{ display: 'flex', alignItems: 'center', ...extra }}>
      {teamLogo(size)}{d.clubLogoSrc && d.logoSrc ? <div style={{ display: 'flex', width: u(14) }} /> : null}{eventLogo(size)}
    </div>
  ) : null
  // Leaves scattered over the given boxes, the same way every time for a given seed.
  const leaves = (spots: [number, number, number, number][], seed = 3) => {
    const r = seeded(seed)
    return spots.map(([x, y, size, rot], i) => (
      <div key={`lf${i}`} style={abs(x, y, { transform: `rotate(${rot}deg)` })}>
        {svgImg((i % 3 === 2 ? ovalLeaf : mapleLeaf)(LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)]), size, size, u)}
      </div>
    ))
  }
  const flakes = (spots: [number, number, number][], color = '#ffffff', opacity = 0.9) => spots.map(([x, y, size], i) => (
    <div key={`sf${i}`} style={abs(x, y, { opacity })}>{svgImg(snowflake(color), size, size, u)}</div>
  ))

  // ── FALL ─────────────────────────────────────────────────────────────────────
  if (style === 'harvest-moon') {
    const moon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="m" cx="42%" cy="40%" r="60%"><stop offset="0" stop-color="#ffe2a0"/><stop offset="0.55" stop-color="#f7a23b"/><stop offset="1" stop-color="#d9631c"/></radialGradient><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0.62" stop-color="#f59e0b" stop-opacity="0.45"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><circle cx="50" cy="50" r="31" fill="url(#m)"/><circle cx="38" cy="42" r="4" fill="#e9852a" fill-opacity="0.45"/><circle cx="60" cy="58" r="6" fill="#e9852a" fill-opacity="0.35"/><circle cx="56" cy="34" r="3" fill="#e9852a" fill-opacity="0.4"/></svg>`
    const hills = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 260" preserveAspectRatio="none"><path d="M0 120 C180 40 320 150 520 90 C720 30 860 130 1080 70 L1080 260 L0 260 Z" fill="#2a120a"/><path d="M0 180 C200 120 420 210 640 160 C820 120 960 190 1080 150 L1080 260 L0 260 Z" fill="#1a0b06"/></svg>`
    return (
      <div style={{ ...root, backgroundImage: 'linear-gradient(180deg, #1c1033 0%, #3f1a2a 45%, #6b2a12 100%)' }}>
        <div style={abs(-110, 60)}>{svgImg(moon, 1300, 1300, u)}</div>
        <div style={abs(0, 1090)}>{svgImg(hills, 1080, 260, u)}</div>
        {logos(70, { position: 'absolute', top: u(36), left: u(40) })}
        <div style={{ ...caps(30, '#fde3b0', 0.42, 800), marginTop: u(60) }}>HARVEST SEASON</div>
        <div style={{ display: 'flex', marginTop: u(26), borderRadius: `${u(300)}px ${u(300)}px ${u(22)}px ${u(22)}px`, boxShadow: `0 ${u(30)}px ${u(90)}px rgba(0,0,0,0.6)` }}>
          {photo(600, 690, { borderRadius: `${u(300)}px ${u(300)}px ${u(22)}px ${u(22)}px`, border: `${u(10)}px solid #fde3b0` })}
        </div>
        {leaves([[70, 260, 120, -25], [880, 300, 110, 30], [130, 820, 90, 15], [860, 760, 130, -40], [760, 170, 70, 60], [220, 560, 64, -70], [930, 560, 60, 10]], 11)}
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 900, 130)), lineHeight: 1, color: '#fff3dc', marginTop: u(26), letterSpacing: '0.02em' }}>{first}</div>
        <div style={{ display: 'flex', fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: u(fit(`is ready for the ${event}`, 960, 46, 0.42)), color: '#fbbf24', marginTop: u(6) }}>{`is ready for the ${event}`}</div>
        <div style={{ ...caps(24, 'rgba(255,243,220,0.75)', 0.24), marginTop: u(16) }}>{[team.toUpperCase(), when].filter(Boolean).join('  ·  ')}</div>
      </div>
    )
  }

  if (style === 'fall-countdown') {
    const n = d.daysOut
    const big = n != null && n > 0 ? String(n) : ''
    return (
      <div style={{ ...root, backgroundImage: 'linear-gradient(160deg, #3a1a08 0%, #22110a 60%, #140a06 100%)' }}>
        {leaves([[40, 40, 110, -20], [900, 30, 120, 25], [600, 120, 70, 70], [30, 560, 80, 40], [960, 640, 90, -30], [80, 1150, 120, 15], [880, 1160, 110, -55], [470, 1240, 70, 20], [320, 70, 60, -60]], 5)}
        {logos(64, { marginTop: u(46) })}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(20) }}>
          {big ? <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(330), lineHeight: 0.86, color: '#f97316' }}>{big}</div> : null}
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: big ? u(30) : 0 }}>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(big ? 120 : 170), lineHeight: 0.95, color: '#fff7ed' }}>{big ? (n === 1 ? 'DAY' : 'DAYS') : 'GAME DAY'}</div>
            {big ? <div style={{ ...caps(44, '#fdba74', 0.3, 800) }}>TO THE</div> : null}
          </div>
        </div>
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(EVENT, 960, 92)), lineHeight: 1, color: '#fdba74', marginTop: u(6) }}>{EVENT}</div>
        <div style={{ display: 'flex', marginTop: u(26), boxShadow: `0 ${u(26)}px ${u(80)}px rgba(0,0,0,0.6)`, transform: 'rotate(-1.5deg)' }}>
          {photo(860, 620, { borderRadius: u(24), border: `${u(8)}px solid #fdba74` })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(30) }}>
          <div style={caps(48, '#fff7ed', 0.08, 800)}>{first}</div>
          <div style={{ ...caps(48, '#fdba74', 0.08, 800), marginLeft: u(14) }}>IS READY.</div>
        </div>
        <div style={{ ...caps(24, 'rgba(255,247,237,0.6)', 0.24), marginTop: u(8) }}>{[team.toUpperCase(), when].filter(Boolean).join('  ·  ')}</div>
      </div>
    )
  }

  if (style === 'letterman') {
    const MAROON = '#5c1222', CREAM = '#f3e6c4', GOLD = '#d6a84a'
    const patch = num || firstName.charAt(0).toUpperCase()
    const wool = tiled(`<rect width="14" height="14" fill="${MAROON}"/><path d="M0 14 L14 0 M-4 4 L4 -4 M10 18 L18 10" stroke="#521020" stroke-width="2"/>`, 14, 14, W, H)
    const pSize = patch.length >= 3 ? 230 : patch.length === 2 ? 300 : 360
    return (
      <div style={{ ...root, background: MAROON }}>
        <div style={abs(0, 0)}>{svgImg(wool, W, H, u, { objectFit: 'cover' })}</div>
        <div style={abs(0, 1190, { flexDirection: 'column', width: u(W) })}>
          {[CREAM, MAROON, CREAM, MAROON, CREAM].map((c, i) => <div key={i} style={{ display: 'flex', width: u(W), height: u(i % 2 ? 22 : 30), background: c }} />)}
        </div>
        <div style={abs(60, 52, { alignItems: 'center' })}>
          <div style={caps(30, GOLD, 0.4, 800)}>{year ? `VARSITY  ·  CLASS OF ${year}` : 'VARSITY'}</div>
        </div>
        <div style={abs(60, 120)}>{photo(560, 780, { border: `${u(14)}px solid ${CREAM}`, borderRadius: u(10), boxShadow: `0 ${u(24)}px ${u(70)}px rgba(0,0,0,0.55)` })}</div>
        <div style={abs(640, 120, { width: u(400), flexDirection: 'column', alignItems: 'center' })}>
          <div style={{ display: 'flex', position: 'relative', width: u(400), height: u(400), alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', display: 'flex', fontFamily: ANTON, fontSize: u(pSize), lineHeight: 1, color: GOLD, WebkitTextStroke: `${u(30)}px ${GOLD}` } as CSSProperties}>{patch}</div>
            <div style={{ position: 'absolute', display: 'flex', fontFamily: ANTON, fontSize: u(pSize), lineHeight: 1, color: CREAM, WebkitTextStroke: `${u(12)}px ${MAROON}` } as CSSProperties}>{patch}</div>
            <div style={{ position: 'absolute', display: 'flex', fontFamily: ANTON, fontSize: u(pSize), lineHeight: 1, color: CREAM }}>{patch}</div>
          </div>
          <div style={{ display: 'flex', fontFamily: SCRIPT, fontSize: u(fit(firstName, 380, 150, 0.42)), lineHeight: 1.1, color: CREAM, marginTop: u(10) }}>{firstName}</div>
          {d.position ? <div style={{ ...caps(28, GOLD, 0.24, 800), marginTop: u(10) }}>{cut(d.position.toUpperCase(), 18)}</div> : null}
          <div style={{ ...caps(24, CREAM, 0.16, 700), marginTop: u(10), textAlign: 'center', maxWidth: u(380) }}>{team.toUpperCase()}</div>
          {logos(80, { marginTop: u(24) })}
        </div>
        <div style={abs(0, 950, { width: u(W), flexDirection: 'column', alignItems: 'center' })}>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(EVENT, 980, 140)), lineHeight: 1, color: CREAM, letterSpacing: '0.03em' }}>{EVENT}</div>
          <div style={{ ...caps(28, GOLD, 0.3, 800), marginTop: u(12) }}>{when}</div>
        </div>
      </div>
    )
  }

  if (style === 'under-the-lights') {
    const tower = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 700"><defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe6" stop-opacity="0.95"/><stop offset="0.35" stop-color="#fde68a" stop-opacity="0.5"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient></defs><circle cx="150" cy="120" r="150" fill="url(#glow)"/><rect x="60" y="70" width="180" height="100" rx="8" fill="#1f2937"/>${[0, 1, 2].map(r => [0, 1, 2, 3].map(c => `<circle cx="${88 + c * 41}" cy="${92 + r * 28}" r="11" fill="#fffbeb"/>`).join('')).join('')}<path d="M140 170 L130 700 L170 700 L160 170 Z" fill="#111827"/><path d="M136 260 L164 300 M164 260 L136 300 M134 380 L166 420 M166 380 L134 420 M132 500 L168 540 M168 500 L132 540" stroke="#111827" stroke-width="6"/></svg>`
    const beams = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 900" preserveAspectRatio="none"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fef3c7" stop-opacity="0.35"/><stop offset="1" stop-color="#fef3c7" stop-opacity="0"/></linearGradient></defs><path d="M130 120 L60 900 L520 900 Z" fill="url(#b)"/><path d="M950 120 L560 900 L1020 900 Z" fill="url(#b)"/></svg>`
    const turf = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 150" preserveAspectRatio="none"><rect width="1080" height="150" fill="#14532d"/><rect y="0" width="1080" height="75" fill="#166534"/><path d="M0 10 L1080 10 M180 10 L120 150 M540 10 L540 150 M900 10 L960 150" stroke="#ffffff" stroke-opacity="0.85" stroke-width="6"/></svg>`
    return (
      <div style={{ ...root, backgroundImage: 'linear-gradient(180deg, #030712 0%, #0b1736 45%, #0a1a2f 75%, #052e16 100%)' }}>
        <div style={abs(0, 120)}>{svgImg(beams, W, 900, u)}</div>
        <div style={abs(-110, -70)}>{svgImg(tower, 300, 700, u)}</div>
        <div style={abs(890, -70)}>{svgImg(tower, 300, 700, u)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: u(70) }}>
          <div style={caps(30, '#fde68a', 0.5, 800)}>{cut(EVENT, 30)}</div>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(132), lineHeight: 1, color: '#ffffff', marginTop: u(6) }}>UNDER THE LIGHTS</div>
        </div>
        <div style={{ display: 'flex', marginTop: u(28), boxShadow: `0 0 ${u(70)}px rgba(253,230,138,0.35)` }}>
          {photo(860, 760, { borderRadius: u(20), border: `${u(6)}px solid rgba(253,230,138,0.85)` })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(24) }}>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 520, 96)), lineHeight: 1 }}>{first}</div>
          {num ? <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(96), lineHeight: 1, color: '#fde68a', marginLeft: u(22) }}>{`#${num}`}</div> : null}
          <div style={{ ...caps(28, '#cbd5e1', 0.14, 700), marginLeft: u(26), maxWidth: u(340) }}>{team.toUpperCase()}</div>
        </div>
        <div style={abs(0, 1200)}>{svgImg(turf, W, 150, u)}</div>
        <div style={abs(0, 1262, { width: u(W), justifyContent: 'center' })}><div style={caps(30, '#ffffff', 0.3, 800)}>{when}</div></div>
      </div>
    )
  }

  if (style === 'fall-foliage') {
    const RUST = '#8a2f16', BROWN = '#5b3418'
    return (
      <div style={{ ...root, background: '#f6ebd9' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: u(52) }}>
          <div style={caps(26, BROWN, 0.5, 800)}>THE SEASON OF</div>
          <div style={{ display: 'flex', fontFamily: SERIF, fontWeight: 800, fontSize: u(fit(event, 980, 104, 0.52)), lineHeight: 1.05, color: RUST }}>{event}</div>
        </div>
        <div style={{ display: 'flex', position: 'relative', width: u(840), height: u(860), marginTop: u(26), justifyContent: 'center' }}>
          <div style={{ display: 'flex', position: 'absolute', left: u(70), top: u(30), boxShadow: `0 ${u(20)}px ${u(60)}px rgba(91,52,24,0.35)` }}>
            {photo(700, 800, { borderRadius: u(14), border: `${u(14)}px solid #ffffff` })}
          </div>
          {leaves([[-10, -20, 150, -30], [90, -40, 110, 20], [-40, 110, 110, 60], [600, 690, 160, 25], [720, 600, 120, -20], [520, 780, 100, 70], [700, 760, 90, 10], [20, 230, 70, -10]], 9)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(14) }}>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 520, 84)), lineHeight: 1, color: BROWN }}>{first}</div>
          <div style={{ ...caps(26, RUST, 0.16, 800), marginLeft: u(22), maxWidth: u(420) }}>{[num ? `#${num}` : '', team.toUpperCase()].filter(Boolean).join('  ·  ')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(8) }}>
          {svgImg(pumpkin(), 56, 56, u)}
          <div style={{ display: 'flex', fontFamily: SCRIPT, fontSize: u(58), color: RUST, margin: `0 ${u(16)}px` }}>Thankful for game day</div>
          {svgImg(pumpkin(), 56, 56, u)}
        </div>
        <div style={{ ...caps(24, BROWN, 0.28, 700), marginTop: u(6) }}>{when}</div>
      </div>
    )
  }

  // ── CHRISTMAS ────────────────────────────────────────────────────────────────
  if (style === 'ugly-sweater') {
    const RED = '#b3122e', GREEN = '#0f5132', WHITE = '#fff7f0'
    const knit = tiled(`<rect width="16" height="16" fill="${RED}"/><path d="M1 3 L4 8 L7 3 M9 3 L12 8 L15 3 M1 11 L4 16 L7 11 M9 11 L12 16 L15 11" stroke="#a10f29" stroke-width="1.6" fill="none"/>`, 16, 16, W, H)
    const zig = (fill: string, bg: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 40" preserveAspectRatio="none"><rect width="1080" height="40" fill="${bg}"/><path d="${Array.from({ length: 28 }, (_, i) => `${i ? 'L' : 'M'}${i * 40} ${i % 2 ? 4 : 36}`).join(' ')} L1080 40 L0 40 Z" fill="${fill}"/></svg>`
    const trees = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 70">${Array.from({ length: 12 }, (_, i) => `<path d="M${45 + i * 90} 6 L${75 + i * 90} 60 L${15 + i * 90} 60 Z" fill="${WHITE}"/><rect x="${41 + i * 90}" y="60" width="8" height="8" fill="${WHITE}"/>`).join('')}</svg>`
    const band = (y: number) => (
      <div style={abs(0, y, { flexDirection: 'column', width: u(W) })}>
        {svgImg(zig(WHITE, GREEN), W, 40, u)}
        <div style={{ display: 'flex', width: u(W), height: u(90), background: GREEN, alignItems: 'center', justifyContent: 'center' }}>{svgImg(trees, W, 70, u)}</div>
        {svgImg(zig(GREEN, WHITE), W, 40, u, { transform: 'rotate(180deg)' })}
      </div>
    )
    return (
      <div style={{ ...root, background: RED }}>
        <div style={abs(0, 0)}>{svgImg(knit, W, H, u, { objectFit: 'cover' })}</div>
        {band(0)}
        {band(1180)}
        {flakes([[60, 330, 70], [950, 360, 80], [40, 900, 64], [970, 930, 60], [120, 620, 44], [930, 650, 48]], WHITE, 0.95)}
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(EVENT, 960, 128)), lineHeight: 1, color: WHITE, marginTop: u(196), WebkitTextStroke: `${u(4)}px ${GREEN}`, letterSpacing: '0.04em' } as CSSProperties}>{EVENT}</div>
        <div style={{ display: 'flex', marginTop: u(22), boxShadow: `0 ${u(20)}px ${u(60)}px rgba(0,0,0,0.4)` }}>
          {photo(580, 590, { border: `${u(16)}px solid ${WHITE}`, borderRadius: u(12) })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(22) }}>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 520, 90)), lineHeight: 1, color: WHITE }}>{first}</div>
          <div style={{ ...caps(28, '#fde68a', 0.14, 800), marginLeft: u(22), maxWidth: u(400) }}>{[num ? `#${num}` : '', team.toUpperCase()].filter(Boolean).join('  ·  ')}</div>
        </div>
        <div style={{ ...caps(26, WHITE, 0.3, 800), marginTop: u(10) }}>{`SWEATER WEATHER. LAX WEATHER.  ·  ${dateShort}`}</div>
      </div>
    )
  }

  if (style === 'nice-list') {
    const INK = '#3b2412', RED = '#b91c1c', PAPER = '#f8eed6'
    const box = (checked: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect x="5" y="5" width="50" height="50" rx="6" fill="none" stroke="${INK}" stroke-width="5"/>${checked ? `<path d="M14 30 L26 44 L52 8" stroke="${RED}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</svg>`
    const seal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4 C62 8 72 4 80 14 C90 22 94 34 96 46 C98 60 92 70 86 80 C76 90 64 96 50 96 C34 96 22 90 14 80 C6 68 4 56 6 44 C8 30 16 18 28 10 C36 6 42 4 50 4 Z" fill="#9f1239"/><circle cx="50" cy="50" r="30" fill="none" stroke="#7f1d1d" stroke-width="4"/><path d="M50 30 L56 44 L71 44 L59 53 L63 68 L50 59 L37 68 L41 53 L29 44 L44 44 Z" fill="#7f1d1d"/></svg>`
    const row = (label: string, value: string) => (
      <div key={label} style={{ display: 'flex', alignItems: 'flex-end', fontFamily: MONO, fontSize: u(36), color: INK, marginTop: u(14), borderBottom: `${u(2)}px dashed rgba(59,36,18,0.35)`, paddingBottom: u(6), width: u(470) }}>
        <div style={{ display: 'flex', fontWeight: 700, width: u(170) }}>{label}</div>
        <div style={{ display: 'flex' }}>{cut(value, 18)}</div>
      </div>
    )
    return (
      <div style={{ ...root, background: '#0e3b26' }}>
        {flakes([[40, 30, 70], [960, 40, 60], [30, 1240, 60], [980, 1230, 70], [520, 1270, 40]], '#ffffff', 0.5)}
        <div style={abs(70, 90, { width: u(940), height: u(1160), backgroundImage: `radial-gradient(circle at 50% 40%, ${PAPER} 60%, #e8d3a8 100%)`, borderRadius: u(18), boxShadow: `0 ${u(30)}px ${u(90)}px rgba(0,0,0,0.5)` })} />
        <div style={abs(70, 110, { width: u(940), flexDirection: 'column', alignItems: 'center' })}>
          <div style={{ display: 'flex', fontFamily: SCRIPT, fontSize: u(130), lineHeight: 1.1, color: RED }}>{"Santa's List"}</div>
          <div style={{ ...caps(26, INK, 0.32, 800), marginTop: u(-4) }}>{`OFFICIAL  ·  ${cut(EVENT, 26)}${year ? ` ${year}` : ''}`}</div>
        </div>
        <div style={abs(130, 400, { flexDirection: 'column' })}>
          {row('NAME', first)}
          {row('TEAM', (d.team || d.club || '').toUpperCase())}
          {num ? row('NUMBER', `#${num}`) : null}
          {d.position ? row('PLAYS', d.position.toUpperCase()) : null}
        </div>
        <div style={abs(130, 830, { alignItems: 'center' })}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {svgImg(box(true), 66, 66, u)}
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(72), color: '#166534', marginLeft: u(16) }}>NICE</div>
            <div style={{ display: 'flex', width: u(60) }} />
            {svgImg(box(false), 66, 66, u)}
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(72), color: INK, marginLeft: u(16), opacity: 0.55 }}>NAUGHTY</div>
          </div>
        </div>
        <div style={abs(650, 360, { transform: 'rotate(5deg)', flexDirection: 'column', background: '#ffffff', padding: `${u(16)}px ${u(16)}px ${u(50)}px`, boxShadow: `0 ${u(14)}px ${u(40)}px rgba(0,0,0,0.3)` })}>
          {photo(290, 350)}
          <div style={{ display: 'flex', fontFamily: SCRIPT, fontSize: u(44), color: INK, marginTop: u(6), justifyContent: 'center', width: u(290) }}>{firstName}</div>
        </div>
        <div style={abs(720, 336, { width: u(140), height: u(42), background: 'rgba(253,230,138,0.75)', transform: 'rotate(-12deg)' })} />
        <div style={abs(150, 960, { transform: 'rotate(-4deg)', flexDirection: 'column' })}>
          <div style={{ display: 'flex', fontFamily: SCRIPT, fontSize: u(84), color: RED }}>On the field? Naughty.</div>
          <div style={{ ...caps(24, INK, 0.2, 700), marginLeft: u(10) }}>(the good kind) — S.C.</div>
        </div>
        <div style={abs(70, 1150, { width: u(940), justifyContent: 'center' })}><div style={caps(26, INK, 0.3, 800)}>{when}</div></div>
        <div style={abs(860, 1040)}>{svgImg(seal, 130, 130, u)}</div>
      </div>
    )
  }

  if (style === 'snow-globe') {
    const base = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 230"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d77a"/><stop offset="0.5" stop-color="#d4a23c"/><stop offset="1" stop-color="#8a6417"/></linearGradient></defs><path d="M120 10 L580 10 L660 220 L40 220 Z" fill="url(#g)"/><rect x="20" y="200" width="660" height="30" rx="8" fill="#6b4c12"/><path d="M120 10 L580 10" stroke="#fff3c4" stroke-width="6"/></svg>`
    const shine = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M18 40 C22 24 34 13 48 10" stroke="#ffffff" stroke-opacity="0.75" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M16 52 C16 50 16 48 17 46" stroke="#ffffff" stroke-opacity="0.75" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`
    return (
      <div style={{ ...root, backgroundImage: 'linear-gradient(180deg, #071a3a 0%, #12305e 60%, #0b1f3f 100%)' }}>
        <div style={abs(0, 0)}>{svgImg(snowField(1080, 1350, 120, 3, 5, 0.7), W, H, u)}</div>
        <div style={{ ...caps(30, '#bfdbfe', 0.46, 800), marginTop: u(46) }}>{`SHAKE IT UP  ·  ${cut(EVENT, 24)}`}</div>
        <div style={{ display: 'flex', position: 'relative', width: u(780), height: u(780), marginTop: u(24) }}>
          {photo(780, 780, { borderRadius: u(390), border: `${u(12)}px solid rgba(219,234,254,0.85)` })}
          <div style={abs(0, 0, { width: u(780), height: u(780), borderRadius: u(390), overflow: 'hidden' })}>{svgImg(snowField(780, 780, 90, 11, 7, 0.95), 780, 780, u)}</div>
          <div style={abs(0, 0)}>{svgImg(shine, 780, 780, u)}</div>
        </div>
        <div style={{ display: 'flex', position: 'relative', width: u(700), height: u(230), marginTop: u(-60) }}>
          {svgImg(base, 700, 230, u)}
          <div style={abs(0, 40, { width: u(700), flexDirection: 'column', alignItems: 'center' })}>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 440, 78)), lineHeight: 1, color: '#4a3208' }}>{first}</div>
            <div style={{ ...caps(24, '#4a3208', 0.22, 800), marginTop: u(6) }}>{`${cut(EVENT, 24)}${year ? `  ${year}` : ''}`}</div>
          </div>
        </div>
        <div style={{ ...caps(28, '#e0f2fe', 0.2, 700), marginTop: u(22) }}>{[num ? `#${num}` : '', team.toUpperCase()].filter(Boolean).join('  ·  ')}</div>
        <div style={{ ...caps(24, '#93c5fd', 0.28, 700), marginTop: u(8) }}>{when}</div>
      </div>
    )
  }

  if (style === 'gift-tag') {
    const GREEN = '#14532d', RED = '#c81e3c', GOLD = '#e8c15a'
    const paper = tiled(`<rect width="60" height="60" fill="${GREEN}"/><circle cx="15" cy="15" r="3.4" fill="${GOLD}" fill-opacity="0.8"/><circle cx="45" cy="45" r="3.4" fill="${GOLD}" fill-opacity="0.8"/><path d="M45 9 L46.5 13.5 L51 15 L46.5 16.5 L45 21 L43.5 16.5 L39 15 L43.5 13.5 Z" fill="#ffffff" fill-opacity="0.55"/>`, 60, 60, W, H)
    const bow = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180"><path d="M150 90 C110 10 30 10 40 70 C46 110 110 110 150 90 Z" fill="${RED}"/><path d="M150 90 C190 10 270 10 260 70 C254 110 190 110 150 90 Z" fill="${RED}"/><path d="M150 90 C120 120 100 160 90 178 L118 170 L150 100 Z M150 90 C180 120 200 160 210 178 L182 170 L150 100 Z" fill="#a3142f"/><circle cx="150" cy="90" r="22" fill="#a3142f"/></svg>`
    const tag = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 270"><path d="M80 10 L440 10 Q450 10 450 20 L450 250 Q450 260 440 260 L80 260 L10 135 Z" fill="#fbf3e0" stroke="#c9a96a" stroke-width="4"/><circle cx="62" cy="135" r="14" fill="#14532d" stroke="#c9a96a" stroke-width="4"/></svg>`
    return (
      <div style={{ ...root, background: GREEN }}>
        <div style={abs(0, 0)}>{svgImg(paper, W, H, u, { objectFit: 'cover' })}</div>
        <div style={abs(470, 0, { width: u(110), height: u(H), background: RED, borderLeft: `${u(8)}px solid ${GOLD}`, borderRight: `${u(8)}px solid ${GOLD}` })} />
        <div style={{ ...caps(30, GOLD, 0.5, 800), marginTop: u(60) }}>SPECIAL DELIVERY</div>
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(EVENT, 960, 128)), lineHeight: 1, color: '#ffffff', marginTop: u(8), letterSpacing: '0.03em' }}>{EVENT}</div>
        <div style={abs(110, 300, { transform: 'rotate(-3deg)', boxShadow: `0 ${u(24)}px ${u(70)}px rgba(0,0,0,0.45)` })}>
          {photo(620, 720, { border: `${u(16)}px solid #ffffff`, borderRadius: u(8) })}
        </div>
        <div style={abs(390, 230)}>{svgImg(bow, 300, 180, u)}</div>
        <div style={abs(560, 890, { transform: 'rotate(-8deg)', width: u(460), height: u(270) })}>
          {svgImg(tag, 460, 270, u)}
          <div style={abs(110, 40, { flexDirection: 'column' })}>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}><div style={caps(24, '#7c5a1e', 0.2, 800)}>TO</div><div style={{ display: 'flex', fontFamily: SCRIPT, fontSize: u(58), color: '#7f1d1d', marginLeft: u(14), lineHeight: 1 }}>The Field</div></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: u(14) }}><div style={caps(24, '#7c5a1e', 0.2, 800)}>FROM</div><div style={{ display: 'flex', fontFamily: SCRIPT, fontSize: u(fit(`${firstName}${num ? ` #${num}` : ''}`, 260, 58, 0.4)), color: '#7f1d1d', marginLeft: u(14), lineHeight: 1 }}>{`${firstName}${num ? ` #${num}` : ''}`}</div></div>
            <div style={{ ...caps(18, '#7c5a1e', 0.16, 700), marginTop: u(14), maxWidth: u(320) }}>{team.toUpperCase()}</div>
          </div>
        </div>
        <div style={abs(0, 1250, { width: u(W), justifyContent: 'center' })}><div style={caps(28, '#ffffff', 0.3, 800)}>{when}</div></div>
      </div>
    )
  }

  return <div style={root} />
}
