// Web push notifications — self-contained. VAPID keys are generated once and
// stored in AppSetting (no env vars to configure), and device subscriptions
// live in AppSetting keyed by org. Everything here is best-effort and never
// throws to its callers — a push failure must never block a registration or
// payment from recording.
import { prisma } from '@/lib/db'
import webpush from 'web-push'

export type PushSub = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  label?: string
  createdAt?: string
}

const jget = async (key: string): Promise<any> => {
  try { const r = await prisma.appSetting.findUnique({ where: { key } }); return r ? JSON.parse(r.value || 'null') : null } catch { return null }
}
const jset = async (key: string, val: any) => {
  const value = JSON.stringify(val)
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

const subsKey = (orgId: string) => `pushSubs:${orgId}`

// One VAPID keypair for the whole app, created on first use and persisted.
export async function getVapid(): Promise<{ publicKey: string; privateKey: string }> {
  let keys = await jget('pushVapid')
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys()
    await jset('pushVapid', keys)
  }
  return keys
}

export async function publicVapidKey(): Promise<string> {
  return (await getVapid()).publicKey
}

export async function addSub(orgId: string, sub: PushSub) {
  const list: PushSub[] = (await jget(subsKey(orgId))) || []
  const next = list.filter(s => s.endpoint !== sub.endpoint)
  next.push({ ...sub, createdAt: new Date().toISOString() })
  await jset(subsKey(orgId), next)
}

export async function removeSub(orgId: string, endpoint: string) {
  const list: PushSub[] = (await jget(subsKey(orgId))) || []
  await jset(subsKey(orgId), list.filter(s => s.endpoint !== endpoint))
}

// Push a notification to every device subscribed for this org. Prunes any
// subscription the push service reports as gone (404/410).
export async function sendPushToOrg(
  orgId: string | null | undefined,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<void> {
  if (!orgId) return
  try {
    const list: PushSub[] = (await jget(subsKey(orgId))) || []
    if (!list.length) return
    const { publicKey, privateKey } = await getVapid()
    webpush.setVapidDetails('mailto:info@sunshinelax.com', publicKey, privateKey)
    const data = JSON.stringify(payload)
    const dead: string[] = []
    await Promise.all(list.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys } as any, data)
      } catch (e: any) {
        const code = e?.statusCode
        if (code === 404 || code === 410) dead.push(s.endpoint)
      }
    }))
    if (dead.length) {
      const fresh: PushSub[] = (await jget(subsKey(orgId))) || []
      await jset(subsKey(orgId), fresh.filter(s => !dead.includes(s.endpoint)))
    }
  } catch (e) {
    console.error('[push] sendPushToOrg failed (non-blocking):', e)
  }
}
