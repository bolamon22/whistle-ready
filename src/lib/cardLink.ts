// The family's own QR link on the player card — pure helpers shared by the server
// (card render, edit API) and the browser (live preview on the form).

/** Accepts an http(s) URL (adds https:// to a bare "youtube.com/…"); '' when unusable. */
export function cleanCardLink(raw: unknown): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return ''
    return u.toString().slice(0, 300)
  } catch { return '' }
}

/** Short caption printed under the QR, from the link's host. */
export function qrLabelFor(url: string): string {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } })()
  if (!host) return 'My player card'
  if (/youtube\.com$|youtu\.be$/.test(host)) return 'Highlight reel'
  if (/hudl\.com$/.test(host)) return 'Hudl highlights'
  if (/instagram\.com$/.test(host)) return 'Instagram'
  if (/tiktok\.com$/.test(host)) return 'TikTok'
  if (/facebook\.com$|fb\.com$/.test(host)) return 'Facebook'
  if (/twitter\.com$|x\.com$/.test(host)) return 'Follow me on X'
  if (/snapchat\.com$/.test(host)) return 'Snapchat'
  if (/twitch\.tv$/.test(host)) return 'Twitch'
  if (/vimeo\.com$/.test(host)) return 'Highlight reel'
  return `Scan · ${host}`
}
