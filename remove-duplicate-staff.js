// Removes duplicate workers (keeps the one with the oldest/original ID)
const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  const result = await client.execute('SELECT id, name FROM Worker ORDER BY name, createdAt ASC')
  const workers = result.rows

  // Group by name
  const byName = {}
  for (const w of workers) {
    if (!byName[w.name]) byName[w.name] = []
    byName[w.name].push(w.id)
  }

  let deleted = 0
  for (const [name, ids] of Object.entries(byName)) {
    if (ids.length > 1) {
      // Keep the first (oldest), delete the rest
      const toDelete = ids.slice(1)
      for (const id of toDelete) {
        await client.execute({ sql: 'DELETE FROM Worker WHERE id = ?', args: [id] })
        deleted++
      }
      console.log(`  ✔ ${name} — kept 1, removed ${toDelete.length}`)
    }
  }

  console.log(`\nDone! Removed ${deleted} duplicates.`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
