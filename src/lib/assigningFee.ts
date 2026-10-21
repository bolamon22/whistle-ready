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

// ── Payments of the fee (Bo, Oct 21 2026: track the tournament director paying it) ──
// What the tournament director has paid the head assigner toward the fee, recorded by
// the head assigner (it's his money coming in; the tournament director sees it in
// their area but can't change it). Several payments are allowed (a deposit, then the
// rest). AppSetting `assigningFeePaid:{tournamentId}` = { payments: FeePayment[] }.

export const FEE_METHODS = ['check', 'zelle', 'venmo', 'cash', 'ach', 'card', 'other'] as const
export type FeeMethod = typeof FEE_METHODS[number]
export type FeePayment = { id: string; amount: number; on: string; method: FeeMethod; note: string; by: string; at: string }
export type FeeState = 'none' | 'unpaid' | 'part' | 'paid'
export type FeeStatus = { paid: number; due: number; state: FeeState }

const paidKey = (tournamentId: string) => 'assigningFeePaid:' + tournamentId
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'))

/** A payment from the browser: a positive amount, a real date (today when missing). */
export function normalizeFeePayment(v: unknown, today: string): Omit<FeePayment, 'id' | 'by' | 'at'> | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const amount = Number(o.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const method = (FEE_METHODS as readonly string[]).includes(String(o.method)) ? (String(o.method) as FeeMethod) : 'other'
  return { amount: round2(Math.min(amount, 1000000)), on: isDay(o.on) ? o.on : today, method, note: String(o.note ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) }
}

function parsePayments(v: string | null | undefined): FeePayment[] {
  try {
    const o = v ? JSON.parse(v) : null
    const list = Array.isArray(o?.payments) ? o.payments : []
    return list.filter((p: any) => p && typeof p.id === 'string' && Number(p.amount) > 0)
      .map((p: any) => ({ id: p.id, amount: round2(Number(p.amount)), on: isDay(p.on) ? p.on : String(p.at || '').slice(0, 10), method: (FEE_METHODS as readonly string[]).includes(p.method) ? p.method : 'other', note: String(p.note || ''), by: String(p.by || ''), at: String(p.at || '') }))
      .sort((a: FeePayment, b: FeePayment) => a.on.localeCompare(b.on) || a.at.localeCompare(b.at))
  } catch { return [] }
}

/** Paid so far, what's left, and a word for it. Over-paying shows as paid with nothing due. */
export function feeStatus(total: number, payments: { amount: number }[]): FeeStatus {
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0))
  const due = round2(Math.max(0, total - paid))
  const state: FeeState = total <= 0 && paid <= 0 ? 'none' : due <= 0.004 ? 'paid' : paid > 0 ? 'part' : 'unpaid'
  return { paid, due, state }
}

export async function feePaymentsOf(tournamentId: string): Promise<FeePayment[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: paidKey(tournamentId) } })
    return parsePayments(row?.value)
  } catch { return [] }
}

/** Several events' payments at once (the Assigning fees page). */
export async function feePaymentsMany(tournamentIds: string[]): Promise<Record<string, FeePayment[]>> {
  const out: Record<string, FeePayment[]> = {}
  for (const id of tournamentIds) out[id] = []
  if (!tournamentIds.length) return out
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: tournamentIds.map(paidKey) } } })
    for (const r of rows) out[r.key.slice('assigningFeePaid:'.length)] = parsePayments(r.value)
  } catch { /* none yet */ }
  return out
}

/** Several events' fees at once. */
export async function assigningFeesMany(tournamentIds: string[]): Promise<Record<string, AssigningFee>> {
  const out: Record<string, AssigningFee> = {}
  for (const id of tournamentIds) out[id] = NO_FEE
  if (!tournamentIds.length) return out
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: tournamentIds.map(key) } } })
    for (const r of rows) { try { out[r.key.slice('assigningFee:'.length)] = normalizeFee(JSON.parse(r.value)) } catch { /* keep none */ } }
  } catch { /* none yet */ }
  return out
}

async function writePayments(tournamentId: string, list: FeePayment[]): Promise<void> {
  const value = JSON.stringify({ payments: list })
  await prisma.appSetting.upsert({ where: { key: paidKey(tournamentId) }, create: { key: paidKey(tournamentId), value }, update: { value } })
}

export async function addFeePayment(tournamentId: string, p: Omit<FeePayment, 'id' | 'by' | 'at'>, by: string): Promise<FeePayment[]> {
  const list = await feePaymentsOf(tournamentId)
  const at = new Date().toISOString()
  list.push({ ...p, id: 'fp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), by: String(by || '').slice(0, 120), at })
  await writePayments(tournamentId, list)
  return feePaymentsOf(tournamentId)
}

/** False when the payment isn't on this event. */
export async function removeFeePayment(tournamentId: string, paymentId: string): Promise<boolean> {
  const list = await feePaymentsOf(tournamentId)
  const next = list.filter(p => p.id !== paymentId)
  if (next.length === list.length) return false
  await writePayments(tournamentId, next)
  return true
}
