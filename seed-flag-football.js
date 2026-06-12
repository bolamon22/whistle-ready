// Parkland Flag Football Showcase — Marketing Demo Seed
// Run with: node seed-flag-football.js
const BASE = 'https://gameday-staff5.vercel.app'

// ── Logo helper (ui-avatars.com generates colorful initials logos) ──
function logo(initials, bg) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${bg}&color=fff&size=128&bold=true&rounded=true`
}

// ── 20 South Florida flag football clubs ──
const CLUBS = [
  { name: 'Parkland Patriots',        abbr: 'PP',  color: 'dc2626', contact: 'Mike Torres',      email: 'mike@parklandpatriots.com',      phone: '(954) 555-0101' },
  { name: 'South Florida Surge',      abbr: 'SFS', color: '2563eb', contact: 'Lisa Chen',         email: 'lisa@sflasurage.com',            phone: '(954) 555-0102' },
  { name: 'Boca Blitz',               abbr: 'BB',  color: '16a34a', contact: 'Carlos Reyes',      email: 'carlos@bocablitz.com',          phone: '(561) 555-0103' },
  { name: 'Miami Mavericks',          abbr: 'MM',  color: 'ea580c', contact: 'Andre Williams',    email: 'andre@miamimavericks.com',       phone: '(305) 555-0104' },
  { name: 'Fort Lauderdale Falcons',  abbr: 'FLF', color: '7c3aed', contact: 'Sarah Johnson',     email: 'sarah@flfalcons.com',            phone: '(954) 555-0105' },
  { name: 'Coral Springs Cobras',     abbr: 'CSC', color: '0891b2', contact: 'David Kim',         email: 'david@cscobras.com',             phone: '(954) 555-0106' },
  { name: 'Weston Warriors',          abbr: 'WW',  color: 'b45309', contact: 'Maria Gonzalez',    email: 'maria@westonwarriors.com',       phone: '(954) 555-0107' },
  { name: 'Plantation Pythons',       abbr: 'PP2', color: '065f46', contact: 'Jason Brown',       email: 'jason@plantationpythons.com',    phone: '(954) 555-0108' },
  { name: 'Deerfield Dolphins',       abbr: 'DD',  color: '1d4ed8', contact: 'Kevin Martinez',    email: 'kevin@deerfielddolphins.com',    phone: '(954) 555-0109' },
  { name: 'Davie Destroyers',         abbr: 'DVD', color: '9f1239', contact: 'Rachel Thompson',   email: 'rachel@daviedestroyers.com',     phone: '(954) 555-0110' },
  { name: 'Tamarac Thunder',          abbr: 'TT',  color: '92400e', contact: 'Marcus Davis',      email: 'marcus@tamaracthunder.com',      phone: '(954) 555-0111' },
  { name: 'Margate Mustangs',         abbr: 'MG',  color: '1e3a5f', contact: 'Stephanie Wilson',  email: 'steph@margatemustangs.com',      phone: '(954) 555-0112' },
  { name: 'Pompano Panthers',         abbr: 'PMP', color: '4c1d95', contact: 'Brian Taylor',      email: 'brian@pompanopanthers.com',      phone: '(954) 555-0113' },
  { name: 'Sunrise Storm',            abbr: 'SS',  color: 'c2410c', contact: 'Amanda Clark',      email: 'amanda@sunrisestorm.com',        phone: '(954) 555-0114' },
  { name: 'Coconut Creek Coyotes',    abbr: 'CCC', color: '166534', contact: 'Derek Harris',      email: 'derek@ccoyotes.com',             phone: '(954) 555-0115' },
  { name: 'Lighthouse Point Lightning', abbr:'LPL', color: 'eab308', contact:'Nicole Rivera',    email: 'nicole@lplightning.com',         phone: '(954) 555-0116' },
  { name: 'Palm Beach Predators',     abbr: 'PBP', color: '831843', contact: 'Tyler Moore',       email: 'tyler@pbpredators.com',          phone: '(561) 555-0117' },
  { name: 'Wellington Wolves',        abbr: 'WLW', color: '1e40af', contact: 'Jessica Lee',       email: 'jessica@wellingtonwolves.com',   phone: '(561) 555-0118' },
  { name: 'Jupiter Jaguars',          abbr: 'JJ',  color: '065f46', contact: 'Chris Adams',       email: 'chris@jupiterjaguars.com',       phone: '(561) 555-0119' },
  { name: 'Boynton Bulldogs',         abbr: 'BYB', color: '7f1d1d', contact: 'Melissa White',     email: 'melissa@boyntonbulldogs.com',    phone: '(561) 555-0120' },
]

// ── Divisions (60 teams total) ──
const DIVISIONS = [
  { name: '8U Boys',          teams: 8  },
  { name: '10U Boys',         teams: 10 },
  { name: '12U Boys',         teams: 10 },
  { name: '14U Boys',         teams: 8  },
  { name: '16U Boys',         teams: 6  },
  { name: '8U Girls',         teams: 4  },
  { name: '10U Girls',        teams: 6  },
  { name: '12U Girls',        teams: 5  },
  { name: 'HS Boys JV',       teams: 3  },
]
// Total: 8+10+10+8+6+4+6+5+3 = 60 ✓

// ── Build team list ──
function buildTeams() {
  const teams = []
  let clubIdx = 0
  for (const div of DIVISIONS) {
    for (let i = 0; i < div.teams; i++) {
      const club = CLUBS[clubIdx % CLUBS.length]
      teams.push({ club, division: div.name })
      clubIdx++
    }
  }
  return teams
}

// ── Group teams into registrations by club ──
function buildRegistrations(teams) {
  const map = new Map()
  for (const t of teams) {
    const key = t.club.name
    if (!map.has(key)) map.set(key, { club: t.club, teams: [] })
    const entry = map.get(key)
    const teamNum = entry.teams.length + 1
    entry.teams.push({
      clubName: t.club.name,
      teamName: `${t.club.name} ${t.division}`,
      division: t.division,
      coachName: generateCoachName(),
      coachPhone: `(${['954','561','305'][Math.floor(Math.random()*3)]}) 555-${String(Math.floor(Math.random()*9000)+1000)}`,
      coachEmail: `coach${teamNum}@${t.club.name.toLowerCase().replace(/[^a-z]/g,'')}.com`,
      logoUrl: '',
    })
  }
  return Array.from(map.values())
}

const FIRST = ['James','Maria','David','Sarah','Carlos','Jessica','Marcus','Ashley','Tyler','Kevin','Rachel','Brian','Amanda','Derek','Nicole','Chris','Melissa','Jason','Stephanie','Andre']
const LAST  = ['Torres','Chen','Reyes','Williams','Johnson','Kim','Gonzalez','Brown','Martinez','Thompson','Davis','Wilson','Taylor','Clark','Harris','Rivera','Moore','Lee','Adams','White']
let nameIdx = 0
function generateCoachName() { return `${FIRST[nameIdx % FIRST.length]} ${LAST[(nameIdx++ + 7) % LAST.length]}` }

// ── Staff (refs + scorekeepers) ──
const REFS = [
  { name: 'Anthony Rosario',  certLevel: 'college', defaultRole: 'ref', gender: 'both',  payRateOverride: 65, roles: '["ref"]' },
  { name: 'Brittany Osei',    certLevel: 'college', defaultRole: 'ref', gender: 'both',  payRateOverride: 65, roles: '["ref"]' },
  { name: 'Damon Fletcher',   certLevel: 'hs',      defaultRole: 'ref', gender: 'boys',  payRateOverride: 55, roles: '["ref"]' },
  { name: 'Elena Vasquez',    certLevel: 'hs',      defaultRole: 'ref', gender: 'girls', payRateOverride: 55, roles: '["ref"]' },
  { name: 'Felix Okafor',     certLevel: 'college', defaultRole: 'ref', gender: 'boys',  payRateOverride: 65, roles: '["ref"]' },
  { name: 'Gabby Nguyen',     certLevel: 'hs',      defaultRole: 'ref', gender: 'girls', payRateOverride: 55, roles: '["ref"]' },
  { name: 'Harold Cruz',      certLevel: 'hs',      defaultRole: 'ref', gender: 'both',  payRateOverride: 55, roles: '["ref"]' },
  { name: 'Imani Baptiste',   certLevel: 'college', defaultRole: 'ref', gender: 'both',  payRateOverride: 65, roles: '["ref"]' },
  { name: 'Jake Hernandez',   certLevel: 'hs',      defaultRole: 'ref', gender: 'boys',  payRateOverride: 55, roles: '["ref"]' },
  { name: 'Keisha Thompson',  certLevel: 'college', defaultRole: 'ref', gender: 'girls', payRateOverride: 65, roles: '["ref"]' },
  { name: 'Leo Marchetti',    certLevel: 'hs',      defaultRole: 'ref', gender: 'both',  payRateOverride: 55, roles: '["ref"]' },
  { name: 'Mia Castillo',     certLevel: 'college', defaultRole: 'ref', gender: 'girls', payRateOverride: 65, roles: '["ref"]' },
]
const SCOREKEEPERS = [
  { name: 'Noah Patel',       certLevel: 'youth', defaultRole: 'scorekeeper', gender: 'both', payRateOverride: 15, roles: '["scorekeeper"]' },
  { name: 'Olivia Simmons',   certLevel: 'youth', defaultRole: 'scorekeeper', gender: 'both', payRateOverride: 15, roles: '["scorekeeper"]' },
  { name: 'Paige Delgado',    certLevel: 'youth', defaultRole: 'scorekeeper', gender: 'both', payRateOverride: 15, roles: '["scorekeeper"]' },
  { name: 'Quinn Stephens',   certLevel: 'youth', defaultRole: 'scorekeeper', gender: 'both', payRateOverride: 15, roles: '["scorekeeper"]' },
  { name: 'Rosa Fontaine',    certLevel: 'youth', defaultRole: 'scorekeeper', gender: 'both', payRateOverride: 15, roles: '["scorekeeper"]' },
  { name: 'Sam Ekwueme',      certLevel: 'youth', defaultRole: 'scorekeeper', gender: 'both', payRateOverride: 15, roles: '["scorekeeper"]' },
]

// ── Game schedule builder ──
function buildGames(tournamentId) {
  const games = []
  let gameNum = 1
  const fields = ['Field 1','Field 2','Field 3','Field 4','Field 5','Field 6']
  const times = ['08:00','08:50','09:40','10:30','11:20','12:10','13:00','13:50','14:40']
  const dates = ['2026-09-12','2026-09-13']

  // Build matchups per division
  const divTeams = {}
  for (const div of DIVISIONS) divTeams[div.name] = []
  const allTeams = buildTeams()
  for (const t of allTeams) {
    divTeams[t.division].push(t.club.name + ' ' + t.division)
  }

  // Create round-robin games for each division
  for (const div of DIVISIONS) {
    const teams = divTeams[div.name]
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const dateIdx = gameNum % 2
        const timeIdx = Math.floor(gameNum / fields.length) % times.length
        const fieldIdx = gameNum % fields.length
        games.push({
          tournamentId,
          gameNumber: String(gameNum).padStart(3, '0'),
          date: dates[dateIdx],
          startTime: times[timeIdx],
          division: div.name,
          pool: null,
          location: fields[fieldIdx],
          team1: teams[i],
          team2: teams[j],
          refCount: 2,
          isChampionship: false,
          isCanceled: false,
        })
        gameNum++
        if (gameNum > 80) return games // Cap at 80 games
      }
    }
  }
  return games
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`POST ${path} failed: ${txt.slice(0, 200)}`)
  }
  return res.json()
}

async function run() {
  console.log('🏈 Creating Parkland Flag Football Showcase...\n')

  // 1. Create tournament
  const tournament = await post('/api/tournaments', {
    name: 'Parkland Flag Football Showcase',
    sport: 'Football',
    startDate: '2026-09-12',
    endDate: '2026-09-13',
    location: 'Pine Trails Park, Parkland FL',
    scheduleIncrement: 50,
    registrationPricing: JSON.stringify({ tier1: 750, tier1Max: 3, tier2: 700, tier2Max: 6, tier3: 650, sevenVSeven: 750 }),
  })
  const tid = tournament.id
  console.log(`✅ Tournament created: "${tournament.name}" (${tid})`)

  // 2. Create registrations
  console.log('\n📋 Creating club registrations...')
  const teams = buildTeams()
  const registrations = buildRegistrations(teams)
  let regOk = 0
  for (const r of registrations) {
    const invoiceAmount = r.teams.length * 750
    try {
      await post('/api/registrations', {
        tournamentId: tid,
        clubName: r.club.name,
        clubContact: r.club.contact,
        contactEmail: r.club.email,
        contactPhone: r.club.phone,
        clubBasedIn: 'South Florida',
        clubWebsite: '',
        numTeams: r.teams.length,
        needsHotel: ['No','Yes','Maybe'][Math.floor(Math.random()*3)],
        paymentMethod: ['check','zelle','credit_card'][Math.floor(Math.random()*3)],
        notes: '',
        invoiceAmount,
        discountAmount: 0,
        discountNote: '',
        teams: r.teams,
      })
      console.log(`  ✔ ${r.club.name} — ${r.teams.length} team(s) — $${invoiceAmount}`)
      regOk++
    } catch(e) {
      console.error(`  ✘ ${r.club.name}: ${e.message}`)
    }
  }
  console.log(`\n✅ ${regOk} clubs registered`)

  // 3. Create staff
  console.log('\n👥 Creating staff...')
  let staffOk = 0
  for (const s of [...REFS, ...SCOREKEEPERS]) {
    try {
      await post('/api/workers', {
        name: s.name,
        certLevel: s.certLevel,
        defaultRole: s.defaultRole,
        gender: s.gender,
        payRateOverride: s.payRateOverride,
        roles: s.roles,
        payMethod: 'check',
      })
      console.log(`  ✔ ${s.name} (${s.defaultRole})`)
      staffOk++
    } catch(e) {
      console.error(`  ✘ ${s.name}: ${e.message}`)
    }
  }
  console.log(`\n✅ ${staffOk} staff created`)

  // 4. Create games
  console.log('\n📅 Creating game schedule...')
  const games = buildGames(tid)
  let gamesOk = 0
  for (const g of games) {
    try {
      await post(`/api/tournaments/${tid}/games`, g)
      gamesOk++
    } catch(e) {
      // Try alternate endpoint
      try {
        await post('/api/games', g)
        gamesOk++
      } catch {}
    }
  }
  console.log(`✅ ${gamesOk} games scheduled`)

  console.log(`
🎉 Done! Parkland Flag Football Showcase is ready.
   • 60 teams across ${DIVISIONS.length} divisions
   • ${registrations.length} clubs registered
   • ${REFS.length + SCOREKEEPERS.length} staff created
   • ${gamesOk} games on the schedule
   • $750/team · ${registrations.reduce((s,r)=>s+r.teams.length,0) * 750} total invoiced

   View at: ${BASE}
  `)
}

run().catch(console.error)
