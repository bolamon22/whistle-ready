// Run with: node seed-jingle-brawl.js
// Make sure npm run dev is running first

const BASE = 'http://localhost:3000'

const registrations = [
  {
    clubName: 'Madskillz Lax', clubContact: 'john mcclain', contactEmail: 'jmcclain1028@yahoo.com',
    contactPhone: '(561) 702-6009', clubBasedIn: 'Boca Raton', clubWebsite: 'https://madskillzlax.com',
    needsHotel: 'No', paymentMethod: 'check', notes: '', invoiceAmount: 4750, discountAmount: 0,
    teams: [
      { clubName: 'Madskillz Lax', teamName: 'Madskillz Epic Reindeers', division: 'Girls LS: 5th and Below', coachName: 'Allison Shamir', coachPhone: '(561) 702-6009', coachEmail: 'jmcclain1028@yahoo.com' },
      { clubName: 'Madskillz Lax', teamName: 'Madskillz Real Deal Candy Canes', division: 'Girls LS: 5th and Below', coachName: 'Shannon Cotter', coachPhone: '(561) 702-6009', coachEmail: 'jmcclain1028@yahoo.com' },
      { clubName: 'Madskillz Lax', teamName: 'Madskillz 2032', division: 'Girls MS', coachName: 'Mike Jones', coachPhone: '(561) 702-6009', coachEmail: 'jmcclain1028@yahoo.com' },
      { clubName: 'Madskillz Lax', teamName: 'Madskillz 2031', division: 'Girls MS', coachName: 'john mcclain', coachPhone: '(561) 702-6009', coachEmail: 'jmcclain1028@yahoo.com' },
      { clubName: 'Madskillz Lax', teamName: 'Florida Select Orange', division: 'Girls HS B', coachName: 'Lizzy Lynch', coachPhone: '(561) 702-6009', coachEmail: 'jmcclain1028@yahoo.com' },
    ]
  },
  {
    clubName: 'Florida Express Lacrosse', clubContact: 'Patrick Timothee', contactEmail: 'admin@southfloridaexpresslacrosse.com',
    contactPhone: '(305) 647-9618', clubBasedIn: 'Davie, FL', clubWebsite: 'https://floridaexpresslacrosse.com',
    needsHotel: 'No', paymentMethod: 'zelle', notes: '', invoiceAmount: 2985, discountAmount: 0,
    teams: [
      { clubName: 'Florida Express Lacrosse', teamName: 'Express Reindeers', division: 'Girls HS B', coachName: 'Patrick Timothee', coachPhone: '(305) 647-9618', coachEmail: 'admin@southfloridaexpresslacrosse.com' },
      { clubName: 'Florida Express Lacrosse', teamName: 'Polar Express', division: 'Girls HS B', coachName: 'Patrick Timothee', coachPhone: '(305) 647-9618', coachEmail: 'admin@southfloridaexpresslacrosse.com' },
      { clubName: 'Florida Express Lacrosse', teamName: 'Express Elves', division: 'Girls MS', coachName: 'Patrick Timothee', coachPhone: '(305) 647-9618', coachEmail: 'admin@southfloridaexpresslacrosse.com' },
    ]
  },
  {
    clubName: 'FLX', clubContact: 'Whitney West', contactEmail: 'info@flxcrabs.com',
    contactPhone: '(904) 874-1941', clubBasedIn: '', clubWebsite: '',
    needsHotel: 'Maybe', paymentMethod: 'check', notes: '', invoiceAmount: 2985, discountAmount: 0,
    teams: [
      { clubName: 'FLX', teamName: 'FLX 14U', division: 'Boys U14', coachName: 'Jake Ferguson', coachPhone: '(954) 608-0916', coachEmail: 'jakeferguson@comcast.net' },
      { clubName: 'FLX', teamName: 'FLX 12U', division: 'Boys U12', coachName: 'Jake Ferguson', coachPhone: '(954) 608-0916', coachEmail: 'jakeferguson@comcast.net' },
      { clubName: 'FLX', teamName: 'FLX 10U', division: 'Boys U10', coachName: 'Jake Ferguson', coachPhone: '(954) 608-0916', coachEmail: 'jakeferguson@comcast.net' },
    ]
  },
  {
    clubName: 'Florida Chaos', clubContact: 'Bill O\'Connell', contactEmail: 'floridachaos305@gmail.com',
    contactPhone: '(954) 540-2327', clubBasedIn: '', clubWebsite: '',
    needsHotel: 'Maybe', paymentMethod: 'check', notes: '', invoiceAmount: 2985, discountAmount: 0,
    teams: [
      { clubName: 'Florida Chaos', teamName: 'Florida Chaos LS', division: 'Girls LS: 5th and Below', coachName: 'Bill O\'Connell', coachPhone: '(954) 540-2327', coachEmail: 'floridachaos305@gmail.com' },
      { clubName: 'Florida Chaos', teamName: 'Florida Chaos MS', division: 'Girls MS', coachName: 'Bill O\'Connell', coachPhone: '(954) 540-2327', coachEmail: 'floridachaos305@gmail.com' },
      { clubName: 'Florida Chaos', teamName: 'Florida Chaos HS', division: 'Girls HS B', coachName: 'Bill O\'Connell', coachPhone: '(954) 540-2327', coachEmail: 'floridachaos305@gmail.com' },
    ]
  },
  {
    clubName: 'LTF', clubContact: 'Kelley Della Porta', contactEmail: 'ktdellaporta@gmail.com',
    contactPhone: '(772) 559-9095', clubBasedIn: 'Vero Beach, FL', clubWebsite: '',
    needsHotel: 'Yes', paymentMethod: 'credit_card', notes: '', invoiceAmount: 925, discountAmount: 0,
    teams: [
      { clubName: 'LTF', teamName: 'LTF', division: 'Boys HS A', coachName: 'Ben Staniewicz', coachPhone: '(772) 321-5176', coachEmail: 'coachben71@icloud.com' },
    ]
  },
  {
    clubName: 'Swamp Grinches', clubContact: 'Zac Pasko', contactEmail: 'zac@lacrossewear.com',
    contactPhone: '(917) 386-3122', clubBasedIn: 'Ft. Lauderdale', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'check', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Swamp Grinches', teamName: 'Swamp Grinches', division: 'Boys HS A', coachName: 'Zac Pasko', coachPhone: '(917) 386-3122', coachEmail: 'zac@lacrossewear.com' },
    ]
  },
  {
    clubName: 'Jingle Wave', clubContact: 'Tyler', contactEmail: 'bigwavelacrosse@gmail.com',
    contactPhone: '(513) 312-2382', clubBasedIn: '', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'zelle', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Jingle Wave', teamName: 'Jingle Wave', division: 'Boys U14', coachName: 'Tyler', coachPhone: '(513) 312-2382', coachEmail: 'bigwavelacrosse@gmail.com' },
    ]
  },
  {
    clubName: "92' SINGHAIRS", clubContact: 'Danny Rosenberg', contactEmail: 'rdannymon@aol.com',
    contactPhone: '(954) 892-1277', clubBasedIn: 'Davie, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'zelle', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: "92' SINGHAIRS", teamName: "92' SINGHAIRS", division: 'Boys HS A', coachName: 'Danny Rosenberg', coachPhone: '(954) 892-1277', coachEmail: 'rdannymon@aol.com' },
    ]
  },
  {
    clubName: 'Conch Republic Lacrosse', clubContact: 'Alberto Piceno', contactEmail: 'alberto.piceno@ophotels.com',
    contactPhone: '(305) 434-0205', clubBasedIn: 'Key West, FL', clubWebsite: '',
    needsHotel: 'Yes', paymentMethod: 'check', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Conch Republic Lacrosse', teamName: 'Conch Republic Lacrosse', division: 'Boys HS B', coachName: 'Alberto Piceno', coachPhone: '(305) 434-0205', coachEmail: 'alberto.piceno@ophotels.com' },
    ]
  },
  {
    clubName: 'Blue Roses Lacrosse', clubContact: 'Robert Rose', contactEmail: 'rerose2022@gmail.com',
    contactPhone: '(954) 646-4366', clubBasedIn: 'Weston, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'check', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Blue Roses Lacrosse', teamName: 'Blue Roses', division: 'Girls HS B', coachName: 'Robert Rose', coachPhone: '(954) 646-4366', coachEmail: 'rerose2022@gmail.com' },
    ]
  },
  {
    clubName: 'Coconut Grove Stingrays', clubContact: 'Colin Gant', contactEmail: 'colin.gant@gmail.com',
    contactPhone: '(305) 613-5425', clubBasedIn: 'Miami, FL', clubWebsite: 'https://www.stingrayslax.com/',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Coconut Grove Stingrays', teamName: 'Coconut Grove Stingrays', division: 'Boys U10', coachName: 'Billy Rieder', coachPhone: '(305) 753-8867', coachEmail: 'williamtrieder@gmail.com' },
    ]
  },
  {
    clubName: 'Sidewinders Lacrosse', clubContact: 'Larry Brannon', contactEmail: 'sidewindersglax@gmail.com',
    contactPhone: '(352) 636-2827', clubBasedIn: 'Lake Worth, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'check', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Sidewinders Lacrosse', teamName: 'Sidewinders', division: 'Girls HS B', coachName: 'Larry Brannon', coachPhone: '(352) 636-2827', coachEmail: 'sidewindersglax@gmail.com' },
    ]
  },
  {
    clubName: 'Florida Elite', clubContact: 'Jennifer Bolger', contactEmail: 'floridabolgers@bellsouth.net',
    contactPhone: '(561) 436-8367', clubBasedIn: 'Delray', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'check', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Florida Elite', teamName: 'Florida Elite', division: 'Girls MS', coachName: 'Britney & Grace', coachPhone: '(561) 436-8367', coachEmail: 'floridabolgers@bellsouth.net' },
    ]
  },
  {
    clubName: 'Jupiter Rebels', clubContact: 'Sam LeBlanc', contactEmail: 'sjleblanc_jd@yahoo.com',
    contactPhone: '(504) 813-2476', clubBasedIn: 'Tequesta, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Jupiter Rebels', teamName: 'Jupiter Rebels 30', division: 'Boys U14', coachName: 'Sam LeBlanc', coachPhone: '(504) 813-2476', coachEmail: 'sjleblanc_jd@yahoo.com' },
    ]
  },
  {
    clubName: "Santa's Misfits", clubContact: 'Kris Strong', contactEmail: 'krisstrong@yahoo.com',
    contactPhone: '(754) 581-4095', clubBasedIn: 'Florida', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: "Santa's Misfits", teamName: "Santa's Misfits", division: 'Girls HS A', coachName: 'Kris Strong', coachPhone: '(754) 581-4095', coachEmail: 'krisstrong@yahoo.com' },
    ]
  },
  {
    clubName: 'Florida Prime Lacrosse', clubContact: 'Angie Benson', contactEmail: 'floridaprimelacrosse@gmail.com',
    contactPhone: '(772) 285-8975', clubBasedIn: 'South Florida', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Florida Prime Lacrosse', teamName: 'Florida Prime', division: 'Girls HS A', coachName: 'Angie Benson', coachPhone: '(772) 285-8975', coachEmail: 'floridaprimelacrosse@gmail.com' },
    ]
  },
  {
    clubName: 'Finesse Lacrosse Club', clubContact: 'Micole Walters', contactEmail: '00micolewalters@gmail.com',
    contactPhone: '(954) 599-9222', clubBasedIn: 'Weston, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Finesse Lacrosse Club', teamName: 'Finesse Lacrosse', division: 'Girls HS B', coachName: 'Micole Walters', coachPhone: '(954) 599-9222', coachEmail: '00micolewalters@gmail.com' },
    ]
  },
  {
    clubName: 'Florida Tropics', clubContact: 'Jason Heatherly', contactEmail: 'floridatropicslacrosse@gmail.com',
    contactPhone: '(561) 843-5050', clubBasedIn: 'Wellington, FL', clubWebsite: 'https://floridatropicslacrosse.com',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Florida Tropics', teamName: 'Florida Tropics', division: 'Girls HS B', coachName: 'Shannon Cloth', coachPhone: '(727) 560-3124', coachEmail: 'shnnclth@gmail.com' },
    ]
  },
  {
    clubName: 'CocoTropics', clubContact: 'CJ Fleming', contactEmail: 'courtneyjfleming23@gmail.com',
    contactPhone: '(914) 564-2374', clubBasedIn: 'Miami, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'CocoTropics', teamName: 'CocoTropics', division: 'Boys HS B', coachName: 'CJ Fleming', coachPhone: '(914) 564-2374', coachEmail: 'courtneyjfleming23@gmail.com' },
    ]
  },
  {
    clubName: 'N/A (Druski Elite)', clubContact: 'Austin Schepers', contactEmail: 'schepers.austin@gmail.com',
    contactPhone: '(772) 766-2744', clubBasedIn: 'Vero Beach, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 995, discountAmount: 0,
    teams: [
      { clubName: 'Druski Elite', teamName: 'Druski Elite', division: 'Boys HS B', coachName: 'Austin Schepers', coachPhone: '(772) 766-2744', coachEmail: 'schepers.austin@gmail.com' },
    ]
  },
  {
    clubName: 'Brothers United Lacrosse', clubContact: 'Tianny Hernandez', contactEmail: 'tianny@brothersunitedlax.com',
    contactPhone: '(786) 325-9763', clubBasedIn: '', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'zelle', notes: '', invoiceAmount: 1990, discountAmount: 0,
    teams: [
      { clubName: 'Brothers United Lacrosse', teamName: 'BUL U14', division: 'Boys U14', coachName: 'Steven Hernandez', coachPhone: '(786) 325-9763', coachEmail: 'tianny@brothersunitedlax.com' },
      { clubName: 'Brothers United Lacrosse', teamName: 'BUL U12', division: 'Boys U12', coachName: 'Steven Hernandez', coachPhone: '(786) 325-9763', coachEmail: 'tianny@brothersunitedlax.com' },
    ]
  },
  {
    clubName: 'Jupiter Revolution', clubContact: 'David Spennacchio', contactEmail: 'davidspennacchio@gmail.com',
    contactPhone: '(561) 972-1611', clubBasedIn: 'Jupiter, FL', clubWebsite: 'https://jtaalacross.org',
    needsHotel: 'No', paymentMethod: 'check', notes: '', invoiceAmount: 1990, discountAmount: 0,
    teams: [
      { clubName: 'Jupiter Revolution', teamName: 'Jupiter Revolution MS', division: 'Girls MS', coachName: 'Regina Spennacchio', coachPhone: '(561) 972-1614', coachEmail: 'rspennacchio@gmail.com' },
      { clubName: 'Jupiter Revolution', teamName: 'Jupiter Revolution LS', division: 'Girls LS: 5th and Below', coachName: 'Regina Spennacchio', coachPhone: '(561) 972-1614', coachEmail: 'rspennacchio@gmail.com' },
    ]
  },
  {
    clubName: 'FCA Treasure Coast', clubContact: 'Russ LeBlanc', contactEmail: 'rleblanc@fca.org',
    contactPhone: '(717) 654-4569', clubBasedIn: 'Stuart, FL', clubWebsite: 'https://www.fcalax.com',
    needsHotel: 'Maybe', paymentMethod: 'zelle', notes: '', invoiceAmount: 1990, discountAmount: 0,
    teams: [
      { clubName: 'FCA Treasure Coast', teamName: 'FCA TC Green', division: 'Girls HS B', coachName: 'Russ LeBlanc', coachPhone: '(717) 654-4569', coachEmail: 'rleblanc@fca.org' },
      { clubName: 'FCA Treasure Coast', teamName: 'FCA TC Red', division: 'Girls HS B', coachName: 'Russ LeBlanc', coachPhone: '(717) 654-4569', coachEmail: 'rleblanc@fca.org' },
    ]
  },
  {
    clubName: 'Lax Mafia', clubContact: 'Jamie Evans', contactEmail: 'jjamieee8@gmail.com',
    contactPhone: '(631) 525-3869', clubBasedIn: 'Boca', clubWebsite: 'https://laxmafia.com',
    needsHotel: 'No', paymentMethod: 'zelle', notes: '', invoiceAmount: 1990, discountAmount: 0,
    teams: [
      { clubName: 'Lax Mafia', teamName: 'Whoville Hitmen', division: 'Boys U12', coachName: 'Jamie Evans', coachPhone: '(631) 525-3869', coachEmail: 'jjamieee8@gmail.com' },
      { clubName: 'Lax Mafia', teamName: 'Lax Mafia U14', division: 'Boys U14', coachName: 'Jamie Evans', coachPhone: '(631) 525-3869', coachEmail: 'jjamieee8@gmail.com' },
      { clubName: 'Lax Mafia', teamName: 'Lax Mafia U10', division: 'Boys U10', coachName: 'Jamie Evans', coachPhone: '(631) 525-3869', coachEmail: 'jjamieee8@gmail.com' },
    ]
  },
  {
    clubName: 'Stealth Lacrosse', clubContact: 'Samantha Straub', contactEmail: 'stealthglax@gmail.com',
    contactPhone: '(720) 628-1382', clubBasedIn: 'Parkland, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'check', notes: '', invoiceAmount: 2985, discountAmount: 0,
    teams: [
      { clubName: 'Stealth', teamName: 'Stealth MS', division: 'Girls MS', coachName: 'Brian Straub', coachPhone: '(720) 628-1382', coachEmail: 'stealthglax@gmail.com' },
      { clubName: 'Stealth', teamName: 'Stealth Elves', division: 'Girls HS B', coachName: 'Samantha Straub', coachPhone: '(720) 628-1382', coachEmail: 'stealthglax@gmail.com' },
      { clubName: 'Stealth', teamName: 'Stealth Reindeer', division: 'Girls HS A', coachName: 'Megan Renne', coachPhone: '(720) 628-1382', coachEmail: 'stealthglax@gmail.com' },
    ]
  },
  {
    clubName: "Creator's Game", clubContact: 'Riordan Cheatham', contactEmail: 'riordan.cheatham@thebenjaminschool.org',
    contactPhone: '(561) 529-0603', clubBasedIn: 'Jupiter, FL', clubWebsite: '',
    needsHotel: 'No', paymentMethod: 'credit_card', notes: '', invoiceAmount: 2985, discountAmount: 0,
    teams: [
      { clubName: "Creator's Game", teamName: "Creator's Game LS", division: 'Girls LS: 5th and Below', coachName: 'Mallory Doremus', coachPhone: '(772) 199-1882', coachEmail: 'mallory@palmdaleoil.com' },
      { clubName: "Creator's Game", teamName: "Creator's Game MS", division: 'Girls MS', coachName: 'Abigail Francis', coachPhone: '(540) 903-3317', coachEmail: 'abbydancing@gmail.com' },
      { clubName: "Creator's Game", teamName: "Creator's Game HS", division: 'Girls HS B', coachName: 'Riordan Cheatham', coachPhone: '(561) 529-0603', coachEmail: 'riordan.cheatham@thebenjaminschool.org' },
    ]
  },
]

async function run() {
  // Find Jingle Brawl tournament
  const res = await fetch(`${BASE}/api/tournaments`)
  const tournaments = await res.json()
  const t = tournaments.find(t => t.name.toLowerCase().includes('jingle'))
  if (!t) { console.error('❌ Could not find a tournament with "Jingle" in the name. Check your tournament list.'); process.exit(1) }
  console.log(`✅ Found tournament: "${t.name}" (${t.id})`)

  let created = 0, failed = 0
  for (const reg of registrations) {
    const body = { ...reg, tournamentId: t.id, numTeams: reg.teams.length }
    const r = await fetch(`${BASE}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) {
      created++
      console.log(`  ✔ ${reg.clubName} (${reg.teams.length} team${reg.teams.length !== 1 ? 's' : ''})`)
    } else {
      failed++
      console.error(`  ✘ ${reg.clubName} — ${await r.text()}`)
    }
  }

  console.log(`\n🏁 Done — ${created} created, ${failed} failed`)
}

run().catch(console.error)
