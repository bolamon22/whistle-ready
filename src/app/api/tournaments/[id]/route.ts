import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff, requireDirector } from '@/lib/apiAuth'
export async function GET(_: Request, { params }: { params:{id:string} }) {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "tiebreakers" TEXT NOT NULL DEFAULT '{}'`) } catch {}
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "tagline" TEXT DEFAULT ''`) } catch {}
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "regConfirmationOverride" TEXT DEFAULT ''`) } catch {}
  const t = await prisma.tournament.findUnique({ where:{id:params.id}, include:{_count:{select:{games:true}}} })
  if (!t) return NextResponse.json({ error:'Not found' }, { status:404 })
  // Effective tiebreakers: the tournament's own, otherwise the saved global default.
  let tiebreakers = (t as any).tiebreakers || '{}'
  try {
    const o = JSON.parse(tiebreakers)
    const hasOwn = Array.isArray(o) ? o.length : (((o.pool||[]).length) || ((o.division||[]).length))
    if (!hasOwn) {
      const def = await prisma.appSetting.findUnique({ where:{ key:'defaultTiebreakers' } }).catch(()=>null)
      if (def && def.value) tiebreakers = def.value
    }
  } catch {}
  let tagline = ''
  try { const tr = await prisma.$queryRawUnsafe<any[]>('SELECT tagline FROM "Tournament" WHERE id = ?', params.id); tagline = (tr?.[0]?.tagline) || '' } catch {}
  let regConfirmationOverride = ''
  try { const rr = await prisma.$queryRawUnsafe<any[]>('SELECT regConfirmationOverride FROM "Tournament" WHERE id = ?', params.id); regConfirmationOverride = (rr?.[0]?.regConfirmationOverride) || '' } catch {}
  // Registration toggles are raw columns (not in the Prisma schema), so they must be
  // read explicitly — otherwise they come back undefined and every consumer assumes
  // "open", which made the Settings checkbox always render checked regardless of the
  // real value. Default to 1 (open) only when the column genuinely doesn't exist yet.
  let teamRegEnabled = 1, individualRegEnabled = 0
  // The individual-registration details are raw columns too, and they were NOT being
  // returned. The editor read them as undefined, fell back to empty defaults, and then
  // wrote those defaults back on save — silently wiping configured tiers, positions,
  // sizes and description. Read them explicitly, same as the toggles above.
  let individualRegDescription = '', individualRegTiers = '[]'
  let individualRegPositions = '[]', individualRegSizes = '[]'
  try {
    const rg = await prisma.$queryRawUnsafe<any[]>('SELECT teamRegEnabled, individualRegEnabled, individualRegDescription, individualRegTiers, individualRegPositions, individualRegSizes FROM "Tournament" WHERE id = ?', params.id)
    if (rg?.[0]) {
      const r0 = rg[0]
      if (r0.teamRegEnabled !== null && r0.teamRegEnabled !== undefined) teamRegEnabled = Number(r0.teamRegEnabled)
      if (r0.individualRegEnabled !== null && r0.individualRegEnabled !== undefined) individualRegEnabled = Number(r0.individualRegEnabled)
      if (r0.individualRegDescription) individualRegDescription = String(r0.individualRegDescription)
      if (r0.individualRegTiers) individualRegTiers = String(r0.individualRegTiers)
      if (r0.individualRegPositions) individualRegPositions = String(r0.individualRegPositions)
      if (r0.individualRegSizes) individualRegSizes = String(r0.individualRegSizes)
    }
  } catch {
    // The detail columns may not exist on older databases, and one missing column
    // fails the whole SELECT. Fall back to just the toggles so they don't regress to
    // defaults (which would make a closed registration look open).
    try {
      const rg = await prisma.$queryRawUnsafe<any[]>('SELECT teamRegEnabled, individualRegEnabled FROM "Tournament" WHERE id = ?', params.id)
      if (rg?.[0]) {
        if (rg[0].teamRegEnabled !== null && rg[0].teamRegEnabled !== undefined) teamRegEnabled = Number(rg[0].teamRegEnabled)
        if (rg[0].individualRegEnabled !== null && rg[0].individualRegEnabled !== undefined) individualRegEnabled = Number(rg[0].individualRegEnabled)
      }
    } catch { /* neither set of columns exists yet — keep defaults */ }
  }
  return NextResponse.json({
    ...t, tiebreakers, tagline, regConfirmationOverride,
    teamRegEnabled: !!teamRegEnabled,
    individualRegEnabled: !!individualRegEnabled,
    individualRegDescription, individualRegTiers, individualRegPositions, individualRegSizes,
  })
}
// These columns store JSON as TEXT. Callers may send either a plain object OR an
// already-serialized JSON string (the Setup wizard serializes some fields itself).
// Blindly calling JSON.stringify() on a string double-encodes it — the value then
// parses back to a STRING instead of an object, silently reverting to defaults.
// That bug corrupted real payRates, so: only stringify what isn't already a string.
const asJson = (v: any) => typeof v === 'string' ? v : JSON.stringify(v)

export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  // Editing tournament config — any staff (setup is used by director/scheduler/assigner).
  // Was previously callable with no auth at all.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const b = await req.json()
  // Fields that live in the Prisma schema.
  const data: any = {
    ...(b.name!==undefined&&{name:b.name}),
    ...(b.sport!==undefined&&{sport:b.sport}),
    ...(b.startDate!==undefined&&{startDate:b.startDate}),
    ...(b.endDate!==undefined&&{endDate:b.endDate}),
    ...(b.location!==undefined&&{location:b.location}),
    ...(b.scheduleIncrement!==undefined&&{scheduleIncrement:Number(b.scheduleIncrement)}),
    ...(b.logoUrl!==undefined&&{logoUrl:b.logoUrl}),
    ...(b.dates!==undefined&&{dates:asJson(b.dates)}),
    ...(b.payRates!==undefined&&{payRates:asJson(b.payRates)}),
    ...(b.divisionRules!==undefined&&{divisionRules:asJson(b.divisionRules)}),
    ...(b.tiebreakers!==undefined&&{tiebreakers:asJson(b.tiebreakers)}),
    ...(b.registrationPricing!==undefined&&{registrationPricing:b.registrationPricing}),
    ...(b.registrationDivisions!==undefined&&{registrationDivisions:b.registrationDivisions}),
  }
  // Registration-toggle columns live only in the DB (not the Prisma schema), so
  // Prisma can't write them - set them via raw SQL, self-healing the column if missing.
  const raw: Array<[string, string, any]> = []
  if (b.teamRegEnabled!==undefined) raw.push(['teamRegEnabled', 'INTEGER DEFAULT 1', Boolean(b.teamRegEnabled) ? 1 : 0])
  if (b.individualRegEnabled!==undefined) raw.push(['individualRegEnabled', 'INTEGER DEFAULT 0', Boolean(b.individualRegEnabled) ? 1 : 0])
  if (b.individualRegDescription!==undefined) raw.push(['individualRegDescription', "TEXT DEFAULT ''", String(b.individualRegDescription ?? '')])
  if (b.individualRegTiers!==undefined) raw.push(['individualRegTiers', "TEXT DEFAULT '[]'", String(b.individualRegTiers ?? '[]')])
  if (b.individualRegPositions!==undefined) raw.push(['individualRegPositions', "TEXT DEFAULT '[]'", String(b.individualRegPositions ?? '[]')])
  if (b.individualRegSizes!==undefined) raw.push(['individualRegSizes', "TEXT DEFAULT '[]'", String(b.individualRegSizes ?? '[]')])
  if (b.tagline!==undefined) raw.push(['tagline', "TEXT DEFAULT ''", String(b.tagline ?? '')])
  if (b.regConfirmationOverride!==undefined) raw.push(['regConfirmationOverride', "TEXT DEFAULT ''", String(b.regConfirmationOverride ?? '')])
  for (const [col, type] of raw) { try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "${col}" ${type}`) } catch {} }
  for (const [col, , val] of raw) { try { await prisma.$executeRawUnsafe(`UPDATE "Tournament" SET "${col}" = ? WHERE id = ?`, val, params.id) } catch {} }
  const out = Object.keys(data).length
    ? await prisma.tournament.update({ where:{id:params.id}, data })
    : await prisma.tournament.findUnique({ where:{id:params.id} })
  return NextResponse.json(out)
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  // Deleting a whole tournament — director only. Was two lines with no auth.
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  await prisma.tournament.delete({ where:{id:params.id} }); return NextResponse.json({ ok:true })
}
