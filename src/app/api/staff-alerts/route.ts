import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { findSub, saveSub, setGroups, removeSub, cleanGroups, defaultGroupsFor, ALERT_GROUPS } from '@/lib/staffAlerts'
import { sendToSubscriptions } from '@/lib/push'

export const dynamic = 'force-dynamic'

// Staff game-day alerts for THIS device (see lib/staffAlerts).
//   GET  ?endpoint=…            -> { subscribed, groups, defaultGroups }
//   POST { subscription, groups, label, tournamentId? }  -> turn on
//   PATCH { endpoint, groups }  -> change which requests buzz this phone
//   PUT  { endpoint }           -> send a test alert to this phone
//   DELETE { endpoint }         -> turn off
// Staff only (coaches, parents and club directors are refused by requireStaff).

const who = (gate: any) => {
  const u = gate.session?.user || {}
  return { userId: String(gate.userId || u.id || ''), email: String(u.email || ''), name: String(u.name || u.email || 'Staff'), role: String(u.role || '') }
}

export async function GET(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const me = who(gate)
  const endpoint = new URL(req.url).searchParams.get('endpoint') || ''
  const sub = endpoint ? await findSub(endpoint) : null
  const mine = sub && sub.userId === me.userId ? sub : null
  return NextResponse.json({ subscribed: !!mine, groups: mine?.groups || [], defaultGroups: await defaultGroupsFor(me.email, me.role), allGroups: ALERT_GROUPS })
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const me = who(gate)
  const body = await req.json().catch(() => ({}))
  const s = body?.subscription
  if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  const orgId = (typeof body.tournamentId === 'string' && body.tournamentId ? await tournamentOrgId(body.tournamentId) : null) || gate.orgId || null
  const groups = cleanGroups(body.groups)
  await saveSub({
    endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
    userId: me.userId, email: me.email, name: me.name, role: me.role, orgId,
    groups: groups.length ? groups : await defaultGroupsFor(me.email, me.role),
    label: typeof body.label === 'string' ? body.label.slice(0, 60) : '',
  })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const body = await req.json().catch(() => ({}))
  const ok = await setGroups(String(body.endpoint || ''), who(gate).userId, cleanGroups(body.groups))
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Alerts are not on for this device' }, { status: 404 })
}

export async function PUT(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const body = await req.json().catch(() => ({}))
  const sub = await findSub(String(body.endpoint || ''))
  if (!sub || sub.userId !== who(gate).userId) return NextResponse.json({ error: 'Alerts are not on for this device' }, { status: 404 })
  const r = await sendToSubscriptions([sub], { title: 'Whistle Ready alerts are on', body: 'Field requests for your groups will show up like this.', url: '/', tag: 'staff-alert-test' })
  return NextResponse.json({ ok: r.sent > 0 })
}

export async function DELETE(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const body = await req.json().catch(() => ({}))
  const sub = await findSub(String(body.endpoint || ''))
  if (sub && sub.userId === who(gate).userId) await removeSub(sub.endpoint)
  return NextResponse.json({ ok: true })
}
