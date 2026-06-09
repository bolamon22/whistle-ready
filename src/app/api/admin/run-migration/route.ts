import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

export async function POST() {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  const log: string[] = []

  // Step 1: Add orgId column
  try {
    await client.execute(`ALTER TABLE "Worker" ADD COLUMN "orgId" TEXT`)
    log.push('✅ orgId column added to Worker table')
  } catch (e: any) {
    if (e.message?.includes('duplicate column') || e.message?.includes('already exists')) {
      log.push('ℹ️  orgId column already exists')
    } else {
      return NextResponse.json({ error: e.message, log }, { status: 500 })
    }
  }

  // Step 2: Find Sunshine Events Group
  const orgs = await client.execute(`SELECT id, name, slug FROM "Organization" ORDER BY createdAt ASC`)
  log.push(`Found ${orgs.rows.length} orgs: ${orgs.rows.map((o: any) => o.name).join(', ')}`)

  const seg = orgs.rows.find((o: any) =>
    String(o.slug).toLowerCase().includes('sunshine') ||
    String(o.name).toLowerCase().includes('sunshine')
  )

  if (!seg) {
    return NextResponse.json({ error: 'Could not find Sunshine Events Group', log }, { status: 500 })
  }

  // Step 3: Stamp all untagged workers with SEG's orgId
  const result = await client.execute({
    sql: `UPDATE "Worker" SET orgId = ? WHERE orgId IS NULL`,
    args: [(seg as any).id],
  })
  log.push(`✅ ${result.rowsAffected} workers tagged with ${(seg as any).name} (${(seg as any).id})`)

  return NextResponse.json({ success: true, log })
}
