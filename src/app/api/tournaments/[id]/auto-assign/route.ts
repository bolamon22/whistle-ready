import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getPayRate, PayRates } from '@/lib/utils'

interface WorkerRow {
  id: string; name: string; certLevel: string; defaultRole: string
  gender: string; payRateOverride: number | null; roles: string
}

function genderMatch(workerGender: string, division: string): boolean {
  const d = division.toLowerCase()
  const isGirls = d.includes('girl') || d.includes('women')
  const isBoys  = d.includes('boy')  || d.includes('men')
  if (isGirls && workerGender === 'boys') return false
  if (isBoys  && workerGender === 'girls') return false
  return true
}

function workerRoles(w: WorkerRow): string[] {
  try { const r = JSON.parse(w.roles || '[]'); return Array.isArray(r) && r.length ? r : [w.defaultRole] }
  catch { return [w.defaultRole] }
}

function canScorekeeper(w: WorkerRow): boolean {
  return w.defaultRole === 'scorekeeper' || (w.defaultRole === 'ref' && workerRoles(w).includes('scorekeeper'))
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { date, stickyScorekeeper } = await req.json()

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } })
  if (!tournament) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const payRates: PayRates = JSON.parse(tournament.payRates)
  const divRules: Record<string,number> = JSON.parse(tournament.divisionRules || '{}')

  function getRefCount(game: { division: string; refCount: number; isChampionship: boolean }): number {
    const div = game.division.toLowerCase()
    for (const [keyword, count] of Object.entries(divRules)) {
      if (div.includes(keyword.toLowerCase())) return game.isChampionship ? Math.max(count, 3) : count
    }
    return game.isChampionship ? Math.max(game.refCount, 3) : game.refCount
  }

  const rosterEntries = await prisma.rosterEntry.findMany({
    where: { tournamentId: params.id },
    include: { worker: true },
  })
  const allWorkers: WorkerRow[] = rosterEntries.map(e => e.worker as unknown as WorkerRow)

  // Refs: only workers whose primary role is ref
  const refs = allWorkers.filter(w => w.defaultRole === 'ref')
  // Scorekeepers: dedicated SKs + refs who have SK checked in their roles
  const scorekeepers = allWorkers.filter(w => canScorekeeper(w))

  // Unavailability map — roster = available by default.
  // Only block someone if they have an explicit unavailable record for this date/time.
  const unavails = await prisma.availability.findMany({ where: { tournamentId: params.id, date } })
  const unavailMap = new Map<string, string[]>() // workerId → unavailable time slots
  for (const a of unavails) {
    unavailMap.set(a.workerId, JSON.parse(a.timeSlots))
  }

  function isAvailable(workerId: string, time: string): boolean {
    if (!unavailMap.has(workerId)) return true          // no record = available all day
    const blocked = unavailMap.get(workerId)!
    if (blocked.length === 0) return false              // empty array = unavailable all day
    return !blocked.includes(time)                      // blocked at specific times only
  }

  const games = await prisma.game.findMany({
    where: { tournamentId: params.id, date, isCanceled: false },
    orderBy: [{ startTime: 'asc' }, { location: 'asc' }],
    include: { assignments: true },
  })

  // Busy tracking: workerId → Set of time slots already assigned
  const busy = new Map<string, Set<string>>()
  function markBusy(workerId: string, time: string) {
    if (!busy.has(workerId)) busy.set(workerId, new Set())
    busy.get(workerId)!.add(time)
  }
  function isBusy(workerId: string, time: string): boolean {
    return busy.get(workerId)?.has(time) ?? false
  }
  function isEligible(workerId: string, time: string): boolean {
    return isAvailable(workerId, time) && !isBusy(workerId, time)
  }

  // Pre-load existing assignments as busy so we don't double-book on top of manual assignments
  const existingAssignments = await prisma.assignment.findMany({
    where: { game: { tournamentId: params.id, date } },
  })
  for (const a of existingAssignments) {
    const game = games.find(g => g.id === a.gameId)
    if (game) markBusy(a.workerId, game.startTime)
  }

  // Game count tracking for load balancing — fewest games first, simple round-robin
  const gameCounts = new Map<string, number>()
  for (const e of rosterEntries) {
    gameCounts.set(e.workerId, existingAssignments.filter(a => a.workerId === e.workerId && games.some(g => g.id === a.gameId)).length)
  }

  function sortByLoad(workers: WorkerRow[]): WorkerRow[] {
    return [...workers].sort((a, b) => (gameCounts.get(a.id) ?? 0) - (gameCounts.get(b.id) ?? 0))
  }

  const created: { gameId: string; role: string; workerId: string }[] = []
  const gaps: { gameNumber: string; division: string; location: string; missingRoles: string[] }[] = []

  // ── Sticky scorekeeper setup ──
  // Assign one SK per field. Only use DEDICATED scorekeepers for sticky (not refs)
  // so we don't accidentally lock a ref out of ref slots.
  // Fall back to refs-who-can-SK only if not enough dedicated SKs.
  const fieldScorekeeper = new Map<string, string>()
  if (stickyScorekeeper) {
    const fields = Array.from(new Set(games.map(g => g.location)))
    const times  = Array.from(new Set(games.map(g => g.startTime))).sort()
    const firstTime = times[0] ?? '08:00'

    // Prefer dedicated scorekeepers first, then ref-SKs
    const dedicatedSKs = scorekeepers
      .filter(w => w.defaultRole === 'scorekeeper')
      .filter(w => isAvailable(w.id, firstTime))
    const refSKs = scorekeepers
      .filter(w => w.defaultRole === 'ref')
      .filter(w => isAvailable(w.id, firstTime))
    const orderedSKs = [...dedicatedSKs, ...refSKs]

    let skIdx = 0
    for (const field of fields) {
      if (skIdx >= orderedSKs.length) break
      const sk = orderedSKs[skIdx]
      fieldScorekeeper.set(field, sk.id)
      // Pre-mark this SK as busy for ALL time slots on this field so the ref
      // assignment loop never accidentally picks them as a ref
      for (const time of times) {
        if (isAvailable(sk.id, time)) markBusy(sk.id, time)
      }
      skIdx++
    }
  }

  // ── Main assignment loop ──
  for (const game of games) {
    const missingRoles: string[] = []
    const refCount = getRefCount(game)
    const neededRoles: string[] = []
    if (refCount >= 1) neededRoles.push('ref1')
    if (refCount >= 2) neededRoles.push('ref2')
    if (refCount >= 3) neededRoles.push('ref3')
    neededRoles.push('scorekeeper')

    for (const role of neededRoles) {
      if (game.assignments.some(a => a.role === role)) continue // already assigned

      if (role === 'scorekeeper') {
        let skId: string | null = null

        // Try sticky SK for this field — must still be available AND not busy
        // (busy is pre-set above, so this mainly catches availability gaps)
        if (stickyScorekeeper && fieldScorekeeper.has(game.location)) {
          const candidateId = fieldScorekeeper.get(game.location)!
          if (isAvailable(candidateId, game.startTime)) {
            // Sticky SK is pre-marked busy for the whole day; un-mark for this slot
            // so we can assign them (they're SUPPOSED to be here)
            skId = candidateId
            // Re-mark busy (was already marked, just being explicit)
            markBusy(skId, game.startTime)
          }
        }

        // Fallback: find any eligible SK not busy at this time
        if (!skId) {
          const eligible = sortByLoad(
            scorekeepers.filter(w => isEligible(w.id, game.startTime))
          )
          skId = eligible[0]?.id ?? null
        }

        if (skId) {
          const worker = allWorkers.find(w => w.id === skId)!
          const payRate = worker.payRateOverride ?? getPayRate(worker.certLevel, 'scorekeeper', payRates)
          await prisma.assignment.upsert({
            where:  { gameId_role: { gameId: game.id, role: 'scorekeeper' } },
            create: { gameId: game.id, workerId: skId, role: 'scorekeeper', payRate },
            update: { workerId: skId, payRate },
          })
          markBusy(skId, game.startTime)
          gameCounts.set(skId, (gameCounts.get(skId) ?? 0) + 1)
          created.push({ gameId: game.id, role: 'scorekeeper', workerId: skId })
        } else {
          missingRoles.push('Scorekeeper')
        }

      } else {
        // Ref slot
        const eligible = sortByLoad(
          refs.filter(w =>
            isEligible(w.id, game.startTime) &&
            genderMatch(w.gender, game.division)
          )
        )
        const worker = eligible[0]
        if (worker) {
          const payRate = worker.payRateOverride ?? getPayRate(worker.certLevel, role, payRates)
          await prisma.assignment.upsert({
            where:  { gameId_role: { gameId: game.id, role } },
            create: { gameId: game.id, workerId: worker.id, role, payRate },
            update: { workerId: worker.id, payRate },
          })
          markBusy(worker.id, game.startTime)
          gameCounts.set(worker.id, (gameCounts.get(worker.id) ?? 0) + 1)
          created.push({ gameId: game.id, role, workerId: worker.id })
        } else {
          missingRoles.push(role === 'ref1' ? 'Ref 1' : role === 'ref2' ? 'Ref 2' : 'Ref 3')
        }
      }
    }

    if (missingRoles.length > 0) {
      gaps.push({ gameNumber: game.gameNumber, division: game.division, location: game.location, missingRoles })
    }
  }

  const missingRefs = gaps.flatMap(g => g.missingRoles.filter(r => r.startsWith('Ref'))).length
  const missingSKs  = gaps.flatMap(g => g.missingRoles.filter(r => r === 'Scorekeeper')).length
  const needMore = []
  if (missingRefs > 0) needMore.push(`${missingRefs} more ref${missingRefs !== 1 ? 's' : ''}`)
  if (missingSKs  > 0) needMore.push(`${missingSKs} more scorekeeper${missingSKs !== 1 ? 's' : ''}`)

  return NextResponse.json({
    assigned: created.length,
    gaps,
    missingRefs,
    missingSKs,
    summary: gaps.length === 0
      ? `✅ All slots filled — ${created.length} assignments made!`
      : `Filled ${created.length} slots. Still need ${needMore.join(' and ')} to cover all games.`,
  })
}
