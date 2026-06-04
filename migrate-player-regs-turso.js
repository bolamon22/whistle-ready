// Migrates player registrations for Jingle Brawl from local SQLite to Turso
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

  const players = local.prepare('SELECT * FROM PlayerRegistration WHERE tournamentId = ?').all(localT.id)
  console.log(`Found ${players.length} player registrations`)

  let created = 0, skipped = 0, failed = 0
  for (const p of players) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO PlayerRegistration
              (id, tournamentId, playerName, playerEmail, usLacrosseNumber, gender, dob, grade,
               teamClubName, jerseyNumber, parentName, parentEmail, parentPhone,
               parent2Name, parent2Email, parent2Phone,
               emergencyContactName, emergencyContactPhone,
               waiverSignature, needsHotel, wantsUpdates, createdAt)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          p.id, tursoTournamentId, p.playerName, p.playerEmail || '',
          p.usLacrosseNumber, p.gender, p.dob || '', p.grade,
          p.teamClubName, p.jerseyNumber || '', p.parentName, p.parentEmail, p.parentPhone,
          p.parent2Name || '', p.parent2Email || '', p.parent2Phone || '',
          p.emergencyContactName, p.emergencyContactPhone,
          p.waiverSignature, p.needsHotel || '', p.wantsUpdates || 0, p.createdAt,
        ],
      })
      created++
    } catch (e) {
      if (e.message?.includes('UNIQUE')) skipped++
      else { console.error(`  ✘ ${p.playerName}: ${e.message}`); failed++ }
    }
  }

  console.log(`\n✅ Done! ${created} players migrated, ${skipped} already existed, ${failed} failed`)
  local.close()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
