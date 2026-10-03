import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { roleLabel } from '@/lib/chirp'

export const runtime = 'nodejs'
export const maxDuration = 60

// Monday-morning Chirp summary for each organization: how many questions the
// public and staff asked last week, the most-asked ones, and every question
// Chirp couldn't answer. Chirp doesn't teach itself; it gets better when those
// gaps become help pages or event FAQ, and this email is that to-do list
// (Bo, Oct 3 2026: "make sure it learns from the questions users ask").
// Vercel cron (vercel.json) sends CRON_SECRET; anyone else gets 401.

type Entry = { q: string; at: number; covered?: boolean; page?: string; team?: string; role?: string; name?: string }
const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app'
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const norm = (q: string) => q.toLowerCase().trim().replace(/[?.!,]+$/g, '').replace(/\s+/g, ' ')

async function readLog(key: string): Promise<Entry[]> {
  const row = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null)
  try { const v = JSON.parse((row as any)?.value || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const qs = req.nextUrl.searchParams.get('secret') || ''
    if (auth !== `Bearer ${secret}` && qs !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const days = Math.min(31, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 7))
  const since = Date.now() - days * 86400000
  const orgs: any[] = await prisma.$queryRawUnsafe('SELECT id, name, slug, contactEmail FROM "Organization"').catch(() => [])
  const sent: string[] = []

  for (const org of orgs) {
    const to = String(org.contactEmail || '').trim()
    if (!to) continue
    const tournaments: any[] = await prisma.$queryRawUnsafe('SELECT id, name FROM "Tournament" WHERE orgId = ?', org.id).catch(() => [])
    const pub: (Entry & { where: string; tid?: string })[] = []
    const staff: (Entry & { where: string; tid?: string })[] = []
    for (const t of tournaments) {
      for (const e of await readLog(`chirpLog:${t.id}`)) if (e.at >= since && e.q) pub.push({ ...e, where: t.name, tid: t.id })
      for (const e of await readLog(`chirpStaffLog:${t.id}`)) if (e.at >= since && e.q) staff.push({ ...e, where: t.name, tid: t.id })
    }
    for (const e of await readLog(`chirpLog:org:${org.id}`)) if (e.at >= since && e.q) pub.push({ ...e, where: 'Website' })
    if (!pub.length && !staff.length) continue

    const all = [...pub, ...staff]
    const counts = new Map<string, { q: string; n: number }>()
    for (const e of all) { const k = norm(e.q); const c = counts.get(k); if (c) c.n++; else counts.set(k, { q: e.q, n: 1 }) }
    const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8)
    const missedPub = pub.filter(e => e.covered === false)
    const missedStaff = staff.filter(e => e.covered === false)
    const missed = missedPub.length + missedStaff.length

    const section = (title: string, body: string) => `<tr><td style="padding:16px 20px 4px"><div style="font-size:13px;font-weight:700;color:#0f172a">${title}</div></td></tr><tr><td style="padding:0 20px 12px">${body}</td></tr>`
    const missRow = (e: Entry & { where: string }, who: string) => `<div style="padding:8px 0;border-bottom:1px solid #f1f5f9"><div style="font-size:14px;color:#0f172a">${esc(e.q)}</div><div style="font-size:12px;color:#64748b;margin-top:2px">${esc(e.where)}${who ? ` · ${esc(who)}` : ''}</div></div>`
    const html = `<div style="background:#f1f5f9;padding:20px 0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0f1f3d;padding:16px 20px">
  <div style="font-size:16px;font-weight:700;color:#ffffff">Chirp this week · ${esc(org.name)}</div>
  <div style="font-size:13px;color:#99f6e4;margin-top:2px">${pub.length} public question${pub.length === 1 ? '' : 's'} · ${staff.length} staff question${staff.length === 1 ? '' : 's'} · ${missed ? `${missed} Chirp couldn't answer` : 'all answered'}</div>
</td></tr>
${missed ? section('Chirp couldn\'t answer these, add them to the help pages or event FAQ',
  missedPub.map(e => missRow(e, e.team ? `team ${e.team}` : 'visitor')).join('') + missedStaff.map(e => missRow(e, [e.name, e.role ? roleLabel(e.role).replace(/^an? /, '').split(',')[0] : ''].filter(Boolean).join(', '))).join('')) : ''}
${section('Most asked', top.map(t => `<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155">${esc(t.q)}<span style="float:right;color:#0f766e;font-weight:600">${t.n}×</span></div>`).join(''))}
<tr><td style="padding:12px 20px 16px;font-size:12px;color:#64748b">Every question and answer is in each tournament's <b>Live → Chirp insights</b>${tournaments[0] ? ` (e.g. <a href="${APP_URL}/tournaments/${tournaments[tournaments.length - 1].id}/chirp-insights" style="color:#0f766e">${esc(tournaments[tournaments.length - 1].name)}</a>)` : ''}.</td></tr>
</table></div>`
    const text = `Chirp this week · ${org.name}\n${pub.length} public, ${staff.length} staff questions, ${missed} not answered.\n\nNot answered:\n${[...missedPub, ...missedStaff].map(e => `- ${e.q} (${e.where})`).join('\n') || '- none'}\n\nMost asked:\n${top.map(t => `- ${t.q} (${t.n})`).join('\n')}`
    const r = await sendEmail({ to, subject: `${missed ? `[${missed} to answer] ` : ''}Chirp this week: ${all.length} question${all.length === 1 ? '' : 's'}`, html, text, fromName: `Chirp · ${org.name}` })
    if (r.ok) sent.push(org.name)
  }
  return NextResponse.json({ ok: true, sent })
}
