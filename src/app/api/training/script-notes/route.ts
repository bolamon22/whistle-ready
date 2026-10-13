import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

// Video library -> each video's script: the changes Bo wants made before it is
// re-recorded (Oct 13 2026: "scripts accessible to me if I want to change them a
// little bit"). Saved as notes; re-recording happens with tools/videos.
// AppSetting `videoScriptNotes`: { [videoId]: { text, by, at } }.

const KEY = 'videoScriptNotes'
const gateDirector = async () => {
  const gate = await requireStaff()
  if (!gate.ok) return { res: gate.res }
  if (gate.role !== 'admin' && gate.role !== 'director') return { res: NextResponse.json({ error: 'Directors only' }, { status: 403 }) }
  return { gate }
}
async function read(): Promise<Record<string, { text: string; by: string; at: string }>> {
  try { const r = await prisma.appSetting.findUnique({ where: { key: KEY } }); const v = r?.value ? JSON.parse(r.value) : {}; return v && typeof v === 'object' ? v : {} } catch { return {} }
}

export async function GET() {
  const g = await gateDirector(); if ('res' in g) return g.res
  return NextResponse.json({ notes: await read() })
}

export async function PUT(req: NextRequest) {
  const g = await gateDirector(); if ('res' in g) return g.res
  const b = await req.json().catch(() => ({} as any))
  const id = String(b.videoId || '').slice(0, 60); const text = String(b.text || '').slice(0, 4000)
  if (!/^[a-z0-9-]+$/.test(id)) return NextResponse.json({ error: 'Bad video' }, { status: 400 })
  const notes = await read()
  if (text.trim()) notes[id] = { text, by: String(g.gate.session?.user?.name || ''), at: new Date().toISOString() }
  else delete notes[id]
  const value = JSON.stringify(notes)
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
  return NextResponse.json({ ok: true, notes })
}
