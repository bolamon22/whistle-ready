// Migrates all workers from local SQLite to Turso
// Run with: node migrate-staff-turso.js
const { createClient } = require('@libsql/client')
const Database = require('better-sqlite3')
const path = require('path')
require('dotenv').config()

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  // Open local SQLite
  const dbPath = path.join(__dirname, 'prisma', 'dev.db')
  const local = new Database(dbPath, { readonly: true })

  const workers = local.prepare('SELECT * FROM Worker').all()
  console.log(`Found ${workers.length} workers in local database`)

  let created = 0, skipped = 0, failed = 0

  for (const w of workers) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO Worker
          (id, name, email, phone, certLevel, defaultRole, isAssigner, gender, photoUrl,
           payRateOverride, hourlyRate, roles, payMethod, payHandle, notes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          w.id, w.name, w.email || null, w.phone || null,
          w.certLevel || 'youth', w.defaultRole || 'ref',
          w.isAssigner || 0, w.gender || 'both',
          w.photoUrl || null, w.payRateOverride || null,
          w.hourlyRate || null, w.roles || '[]',
          w.payMethod || 'check', w.payHandle || null,
          w.notes || null, w.createdAt, w.updatedAt,
        ],
      })
      console.log(`  ✔ ${w.name}`)
      created++
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        skipped++
      } else {
        console.error(`  ✘ ${w.name}: ${e.message}`)
        failed++
      }
    }
  }

  local.close()
  console.log(`\nDone! ${created} migrated, ${skipped} already existed, ${failed} failed`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
