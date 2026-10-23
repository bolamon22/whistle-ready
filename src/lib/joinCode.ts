import crypto from 'crypto'
import { prisma } from '@/lib/db'

// An org's public signup links (/join/<code>). Each carries a secret code so the open
// signup can't be botted; a new code kills every link already shared. Two links per org:
//   'staff'  — AppSetting joinCode:{orgId}, the recruiting link (paid staff);
//   'unpaid' — AppSetting joinCodeUnpaid:{orgId}, volunteers and refs in training
//              (lib/staffType, Oct 23 2026). Its signup asks for no payment or W-9 and
//              marks whoever joins unpaid, so the link itself says what they are.
// joinCodeMap:{code} resolves the org from the code alone; joinCodeKind:{code} says
// 'unpaid'. Always checked back against the org's current code, so rotated codes die.
// Server only.

export type JoinKind = 'staff' | 'unpaid'
const keyOf = (orgId: string, kind: JoinKind) => (kind === 'unpaid' ? `joinCodeUnpaid:${orgId}` : `joinCode:${orgId}`)

async function setting(key: string): Promise<string> {
  return (await prisma.appSetting.findUnique({ where: { key } }))?.value || ''
}
async function put(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

/** This org's code for that link, minted when missing (or legacy-long), or new on regenerate. */
export async function joinCodeFor(orgId: string, kind: JoinKind, regenerate = false): Promise<string> {
  const key = keyOf(orgId, kind)
  let code = await setting(key)
  if (!code || regenerate || code.length > 16) {
    const old = code
    code = crypto.randomBytes(6).toString('base64url') // 8 URL-safe chars
    await put(key, code)
    if (old) {
      try { await prisma.appSetting.delete({ where: { key: `joinCodeMap:${old}` } }) } catch { /* no map */ }
      try { await prisma.appSetting.delete({ where: { key: `joinCodeKind:${old}` } }) } catch { /* none */ }
    }
  }
  await put(`joinCodeMap:${code}`, orgId)
  if (kind === 'unpaid') await put(`joinCodeKind:${code}`, 'unpaid')
  return code
}

/** The org and kind of a signup link, or null when the code isn't that org's current one.
 *  orgId is given by legacy ?org=&code= links; short links carry the code alone. */
export async function resolveJoinCode(orgId: string, code: string): Promise<{ orgId: string; kind: JoinKind } | null> {
  if (!code) return null
  const org = orgId || await setting(`joinCodeMap:${code}`)
  if (!org) return null
  if ((await setting(keyOf(org, 'staff'))) === code) return { orgId: org, kind: 'staff' }
  if ((await setting(keyOf(org, 'unpaid'))) === code) return { orgId: org, kind: 'unpaid' }
  return null
}
