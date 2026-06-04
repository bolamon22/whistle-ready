// Run with: node seed-jingle-assignments.js
// Make sure npm run dev is running first

const BASE = 'http://localhost:3000'

// ── Worker IDs ──
const W = {
  // Refs - Girls ($70 college)
  CHARITY:   { id: 'cmpxa6fdy0025ioknf2mtuas0', rate: 70 },
  GARNETT:   { id: 'cmpxa6fdo0023ioknw4hx2m4s', rate: 70 },
  AL_G:      { id: 'cmpym88w0005i2dlhysuwnu2c',  rate: 70 },
  JOSH:      { id: 'cmpxa6fed0028ioknllpi1u84',  rate: 70 },
  HARRY:     { id: 'cmpxa6ffk002iiokniuev5udo',  rate: 70 },
  FABIO:     { id: 'cmpym88u7005e2dlhmda7msls',  rate: 70 },
  // Refs - Boys/Mixed ($60 HS)
  ALISE:     { id: 'cmpxa6feu002ciokn660r3gtl',  rate: 60 },
  HAMILTON:  { id: 'cmpxa6fb3001jiokngtgy7pux',  rate: 60 },
  HUMANE:    { id: 'cmpxa6f990015ioknbfbeh981',  rate: 60 },
  GUGLIELMO: { id: 'cmpym88v3005g2dlh2jj0rdtt',  rate: 60 },
  ANDRIESSE: { id: 'cmpxa6f9i0017iokngm97y5kz',  rate: 60 },
  GATTI:     { id: 'cmpxa6fae001eioknx878sq1t',  rate: 60 },
  MOORE:     { id: 'cmpxa6f9d0016iokncwbb434n',  rate: 60 },
  TOSHEFF:   { id: 'cmpxa6fd2001ziokns4q7b94r',  rate: 60 },
  CHIARELLA: { id: 'cmpym88vk005h2dlh7xy8my7n',  rate: 60 },
  LAYNE:     { id: 'cmpym88um005f2dlhnv66gfk9',  rate: 60 }, // Vinny Layne (boys)
  // Scorekeepers ($15)
  SOFIA:     { id: 'cmpxa1e7s000tiokn1tzo28cq',  rate: 15 },
  REESE:     { id: 'cmpym88ws005j2dlha9hg2in3',  rate: 15 },
  GRACE:     { id: 'cmpym88xu005k2dlh85l94jwl',  rate: 15 },
  JOSEPH:    { id: 'cmpym88ye005l2dlhobkca429',  rate: 15 },
  ZURI:      { id: 'cmpym88yy005m2dlhb0meay9k',  rate: 15 },
  RYAN:      { id: 'cmpxa6fbs001oioknl8yg8be7',  rate: 15 },
  LINDSEY:   { id: 'cmpym88zd005n2dlhcta3690k',  rate: 15 },
  SORTO:     { id: 'cmpym88zr005o2dlh4hghryot',  rate: 15 },
  TRACE:     { id: 'cmpym8902005p2dlhx0v9f86g',  rate: 15 },
  GLORIA:    { id: 'cmpxa1e570005ioknf39mbbag',  rate: 15 },
  VALENTINA: { id: 'cmpym890f005q2dlhxqi8ln8a',  rate: 15 },
}

// ── Assignments: [gameId, ref1, scorekeeper, ref2 (optional)] ──
// ref2 only used for championship finals
const assignments = [

  // ── SATURDAY 2025-12-13 ──

  // 09:00
  ['cmpylpyd0002p2dlh6q4oy7id', W.CHARITY,   W.SOFIA],    // F1 GMS
  ['cmpylpyd0002q2dlhbbws20cv', W.GARNETT,   W.REESE],    // F2 GMS
  ['cmpylpyd0002r2dlhm3p9bukd', W.AL_G,      W.GRACE],    // F3 GMS
  ['cmpylpyd0002s2dlhg363b8tu', W.JOSH,      W.JOSEPH],   // F4 GMS
  ['cmpylpyd0002t2dlhr1eray2j', W.HAMILTON,  W.ZURI],     // F5 BU10
  ['cmpylpyd0002u2dlh8jbdvfjl', W.HUMANE,    W.RYAN],     // F6 BU10

  // 09:55
  ['cmpylpyd0002v2dlh60mgzhcs', W.CHARITY,   W.SOFIA],    // F1 GHS
  ['cmpylpyd0002w2dlh9cxi9ktw', W.GARNETT,   W.REESE],    // F2 GHS
  ['cmpylpyd0002x2dlh6jgg8rg2', W.AL_G,      W.GRACE],    // F3 GHS
  ['cmpylpyd0002y2dlhxzq4qmhy', W.JOSH,      W.JOSEPH],   // F4 GHS
  ['cmpylpyd0002z2dlhsres7wmx', W.HARRY,     W.ZURI],     // F5 GHS
  ['cmpylpyd000302dlhuveonkaq', W.FABIO,     W.RYAN],     // F6 GHS
  ['cmpylpyd000312dlhvqjr5krk', W.ALISE,     W.LINDSEY],  // F7 GHS

  // 10:50
  ['cmpylpyd000322dlhgs3l42o1', W.CHARITY,   W.SOFIA],    // F1 GMS
  ['cmpylpyd000332dlh23k21wp2', W.GARNETT,   W.REESE],    // F2 GMS
  ['cmpylpyd000342dlhynr9zeep', W.AL_G,      W.GRACE],    // F3 GLS
  ['cmpylpyd000352dlhunzpl08n', W.JOSH,      W.JOSEPH],   // F4 GLS
  ['cmpylpyd000362dlhxkfum6m2', W.HAMILTON,  W.ZURI],     // F5 BU10
  ['cmpylpyd000372dlhrh3e0l7x', W.HUMANE,    W.RYAN],     // F6 BU10
  ['cmpylpyd000382dlh6yv6emde', W.ALISE,     W.LINDSEY],  // F7 GMS
  ['cmpylpyd000392dlhvcwsbi4f', W.FABIO,     W.SORTO],    // F8 GMS

  // 11:45
  ['cmpylpyd0003a2dlht46jhw11', W.CHARITY,   W.SOFIA],    // F1 GHS
  ['cmpylpyd0003b2dlhbowe7fd8', W.GARNETT,   W.REESE],    // F2 GHS
  ['cmpylpyd0003c2dlhns3ibqwb', W.AL_G,      W.GRACE],    // F3 GHS
  ['cmpylpyd0003d2dlh71aatq4d', W.JOSH,      W.JOSEPH],   // F4 GHS
  ['cmpylpyd0003e2dlhspc0tuci', W.HARRY,     W.ZURI],     // F5 GHS
  ['cmpylpyd0003f2dlh2g8gqxkb', W.FABIO,     W.RYAN],     // F6 GHS
  ['cmpylpyd0003g2dlhfpctof0b', W.ALISE,     W.LINDSEY],  // F7 GHS
  ['cmpylpyd0003h2dlh0gmgjqus', W.ANDRIESSE, W.SORTO],    // F8 BU14
  ['cmpylpyd0003i2dlhirn7pn48', W.HUMANE,    W.TRACE],    // F9 BU14

  // 12:40
  ['cmpylpyd0003j2dlh5ccvyid8', W.CHARITY,   W.SOFIA],    // F1 GMS
  ['cmpylpyd0003k2dlh20ruxjxm', W.GARNETT,   W.REESE],    // F2 GMS
  ['cmpylpyd0003l2dlhnbwktkq6', W.AL_G,      W.GRACE],    // F3 GMS
  ['cmpylpyd0003m2dlhhz3h3jc5', W.JOSH,      W.JOSEPH],   // F4 GMS
  ['cmpylpyd0003n2dlh1f4g66nm', W.HARRY,     W.ZURI],     // F5 GLS
  ['cmpylpyd0003o2dlhxt0o63fy', W.FABIO,     W.RYAN],     // F6 GLS
  ['cmpylpyd0003p2dlhtknrfblu', W.GATTI,     W.HAMILTON], // F7 BHS (Hamilton keeping score)
  ['cmpylpyd0003q2dlhjymezbme', W.MOORE,     W.SORTO],    // F8 BHS
  ['cmpylpyd0003r2dlhcx0d5kf1', W.HUMANE,    W.TRACE],    // F9 BHS

  // 13:35
  ['cmpylpyd0003s2dlh6afrd14v', W.ANDRIESSE, W.SOFIA],    // F1 BU14
  ['cmpylpyd0003t2dlhbejwdlpg', W.MOORE,     W.REESE],    // F2 BU14
  ['cmpylpyd1003u2dlhgy4auqim', W.GATTI,     W.GRACE],    // F3 BU12
  ['cmpylpyd1003v2dlh9pj4jfpb', W.ALISE,     W.JOSEPH],   // F4 GHS

  // 14:30
  ['cmpylpyd1003w2dlhkae8ei1f', W.ANDRIESSE, W.SOFIA],    // F1 BHS
  ['cmpylpyd1003x2dlhfzn2myo6', W.MOORE,     W.REESE],    // F2 BHS
  ['cmpylpyd1003y2dlhnr13n4tm', W.GATTI,     W.GRACE],    // F3 BU12
  ['cmpylpyd1003z2dlhiinc9u7u', W.FABIO,     W.JOSEPH],   // F4 GLS
  ['cmpylpyd100402dlhzvahibor', W.HARRY,     W.ZURI],     // F5 GLS
  ['cmpylpyd100412dlhio8en657', W.HAMILTON,  W.LINDSEY],  // F7 BHS

  // 15:25
  ['cmpylpyd100422dlhsk2uhkoo', W.ANDRIESSE, W.SOFIA],    // F1 BU14
  ['cmpylpyd100432dlh6sim46pn', W.MOORE,     W.REESE],    // F2 BU14
  ['cmpylpyd100442dlhm2co0p4e', W.GATTI,     W.GRACE],    // F3 BU12

  // ── SUNDAY 2025-12-14 ──

  // 09:00
  ['cmpylpyd100452dlh25re5nmx', W.FABIO,     W.SOFIA],    // F1 GHS
  ['cmpylpyd100462dlhj6gi3yj3', W.CHARITY,   W.GLORIA],   // F2 GHS
  ['cmpylpyd100472dlh2sj9ah7d', W.GATTI,     W.REESE],    // F3 BU10
  ['cmpylpyd100482dlh4ghdt0sa', W.TOSHEFF,   W.JOSEPH],   // F4 BU10
  ['cmpylpyd100492dlh39obbt9i', W.JOSH,      W.ZURI],     // F5 GHS
  ['cmpylpyd1004a2dlh153mbt0d', W.AL_G,      W.VALENTINA],// F6 GHS
  ['cmpylpyd1004b2dlhmm444ee8', W.HARRY,     W.RYAN],     // F7 GHS
  ['cmpylpyd1004c2dlhtlvmg8cr', W.GARNETT,   W.TRACE],    // F8 GHS

  // 09:55
  ['cmpylpyd1004d2dlht6a2u9ja', W.FABIO,     W.ZURI],     // F1 GMS/BU14
  ['cmpylpyd1004e2dlh6vzlzs1j', W.CHARITY,   W.GLORIA],   // F2 GMS/BU14
  ['cmpylpyd1004f2dlhaly56g04', W.GARNETT,   W.REESE],    // F3 GLS
  ['cmpylpyd1004g2dlhwu1alh7c', W.JOSH,      W.JOSEPH],   // F4 GLS
  ['cmpylpyd1004h2dlhowudm5ox', W.HARRY,     W.SOFIA],    // F5 GMS
  ['cmpylpyd1004i2dlh6gf37ma7', W.AL_G,      W.VALENTINA],// F6 GMS
  ['cmpylpyd1004j2dlhg3wp4vvj', W.GUGLIELMO, W.RYAN],     // F7 BHS
  ['cmpylpyd1004k2dlhpvhqzk32', W.TOSHEFF,   W.TRACE],    // F8 BHS
  ['cmpylpyd1004l2dlhzgj9a4ig', W.CHIARELLA, W.SORTO],    // F9 BHS

  // 10:50
  ['cmpylpyd1004m2dlhp4l3820v', W.FABIO,     W.ZURI],     // F1 GHS
  ['cmpylpyd1004n2dlhke05rbx4', W.CHARITY,   W.GLORIA],   // F2 GHS
  ['cmpylpyd1004o2dlhxky5u76u', W.GATTI,     W.REESE],    // F3 BU10
  ['cmpylpyd1004p2dlhwcsfxkld', W.LAYNE,     W.JOSEPH],   // F4 BU10 (Vinny Layne)
  ['cmpylpyd1004q2dlhgcfit06c', W.HARRY,     W.SOFIA],    // F5 GHS
  ['cmpylpyd1004r2dlhio29tpfc', W.AL_G,      W.VALENTINA],// F6 GHS
  ['cmpylpyd1004s2dlhsq313its', W.JOSH,      W.RYAN],     // F7 GHS
  ['cmpylpyd1004t2dlhaixq96t8', W.GARNETT,   W.TRACE],    // F8 GHS
  ['cmpylpyd1004u2dlh9g430apf', W.GUGLIELMO, W.SORTO],    // F9 BU12

  // 11:45
  ['cmpylpyd1004v2dlh8hu23ir9', W.LAYNE,     W.ZURI],     // F1 BU14 (Vinny Layne)
  ['cmpylpyd1004w2dlh0af3qm8c', W.CHARITY,   W.GLORIA],   // F2 GMS
  ['cmpylpyd1004x2dlh4uzlicq0', W.FABIO,     W.REESE],    // F3 GMS
  ['cmpylpyd1004y2dlhcee63xjc', W.HARRY,     W.JOSEPH],   // F4 GMS
  ['cmpylpyd1004z2dlhkbycalj2', W.GARNETT,   W.SOFIA],    // F5 GLS
  ['cmpylpyd100502dlh72eok4rm', W.AL_G,      W.VALENTINA],// F6 GLS
  ['cmpylpyd100512dlhfss1mg4n', W.GUGLIELMO, W.RYAN],     // F7 BHS
  ['cmpylpyd100522dlhxd3eomxb', W.TOSHEFF,   W.TRACE],    // F8 BU14
  ['cmpylpyd200532dlh4wzxr9v0', W.CHIARELLA, W.GATTI],    // F9 BHS (Gatti keeping score)

  // 12:40
  ['cmpylpyd200542dlhwxc3j4pj', W.FABIO,     W.ZURI],     // F1 GHS
  ['cmpylpyd200552dlh1qh9xbj2', W.CHARITY,   W.GLORIA],   // F2 GHS
  ['cmpylpyd200562dlhnaf3z619', W.JOSH,      W.HARRY,   W.CHARITY], // F3 GHS Final (2 refs)
  ['cmpylpyd200572dlh5ypopz6k', W.LAYNE,     W.JOSEPH],   // F4 BU12 (Vinny Layne)
  ['cmpylpyd200582dlhifpdh8tq', W.CHIARELLA, W.RYAN],     // F7 BHS

  // 13:00 - GLS Final
  ['cmpylpyd200592dlh6vf8o8sa', W.GARNETT,   W.SOFIA],    // F5 GLS Final

  // 13:35 - BU14 Final
  ['cmpylpyd2005a2dlh7x1udmhd', W.TOSHEFF,   W.LAYNE],    // F1 BU14 Final (Layne keeping score)

  // 14:00 - Finals
  ['cmpylpyd2005c2dlh59jjfv5c', W.CHIARELLA, W.GATTI],    // F7 BHS Final
  ['cmpylpyd2005d2dlhb4bm89a8', W.HARRY,     W.REESE,   W.CHARITY], // F3 GHS Final (Harry + Charity 2 refs)
]

async function run() {
  let created = 0, skipped = 0, failed = 0

  for (const entry of assignments) {
    const [gameId, ref1, sk, ref2] = entry

    // Assign ref1
    const r1 = await fetch(`${BASE}/api/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, workerId: ref1.id, role: 'ref1', payRate: ref1.rate }),
    })
    if (r1.ok) created++
    else if ((await r1.text()).includes('Unique')) skipped++
    else failed++

    // Assign scorekeeper
    const rs = await fetch(`${BASE}/api/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, workerId: sk.id, role: 'scorekeeper', payRate: sk.rate }),
    })
    if (rs.ok) created++
    else if ((await rs.text()).includes('Unique')) skipped++
    else failed++

    // Assign ref2 if present (finals)
    if (ref2) {
      const r2 = await fetch(`${BASE}/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, workerId: ref2.id, role: 'ref2', payRate: ref2.rate }),
      })
      if (r2.ok) created++
      else if ((await r2.text()).includes('Unique')) skipped++
      else failed++
    }
  }

  const games = assignments.length
  console.log(`\n🏁 Done — ${games} games processed`)
  console.log(`   ✔ ${created} assignments created`)
  if (skipped > 0) console.log(`   ⚠ ${skipped} already existed (skipped)`)
  if (failed > 0)  console.log(`   ✘ ${failed} failed`)
}

run().catch(console.error)
