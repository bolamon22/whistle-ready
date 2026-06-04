// Run with: node seed-jingle-staff.js
// Make sure npm run dev is running first

const BASE = 'http://localhost:3000'

// ── 1. Update existing staff pay rates ──
const updates = [
  // Girls refs - College cert $70
  { id: 'cmpxa6fdo0023ioknw4hx2m4s', name: 'Garnett Byrd',    certLevel: 'college', payRateOverride: 70, defaultRole: 'ref', gender: 'girls' },
  { id: 'cmpxa6fdy0025ioknf2mtuas0', name: 'Charity Cox',      certLevel: 'college', payRateOverride: 70, defaultRole: 'ref', gender: 'girls' },
  { id: 'cmpxa6fed0028ioknllpi1u84', name: 'Josh Feinberg',    certLevel: 'college', payRateOverride: 70, defaultRole: 'ref', gender: 'girls' },
  { id: 'cmpxa6ffk002iiokniuev5udo', name: 'Harry Ziskroit',   certLevel: 'college', payRateOverride: 70, defaultRole: 'ref', gender: 'girls' },
  // Boys refs - HS cert $60
  { id: 'cmpxa6fae001eioknx878sq1t', name: 'Philip Gatti',     certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys' },
  { id: 'cmpxa6fb3001jiokngtgy7pux', name: 'Lloyd Hamilton',   certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys' },
  { id: 'cmpxa6f990015ioknbfbeh981', name: 'Stephen Humane',   certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys' },
  { id: 'cmpxa6f9d0016iokncwbb434n', name: 'Derwin Moore',     certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys' },
  { id: 'cmpxa6f9i0017iokngm97y5kz', name: 'Mark Andriesse',   certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys' },
  { id: 'cmpxa6fd2001ziokns4q7b94r', name: 'Ethan Tosheff',    certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys' },
  { id: 'cmpxa6fem002aiokn69v5fq86', name: 'Mia Nicole Layne', certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'both' },
  { id: 'cmpxa6feu002ciokn660r3gtl', name: 'Alise Penbe',      certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'girls' },
  // Scorekeeper
  { id: 'cmpxa1e570005ioknf39mbbag', name: 'Gloria',           certLevel: 'none',    hourlyRate: null, payRateOverride: 15, defaultRole: 'scorekeeper', gender: 'both' },
]

// ── 2. New refs to add ──
const newRefs = [
  { name: 'Fabio Alveras',      certLevel: 'college', payRateOverride: 70, defaultRole: 'ref', gender: 'girls', roles: ['ref'] },
  { name: 'Vinny Layne',        certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys',  roles: ['ref'] },
  { name: 'Rich Guglielmo',     certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys',  roles: ['ref'] },
  { name: 'Joe Chiarella',      certLevel: 'hs',      payRateOverride: 60, defaultRole: 'ref', gender: 'boys',  roles: ['ref'] },
  { name: 'Adalberto Grimaldi', certLevel: 'college', payRateOverride: 70, defaultRole: 'ref', gender: 'girls', roles: ['ref'] },
]

// ── 3. Scorekeepers to add ──
const newSK = ['Reese', 'Grace', 'Joseph', 'Zuri', 'Lindsey', 'Sorto', 'Trace', 'Valentina']
  .map(name => ({ name, certLevel: 'none', payRateOverride: 15, defaultRole: 'scorekeeper', roles: ['scorekeeper'], gender: 'both' }))

async function run() {
  let updated = 0, added = 0, failed = 0

  console.log('── Updating existing staff rates ──')
  for (const w of updates) {
    const r = await fetch(`${BASE}/api/workers/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certLevel: w.certLevel, payRateOverride: w.payRateOverride, defaultRole: w.defaultRole, gender: w.gender, ...(w.hourlyRate !== undefined && { hourlyRate: w.hourlyRate }) }),
    })
    if (r.ok) { updated++; console.log(`  ✔ Updated ${w.name}`) }
    else { failed++; console.error(`  ✘ Failed ${w.name}: ${await r.text()}`) }
  }

  console.log('\n── Adding new refs ──')
  for (const w of newRefs) {
    const r = await fetch(`${BASE}/api/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...w, payMethod: 'check', isAssigner: false }),
    })
    if (r.ok) { added++; console.log(`  ✔ Added ${w.name}`) }
    else { failed++; console.error(`  ✘ Failed ${w.name}: ${await r.text()}`) }
  }

  console.log('\n── Adding scorekeepers ──')
  for (const w of newSK) {
    const r = await fetch(`${BASE}/api/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...w, payMethod: 'check', isAssigner: false }),
    })
    if (r.ok) { added++; console.log(`  ✔ Added ${w.name}`) }
    else { failed++; console.error(`  ✘ Failed ${w.name}: ${await r.text()}`) }
  }

  console.log(`\n🏁 Done — ${updated} updated, ${added} added, ${failed} failed`)
}

run().catch(console.error)
