import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { cleanCustomLetter, MAX_CUSTOM_LETTERS, type CustomLetter } from '@/lib/customLetters'

// The org's own club letters, saved from the Email clubs dialog (lib/customLetters).
// One AppSetting per org, commLetterCustom:{orgId}, holding the whole list — a
// handful of letters, edited by one office, so a read-modify-write is plenty.

const keyFor = (orgId: string) => `commLetterCustom:${orgId}`

type Gate = { role?: string | null; orgId?: string | null }
/** Same rule as the built-in letters' route: admins may work on another org. */
const orgFor = (gate: Gate, viewOrgId: unknown) =>
  gate.role === 'admin' ? String(viewOrgId || gate.orgId || '') : String(gate.orgId || '')

async function load(orgId: string): Promise<CustomLetter[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: keyFor(orgId) } })
    if (!row?.value) return []
    const v = JSON.parse(row.value) as { letters?: unknown }
    return (Array.isArray(v?.letters) ? v.letters : [])
      .map(x => cleanCustomLetter(x))
      .filter((x): x is CustomLetter => !!x && !!x.id)
  } catch {
    return []
  }
}

async function store(orgId: string, letters: CustomLetter[]) {
  const key = keyFor(orgId)
  const value = JSON.stringify({ letters })
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const orgId = orgFor(gate, new URL(req.url).searchParams.get('viewOrgId'))
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  return NextResponse.json({ letters: await load(orgId) })
}

export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* validated below */ }
  const orgId = orgFor(gate, b.viewOrgId)
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const letters = await load(orgId)
  if (letters.length >= MAX_CUSTOM_LETTERS) return NextResponse.json({ error: `You have ${MAX_CUSTOM_LETTERS} saved letters already. Delete one first.` }, { status: 400 })
  const letter = cleanCustomLetter({ ...b, id: 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), updatedAt: new Date().toISOString() })
  if (!letter) return NextResponse.json({ error: 'A letter needs a name, a subject and some words.' }, { status: 400 })
  if (letters.some(l => sameName(l.name, letter.name))) return NextResponse.json({ error: `You already have a letter called "${letter.name}".` }, { status: 400 })
  await store(orgId, [...letters, letter])
  return NextResponse.json({ ok: true, letter })
}

export async function PUT(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* validated below */ }
  const orgId = orgFor(gate, b.viewOrgId)
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const id = String(b.id ?? '')
  const letters = await load(orgId)
  const at = letters.findIndex(l => l.id === id)
  if (!id || at < 0) return NextResponse.json({ error: 'That letter is gone. Save it as a new one.' }, { status: 404 })
  const letter = cleanCustomLetter({ ...b, id, updatedAt: new Date().toISOString() })
  if (!letter) return NextResponse.json({ error: 'A letter needs a name, a subject and some words.' }, { status: 400 })
  if (letters.some((l, i) => i !== at && sameName(l.name, letter.name))) return NextResponse.json({ error: `You already have a letter called "${letter.name}".` }, { status: 400 })
  const next = letters.slice()
  next[at] = letter
  await store(orgId, next)
  return NextResponse.json({ ok: true, letter })
}

export async function DELETE(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const url = new URL(req.url)
  const orgId = orgFor(gate, url.searchParams.get('viewOrgId'))
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const id = String(url.searchParams.get('id') || '')
  const letters = await load(orgId)
  if (!letters.some(l => l.id === id)) return NextResponse.json({ error: 'Already deleted' }, { status: 404 })
  await store(orgId, letters.filter(l => l.id !== id))
  return NextResponse.json({ ok: true })
}
