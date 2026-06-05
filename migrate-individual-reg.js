// Creates IndividualRegistration table and adds individual reg settings to Tournament
// Run with: node migrate-individual-reg.js
const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function run() {
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "IndividualRegistration" (
        "id"                    TEXT NOT NULL PRIMARY KEY,
        "tournamentId"          TEXT NOT NULL,
        "firstName"             TEXT NOT NULL,
        "lastName"              TEXT NOT NULL,
        "email"                 TEXT NOT NULL,
        "phone"                 TEXT NOT NULL DEFAULT '',
        "position"              TEXT NOT NULL,
        "numberRequest"         TEXT NOT NULL DEFAULT '',
        "jerseySize"            TEXT NOT NULL,
        "shortsSize"            TEXT NOT NULL,
        "usLacrosseNumber"      TEXT NOT NULL DEFAULT '',
        "dateOfBirth"           TEXT NOT NULL DEFAULT '',
        "guardianName"          TEXT NOT NULL DEFAULT '',
        "guardianPhone"         TEXT NOT NULL DEFAULT '',
        "guardianEmail"         TEXT NOT NULL DEFAULT '',
        "emergencyContactName"  TEXT NOT NULL DEFAULT '',
        "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
        "emergencyRelationship" TEXT NOT NULL DEFAULT '',
        "medicalNotes"          TEXT NOT NULL DEFAULT '',
        "waiverSigned"          INTEGER NOT NULL DEFAULT 0,
        "waiverSignature"       TEXT NOT NULL DEFAULT '',
        "feeTierId"             TEXT NOT NULL,
        "feeTierName"           TEXT NOT NULL,
        "feeTierAmount"         REAL NOT NULL,
        "paymentStatus"         TEXT NOT NULL DEFAULT 'pending',
        "stripePaymentIntent"   TEXT,
        "stripeSessionId"       TEXT,
        "createdAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await client.execute(`CREATE INDEX IF NOT EXISTS "IndividualReg_tournamentId" ON "IndividualRegistration"("tournamentId")`)
    await client.execute(`CREATE INDEX IF NOT EXISTS "IndividualReg_email" ON "IndividualRegistration"("email")`)

    // Add individual reg settings columns to Tournament
    const cols = [
      `ALTER TABLE "Tournament" ADD COLUMN "individualRegEnabled" INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE "Tournament" ADD COLUMN "individualRegDescription" TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE "Tournament" ADD COLUMN "individualRegTiers" TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE "Tournament" ADD COLUMN "individualRegPositions" TEXT NOT NULL DEFAULT '["Attack","Midfield","Defense","Goalie","Utility/Other"]'`,
      `ALTER TABLE "Tournament" ADD COLUMN "individualRegSizes" TEXT NOT NULL DEFAULT '["YS","YM","YL","S","M","L","XL","XXL"]'`,
    ]
    for (const sql of cols) {
      try { await client.execute(sql) } catch (e) {
        if (!e.message?.includes('duplicate column')) throw e
      }
    }

    try { await client.execute(`ALTER TABLE "Tournament" ADD COLUMN "teamRegEnabled" INTEGER NOT NULL DEFAULT 1`) }
    catch (e) { if (!e.message?.includes('duplicate column')) throw e }
    console.log('✅ IndividualRegistration table + Tournament columns added')
  } catch (e) {
    console.error('❌ Error:', e.message)
    process.exit(1)
  }
}
run()
