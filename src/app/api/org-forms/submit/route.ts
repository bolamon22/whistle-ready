import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendEmail, emailEnabled } from '@/lib/email'
import { mdToHtml } from '@/app/o/[slug]/_md'

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

const key = (orgId: string) => `orgFormSubmissions:${orgId}`

// PUBLIC: a registrant submits a standalone org form (no auth). Validates the org
// exists, then appends the submission to the org's submissions list.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as any
    const orgId = String(body.orgId || '')
    const formType = String(body.formType || 'player')
    const data = body.data || {}
    if (!orgId) return NextResponse.json({ error: 'Missing organization' }, { status: 400 })
    const org = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM "Organization" WHERE id = ?', orgId)
    if (!org || org.length === 0) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: key(orgId) } })
    const list: any[] = row ? (JSON.parse(row.value || '[]') || []) : []
    list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), formType, data, submittedAt: new Date().toISOString() })
    if (list.length > 5000) list.splice(0, list.length - 5000)
    const value = JSON.stringify(list)
    await prisma.appSetting.upsert({ where: { key: key(orgId) }, update: { value }, create: { key: key(orgId), value } })

    // Confirmation email (non-blocking) — uses the org's configured confirmation text.
    try {
      const to = String(((formType === 'vendor' || formType === 'staff') ? data.email : (data.playerEmail || data.parentEmail)) || '').trim()
      if (to && emailEnabled()) {
        const cfgRow = await prisma.appSetting.findUnique({ where: { key: `orgForms:${orgId}` } })
        const allCfg = cfgRow ? JSON.parse(cfgRow.value || '{}') : {}
        const cfg = (formType === 'vendor' ? allCfg.vendor : formType === 'staff' ? allCfg.staff : allCfg.player) || {}
        if (cfg.emailConfirmation !== false) {
          const orgRows = await prisma.$queryRawUnsafe<any[]>('SELECT name FROM "Organization" WHERE id = ?', orgId)
          const orgName = orgRows?.[0]?.name || 'the tournament'
          const title = cfg.confirmationTitle || (formType === 'vendor' ? 'Vendor request received!' : formType === 'staff' ? 'Application received!' : "You're registered!")
          const bodyHtml = mdToHtml(cfg.confirmationMessage || (formType === 'staff' ? "Thanks for your interest in working our events! We've received your application and will be in touch." : "Thanks for registering. We've received your information and signed waiver."))
          await sendEmail({
            to,
            subject: `${formType === 'vendor' ? 'Vendor request received' : formType === 'staff' ? 'Application received' : 'Registration received'} \u2014 ${orgName}`,
            html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto"><h1 style="font-size:20px;color:#0f172a">${title}</h1><div style="color:#475569;font-size:15px;line-height:1.6">${bodyHtml}</div><p style="color:#94a3b8;font-size:12px;margin-top:24px">${orgName} \u00b7 ${formType === 'vendor' ? 'Vendor request' : formType === 'staff' ? 'Staff application' : 'Player registration'} confirmation</p></div>`,
          })
        }
      }
    } catch { /* email failure must not fail the submission */ }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to submit' }, { status: 500 })
  }
}

// AUTH: org admin/director reads submissions for the editor.
function targetOrgId(req: NextRequest, session: any): string | null {
  const role = session?.user?.role
  const paramOrg = new URL(req.url).searchParams.get('org')
  if (role === 'admin' && paramOrg) return paramOrg
  return session?.user?.orgId ?? null
}
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') return NextResponse.json({ submissions: [] }, { status: 403 })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ submissions: [] })
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: key(orgId) } })
    return NextResponse.json({ submissions: row ? JSON.parse(row.value || '[]') : [] })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}
