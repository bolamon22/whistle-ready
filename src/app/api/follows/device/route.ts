import { NextRequest, NextResponse } from 'next/server'
import { saveDevicePush, clearDevicePush, deviceHasPush, isDeviceId } from '@/lib/follows'

// The phone behind a device id. Not tournament-scoped: one browser, one
// subscription, however many events it follows. Public, like the follows
// themselves -- a subscription is only ever useful to the phone that made it.

export async function GET(req: NextRequest) {
  const device = new URL(req.url).searchParams.get('device') || ''
  if (!isDeviceId(device)) return NextResponse.json({ enabled: false })
  try { return NextResponse.json({ enabled: await deviceHasPush(device) }, { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch { return NextResponse.json({ enabled: false }) }
}

/** { deviceId, subscription: PushSubscriptionJSON, label? } */
export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const deviceId = String(body?.deviceId || '')
  const sub = body?.subscription
  if (!isDeviceId(deviceId) || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  try {
    const ok = await saveDevicePush(deviceId, { endpoint: String(sub.endpoint), keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }, String(body?.label || ''))
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'bad_request' }, { status: 400 })
  } catch (e) {
    console.error('[follows] device POST failed:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

/** { deviceId } -- alerts off; follows stay. */
export async function DELETE(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const deviceId = String(body?.deviceId || '')
  if (!isDeviceId(deviceId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  try { await clearDevicePush(deviceId); return NextResponse.json({ ok: true }) }
  catch { return NextResponse.json({ error: 'failed' }, { status: 500 }) }
}
