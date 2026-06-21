import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveBlocks, newBlock } from '@/lib/eventBlocks'
import { parsePricing, baseFee, feeScheduleLines } from '@/lib/regPricing'
import { SITE_URL, stripMd } from '@/lib/seo'
import { resolveRules } from '@/lib/rules'

export const runtime = 'nodejs'

const fmtD = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) }
const yr = (d: string) => (d ? d.split('-')[0] : '')
function range(s: string, e: string) { if (s && e && s !== e) return `${fmtD(s)}–${fmtD(e)}, ${yr(e)}`; if (s) return `${fmtD(s)}, ${yr(s)}`; return '' }
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Builds factual FAQ entries from a tournament's own data (dates, location, format,
// divisions, fees, registration, hotels, contacts) and merges them into the event
// page's FAQ block. Deterministic — no invented facts. Staff-only.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Sign in to edit' }, { status: 401 })
  const id = params.id
  try {
    const tr = await prisma.$queryRawUnsafe<any[]>('SELECT id, name, sport, startDate, endDate, location, orgId, teamRegEnabled, registrationDivisions, registrationPricing, tagline FROM "Tournament" WHERE id = ?', id)
    const t = tr?.[0]
    if (!t) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

    const key = `tournamentSite:${id}`
    const row = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null)
    let c: any = {}
    try { c = JSON.parse((row as any)?.value || '{}') } catch {}

    let orgEmail = ''
    try { if (t.orgId) { const o = await prisma.$queryRawUnsafe<any[]>('SELECT contactEmail FROM "Organization" WHERE id = ?', t.orgId); orgEmail = o?.[0]?.contactEmail || '' } } catch {}

    let ruleSets: any[] = []
    try { if (t.orgId) { const rr = await prisma.appSetting.findUnique({ where: { key: `orgRules:${t.orgId}` } }); if (rr) { const v = JSON.parse((rr as any).value || '{}'); ruleSets = Array.isArray(v.sets) ? v.sets : [] } } } catch {}
    const rulesBody = resolveRules(c, ruleSets).body
    const name = String(t.name || 'the tournament')
    const sport = String(t.sport || 'lacrosse')
    const when = range(t.startDate, t.endDate)
    const divisions: string[] = (() => { try { const d = JSON.parse(t.registrationDivisions || '[]'); return Array.isArray(d) ? d.filter(Boolean) : [] } catch { return [] } })()
    const pricing = parsePricing(t.registrationPricing)
    const feeLines = feeScheduleLines(pricing)
    const base = baseFee(pricing)
    const eventUrl = `${SITE_URL}/tournaments/${id}/event`
    const contact = (Array.isArray(c.contacts) && c.contacts.find((x: any) => x && (x.email || x.phone))) || null

    const faqs: { q: string; a: string }[] = []
    if (when) faqs.push({ q: `When is ${name}?`, a: `${name} takes place ${when}${t.location ? ` in ${t.location}` : ''}.` })
    if (t.location) faqs.push({ q: `Where is ${name} held?`, a: `${name} is held at ${t.location}.` })
    if (t.tagline) faqs.push({ q: `What is the format of ${name}?`, a: `${name} is a ${String(t.tagline).replace(/\.$/, '')}.` })
    if (divisions.length) faqs.push({ q: `What divisions are offered at ${name}?`, a: `Divisions include ${divisions.join(', ')}.` })
    if (base > 0 && feeLines.length) faqs.push({ q: `How much does it cost to enter a team?`, a: `Team registration: ${feeLines.join('; ')}.` })
    if (Number(t.teamRegEnabled)) faqs.push({ q: `How do I register a team for ${name}?`, a: `Register online at ${SITE_URL}/tournaments/${id}/register. Spots are confirmed once registration and payment are complete.` })
    if (c.hotelsUrl || c.hotels) faqs.push({ q: `Where should teams stay for ${name}?`, a: c.hotelsUrl ? `Book discounted team hotels here: ${c.hotelsUrl}.` : stripMd(c.hotels).slice(0, 280) })
    if (rulesBody) faqs.push({ q: `Where can I find the rules for ${name}?`, a: `The full tournament rules and policies are at ${SITE_URL}/tournaments/${id}/rules.` })
    const cEmail = (contact && contact.email) || orgEmail
    if (cEmail) faqs.push({ q: `Who do I contact with questions about ${name}?`, a: `Email ${cEmail}${contact && contact.name ? ` (${contact.name})` : ''} with any questions.` })
    faqs.push({ q: `Is there a schedule and live scores for ${name}?`, a: `Yes — the game schedule, live scores and standings are posted at ${SITE_URL}/tournaments/${id}/public.` })

    const blocks: any[] = resolveBlocks(c)
    let faq = blocks.find(b => b.type === 'faq' && (!b.props || b.props.display !== 'page')) || blocks.find(b => b.type === 'faq')
    if (!faq) { faq = newBlock('faq') as any; faq.props = { title: 'Frequently asked questions', items: [], display: 'inline' }; blocks.push(faq) }
    faq.props = faq.props || {}
    if (!faq.props.title) faq.props.title = 'Frequently asked questions'
    const existing: any[] = Array.isArray(faq.props.items) ? faq.props.items.filter((it: any) => it && (it.q || it.a)) : []
    const have = new Set(existing.map((it: any) => norm(it.q)))
    let added = 0
    for (const f of faqs) { if (!have.has(norm(f.q))) { existing.push({ q: f.q, a: f.a }); have.add(norm(f.q)); added++ } }
    faq.props.items = existing
    faq.hidden = false
    c.blocks = blocks

    await prisma.appSetting.upsert({ where: { key }, update: { value: JSON.stringify(c) }, create: { key, value: JSON.stringify(c) } })
    return NextResponse.json({ ok: true, added, total: existing.length })
  } catch (e: unknown) {
    console.error('generate-faqs error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
