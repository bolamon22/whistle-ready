// Adds orgId column to Worker table and stamps existing workers with their org
// Run with: node migrate-worker-org.js
const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function run() {
  // Step 1: Add column
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

  // Step 2: Find Sunshine Events Group (or the org with slug 'sunshine-events-group')
  // and stamp all untagged workers with that orgId
  try {
    const orgs = await client.execute(`SELECT id, name, slug FROM "Organization" ORDER BY createdAt ASC`)
    console.log('\nOrganizations found:')
    orgs.rows.forEach((o, i) => console.log(`  ${i + 1}. ${o.name} (${o.id}) slug=${o.slug}`))

    // Find SEG — prefer by slug, fall back to name match
    const seg = orgs.rows.find(o =>
      String(o.slug).toLowerCase().includes('sunshine') ||
      String(o.name).toLowerCase().includes('sunshine')
    )

    if (!seg) {
      console.log('\n⚠️  Could not find Sunshine Events Group. Untagged workers left as-is.')
      console.log('   Run manually: UPDATE "Worker" SET orgId = \'<your-org-id>\' WHERE orgId IS NULL')
      return
    }

    console.log(`\n✅ Stamping existing workers with org: ${seg.name} (${seg.id})`)
    const result = await client.execute({
      sql: `UPDATE "Worker" SET orgId = ? WHERE orgId IS NULL`,
      args: [seg.id],
    })
    console.log(`✅ ${result.rowsAffected} workers tagged with orgId = ${seg.id}`)
  } catch (e) {
    console.error('❌ Error stamping workers:', e.message)
  }
}

run()
