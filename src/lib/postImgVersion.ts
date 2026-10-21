// Post images (/pass/<token>/post/<style>.png) are addressed by the player's pass token,
// which never changes, so a browser that already has one keeps showing it after the family
// (or staff) changes the photo. The scheduler records each player's photo version here when
// it loads the cleared players, and every post image URL carries it as ?v=, so a new photo
// means a new URL (Bo, Oct 21 2026: Kairos's new photo didn't show in Cleared to post).
const vers = new Map<string, string>()

export function rememberPhotoVersions(players: { token: string; photoV?: string }[]) {
  for (const p of players) if (p.token && p.photoV) vers.set(p.token, p.photoV)
}

/** '&v=…' for a token, or '' when unknown. */
export const photoVParam = (token: string) => { const v = vers.get(token); return v ? `v=${encodeURIComponent(v)}` : '' }
