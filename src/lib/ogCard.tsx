import { ImageResponse } from 'next/og'

// The link-preview card — what iMessage, Slack, WhatsApp and Facebook draw when
// someone pastes one of our URLs.
//
// WHY THIS EXISTS: og:image used to be the org's (or tournament's) LOGO FILE.
// Every one of those apps wants a 1.91:1 opaque image, so a logo-shaped PNG got
// padded and tinted — Bo texting sunshineeventsgroup.com came out as a washed-out
// red block with the logo floating in it (Sep 16 2026). A card is a different
// object from a logo: a ground, a headline, and the event's name and dates, which
// is what somebody reading a text actually needs to decide whether to tap.
//
// Mirrors the site's own hero so the preview and the page look like one thing.
//
// Satori (what next/og renders with) supports a small slice of CSS: flex only,
// no grid, explicit width/height on every image, and — the one that bites —
// fontWeight does NOTHING unless a font of that weight is actually loaded, so a
// card without the fonts below silently renders every headline in regular.

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_ALT = 'Tournaments, schedules and team registration'
export const OG_CONTENT_TYPE = 'image/png'

const INK = '#0b1220'
const TEAL = '#5ec5b6'
const TEAL_INK = '#d7fbf4'
const MUTE = '#cbd5e1'

type Weight = 400 | 700

// Google serves TTF (which Satori reads) to plain user agents and woff2 (which it
// does not) to modern ones, so this User-Agent is load-bearing.
async function inter(weight: Weight): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 * 60 * 24 * 30 },
    }).then(r => r.text())
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1]
    if (!url) return null
    return await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } }).then(r => r.arrayBuffer())
  } catch { return null }
}

export type OgHeroCard = {
  /** The pill above the headline — "Next up · Monster Mash · Oct 24–25". */
  eyebrow?: string
  /** The headline: the event name, or the org's own hero line. */
  headline: string
  /** Bottom line — the domain, or a call to action. */
  footer?: string
  /** Background photo. Falls back to a flat ground when missing or unfetchable. */
  imageUrl?: string
  logoUrl?: string
}

export async function ogHeroCard({ eyebrow, headline, footer, imageUrl, logoUrl }: OgHeroCard) {
  const [regular, bold] = await Promise.all([inter(400), inter(700)])
  const fonts = [
    regular && { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    bold && { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: Weight; style: 'normal' }[]

  // Long event names have to stay on the card rather than overflow it.
  const size = headline.length > 52 ? 62 : headline.length > 34 ? 72 : 84

  return new ImageResponse(
    (
      <div style={{ display: 'flex', fontFamily: 'Inter', width: '100%', height: '100%', position: 'relative', background: INK }}>
        {imageUrl ? (
          <img src={imageUrl} width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} alt="" />
        ) : null}
        {/* Dark wash so white type stays legible over any photo. Matches the
            site hero's own gradient. */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex',
          background: imageUrl
            ? 'linear-gradient(180deg, rgba(11,18,32,.35) 0%, rgba(11,18,32,.58) 45%, rgba(11,18,32,.95) 100%)'
            : 'linear-gradient(135deg, #0b1f3a 0%, #0e7490 55%, #0b1f3a 100%)',
        }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 1200, height: 630, padding: '54px 64px' }}>
          {logoUrl
            ? <img src={logoUrl} width={150} height={64} style={{ objectFit: 'contain' }} alt="" />
            : <div style={{ display: 'flex' }} />}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {eyebrow ? (
              <div style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 25, color: TEAL_INK, border: `2px solid ${TEAL}`, borderRadius: 999, padding: '9px 22px', marginBottom: 22 }}>
                {eyebrow}
              </div>
            ) : null}
            <div style={{ display: 'flex', fontSize: size, fontWeight: 700, color: '#ffffff', lineHeight: 1.05, letterSpacing: -2 }}>
              {headline}
            </div>
            {footer ? <div style={{ display: 'flex', fontSize: 28, color: MUTE, marginTop: 20 }}>{footer}</div> : null}
          </div>

          <div style={{ display: 'flex' }} />
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: fonts.length ? fonts : undefined },
  )
}
