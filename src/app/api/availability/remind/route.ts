import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { fieldDirectorSees } from '@/lib/roleScope'
import { payScopeFor } from '@/lib/payScope'
import { seesPay, workerPayGroups } from '@/lib/payGroups'
import { orgForTournament, tournamentOrgId } from '@/lib/org'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { renderEmail } from '@/lib/emailLayout'
import { eventDayList } from '@/lib/eventDays'
import { availabilityLetter, dayTitle, eventRange } from '@/lib/availabilityAnswers'
import { AVAILABILITY_MANAGERS, dayStates, gameSlots, logReminder } from '@/lib/availability'

// "Email the N who haven't answered" on the Availability page (Bo, Oct 14 2026: a
// button that emails the people who haven't answered a link to their days).
//
// POST { tournamentId, workerIds } -> { sent, failed, skipped }
// Each person gets one email listing the event's days, with a button that opens their
// staff home on that event (/dashboard/staff?avail=<id>). Nobody gets it who has
// answered every day, has no email, isn't on the staff roster, or is outside the
// sender's staff (a field director's jobs, an assigner's staff groups). Sent from
// the org (orgSender), logged per event for the page's "Reminded" notes.

export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!AVAILABILITY_MANAGERS.includes(gate.role)) return NextResponse.json({ error: 'Only the people who assign staff can send reminders.' }, { status: 403 })
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const tid = String(b.tournamentId || '')
  if (!tid) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 })
  const refused = eventGate(gate, tid); if (refused) return refused
  if (gate.role !== 'admin' && gate.orgId) {
    const org = await tournamentOrgId(tid)
    if (org && org !== gate.orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const ids = Array.from(new Set((Array.isArray(b.workerIds) ? b.workerIds : []).map(String))).slice(0, 300) as string[]
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one person.' }, { status: 400 })
  const t = await prisma.tournament.findUnique({ where: { id: tid }, select: { id: true, name: true, startDate: true, endDate: true, dates: true, location: true } })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const roster = await prisma.rosterEntry.findMany({ where: { tournamentId: tid, workerId: { in: ids } }, select: { worker: { select: { id: true, name: true, email: true, roles: true, defaultRole: true, gender: true } } } })
  const byId = new Map(roster.map(r => [r.worker.id, r.worker]))
  const scope = gate.role === 'assigner' ? await payScopeFor(gate.role, gate.userId) : null
  const slots = await gameSlots(tid)
  const days = eventDayList(t, Array.from(slots.keys()))
  const states = await dayStates(tid, Array.from(byId.keys()))

  const skipped: { id: string; name: string; reason: string }[] = []
  const go: { id: string; name: string; email: string; answered: Set<string> }[] = []
  for (const id of ids) {
    const w = byId.get(id)
    if (!w) { skipped.push({ id, name: '', reason: 'Not on the staff roster' }); continue }
    if (gate.role === 'field_director' && !fieldDirectorSees(w)) { skipped.push({ id, name: w.name, reason: 'Not one of your staff' }); continue }
    if (scope && !seesPay(scope, workerPayGroups(w))) { skipped.push({ id, name: w.name, reason: 'Not in your staff groups' }); continue }
    const mine = states.get(id) || {}
    if (days.every(d => mine[d])) { skipped.push({ id, name: w.name, reason: 'Already answered' }); continue }
    const email = String(w.email || '').trim()
    if (!email) { skipped.push({ id, name: w.name, reason: 'No email on file' }); continue }
    go.push({ id, name: w.name, email, answered: new Set(days.filter(d => mine[d])) })
  }

  const org = await orgForTournament(tid)
  const link = `${process.env.APP_PUBLIC_URL || 'https://whistleready.app'}/dashboard/staff?avail=${encodeURIComponent(tid)}`
  const when = eventRange(t.startDate, t.endDate || t.startDate)
  let sent = 0
  const failed: string[] = [], sentIds: string[] = []
  const one = async (p: typeof go[number]) => {
    const letter = availabilityLetter({
      firstName: p.name.trim().split(/\s+/)[0] || '', eventName: t.name, when, where: t.location || '',
      days: days.map(d => ({ label: dayTitle(d), answered: p.answered.has(d) })), link,
    })
    const html = renderEmail({ orgName: org?.name || 'Sunshine Events Group', eyebrow: t.name, body: letter.html, footerNote: 'Questions? Reply to this email.' })
    const r = await sendEmail({ to: p.email, subject: letter.subject, html, text: letter.text, ...orgSender(org) })
    if (r.ok) { sent++; sentIds.push(p.id) } else failed.push(p.name)
  }
  for (let i = 0; i < go.length; i += 8) await Promise.all(go.slice(i, i + 8).map(one))
  if (sentIds.length) await logReminder(tid, { at: new Date().toISOString(), by: String(gate.session?.user?.name || gate.session?.user?.email || ''), byUserId: gate.userId || '', workerIds: sentIds })
  return NextResponse.json({ ok: true, sent, failed, skipped, emailOn: emailEnabled() })
}
