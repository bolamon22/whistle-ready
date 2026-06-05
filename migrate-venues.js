// Adds the venues column to the Tournament table in Turso
// Run with: node migrate-venues.js
const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function run() {
  try {
    await client.execute(`ALTER TABLE "Tournament" ADD COLUMN "venues" TEXT NOT NULL DEFAULT '[]'`)
    console.log('✅ venues column added to Tournament table')
  } catch (e) {
    if (e.message?.includes('duplicate column')) {
      console.log('ℹ️  venues column already exists — nothing to do')
    } else {
      console.error('❌ Error:', e.message)
      process.exit(1)
    }
  }
}

run()
