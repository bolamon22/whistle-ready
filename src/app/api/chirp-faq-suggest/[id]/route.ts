import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { parsePricing, feeScheduleLines } from '@/lib/regPricing'

export const runtime = 'nodejs'

// Clusters logged attendee questions into a short draft FAQ the organizer can review.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI not configured.' }, { status: 503 })
  try {
    const id = params.id
    const [t, logRow, siteRow] = await Promise.all([
      prisma.tournament.findUnique({ where: { id } }),
      prisma.appSetting.findUnique({ where: { key: `chirpLog:${id}` } }).catch(() => null),
      prisma.appSetting.findUnique({ where: { key: `tournamentSite:${id}` } }).catch(() => null),
    ])
    let log: any[] = []
    try { log = JSON.parse((logRow as any)?.value || '[]'); if (!Array.isArray(log)) log = [] } catch {}
    if (!log.length) return NextResponse.json({ suggestions: [] })

    const tt: any = t || {}
    let c: any = {}
    try { c = JSON.parse((siteRow as any)?.value || '{}') } catch {}
    const divisions: string[] = (() => { try { const d = JSON.parse(tt.registrationDivisions || '[]'); return Array.isArray(d) ? d.filter(Boolean) : [] } catch { return [] } })()
    const fees = (() => { try { return feeScheduleLines(parsePricing(tt.registrationPricing)) } catch { return [] } })()
    const summary = `EVENT: ${tt.name || ''} ${tt.sport ? '(' + tt.sport + ')' : ''}
DATES: ${tt.startDate || 'TBA'}${tt.endDate && tt.endDate !== tt.startDate ? ' to ' + tt.endDate : ''}
LOCATION: ${tt.location || 'TBA'}
DIVISIONS: ${divisions.join(', ') || 'TBA'}
${fees.length ? 'FEES per team: ' + fees.join('; ') : ''}
${(c.hotelsUrl || c.hotels) ? 'HOTELS: ' + (c.hotelsUrl || '') + ' ' + String(c.hotels || '').slice(0, 300) : ''}
${c.overview ? 'OVERVIEW: ' + String(c.overview).slice(0, 600) : ''}
${c.rules ? 'RULES: ' + String(c.rules).slice(0, 1200) : ''}`

    // This tournament's organization pages (refund policy, terms, FAQ, etc.) — always
    // scoped to THIS event's org, so each organization gets its own rules.
    let orgPagesText = ''
    try {
      const orgRows: any[] = await prisma.$queryRawUnsafe('SELECT orgId FROM "Tournament" WHERE id = ?', id)
      const orgId = orgRows && orgRows[0] && orgRows[0].orgId
      if (orgId) {
        const os = await prisma.appSetting.findUnique({ where: { key: `orgSite:${orgId}` } }).catch(() => null)
        let oc: any = {}
        try { oc = JSON.parse((os as any)?.value || '{}') } catch {}
        const pages = Array.isArray(oc.pages) ? oc.pages : []
        orgPagesText = pages.filter((p: any) => p && p.body).slice(0, 8)
          .map((p: any) => `### ${p.title || p.slug}\n${String(p.body).slice(0, 1200)}`)
          .join('\n\n').slice(0, 4500)
      }
    } catch (e) { console.error('faq org pages error:', e) }

    const questions = log.slice(-300).reverse().map((e: any) => '- ' + String(e.q || '')).join('\n')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: `You help a tournament organizer turn real attendee questions into a concise FAQ. Cluster the questions into the most common/important themes. For each, write a short, accurate answer (1-2 sentences) using the event info and the organizer's policy pages — if the info isn't available, write a helpful placeholder answer the organizer can fill in. Output ONLY a JSON array of 4-8 objects: [{"question":"...","answer":"..."}]. No prose, no markdown fences.`,
      messages: [{ role: 'user', content: `Event info:\n${summary}${orgPagesText ? `\n\nORGANIZER WEBSITE PAGES (policies such as refunds, terms, FAQ):\n${orgPagesText}` : ''}\n\nAttendee questions:\n${questions}` }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    let suggestions: any[] = []
    try {
      const m = text.match(/\[[\s\S]*\]/)
      suggestions = JSON.parse(m ? m[0] : text)
      if (!Array.isArray(suggestions)) suggestions = []
      suggestions = suggestions.filter((x: any) => x && x.question).slice(0, 8)
    } catch { suggestions = [] }
    return NextResponse.json({ suggestions })
  } catch (e: unknown) {
    console.error('chirp-faq-suggest error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
