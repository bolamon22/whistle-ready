import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI assistant not configured — add ANTHROPIC_API_KEY to Vercel environment variables.' },
      { status: 503 }
    )
  }

  try {
    const { messages, tournamentId } = await req.json()

    let context = 'You are a helpful assistant for Whistle Ready, a tournament management app. Be concise.'

    if (tournamentId) {
      try {
        const [tournament, games, workers, roster, regs, indivRegs] = await Promise.all([
          prisma.tournament.findUnique({ where: { id: tournamentId } }),
          prisma.game.findMany({ where: { tournamentId }, include: { assignments: true } }),
          prisma.worker.findMany(),
          prisma.rosterEntry.findMany({ where: { tournamentId } }),
          prisma.teamRegistration.findMany({ where: { tournamentId }, include: { teams: true, payments: true } }),
          prisma.individualRegistration.findMany({ where: { tournamentId } }),
        ])

        if (tournament) {
          const dates: string[] = JSON.parse(tournament.dates || '[]')
          const active = games.filter((g: { isCanceled: boolean }) => !g.isCanceled)
          const assigned = active.filter((g: { assignments: unknown[] }) => g.assignments.length > 0)
          const unscheduled = active.filter((g: { startTime: string; location: string }) => !g.startTime || !g.location)
          const rosterIds = new Set(roster.map((r: { workerId: string }) => r.workerId))
          const rosterWorkers = workers.filter((w: { id: string }) => rosterIds.has(w.id))
          const totalInvoiced = regs.reduce((s: number, r: { invoiceAmount: number }) => s + r.invoiceAmount, 0)
          const totalPaid = regs.reduce((s: number, r: { payments: { amount: number }[] }) =>
            s + r.payments.reduce((ps: number, p: { amount: number }) => ps + p.amount, 0), 0)
          const indivPaid = indivRegs.filter((r: { paymentStatus: string }) => r.paymentStatus === 'paid')
            .reduce((s: number, r: { feeTierAmount: number }) => s + r.feeTierAmount, 0)

          context = `You are a smart assistant for Whistle Ready. Be concise and use the live data below.

TOURNAMENT: ${tournament.name} | Sport: ${tournament.sport || 'N/A'} | Dates: ${dates.join(', ')} | Location: ${tournament.location || 'N/A'}
GAMES: ${active.length} total | ${assigned.length} assigned | ${unscheduled.length} unscheduled
ROSTER: ${rosterWorkers.length} staff on roster (refs/scorekeepers)
TEAM REGISTRATIONS: ${regs.length} clubs | ${regs.reduce((s: number, r: { teams: unknown[] }) => s + r.teams.length, 0)} teams
INDIVIDUAL PLAYERS: ${indivRegs.length} registered | ${indivRegs.filter((r: { paymentStatus: string }) => r.paymentStatus === 'paid').length} paid | ${indivRegs.filter((r: { paymentStatus: string }) => r.paymentStatus === 'pending').length} pending
FINANCIALS: Team invoiced $${totalInvoiced.toLocaleString()} | Team collected $${totalPaid.toLocaleString()} | Player fees collected $${indivPaid.toLocaleString()} | Balance $${(totalInvoiced - totalPaid).toLocaleString()}`
        }
      } catch (e) {
        console.error('Context fetch error:', e)
      }
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: context,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ message: text })

  } catch (e: unknown) {
    console.error('Chat error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
