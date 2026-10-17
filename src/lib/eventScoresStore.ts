// An event's scores choice (lib/eventScores), stored in AppSetting
// `eventScores:{tournamentId}` = { on, by, at }. Server only.

import prisma from '@/lib/db'
import { cleanScores, type ScoresChoice } from '@/lib/eventScores'

const PREFIX = 'eventScores:'
const keyOf = (tournamentId: string) => PREFIX + tournamentId
const choiceIn = (value: string | null | undefined): ScoresChoice => {
  try { return cleanScores(JSON.parse(value || '{}')?.on) } catch { return null }
}

export async function eventScoresOf(tournamentId: string): Promise<ScoresChoice> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: keyOf(tournamentId) } })
    return choiceIn(row?.value)
  } catch { return null }
}

/** Several events at once (the home page's cards). */
export async function eventScoresMany(tournamentIds: string[]): Promise<Map<string, ScoresChoice>> {
  const out = new Map<string, ScoresChoice>()
  const ids = Array.from(new Set(tournamentIds.filter(Boolean)))
  if (!ids.length) return out
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: ids.map(keyOf) } } })
    for (const r of rows) out.set(r.key.slice(PREFIX.length), choiceIn(r.value))
  } catch { /* none */ }
  return out
}

/** Saves on or off; anything else clears it, so the add-on decides again. */
export async function saveEventScores(tournamentId: string, on: unknown, by: string): Promise<ScoresChoice> {
  const c = cleanScores(on)
  if (c === null) {
    await prisma.appSetting.deleteMany({ where: { key: keyOf(tournamentId) } })
    return null
  }
  const value = JSON.stringify({ on: c, by: String(by || '').slice(0, 120), at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: keyOf(tournamentId) }, create: { key: keyOf(tournamentId), value }, update: { value } })
  return c
}
