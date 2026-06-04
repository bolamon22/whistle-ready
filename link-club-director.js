// Run with: node link-club-director.js
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // Find bo's user record
  const user = await p.user.findUnique({ where: { email: 'bo@lacrossewear.com' } })
  if (!user) { console.error('User not found'); return }
  console.log('Found user:', user.id, user.name, user.role)

  // Find all tournaments
  const tournaments = await p.tournament.findMany({ orderBy: { createdAt: 'desc' } })
  console.log('Tournaments:')
  tournaments.forEach(t => console.log(' ', t.id, t.name))

  // Find Florida Select registrations
  const regs = await p.teamRegistration.findMany({
    where: { clubName: { contains: 'Florida Select' } },
    select: { id: true, clubName: true, tournamentId: true }
  })
  console.log('Florida Select registrations:', JSON.stringify(regs, null, 2))

  if (regs.length === 0) {
    // Link to all tournaments anyway using exact name provided
    console.log('\nNo registrations found — linking to all tournaments as "Florida Select"')
    for (const t of tournaments) {
      const link = await p.clubDirectorLink.upsert({
        where: { userId_tournamentId_clubName: { userId: user.id, tournamentId: t.id, clubName: 'Florida Select' } },
        update: {},
        create: { userId: user.id, tournamentId: t.id, clubName: 'Florida Select' }
      })
      console.log('Linked:', t.name, '->', link.id)
    }
  } else {
    for (const reg of regs) {
      const link = await p.clubDirectorLink.upsert({
        where: { userId_tournamentId_clubName: { userId: user.id, tournamentId: reg.tournamentId, clubName: reg.clubName } },
        update: {},
        create: { userId: user.id, tournamentId: reg.tournamentId, clubName: reg.clubName }
      })
      console.log('Linked:', reg.clubName, 'in tournament', reg.tournamentId, '->', link.id)
    }
  }

  console.log('\nDone! bo@lacrossewear.com is now linked to Florida Select.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
