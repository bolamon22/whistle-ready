// Run with: node seed-jingle-roster.js
// Make sure npm run dev is running first

const BASE = 'http://localhost:3000'
const TOURNAMENT_ID = 'cmpykoo4z0000h24blhpsm8nn'

// All refs and scorekeepers working the Jingle Brawl
const workerIds = [
  // Refs - Girls ($70)
  'cmpxa6fdy0025ioknf2mtuas0', // Charity Cox
  'cmpxa6fdo0023ioknw4hx2m4s', // Garnett Byrd
  'cmpym88w0005i2dlhysuwnu2c',  // Adalberto Grimaldi (Al G.)
  'cmpxa6fed0028ioknllpi1u84',  // Josh Feinberg
  'cmpxa6ffk002iiokniuev5udo',  // Harry Ziskroit
  'cmpym88u7005e2dlhmda7msls',  // Fabio Alveras
  // Refs - Boys/Mixed ($60)
  'cmpxa6feu002ciokn660r3gtl',  // Alise Penbe
  'cmpxa6fb3001jiokngtgy7pux',  // Lloyd Hamilton
  'cmpxa6f990015ioknbfbeh981',  // Stephen Humane
  'cmpym88v3005g2dlh2jj0rdtt',  // Rich Guglielmo
  'cmpxa6f9i0017iokngm97y5kz',  // Mark Andriesse
  'cmpxa6fae001eioknx878sq1t',  // Philip Gatti
  'cmpxa6f9d0016iokncwbb434n',  // Derwin Moore
  'cmpxa6fd2001ziokns4q7b94r',  // Ethan Tosheff
  'cmpym88vk005h2dlh7xy8my7n',  // Joe Chiarella
  'cmpym88um005f2dlhnv66gfk9',  // Vinny Layne
  // Scorekeepers ($15)
  'cmpxa1e7s000tiokn1tzo28cq',  // Sofia
  'cmpym88ws005j2dlha9hg2in3',  // Reese
  'cmpym88xu005k2dlh85l94jwl',  // Grace
  'cmpym88ye005l2dlhobkca429',  // Joseph
  'cmpym88yy005m2dlhb0meay9k',  // Zuri
  'cmpxa6fbs001oioknl8yg8be7',  // Ryan Olexa
  'cmpym88zd005n2dlhcta3690k',  // Lindsey
  'cmpym88zr005o2dlh4hghryot',  // Sorto
  'cmpym8902005p2dlhx0v9f86g',  // Trace
  'cmpxa1e570005ioknf39mbbag',  // Gloria
  'cmpym890f005q2dlhxqi8ln8a',  // Valentina
]

async function run() {
  let added = 0, skipped = 0, failed = 0

  for (const workerId of workerIds) {
    const res = await fetch(`${BASE}/api/tournaments/${TOURNAMENT_ID}/roster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId, gameTarget: 0 }),
    })
    const text = await res.text()
    if (res.ok) {
      added++
    } else if (text.includes('Unique') || text.includes('already') || res.status === 409) {
      skipped++
    } else {
      failed++
      console.error(`  ✘ Failed ${workerId}: ${text}`)
    }
  }

  console.log(`\n🏁 Done — ${added} added to roster, ${skipped} already on roster, ${failed} failed`)
}

run().catch(console.error)
