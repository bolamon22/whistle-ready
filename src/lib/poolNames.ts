/**
 * Pool names: the pure half.
 *
 * Split out because these are needed in CLIENT components (the public game page
 * labels a pool with them) while the rename cascade next door imports Prisma.
 * Importing that from the browser ships the client to it -- see lib/inviteLetter
 * for the same split and the same reason.
 *
 * Pool names, and what happens when one changes.
 *
 * A pool name is a string key, not an id. The Pool row carries it, and every
 * scheduled Game carries its own copy in `Game.pool` -- written by the scheduler,
 * sometimes as "Pool A" and sometimes as the bare "A". Nothing joins them but the
 * text, which is why poolKey exists and why a rename has to move both.
 *
 * Bo, Sep 30 2026: "Sometimes we want to call them north, south." That is the
 * case this file is for. Renaming "Pool A" to "North" without the cascade leaves
 * every game keyed to "a" while the pool answers to "north": the games fall out of
 * the pool, standings empty, and the public page shows an empty group.
 */

/** Loose key: "Pool A", "pool a" and "A" are the same pool. Matches lib/gameBalance. */
export const poolKey = (p: string | null | undefined) =>
  String(p || '').trim().replace(/^(pool|group)\s*/i, '').toLowerCase()

export const samePool = (a: string | null | undefined, b: string | null | undefined) =>
  poolKey(a) === poolKey(b)

/**
 * How a pool reads on screen.
 *
 * The word "Pool" is added only to a BARE DESIGNATOR -- the one or two characters
 * the scheduler writes onto a game ("A", "B", "A1"), which on their own read as
 * nothing. Anything longer is a name somebody chose and stands by itself, so
 * "North" is "North" and not "Pool North".
 *
 * Testing the old prefix alone was not enough: it only let through names that
 * already began with Pool or Group, which was invisible while every pool was a
 * letter and wrong the moment one was called North.
 */
export const poolLabel = (p: string | null | undefined) => {
  const t = String(p || '').trim()
  if (!t) return ''
  if (/^(pool|group)\b/i.test(t)) return t
  return /^[A-Za-z0-9]{1,2}$/.test(t) ? `Pool ${t}` : t
}

/** Trimmed, collapsed, and capped. Empty means the caller should reject it. */
export const cleanPoolName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
