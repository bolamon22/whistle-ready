import { prisma } from '@/lib/db'
import { INVITE_TEMPLATES, type StoredTemplate } from '@/lib/inviteTemplates'

// Saved invite letters (Bo, Sep 10: "can you make it so I can save my templates
// if I change them?"). Edits used to live only in React state, so reloading the
// page threw them away and every send started from the shipped wording again.
//
// Storage is ONE AppSetting row per org — `inviteTemplates:{orgId}` holding a
// JSON array — rather than a row per letter, because Bo can add letters of his
// own and a fixed set of keys couldn't grow. A saved entry whose key matches a
// built-in overrides that built-in in place; any other key is a letter he wrote.

export type { StoredTemplate }

type Saved = { key: string; label: string; subject: string; body: string }

const rowKey = (orgId: string) => `inviteTemplates:${orgId}`
const MAX_SAVED = 40

function assemble(saved: Saved[]): StoredTemplate[] {
  const byKey = new Map(saved.map(s => [s.key, s]))
  const builtIns: StoredTemplate[] = INVITE_TEMPLATES.map(t => {
    const s = byKey.get(t.key)
    return s
      ? { ...t, label: s.label || t.label, subject: s.subject, body: s.body, builtIn: true, edited: true }
      : { ...t, builtIn: true, edited: false }
  })
  const mine: StoredTemplate[] = saved
    .filter(s => !INVITE_TEMPLATES.some(t => t.key === s.key))
    .map(s => ({ key: s.key, label: s.label, hint: 'Your saved letter.', subject: s.subject, body: s.body, builtIn: false, edited: true }))
  return [...builtIns, ...mine]
}

async function readSaved(orgId: string): Promise<Saved[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: rowKey(orgId) } })
    if (!row) return []
    const parsed = JSON.parse(row.value) as { saved?: unknown }
    if (!Array.isArray(parsed?.saved)) return []
    return (parsed.saved as Saved[]).filter(s => s && typeof s.key === 'string' && typeof s.subject === 'string' && typeof s.body === 'string')
  } catch {
    // Never let a bad row take the page down — fall back to the shipped letters.
    return []
  }
}

async function writeSaved(orgId: string, saved: Saved[]): Promise<void> {
  if (!saved.length) {
    try { await prisma.appSetting.delete({ where: { key: rowKey(orgId) } }) } catch { /* nothing saved yet */ }
    return
  }
  const value = JSON.stringify({ saved })
  await prisma.appSetting.upsert({ where: { key: rowKey(orgId) }, update: { value }, create: { key: rowKey(orgId), value } })
}

export async function listInviteTemplates(orgId: string): Promise<StoredTemplate[]> {
  return assemble(await readSaved(orgId))
}

/** Save over an existing letter (pass its key) or add a new one (leave key blank). */
export async function saveInviteTemplate(
  orgId: string,
  a: { key?: string; label?: string; subject: string; body: string },
): Promise<{ ok: true; key: string; templates: StoredTemplate[] } | { ok: false; error: string }> {
  const subject = String(a.subject ?? '').trim().slice(0, 200)
  const body = String(a.body ?? '').trim().slice(0, 8000)
  if (!subject || !body) return { ok: false, error: 'Subject and letter are both required' }

  const saved = await readSaved(orgId)
  const key = String(a.key ?? '').trim() || `mine-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const builtIn = INVITE_TEMPLATES.find(t => t.key === key)
  const label = String(a.label ?? '').trim().slice(0, 60) || builtIn?.label || 'My letter'

  const next = saved.filter(s => s.key !== key)
  if (next.length >= MAX_SAVED) return { ok: false, error: `That's ${MAX_SAVED} saved letters — delete one first` }
  next.push({ key, label, subject, body })
  await writeSaved(orgId, next)
  return { ok: true, key, templates: assemble(next) }
}

/** Reset a built-in to its shipped wording, or delete one of Bo's own. */
export async function deleteInviteTemplate(orgId: string, key: string): Promise<StoredTemplate[]> {
  const next = (await readSaved(orgId)).filter(s => s.key !== key)
  await writeSaved(orgId, next)
  return assemble(next)
}
