// The head assigner's own fee on an event (Bo, Oct 17 2026: the tournament director's
// fees are "ref pay plus an assigning fee"). Ref pay is Staff pay, which the tournament
// director normally pays each person; the assigning fee is what they pay the head
// assigner. Per game (each game with at least one official assigned, canceled games
// left out) or one amount for the event. AppSetting `assigningFee:{tournamentId}` =
// { amount, per, by, at }. The math is pure (feeTotal); reading and saving need the
// database.

import prisma from '@/lib/db'

export type FeePer = 'game' | 'event'
export type AssigningFee = { amount: number; per: FeePer }
export const NO_FEE: AssigningFee = { amount: 0, per: 'game' }

const key = (tournamentId: string) => 'assigningFee:' + tournamentId
const round2 = (n: number) => Math.round(n * 100) / 100

export function normalizeFee(v: unknown): AssigningFee {
  const o = (v && typeof v === 'object' ? v : {}) as { amount?: unknown; per?: unknown }
  const amount = Number(o.amount)
  return { amount: Number.isFinite(amount) && amount > 0 ? round2(Math.min(amount, 100000)) : 0, per: o.per === 'event' ? 'event' : 'game' }
}

/** The fee for an event: per game times the games that have an official, or the one amount. */
export function feeTotal(fee: AssigningFee, staffedGames: number): number {
  if (!fee.amount) return 0
  return fee.per === 'event' ? fee.amount : round2(fee.amount * Math.max(0, staffedGames))
}

export async function assigningFeeOf(tournamentId: string): Promise<AssigningFee> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: key(tournamentId) } })
    return row?.value ? normalizeFee(JSON.parse(row.value)) : NO_FEE
  } catch { return NO_FEE }
}

export async function saveAssigningFee(tournamentId: string, fee: AssigningFee, by: string): Promise<AssigningFee> {
  const f = normalizeFee(fee)
  const value = JSON.stringify({ ...f, by, at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: key(tournamentId) }, create: { key: key(tournamentId), value }, update: { value } })
  return f
}
