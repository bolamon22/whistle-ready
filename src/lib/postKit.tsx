import type { CSSProperties, ReactElement } from 'react'

// Shared drawing bits for the post looks (lib/socialPosts, lib/seasonalPosts). Satori-safe:
// every element with more than one child is display:flex; decorations are inline SVG.

export const ANTON = 'Anton'
export const BARLOW = 'Barlow Condensed'
export const MONO = 'Courier Prime'
export const SERIF = 'Playfair Display'
export const SCRIPT = 'Great Vibes'

/** A font size that keeps `text` within `maxW` at Anton's rough character width. */
export const fit = (text: string, maxW: number, max: number, perChar = 0.5) => Math.min(max, Math.floor(maxW / (Math.max(1, text.length) * perChar)))
export const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** A photo filling a w×h box, cropped from the top instead of the middle. Satori ignores
 *  object-position (it always centers a cover crop), which cut heads off in wide boxes like
 *  Main Event's (Bo, Oct 18 2026). Scales to cover and keeps the top, minus a sliver. */
export function topCrop(src: string, w: number, h: number, pw: number, ph: number, u: (n: number) => number, extra: CSSProperties = {}): ReactElement {
  const scale = Math.max(w / pw, h / ph)
  const dw = pw * scale, dh = ph * scale
  const top = -Math.min(dh - h, (dh - h) * 0.04)
  return (
    <div style={{ display: 'flex', position: 'relative', overflow: 'hidden', width: u(w), height: u(h), ...extra }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={u(dw)} height={u(dh)} alt="" style={{ position: 'absolute', left: u((w - dw) / 2), top: u(top) }} />
    </div>
  )
}

/** An SVG drawn as an image (Satori renders SVG data URLs). */
export function svgImg(svg: string, w: number, h: number, u: (n: number) => number, style: CSSProperties = {}): ReactElement {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={u(w)} height={u(h)} alt="" style={style} />
}

// ── decorations (100×100 viewBox unless noted) ─────────────────────────────────
export const LEAF_COLORS = ['#c2410c', '#ea580c', '#d97706', '#b91c1c', '#a16207', '#9a3412']
/** A maple leaf in `color`, with a stem and veins. */
export const mapleLeaf = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4 L57 22 L69 15 L66 33 L85 28 L77 44 L95 52 L75 60 L81 77 L61 69 L55 88 L50 84 L45 88 L39 69 L19 77 L25 60 L5 52 L23 44 L15 28 L34 33 L31 15 L43 22 Z" fill="${color}"/><path d="M50 84 L50 99 M50 84 L50 30 M50 62 L30 44 M50 62 L70 44 M50 74 L28 64 M50 74 L72 64" stroke="rgba(0,0,0,0.28)" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`
/** An oval oak-ish leaf. */
export const ovalLeaf = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4 C82 26 84 70 50 94 C16 70 18 26 50 4 Z" fill="${color}"/><path d="M50 98 L50 10 M50 40 L34 28 M50 40 L66 28 M50 60 L30 46 M50 60 L70 46 M50 78 L34 66 M50 78 L66 66" stroke="rgba(0,0,0,0.25)" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`
/** A six-armed snowflake. */
export const snowflake = (color = '#ffffff') => {
  const arm = (a: number) => `<g transform="rotate(${a} 50 50)"><path d="M50 50 L50 6 M50 18 L42 10 M50 18 L58 10 M50 30 L41 22 M50 30 L59 22" stroke="${color}" stroke-width="4" stroke-linecap="round" fill="none"/></g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${[0, 60, 120, 180, 240, 300].map(arm).join('')}</svg>`
}
/** A small pumpkin. */
export const pumpkin = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><ellipse cx="30" cy="60" rx="22" ry="30" fill="#c2410c"/><ellipse cx="70" cy="60" rx="22" ry="30" fill="#c2410c"/><ellipse cx="50" cy="60" rx="24" ry="33" fill="#ea580c"/><path d="M50 30 C50 20 54 14 60 10" stroke="#4d7c0f" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M58 22 C70 16 78 22 80 28 C70 30 62 28 58 22 Z" fill="#65a30d"/></svg>`
/** Falling snow: deterministic dots over a w×h area (viewBox w h). */
export function snowField(w: number, h: number, n: number, seed = 7, max = 7, opacity = 0.85) {
  let s = seed
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  const dots = Array.from({ length: n }, () => `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h).toFixed(1)}" r="${(1.5 + rnd() * max).toFixed(1)}" fill="#ffffff" fill-opacity="${(0.35 + rnd() * (opacity - 0.35)).toFixed(2)}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${dots}</svg>`
}
/** A w×h SVG that repeats one tw×th tile (the tile's inner SVG markup, no <svg> wrapper). */
export const tiled = (tile: string, tw: number, th: number, w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><pattern id="t" width="${tw}" height="${th}" patternUnits="userSpaceOnUse">${tile}</pattern></defs><rect width="${w}" height="${h}" fill="url(#t)"/></svg>`
/** A seeded random number helper for scattering decorations the same way every time. */
export function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}
