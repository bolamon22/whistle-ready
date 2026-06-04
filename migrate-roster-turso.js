// Migrates roster entries for Jingle Brawl from local SQLite to Turso
const { createClient } = require('@libsql/client')
const Database = require('better-sqlite3')
const path = require('path')
require('dotenv').config()

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  const local = new Database(path.join(__dirname, 'prisma', 'dev.db'), { readonly: true })

  // Find local Jingle Brawl
  const localT = local.prepare("SELECT * FROM Tournament WHERE name LIKE '%Jingle%'").get()
  if (!localT) { console.error('No Jingle Brawl found locally'); process.exit(1) }

  // Find Turso Jingle Brawl
  const tursoT = await turso.execute("SELECT id FROM Tournament WHERE name LIKE '%Jingle%'")
  if (!tursoT.rows.length) { console.error('No Jingle Brawl found in Turso'); process.exit(1) }
  const tursoTournamentId = tursoT.rows[0].id

  console.log(`Migrating roster from "${localT.name}" → Turso...`)

  // Get roster entries
  const roster = local.prepare('SELECT * FROM RosterEntry WHERE tournamentId = ?').all(localT.id)
  console.log(`Found ${roster.length} roster entries`)

  let created = 0, skipped = 0, failed = 0
  for (const r of roster) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO RosterEntry (id, workerId, tournamentId, gameTarget, notes, createdAt)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [r.id, r.workerId, tursoTournamentId, r.gameTarget || 0, r.notes || null, r.createdAt],
      })
      created++
    } catch (e) {
      if (e.message?.includes('UNIQUE')) skipped++
      else { console.error(`  ✘ ${r.workerId}: ${e.message}`); failed++ }
    }
  }

  console.log(`\n✅ Done! ${created} roster entries added, ${skipped} already existed, ${failed} failed`)
  local.close()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
