// Migrates payment records and tournament transactions for Jingle Brawl from local SQLite to Turso
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
  console.log(`Migrating financials for Jingle Brawl...`)

  // ── Registration Payments ──
  const regPayments = local.prepare(`
    SELECT rp.* FROM RegistrationPayment rp
    JOIN TeamRegistration tr ON tr.id = rp.registrationId
    WHERE tr.tournamentId = ?
  `).all(localT.id)
  console.log(`\nFound ${regPayments.length} registration payments`)

  let rp_created = 0, rp_skipped = 0, rp_failed = 0
  for (const p of regPayments) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO RegistrationPayment
              (id, registrationId, amount, method, checkNumber, receivedAt, notes, createdAt)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [p.id, p.registrationId, p.amount, p.method, p.checkNumber || '',
               p.receivedAt, p.notes || '', p.createdAt],
      })
      rp_created++
    } catch (e) {
      if (e.message?.includes('UNIQUE')) rp_skipped++
      else { console.error(`  ✘ Payment ${p.id}: ${e.message}`); rp_failed++ }
    }
  }
  console.log(`✅ Registration payments: ${rp_created} migrated, ${rp_skipped} existed, ${rp_failed} failed`)

  // ── Staff Payment Records ──
  const staffPayments = local.prepare('SELECT * FROM PaymentRecord WHERE tournamentId = ?').all(localT.id)
  console.log(`\nFound ${staffPayments.length} staff payment records`)

  let sp_created = 0, sp_skipped = 0, sp_failed = 0
  for (const p of staffPayments) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO PaymentRecord
              (id, workerId, tournamentId, amount, method, paidAt, notes, paidBy)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [p.id, p.workerId, tursoTournamentId, p.amount, p.method || 'check',
               p.paidAt, p.notes || null, p.paidBy || null],
      })
      sp_created++
    } catch (e) {
      if (e.message?.includes('UNIQUE')) sp_skipped++
      else { console.error(`  ✘ Staff payment ${p.id}: ${e.message}`); sp_failed++ }
    }
  }
  console.log(`✅ Staff payments: ${sp_created} migrated, ${sp_skipped} existed, ${sp_failed} failed`)

  // ── Tournament Transactions (income/expenses) ──
  const transactions = local.prepare('SELECT * FROM TournamentTransaction WHERE tournamentId = ?').all(localT.id)
  console.log(`\nFound ${transactions.length} tournament transactions`)

  let tt_created = 0, tt_skipped = 0, tt_failed = 0
  for (const t of transactions) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO TournamentTransaction
              (id, tournamentId, type, category, description, amount, method, date, notes, createdAt)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [t.id, tursoTournamentId, t.type, t.category, t.description,
               t.amount, t.method || 'check', t.date, t.notes || '', t.createdAt],
      })
      tt_created++
    } catch (e) {
      if (e.message?.includes('UNIQUE')) tt_skipped++
      else { console.error(`  ✘ Transaction ${t.id}: ${e.message}`); tt_failed++ }
    }
  }
  console.log(`✅ Transactions: ${tt_created} migrated, ${tt_skipped} existed, ${tt_failed} failed`)

  local.close()
  console.log('\n✅ All financials migrated!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
