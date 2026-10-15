import { prisma } from '@/lib/db'
import { eventToday } from '@/lib/availabilityAnswers'
import { CREWS, isReleased, seesUnreleased, type Crew, type ReleaseState } from '@/lib/staffRelease'

// Stored per event in AppSetting `staffRelease:<tournamentId>`:
// { boys: { at, by } | null, girls: ..., scorekeepers: ... }. See lib/staffRelease.

const keyOf = (tid: string) => `staffRelease:${tid}`
const empty = (): ReleaseState => ({ boys: null, girls: null, scorekeepers: null })

/**
 * What staff may see at this event. Never set: an event that has already started
 * (or is over) stays visible, because its staff have been working off it; one that
 * hasn't started stays hidden until an assigner shows it.
 */
export async function getRelease(tournamentId: string): Promise<ReleaseState & { saved: boolean }> {
  const out = empty()
  try {
    const r = await prisma.appSetting.findUnique({ where: { key: keyOf(tournamentId) } })
    if (r?.value) {
      const v = JSON.parse(r.value) || {}
      for (const c of CREWS) if (v[c] && typeof v[c].at === 'string') out[c] = { at: v[c].at, by: String(v[c].by || '') }
      return { ...out, saved: true }
    }
  } catch {}
  try {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { startDate: true } })
    const start = String(t?.startDate || '').slice(0, 10)
    if (start && start <= eventToday()) for (const c of CREWS) out[c] = { at: '', by: '' }
  } catch {}
  return { ...out, saved: false }
}

export async function setRelease(tournamentId: string, crews: Crew[], visible: boolean, by: string): Promise<ReleaseState> {
  const cur = await getRelease(tournamentId)
  const next: ReleaseState = { boys: cur.boys, girls: cur.girls, scorekeepers: cur.scorekeepers }
  const at = new Date().toISOString()
  for (const c of crews) next[c] = visible ? (next[c]?.at ? next[c] : { at, by }) : null
  const value = JSON.stringify(next)
  await prisma.appSetting.upsert({ where: { key: keyOf(tournamentId) }, update: { value }, create: { key: keyOf(tournamentId), value } })
  return next
}

/**
 * A filter for assignment rows: always true for the people who build the schedule,
 * else true only for crews that have been shown. Loads each event's state once.
 */
export async function releaseFilter(role: unknown, tournamentIds: string[]): Promise<(tournamentId: string, assignmentRole: string, division: string) => boolean> {
  if (seesUnreleased(role)) return () => true
  const ids = Array.from(new Set(tournamentIds.filter(Boolean)))
  const states = new Map<string, ReleaseState>()
  await Promise.all(ids.map(async id => { states.set(id, await getRelease(id)) }))
  return (tid, r, division) => { const s = states.get(tid); return !!s && isReleased(s, r, division) }
}
