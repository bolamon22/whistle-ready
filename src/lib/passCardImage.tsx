import { ImageResponse } from 'next/og'
import { PassCard, PASS_W, PASS_H } from '@/lib/playerPassCard'
import { imageForSatori, loadPassFonts, qrDataUrl, type PlayerPass } from '@/lib/playerPass'

// The player card as a PNG. Shared by /pass/<token>/card.png and the social posts
// that put the card inside a bigger graphic (/pass/<token>/post/<style>.png), so a
// post always shows exactly the card the family has.

export async function passCardImage(pass: PlayerPass, base: string, headers?: Record<string, string>): Promise<ImageResponse> {
  const [photoUrl, clubLogoUrl, tournamentLogoUrl, orgLogoUrl, qr, qr2, fonts] = await Promise.all([
    imageForSatori(pass.card.photoUrl, base),
    imageForSatori(pass.card.clubLogoUrl, base),
    imageForSatori(pass.card.tournamentLogoUrl, base),
    imageForSatori(pass.card.orgLogoUrl, base),
    qrDataUrl(pass.qrUrl),
    qrDataUrl(pass.qr2Url),
    loadPassFonts().catch(() => undefined),
  ])
  const p = { ...pass.card, photoUrl, clubLogoUrl, tournamentLogoUrl, orgLogoUrl, qrDataUrl: qr, qr2DataUrl: qr2 }
  return new ImageResponse(<PassCard p={p} theme={pass.theme} />, {
    width: PASS_W, height: PASS_H,
    ...(fonts ? { fonts } : {}),
    ...(headers ? { headers } : {}),
  })
}

/** The card PNG as a data URL, for drawing it inside another Satori image. */
export async function passCardDataUrl(pass: PlayerPass, base: string): Promise<string> {
  const res = await passCardImage(pass, base)
  return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
}
