import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { ensurePaymentGuard } from '@/lib/paymentGuard'
import { requireStaff } from '@/lib/apiAuth'
import { canSeeMoney } from '@/lib/roleScope'
import { helpArticlesText, helpPagesText, CHIRP_HOWTO_RULES } from '@/lib/helpArticles'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Staff only: the prompt is built from every worker, registration and payment in the
  // tournament, so an open endpoint let anyone ask it for staff phone numbers or who
  // owes what (and ran up the Anthropic bill). The widget only lives on staff pages.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI assistant not configured — add ANTHROPIC_API_KEY to Vercel environment variables.' },
      { status: 503 }
    )
  }

  try {
    const { messages, tournamentId: rawId } = await req.json()
    const tournamentId = typeof rawId === 'string' && /^[A-Za-z0-9_-]+$/.test(rawId) ? rawId : ''
    // Dollar amounts go into the prompt only for roles that may see them (View as
    // included). Anything in the prompt can come out in an answer.
    const money = canSeeMoney(gate.role)

    let liveData = 'No tournament is open.'

    if (tournamentId) {
      try {
        await ensurePaymentGuard()
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

          liveData = `TOURNAMENT: ${tournament.name} | Sport: ${tournament.sport || 'N/A'} | Dates: ${dates.join(', ')} | Location: ${tournament.location || 'N/A'}
GAMES: ${active.length} total | ${assigned.length} assigned | ${unscheduled.length} unscheduled
ROSTER: ${rosterWorkers.length} staff on roster (refs/scorekeepers)
TEAM REGISTRATIONS: ${regs.length} clubs | ${regs.reduce((s: number, r: { teams: unknown[] }) => s + r.teams.length, 0)} teams
INDIVIDUAL PLAYERS: ${indivRegs.length} registered | ${indivRegs.filter((r: { paymentStatus: string }) => r.paymentStatus === 'paid').length} paid | ${indivRegs.filter((r: { paymentStatus: string }) => r.paymentStatus === 'pending').length} pending` +
            (money ? `
FINANCIALS: Team invoiced $${totalInvoiced.toLocaleString()} | Team collected $${totalPaid.toLocaleString()} | Player fees collected $${indivPaid.toLocaleString()} | Balance $${(totalInvoiced - totalPaid).toLocaleString()}` : '')
        }
      } catch (e) {
        console.error('Context fetch error:', e)
      }
    }

    // One floating Chirp answers both kinds of question: numbers about this
    // tournament, and how to use the app (it used to know only the numbers).
    const context = `You are Chirp, the assistant for Whistle Ready, a tournament-management app. If asked your name, you are Chirp. Be concise and warm.

You answer two kinds of questions:
1. Questions about this tournament: answer from LIVE DATA.${money ? '' : ' LIVE DATA holds no dollar amounts for this person\'s role; if they ask about money, say the tournament director can see that.'}
2. How to use Whistle Ready: ${CHIRP_HOWTO_RULES}

=== LIVE DATA ===
${liveData}

=== PAGES ===
${helpPagesText(tournamentId || undefined)}

=== MANUAL ===
${helpArticlesText()}`

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
