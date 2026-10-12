import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getPayRate, parsePayRates, parseJsonDeep } from '@/lib/utils'
import { requireStaff } from '@/lib/apiAuth'
import { gameGender } from '@/lib/gameGender'

interface WorkerRow {
  id: string; name: string; certLevel: string; defaultRole: string
  gender: string; payRateOverride: number | null; roles: string
}


function genderMatch(workerGender: string, division: string): boolean {
  const g = gameGender(division)
  if (g === 'girls' && workerGender === 'boys') return false
  if (g === 'boys' && workerGender === 'girls') return false
  return true
}

function workerRoles(w: WorkerRow): string[] {
  try { const r = JSON.parse(w.roles || '[]'); return Array.isArray(r) && r.length ? r : [w.defaultRole] }
  catch { return [w.defaultRole] }
}

// Anyone with Scorekeeper among their roles, whatever their main job (the board's rule,
// tournaments/[id]/page.tsx). Refs only, before Oct 12 2026.
function canScorekeeper(w: WorkerRow): boolean {
  return w.defaultRole === 'scorekeeper' || workerRoles(w).includes('scorekeeper')
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { date, stickyScorekeeper, fill, preview, apply, skFields } = await req.json()
  // What to fill (Bo, Oct 12 2026: "options to auto assign Score keepers, Girls Refs,
  // and Boys refs independently"). Leaving one out leaves its slots alone, so staff
  // can run girls' refs first, check them, then the rest. Default: everything.
  const want = {
    sk: fill?.scorekeepers !== false,
    boys: fill?.boysRefs !== false,
    girls: fill?.girlsRefs !== false,
  }
  // Games that aren't boys' or girls' (coed, or a name that says neither) go with
  // either refs choice.
  const refsWanted = (division: string) => { const g = gameGender(division); return g === 'girls' ? want.girls : g === 'boys' ? want.boys : (want.boys || want.girls) }

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } })
  if (!tournament) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const payRates = parsePayRates(tournament.payRates)

  // ── Apply a preview the assigner approved (some picks may have been dropped) ──
  // Each pick is saved only if its slot is still empty and the worker is still on the
  // roster and free at that time, so a preview that went stale can't overwrite
  // anything or double-book anyone.
  if (Array.isArray(apply)) {
    const picks = (apply as { gameId?: string; role?: string; workerId?: string }[])
      .filter(x => x && typeof x.gameId === 'string' && typeof x.workerId === 'string' && ['ref1', 'ref2', 'ref3', 'scorekeeper'].includes(String(x.role)))
    const gameIds = Array.from(new Set(picks.map(x => x.gameId!)))
    const pickGames = await prisma.game.findMany({ where: { tournamentId: params.id, id: { in: gameIds } }, include: { assignments: true } })
    const roster = await prisma.rosterEntry.findMany({ where: { tournamentId: params.id }, include: { worker: true } })
    const onRoster = new Map<string, WorkerRow>(roster.map(e => [e.workerId, e.worker as unknown as WorkerRow] as [string, WorkerRow]))
    const dates = Array.from(new Set(pickGames.map(g => g.date)))
    const sameDay = await prisma.game.findMany({ where: { tournamentId: params.id, date: { in: dates } }, include: { assignments: true } })
    const busyAt = new Set<string>()   // workerId|date|time
    for (const g of sameDay) for (const a of g.assignments) busyAt.add(`${a.workerId}|${g.date}|${g.startTime}`)
    let saved = 0, skipped = 0
    for (const x of picks) {
      const g = pickGames.find(y => y.id === x.gameId)
      const w = onRoster.get(x.workerId!)
      const k = `${x.workerId}|${g?.date}|${g?.startTime}`
      if (!g || !w || g.assignments.some(a => a.role === x.role) || busyAt.has(k)) { skipped++; continue }
      const payRate = w.payRateOverride ?? getPayRate(w.certLevel, x.role!, payRates)
      await prisma.assignment.create({ data: { gameId: g.id, workerId: w.id, role: x.role!, payRate } })
      g.assignments.push({ role: x.role! } as any)
      busyAt.add(k)
      saved++
    }
    return NextResponse.json({ assigned: saved, skipped, gaps: [], missingRefs: 0, missingSKs: 0,
      summary: `Saved ${saved} assignment${saved === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (slot filled or person busy since the preview)` : ''}.` })
  }
  const divRules: Record<string,number> = parseJsonDeep(tournament.divisionRules, {})

  // The game's own count, the same one the assigner board shows. The division
  // rule used to override it here, so a 7v7 playoff bumped to two refs by hand
  // still got one from Auto-assign. The rule now sets the default when the game
  // is made (lib/refRules) and the stored count is the truth after that.
  void divRules
  function getRefCount(game: { division: string; refCount: number; isChampionship: boolean }): number {
    return game.refCount   // championships carry their own count now (lib/refRules championshipRefs)
  }

  const rosterEntries = await prisma.rosterEntry.findMany({
    where: { tournamentId: params.id },
    include: { worker: true },
  })
  const allWorkers: WorkerRow[] = rosterEntries.map(e => e.worker as unknown as WorkerRow)

  // Refs: only workers whose primary role is ref
  const refs = allWorkers.filter(w => w.defaultRole === 'ref')
  // Scorekeepers: dedicated SKs + anyone else with SK checked in their roles
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

  const created: { gameId: string; role: string; workerId: string; payRate: number }[] = []
  const gaps: { gameNumber: string; division: string; location: string; missingRoles: string[] }[] = []

  // ── Sticky scorekeeper setup ──
  // Assign one SK per field. Only use DEDICATED scorekeepers for sticky (not refs)
  // so we don't accidentally lock a ref out of ref slots.
  // Fall back to refs-who-can-SK only if not enough dedicated SKs.
  const fieldScorekeeper = new Map<string, string>()
  if (stickyScorekeeper && want.sk) {
    const fields = Array.from(new Set(games.map(g => g.location)))
    const times  = Array.from(new Set(games.map(g => g.startTime))).sort()
    const firstTime = times[0] ?? '08:00'

    // Prefer dedicated scorekeepers first, then everyone else who can keep score
    const dedicatedSKs = scorekeepers
      .filter(w => w.defaultRole === 'scorekeeper')
      .filter(w => isAvailable(w.id, firstTime))
    // Refs, field ops and trainers with Scorekeeper in their roles.
    const otherSKs = scorekeepers
      .filter(w => w.defaultRole !== 'scorekeeper')
      .filter(w => isAvailable(w.id, firstTime))
    // Scorekeepers the assigner put on a field by hand (Bo, Oct 12 2026: "choose which
    // field I want to put the scorekeeper on for the day") go there first; the rest of
    // the fields are dealt out as before from whoever is left.
    const chosen = new Set<string>()
    if (skFields && typeof skFields === 'object') {
      for (const [field, wid] of Object.entries(skFields as Record<string, unknown>)) {
        const sk = typeof wid === 'string' ? scorekeepers.find(w => w.id === wid) : undefined
        if (!sk || !fields.includes(field) || chosen.has(sk.id)) continue
        fieldScorekeeper.set(field, sk.id)
        chosen.add(sk.id)
        for (const time of times) if (isAvailable(sk.id, time)) markBusy(sk.id, time)
      }
    }
    const orderedSKs = [...dedicatedSKs, ...otherSKs].filter(w => !chosen.has(w.id))

    let skIdx = 0
    for (const field of fields.filter(f => !fieldScorekeeper.has(f))) {
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
      if (role === 'scorekeeper' ? !want.sk : !refsWanted(game.division)) continue // not asked to fill this one

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
          markBusy(skId, game.startTime)
          gameCounts.set(skId, (gameCounts.get(skId) ?? 0) + 1)
          created.push({ gameId: game.id, role: 'scorekeeper', workerId: skId, payRate })
        } else {
          missingRoles.push('Scorekeeper')
        }

      } else {
        // Ref slot. On a boys' or girls' game, refs who only do that side go first and
        // refs who do both are the fallback: girls' refs are the scarce ones, and a
        // both-ways ref used up on a boys' game at 9:40 can't cover a girls' game then.
        const gg = gameGender(game.division)
        const flex = (w: WorkerRow) => (gg !== 'both' && (w.gender || 'both') === 'both' ? 1 : 0)
        const eligible = sortByLoad(
          refs.filter(w =>
            isEligible(w.id, game.startTime) &&
            genderMatch(w.gender, game.division)
          )
        ).sort((a, b) => flex(a) - flex(b))
        const worker = eligible[0]
        if (worker) {
          const payRate = worker.payRateOverride ?? getPayRate(worker.certLevel, role, payRates)
          markBusy(worker.id, game.startTime)
          gameCounts.set(worker.id, (gameCounts.get(worker.id) ?? 0) + 1)
          created.push({ gameId: game.id, role, workerId: worker.id, payRate })
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

  // Picks are made in memory and written together at the end, so a preview is the
  // same run with the writes left out (Bo, Oct 12 2026: preview before saving).
  if (!preview) {
    for (const c of created) {
      await prisma.assignment.upsert({
        where:  { gameId_role: { gameId: c.gameId, role: c.role } },
        create: { gameId: c.gameId, workerId: c.workerId, role: c.role, payRate: c.payRate },
        update: { workerId: c.workerId, payRate: c.payRate },
      })
    }
  }
  const proposals = preview ? created.map(c => {
    const g = games.find(x => x.id === c.gameId)!
    const w = allWorkers.find(x => x.id === c.workerId)
    return { ...c, workerName: w?.name ?? '?', workerGender: w?.gender ?? 'both', gameNumber: g.gameNumber, division: g.division, startTime: g.startTime, location: g.location }
  }) : undefined

  const did = [want.sk && 'scorekeepers', want.boys && "boys' refs", want.girls && "girls' refs"].filter(Boolean) as string[]
  const scope = did.length === 3 ? '' : ` (${did.join(' and ')} only)`
  return NextResponse.json({
    assigned: preview ? 0 : created.length,
    proposed: created.length,
    preview: !!preview,
    proposals,
    scope: did,
    gaps,
    missingRefs,
    missingSKs,
    summary: gaps.length === 0
      ? `✅ ${preview ? 'Can fill' : 'All slots filled'}${scope} — ${created.length} assignments${preview ? ' proposed' : ' made'}!`
      : `${preview ? 'Can fill' : 'Filled'} ${created.length} slots${scope}. Still need ${needMore.join(' and ')} to cover all games.`,
  })
}
