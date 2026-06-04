// Deletes all workers from Turso so we can re-seed cleanly
const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  const result = await client.execute('DELETE FROM Worker')
  console.log(`✅ Deleted ${result.rowsAffected} workers from Turso`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
