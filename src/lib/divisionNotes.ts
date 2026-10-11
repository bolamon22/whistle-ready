import { prisma } from '@/lib/db'
import { nameKey } from '@/lib/names'

// Notes on the public schedule page (Bo, Oct 11 2026: "add a note to the divisions
// individually. And also one that would be maybe a tournament wide note on the
// division"). Written on the Divisions page (divisions/DivisionNotes.tsx); the public
// schedule shows them at the top of a division: its own note, then the note for
// every division. They go public with Teams & pools, like the rest of that view.
//
// Not the event page's "Divisions note" (Tournament setup), which sits under the
// division list on the event page and is about registration. Not a broadcast,
// which is a dated announcement in the banner.
//
// AppSetting `divisionNotes:{tournamentId}` = { all, divisions: { [division]: note } },
// keyed by the division's name like the other per-division settings; renaming the
// division carries its note and deleting the division drops it (divisions route).

export const NOTE_MAX = 600
export type DivisionNotes = { all: string; divisions: Record<string, string> }

const key = (tid: string) => `divisionNotes:${tid}`

export async function readDivisionNotes(tid: string): Promise<DivisionNotes> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: key(tid) } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    const all = typeof v?.all === 'string' ? v.all : ''
    const divisions: Record<string, string> = {}
    const src = v?.divisions
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      for (const [d, note] of Object.entries(src)) if (typeof note === 'string' && note.trim()) divisions[d] = note
    }
    return { all, divisions }
  } catch { return { all: '', divisions: {} } }
}

async function write(tid: string, v: DivisionNotes): Promise<void> {
  const value = JSON.stringify(v)
  await prisma.appSetting.upsert({ where: { key: key(tid) }, update: { value }, create: { key: key(tid), value } })
}

/** What staff typed, tidied: one kind of line break, no runs of blank lines, capped. */
export function cleanNote(s: unknown): string {
  return String(s ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, NOTE_MAX).trim()
}

/** Set a division's note, or the note for every division when `division` is blank.
 *  An empty note removes it. */
export async function setDivisionNote(tid: string, division: string, text: string): Promise<DivisionNotes> {
  const cur = await readDivisionNotes(tid)
  const note = cleanNote(text)
  const name = String(division || '').trim()
  if (!name) cur.all = note
  else {
    const want = nameKey(name)
    for (const d of Object.keys(cur.divisions)) if (nameKey(d) === want) delete cur.divisions[d]
    if (note) cur.divisions[name] = note
  }
  await write(tid, cur)
  return cur
}

/** A renamed division keeps its note. */
export async function renameDivisionNote(tid: string, oldName: string, newName: string): Promise<void> {
  const cur = await readDivisionNotes(tid)
  const want = nameKey(oldName)
  const hit = Object.keys(cur.divisions).find(d => nameKey(d) === want)
  if (!hit) return
  const note = cur.divisions[hit]
  delete cur.divisions[hit]
  cur.divisions[newName.trim()] = note
  await write(tid, cur)
}

/** A deleted division's note goes with it (never the note for every division). */
export async function dropDivisionNote(tid: string, division: string): Promise<void> {
  if (!String(division || '').trim()) return
  const cur = await readDivisionNotes(tid)
  const want = nameKey(division)
  const hits = Object.keys(cur.divisions).filter(d => nameKey(d) === want)
  if (!hits.length) return
  for (const d of hits) delete cur.divisions[d]
  await write(tid, cur)
}
