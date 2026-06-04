// Run with: node seed-jingle-mark-paid.js
// Make sure npm run dev is running first
// Marks ALL team registrations as paid and ALL staff as paid for Jingle Brawl 2025

const BASE = 'http://localhost:3000'
const TOURNAMENT_ID = 'cmpykoo4z0000h24blhpsm8nn'
const TODAY = new Date().toISOString().slice(0, 10)

async function run() {

  // ── 1. Mark all team registrations paid ──
  console.log('── Team Registrations ──')
  const regsRes = await fetch(`${BASE}/api/registrations?tournamentId=${TOURNAMENT_ID}`)
  const registrations = await regsRes.json()

  let regPaid = 0, regSkipped = 0

  for (const reg of registrations) {
    const alreadyPaid = reg.payments.reduce((s, p) => s + p.amount, 0)
    const due = reg.invoiceAmount - reg.discountAmount
    const balance = due - alreadyPaid

    if (balance <= 0) {
      regSkipped++
      console.log(`  ⏭ ${reg.clubName || reg.clubContact} — already paid (${due.toFixed(2)})`)
      continue
    }

    const res = await fetch(`${BASE}/api/registration-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: reg.id,
        amount: balance,
        method: reg.paymentMethod,
        receivedAt: TODAY,
        notes: 'Marked paid via bulk payment',
      }),
    })

    if (res.ok) {
      regPaid++
      console.log(`  ✔ ${reg.clubName || reg.clubContact} — $${balance.toFixed(2)} (${reg.paymentMethod})`)
    } else {
      console.error(`  ✘ ${reg.clubName || reg.clubContact} — ${await res.text()}`)
    }
  }

  // ── 2. Mark all staff paid ──
  console.log('\n── Staff Pay ──')
  const summaryRes = await fetch(`${BASE}/api/tournaments/${TOURNAMENT_ID}/pay-summary`)
  const summary = await summaryRes.json()

  const existingPayRes = await fetch(`${BASE}/api/payment-records?tournamentId=${TOURNAMENT_ID}`)
  const existingPay = await existingPayRes.json()
  const alreadyPaidWorkers = new Set(existingPay.map(p => p.workerId))

  let staffPaid = 0, staffSkipped = 0

  for (const ws of summary.summary) {
    if (ws.totalPay <= 0) continue

    if (alreadyPaidWorkers.has(ws.worker.id)) {
      staffSkipped++
      console.log(`  ⏭ ${ws.worker.name} — already marked paid`)
      continue
    }

    const res = await fetch(`${BASE}/api/payment-records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: ws.worker.id,
        tournamentId: TOURNAMENT_ID,
        amount: ws.totalPay,
        method: ws.worker.payMethod || 'check',
        notes: 'Marked paid via bulk payment',
      }),
    })

    if (res.ok) {
      staffPaid++
      console.log(`  ✔ ${ws.worker.name} — $${ws.totalPay.toFixed(2)} (${ws.worker.payMethod || 'check'})`)
    } else {
      console.error(`  ✘ ${ws.worker.name} — ${await res.text()}`)
    }
  }

  console.log(`
🏁 Done
   Team registrations: ${regPaid} paid, ${regSkipped} already paid
   Staff: ${staffPaid} paid, ${staffSkipped} already paid`)
}

run().catch(console.error)
