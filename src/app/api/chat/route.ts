import { streamText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { messages, tournamentId } = await req.json()
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let context = 'You are a helpful assistant for GameDay Staff, a tournament management app.'

  if (tournamentId) {
    try {
      const [tournament, games, workers, roster, regs] = await Promise.all([
        prisma.tournament.findUnique({ where: { id: tournamentId } }),
        prisma.game.findMany({ where: { tournamentId }, include: { assignments: true } }),
        prisma.worker.findMany(),
        prisma.rosterEntry.findMany({ where: { tournamentId } }),
        prisma.teamRegistration.findMany({ where: { tournamentId }, include: { teams: true, payments: true } }),
      ])

      if (tournament) {
        const dates: string[] = JSON.parse(tournament.dates || '[]')
        const active = games.filter(g => !g.isCanceled)
        const assigned = active.filter(g => g.assignments.length > 0)
        const unscheduled = active.filter(g => !g.startTime || !g.location)
        const rosterIds = new Set(roster.map(r => r.workerId))
        const rosterWorkers = workers.filter(w => rosterIds.has(w.id))
        const boysRefs  = rosterWorkers.filter(w => w.defaultRole === 'ref' && w.gender === 'boys')
        const girlsRefs = rosterWorkers.filter(w => w.defaultRole === 'ref' && w.gender === 'girls')
        const bothRefs  = rosterWorkers.filter(w => w.defaultRole === 'ref' && w.gender === 'both')
        const sks       = rosterWorkers.filter(w => w.defaultRole === 'scorekeeper')

        const divCounts: Record<string, number> = {}
        for (const reg of regs) {
          for (const team of reg.teams) {
            divCounts[team.division] = (divCounts[team.division] || 0) + 1
          }
        }

        const totalInvoiced = regs.reduce((s, r) => s + r.invoiceAmount, 0)
        const totalPaid = regs.reduce((s, r) => s + r.payments.reduce((ps, p) => ps + p.amount, 0), 0)
        const divisions = [...new Set(active.map(g => g.division))]

        context = `You are a smart assistant for GameDay Staff. Answer concisely using the live data below.

TOURNAMENT: ${tournament.name}
Sport: ${tournament.sport || 'Not set'} | Dates: ${dates.join(', ') || 'Not set'} | Location: ${tournament.location || 'Not set'}

GAMES: ${active.length} total | ${assigned.length} assigned | ${unscheduled.length} unscheduled | ${games.filter(g => g.isCanceled).length} canceled
Divisions: ${divisions.join(', ')}

ROSTER (${rosterWorkers.length} staff):
- Boys refs: ${boysRefs.length} — ${boysRefs.map(w => w.name).join(', ') || 'none'}
- Girls refs: ${girlsRefs.length} — ${girlsRefs.map(w => w.name).join(', ') || 'none'}
- Both refs: ${bothRefs.length} — ${bothRefs.map(w => w.name).join(', ') || 'none'}
- Scorekeepers: ${sks.length} — ${sks.map(w => w.name).join(', ') || 'none'}

REGISTRATIONS: ${regs.length} clubs | ${regs.reduce((s, r) => s + r.teams.length, 0)} teams
Invoiced: $${totalInvoiced.toLocaleString()} | Collected: $${totalPaid.toLocaleString()} | Balance: $${(totalInvoiced - totalPaid).toLocaleString()}
Teams by division: ${Object.entries(divCounts).map(([d, c]) => `${d}: ${c}`).join(', ')}

Answer accurately from this data. If something isn't here, say so.`
      }
    } catch (e) {
      console.error('Context fetch error:', e)
    }
  }

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: context,
    messages,
    maxTokens: 1024,
  })

  return result.toDataStreamResponse()
}
