import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/admin/parent-login-gaps  (admin only, read-only)
//
// Who it finds: parents who filed a player waiver but have NO login account — so they
// can't sign in. That's everyone who filed before the account feature shipped
// (Oct 9 2026) plus anyone who skipped the "save your info for next time" step. These
// are the people to email "you can now set up a login with the same email you used."
//
// Returns the headline counts, a per-org breakdown, and (admin only) the email list
// for the campaign. Nothing is written.
export async function GET() {
  const auth = await requireStaff()
  if (!auth.ok) return auth.res
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const CUTOFF = '2026-10-09' // the parent-account feature shipped Oct 9 2026

  // One row per distinct parent email across live player waivers (both parentEmail and
  // parent2Email), with the earliest waiver date, a representative name, and the org(s).
  const rows = await prisma.$queryRawUnsafe<{ em: string; firstAt: string; name: string; orgId: string }[]>(`
    SELECT em, MIN(submittedAt) AS firstAt, MIN(name) AS name, MIN(orgId) AS orgId FROM (
      SELECT lower(trim(json_extract(data,'$.parentEmail')))  AS em, submittedAt, orgId,
             trim(json_extract(data,'$.parentName')) AS name
      FROM "OrgFormSubmission"
      WHERE formType='player' AND archivedAt IS NULL
        AND json_extract(data,'$.parentEmail') IS NOT NULL
        AND instr(json_extract(data,'$.parentEmail'),'@') > 0
      UNION ALL
      SELECT lower(trim(json_extract(data,'$.parent2Email'))) AS em, submittedAt, orgId,
             trim(json_extract(data,'$.parentName')) AS name
      FROM "OrgFormSubmission"
      WHERE formType='player' AND archivedAt IS NULL
        AND json_extract(data,'$.parent2Email') IS NOT NULL
        AND instr(json_extract(data,'$.parent2Email'),'@') > 0
    )
    WHERE em <> ''
    GROUP BY em
  `)

  const accounts = await prisma.$queryRawUnsafe<{ em: string }[]>(
    `SELECT lower(email) AS em FROM "User" WHERE email IS NOT NULL AND email <> ''`)
  const has = new Set(accounts.map(a => a.em))

  const noAccount = rows.filter(r => r.em && !has.has(r.em))
  const beforeFeature = noAccount.filter(r => String(r.firstAt || '') < CUTOFF)

  // Org names (raw-SQL Organization table), best-effort.
  const orgName = new Map<string, string>()
  try {
    const orgs = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`SELECT id, name FROM "Organization"`)
    for (const o of orgs) orgName.set(String(o.id), String(o.name || ''))
  } catch { /* ignore — fall back to orgId */ }

  const byOrg: Record<string, { org: string; count: number }> = {}
  for (const r of noAccount) {
    const k = r.orgId || '(none)'
    byOrg[k] = byOrg[k] || { org: orgName.get(k) || k, count: 0 }
    byOrg[k].count++
  }

  return NextResponse.json({
    distinctParentEmails: rows.length,
    withAccount: rows.length - noAccount.length,
    withoutAccount: noAccount.length,
    withoutAccountBeforeFeature: beforeFeature.length,
    cutoff: CUTOFF,
    byOrg: Object.values(byOrg).sort((a, b) => b.count - a.count),
    emails: noAccount
      .sort((a, b) => String(a.firstAt).localeCompare(String(b.firstAt)))
      .map(r => ({
        email: r.em,
        name: r.name || '',
        org: orgName.get(r.orgId) || r.orgId || '',
        firstWaiver: String(r.firstAt || '').slice(0, 10),
      })),
  })
}
