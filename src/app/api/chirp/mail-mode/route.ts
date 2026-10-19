import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, viewerRole } from '@/lib/apiAuth'
import { cleanId } from '@/lib/chirp'
import { orgById, tournamentOrgId } from '@/lib/org'
import { MAIL_MODES, getMailMode, sendChirpDigest, setMailMode, type MailMode } from '@/lib/publicChirp'

export const runtime = 'nodejs'

// How often the organizer gets Chirp chat emails (Chirp insights).
// GET ?tournamentId= reads it; POST { tournamentId, mode } changes it, and
// POST { tournamentId, sendNow: true } sends what's waiting right away.
async function orgFor(req: NextRequest, body?: any) {
  const tid = cleanId(body?.tournamentId ?? req.nextUrl.searchParams.get('tournamentId'))
  return tid ? await tournamentOrgId(tid) : null
}

export async function GET(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const orgId = await orgFor(req)
  if (!orgId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  return NextResponse.json({ mode: await getMailMode(orgId), modes: MAIL_MODES })
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const role = await viewerRole()
  if (role !== 'admin' && role !== 'director') return NextResponse.json({ error: 'Only an admin or director can change this' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const orgId = await orgFor(req, body)
  if (!orgId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (body.sendNow) {
    const org = await orgById(orgId)
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    return NextResponse.json(await sendChirpDigest(org, { force: true }))
  }
  const mode = String(body.mode || '') as MailMode
  if (!MAIL_MODES.some(m => m.id === mode)) return NextResponse.json({ error: 'Unknown setting' }, { status: 400 })
  await setMailMode(orgId, mode)
  return NextResponse.json({ ok: true, mode })
}
