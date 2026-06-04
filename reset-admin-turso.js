// Run with: node reset-admin-turso.js
const { createClient } = require('@libsql/client')
const bcrypt = require('bcryptjs')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  const hash = await bcrypt.hash('changeme123', 12)
  const now = new Date().toISOString()

  const update = await client.execute({
    sql: `UPDATE User SET password = ?, updatedAt = ? WHERE email = ?`,
    args: [hash, now, 'bo@lacrossewear.com'],
  })

  if (update.rowsAffected === 0) {
    // Insert with a simple random id
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    await client.execute({
      sql: `INSERT INTO User (id, name, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, 'Bo', 'bo@lacrossewear.com', hash, 'admin', now, now],
    })
    console.log('Admin user created!')
  } else {
    console.log('Password updated in Turso!')
  }

  console.log('Email: bo@lacrossewear.com')
  console.log('Password: changeme123')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
