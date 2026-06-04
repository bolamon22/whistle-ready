// Migrates all games + assignments from local SQLite to Turso for a specific tournament
// Run with: node migrate-games-turso.js
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

  // Find local Jingle Brawl tournament
  const localT = local.prepare("SELECT * FROM Tournament WHERE name LIKE '%Jingle%'").get()
  if (!localT) { console.error('No Jingle Brawl tournament found locally'); process.exit(1) }
  console.log(`Local tournament: "${localT.name}" (${localT.id})`)

  // Find Turso Jingle Brawl tournament
  const tursoT = await turso.execute("SELECT id, name FROM Tournament WHERE name LIKE '%Jingle%'")
  if (!tursoT.rows.length) { console.error('No Jingle Brawl found in Turso — create it first'); process.exit(1) }
  const tursoTournamentId = tursoT.rows[0].id
  console.log(`Turso tournament: "${tursoT.rows[0].name}" (${tursoTournamentId})`)

  // Also update tournament settings (dates, location, etc.) from local
  await turso.execute({
    sql: `UPDATE Tournament SET sport=?, startDate=?, endDate=?, location=?, scheduleIncrement=?,
          dates=?, payRates=?, logoUrl=?, registrationDivisions=?, divisionRules=?, updatedAt=?
          WHERE id=?`,
    args: [localT.sport, localT.startDate, localT.endDate, localT.location,
           localT.scheduleIncrement, localT.dates, localT.payRates, localT.logoUrl || '',
           localT.registrationDivisions, localT.divisionRules,
           new Date().toISOString(), tursoTournamentId],
  })
  console.log('✔ Updated tournament settings')

  // Migrate games
  const games = local.prepare('SELECT * FROM Game WHERE tournamentId = ?').all(localT.id)
  console.log(`\nMigrating ${games.length} games...`)
  let gCreated = 0, gFailed = 0
  for (const g of games) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO Game
              (id, tournamentId, gameNumber, date, startTime, division, pool, location,
               team1, team2, score1, score2, refCount, isChampionship, isCanceled, createdAt)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [g.id, tursoTournamentId, g.gameNumber, g.date, g.startTime,
               g.division, g.pool || null, g.location, g.team1, g.team2,
               g.score1, g.score2, g.refCount, g.isChampionship, g.isCanceled, g.createdAt],
      })
      gCreated++
    } catch (e) {
      console.error(`  ✘ Game ${g.gameNumber}: ${e.message}`)
      gFailed++
    }
  }
  console.log(`✔ ${gCreated} games migrated, ${gFailed} failed`)

  // Migrate assignments
  const assignments = local.prepare(`
    SELECT a.* FROM Assignment a
    JOIN Game g ON g.id = a.gameId
    WHERE g.tournamentId = ?
  `).all(localT.id)
  console.log(`\nMigrating ${assignments.length} assignments...`)
  let aCreated = 0, aFailed = 0
  for (const a of assignments) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO Assignment (id, gameId, workerId, role, payRate, createdAt)
              VALUES (?,?,?,?,?,?)`,
        args: [a.id, a.gameId, a.workerId, a.role, a.payRate, a.createdAt],
      })
      aCreated++
    } catch (e) {
      aFailed++
    }
  }
  console.log(`✔ ${aCreated} assignments migrated, ${aFailed} failed`)

  local.close()
  console.log('\n✅ Migration complete!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
