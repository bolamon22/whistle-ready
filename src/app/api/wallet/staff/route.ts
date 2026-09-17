import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { requireStaff } from '@/lib/apiAuth'
import { buildApplePass, walletEnabled, pngFromDataUrl, WALLET_MIME } from '@/lib/wallet'
import { STAFF_CERT_LABELS } from '@/components/StaffIdCard'

// The signed-in staff member's Apple Wallet credential.
//
// NO :workerId PARAM ON PURPOSE. The worker is resolved from the session email,
// exactly the way /api/staff-portal does it, so this route can only ever hand you
// your own pass. A credential endpoint that takes an id in the URL is one missing
// check away from letting anyone mint a badge in someone else's name.
//
// The QR points at the PUBLIC /verify/[workerId] page, the same target as the
// printed card, so a gate volunteer scanning either gets the identical check --
// and the photo, which a Wallet pass can only show as a small thumbnail.

export const dynamic = 'force-dynamic'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const ROLE_LABELS: Record<string, string> = {
  ref: 'Referee', scorekeeper: 'Scorekeeper', athletic_trainer: 'Athletic trainer',
  field_ops: 'Field ops', assigner: 'Assigner', scheduler: 'Scheduler',
}
const roleLabel = (r: string) => ROLE_LABELS[r] || (r ? r.replace(/_/g, ' ') : 'Staff')

export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res

  // 503 not 500: the pass is unavailable, the account is fine. The button is
  // hidden when this is false, so hitting it means a hand-typed URL or a cert
  // that expired since the page rendered.
  if (!walletEnabled()) {
    return NextResponse.json({ error: 'Apple Wallet is not set up for this site yet' }, { status: 503 })
  }

  const client = db()
  const email = String(gate.session?.user?.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const wRes = await client.execute({
    sql: `SELECT id, name, defaultRole, roles, certLevel, association, photoUrl, orgId
          FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC LIMIT 1`,
    args: [email],
  })
  const w = wRes.rows[0] as Record<string, any> | undefined
  if (!w) return NextResponse.json({ error: 'Your login is not linked to a staff record' }, { status: 404 })

  const orgId = String(w.orgId || gate.orgId || '')
  let orgName = 'Whistle Ready', orgLogo = ''
  if (orgId) {
    try {
      const o = await client.execute({ sql: 'SELECT name, logoUrl FROM "Organization" WHERE id = ?', args: [orgId] })
      if (o.rows.length) { orgName = String((o.rows[0] as any).name || orgName); orgLogo = String((o.rows[0] as any).logoUrl || '') }
    } catch { /* Organization is raw SQL; a miss just leaves the defaults */ }
  }

  let roles: string[] = []
  try {
    const r = JSON.parse(String(w.roles ?? '[]'))
    roles = Array.isArray(r) && r.length ? r.map(String) : [String(w.defaultRole ?? 'ref')]
  } catch { roles = [String(w.defaultRole ?? 'ref')] }

  // The events they are actually rostered for, soonest first. Drives both the
  // "working" line and the relevant date that floats the pass on the lock screen.
  let events: { name: string; startDate: string }[] = []
  if (orgId) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const e = await client.execute({
        sql: `SELECT t.name AS name, t.startDate AS startDate, t.endDate AS endDate
              FROM "RosterEntry" r JOIN "Tournament" t ON t.id = r.tournamentId
              WHERE r.workerId = ? AND (t.endDate = '' OR t.endDate >= ? OR t.startDate >= ?)
              ORDER BY CASE WHEN t.startDate = '' THEN 1 ELSE 0 END, t.startDate ASC`,
        args: [String(w.id), today, today],
      })
      events = (e.rows as any[]).map(r => ({ name: String(r.name || ''), startDate: String(r.startDate || '') })).filter(x => x.name)
    } catch { /* no roster rows is a valid state -- a new hire still gets a pass */ }
  }

  // Same string as the printed card, built the same way, so the two never disagree
  // at a check-in table.
  const orgInitials = orgName.split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase() || 'STF'
  const year = new Date().getFullYear()
  const staffId = `${orgInitials}-${year}-${String(w.id).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`

  const certLine = [STAFF_CERT_LABELS[String(w.certLevel || '')], String(w.association || '')].filter(Boolean).join(' · ')
  const base = new URL(req.url).origin
  const next = events.find(e => e.startDate)

  const result = await buildApplePass({
    role: 'staff',
    // Stable: re-downloading REPLACES the pass in Wallet rather than stacking up
    // a second copy every time somebody taps the button.
    serialNumber: `staff-${String(w.id)}`,
    description: `${orgName} staff credential`,
    orgName,
    logoText: orgName,
    headerFields: [{ key: 'season', label: 'SEASON', value: String(year) }],
    primaryFields: [{ key: 'name', value: String(w.name || 'Staff') }],
    secondaryFields: [
      { key: 'role', label: 'ROLE', value: roles.map(roleLabel).join(' · ') },
      { key: 'id', label: 'STAFF ID', value: staffId },
    ],
    auxiliaryFields: [
      ...(certLine ? [{ key: 'cert', label: 'CERTIFICATION', value: certLine }] : []),
      ...(events.length ? [{ key: 'events', label: 'WORKING', value: `${events.length} event${events.length === 1 ? '' : 's'}` }] : []),
    ],
    backFields: [
      ...(events.length ? [{ key: 'list', label: 'Your events', value: events.map(e => e.name).join('\n') }] : []),
      { key: 'verify', label: 'Verify this credential', value: `${base}/verify/${String(w.id)}` },
      { key: 'portal', label: 'Staff portal', value: `${base}/dashboard/staff` },
      { key: 'note', label: 'Note', value: 'Show this at check-in. Your photo is on the verify page behind the QR code.' },
    ],
    barcodeMessage: `${base}/verify/${String(w.id)}`,
    logoPng: pngFromDataUrl(orgLogo),
    thumbnailPng: pngFromDataUrl(String(w.photoUrl || '')),
    relevantDate: next?.startDate ? new Date(`${next.startDate}T07:00:00`) : null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 })

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': WALLET_MIME,
      'Content-Disposition': `attachment; filename="${staffId}.pkpass"`,
      // A credential is per-person and changes with the roster. Never cached.
      'Cache-Control': 'no-store, private',
    },
  })
}
