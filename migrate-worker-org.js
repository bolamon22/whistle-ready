// Adds orgId column to Worker table in Turso
// Run with: node migrate-worker-org.js
const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function run() {
  try {
    await client.execute(`ALTER TABLE "Worker" ADD COLUMN "orgId" TEXT`)
    console.log('✅ orgId column added to Worker table')
  } catch (e) {
    if (e.message?.includes('duplicate column')) {
      console.log('ℹ️  Column already exists, skipping')
    } else {
      console.error('❌ Error:', e.message)
      process.exit(1)
    }
  }
}

run()
