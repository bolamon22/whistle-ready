import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Creates the social-scheduler tables (SocialAccount, ScheduledPost,
// PostInsightSnapshot — see prisma/schema.prisma and SOCIAL-SCHEDULER.md).
// Idempotent (IF NOT EXISTS), same one-shot-POST pattern as migrate-flights.
export async function POST() {
  const log: string[] = []
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SocialAccount" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "platform" TEXT NOT NULL,
        "label" TEXT NOT NULL DEFAULT '',
        "externalId" TEXT NOT NULL,
        "pageId" TEXT NOT NULL DEFAULT '',
        "accessToken" TEXT NOT NULL,
        "tokenExpiresAt" DATETIME,
        "connectedByUserId" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'active',
        "lastError" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    log.push('SocialAccount ready')
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SocialAccount_orgId_idx" ON "SocialAccount"("orgId")`)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ScheduledPost" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "socialAccountId" TEXT NOT NULL,
        "caption" TEXT NOT NULL DEFAULT '',
        "mediaUrls" TEXT NOT NULL DEFAULT '[]',
        "scheduledFor" DATETIME NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "approvedByUserId" TEXT NOT NULL DEFAULT '',
        "approvedAt" DATETIME,
        "externalPostId" TEXT NOT NULL DEFAULT '',
        "publishedAt" DATETIME,
        "lastError" TEXT NOT NULL DEFAULT '',
        "createdByUserId" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    log.push('ScheduledPost ready')
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScheduledPost_orgId_idx" ON "ScheduledPost"("orgId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScheduledPost_socialAccountId_idx" ON "ScheduledPost"("socialAccountId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScheduledPost_status_scheduledFor_idx" ON "ScheduledPost"("status","scheduledFor")`)
    // Columns added after the first rollout — SQLite has no ADD COLUMN IF NOT EXISTS,
    // so each is attempted and a "duplicate column" error is treated as already done.
    for (const [col, ddl] of [['firstComment', `TEXT NOT NULL DEFAULT ''`], ['groupId', `TEXT NOT NULL DEFAULT ''`]] as const) {
      try { await prisma.$executeRawUnsafe(`ALTER TABLE "ScheduledPost" ADD COLUMN "${col}" ${ddl}`); log.push(`ScheduledPost.${col} added`) }
      catch (e: any) { if (!/duplicate column/i.test(String(e?.message))) throw e; log.push(`ScheduledPost.${col} already present`) }
    }
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScheduledPost_groupId_idx" ON "ScheduledPost"("groupId")`)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PostInsightSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "scheduledPostId" TEXT NOT NULL,
        "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "reach" INTEGER NOT NULL DEFAULT 0,
        "impressions" INTEGER NOT NULL DEFAULT 0,
        "likes" INTEGER NOT NULL DEFAULT 0,
        "comments" INTEGER NOT NULL DEFAULT 0,
        "saves" INTEGER NOT NULL DEFAULT 0,
        "shares" INTEGER NOT NULL DEFAULT 0,
        "raw" TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    log.push('PostInsightSnapshot ready')
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PostInsightSnapshot_scheduledPostId_idx" ON "PostInsightSnapshot"("scheduledPostId")`)

    return NextResponse.json({ ok: true, log })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err), log }, { status: 500 })
  }
}
