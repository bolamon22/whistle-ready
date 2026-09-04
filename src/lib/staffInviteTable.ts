import { createClient } from '@libsql/client'

// The StaffInvite TABLE never existed in prod Turso: the repo migration file
// (prisma/migrations/20260605_add_staff_invite) was never applied, because this app
// migrates via in-app admin routes and StaffInvite was never wired into one. Every
// invite send/accept 500'd on "no such table" — found Sep 4 2026, the SECOND root
// cause behind dead invites (the first: the model missing from schema.prisma).
// Self-heal instead of a migration button: idempotent, call before any
// StaffInvite read/write.
export async function ensureStaffInviteTable(): Promise<void> {
  const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  await client.execute(`CREATE TABLE IF NOT EXISTS "StaffInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "tournamentId" TEXT,
    "usedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "StaffInvite_token_key" ON "StaffInvite"("token")`)
  await client.execute(`CREATE INDEX IF NOT EXISTS "StaffInvite_email_idx" ON "StaffInvite"("email")`)
  // Raw columns deliberately NOT in schema.prisma (same pattern as Organization / Tournament.orgId)
  try { await client.execute(`ALTER TABLE "StaffInvite" ADD COLUMN "orgId" TEXT`) } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE "StaffInvite" ADD COLUMN "workerId" TEXT`) } catch { /* exists */ }
}
