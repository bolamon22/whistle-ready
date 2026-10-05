import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { tasksGate } from '@/lib/tasksGate'
import { createTask, ensureTaskTable } from '@/lib/tasks'
import { importContacts, type ImportFile } from '@/lib/contacts'

export const dynamic = 'force-dynamic'

// POST /api/contacts/import { contacts: [...], tasks: [...] }
// A contacts file written with event NAMES (see importContacts). Open items in
// the file become Tasks on the matched tournament, linked to their contact.
// Safe to run twice: duplicates are skipped. Never contacts anyone.

export async function POST(req: NextRequest) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  if (!g.orgId) return NextResponse.json({ error: 'Pick an organization first (the org picker on the tournaments page)' }, { status: 400 })
  const file = await req.json().catch(() => null) as ImportFile | null
  if (!file || (!Array.isArray(file.contacts) && !Array.isArray(file.tasks))) {
    return NextResponse.json({ error: 'That file has no contacts or tasks in it' }, { status: 400 })
  }
  try {
    await ensureTaskTable()
    const result = await importContacts(g.scope, g.orgId, file, g.by, async t => {
      if (!t.title) return false
      const dup: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM "OrgTask" WHERE "tournamentId" = ? AND lower("title") = lower(?) LIMIT 1`, t.tournamentId, t.title)
      if (dup.length) return false
      const row = await createTask({ orgId: g.orgId, tournamentId: t.tournamentId, title: t.title, category: t.category, dueDate: t.dueDate, notes: t.notes, contactId: t.contactId, createdBy: g.by })
      return !!row
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[api/contacts/import] failed:', e)
    return NextResponse.json({ error: 'Could not import the file' }, { status: 500 })
  }
}
