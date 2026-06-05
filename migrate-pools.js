// Creates the Pool table in Turso
// Run with: node migrate-pools.js
const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function run() {
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "Pool" (
        "id"           TEXT     NOT NULL PRIMARY KEY,
        "tournamentId" TEXT     NOT NULL,
        "division"     TEXT     NOT NULL,
        "name"         TEXT     NOT NULL,
        "teamNames"    TEXT     NOT NULL DEFAULT '[]',
        "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await client.execute(`CREATE INDEX IF NOT EXISTS "Pool_tournamentId_division_idx" ON "Pool"("tournamentId", "division")`)
    console.log('✅ Pool table created')
  } catch (e) {
    console.error('❌ Error:', e.message)
    process.exit(1)
  }
}

run()
