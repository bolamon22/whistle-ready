const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const p = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('changeme123', 12)
  const user = await p.user.upsert({
    where: { email: 'bo@lacrossewear.com' },
    update: { role: 'admin', password: hash },
    create: { name: 'Bo', email: 'bo@lacrossewear.com', password: hash, role: 'admin' },
  })
  console.log('Admin created:', user.email, user.role)
  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
