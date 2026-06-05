// Creates the StaffInvite table in Turso
// Run with: node migrate-staff-invite.js
const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function run() {
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "StaffInvite" (
        "id"           TEXT     NOT NULL PRIMARY KEY,
        "token"        TEXT     NOT NULL,
        "email"        TEXT     NOT NULL,
        "name"         TEXT,
        "tournamentId" TEXT,
        "usedAt"       DATETIME,
        "expiresAt"    DATETIME NOT NULL,
        "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "StaffInvite_token_key" ON "StaffInvite"("token")`)
    await client.execute(`CREATE INDEX IF NOT EXISTS "StaffInvite_token_idx" ON "StaffInvite"("token")`)
    await client.execute(`CREATE INDEX IF NOT EXISTS "StaffInvite_email_idx" ON "StaffInvite"("email")`)
    console.log('✅ StaffInvite table created')
  } catch (e) {
    console.error('❌ Error:', e.message)
    process.exit(1)
  }
}

run()
