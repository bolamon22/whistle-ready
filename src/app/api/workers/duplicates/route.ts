import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

function normName(s: unknown): string { return String(s ?? '').toLowerCase().replace(/[^a-z]/g, '') }
function normPhone(s: unknown): string {
  const d = String(s ?? '').replace(/\D/g, '')
  return d.length >= 7 ? d.slice(-10) : ''
}

/**
 * Edit distance, stopped as soon as it exceeds `cap`.
 *
 * WHY THIS IS HERE: exact matching missed the case this panel exists for. Bo imported a
 * pool of staff as sample data, real people are now signing themselves up through the
 * recruiting link, and the two spellings rarely agree to the letter -- "Haley Nolan"
 * signs up fresh while "Hayley Nolan" sits in the import. One letter apart, and because
 * the imported half was seeded with no email and no phone there is nothing else to match
 * on, so the pair was invisible: two records for one person, and her assignments and pay
 * history split across both.
 */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (row[j] < best) best = row[j]
    }
    if (best > cap) return cap + 1   // every path through this row is already too far
    prev = row
  }
  return prev[b.length]
}

// Common first-name short forms. Bo's early import typed people the way he knows them
// ("Jim Gottlieb") and people sign up under their full name ("James O. Gottlieb"), so
// a pair with the same last name and nickname-equivalent first names is worth a look.
const NICK_GROUPS = [
  'james jim jimmy jamie', 'robert rob bob bobby robbie', 'william will bill billy willie liam', 'michael mike mikey mick',
  'matthew matt matty', 'christopher chris topher', 'thomas tom tommy', 'nicholas nick nicky nico', 'stephen steven steve stevie',
  'jeffrey jeff geoff geoffrey', 'daniel dan danny', 'david dave davey', 'joseph joe joey', 'anthony tony', 'andrew andy drew',
  'richard rick rich ricky dick', 'jonathan jon jonny john johnny jack', 'edward ed eddie ted ned', 'gregory greg', 'patrick pat paddy',
  'benjamin ben benny', 'samuel sam sammy', 'alexander alex al xander', 'alexandra alex alexa lexi', 'katherine kathryn catherine kate katie kathy cathy kat',
  'elizabeth liz lizzie beth betsy eliza libby', 'jennifer jen jenny', 'jessica jess jessie', 'margaret maggie meg peggy', 'rebecca becky becca',
  'victoria vicky tori', 'charles charlie chuck chas', 'timothy tim timmy', 'kenneth ken kenny', 'ronald ron ronnie', 'donald don donnie',
  'lawrence larry', 'raymond ray', 'gerald gerry jerry', 'frederick fred freddie', 'zachary zach zack', 'nathaniel nathan nate',
  'joshua josh', 'kristopher kris', 'abigail abby', 'samantha sam sammy', 'christina christine chris tina', 'theodore theo ted teddy',
  'phillip philip phil', 'douglas doug', 'leonard leo len lenny', 'harold harry hal', 'henry hank harry', 'walter walt wally',
  'marcelo marcel', 'adalberto beto al', 'roshonda shonda', 'garnett gary',
]
const NICK = new Map<string, Set<number>>()
NICK_GROUPS.forEach((g, i) => g.split(' ').forEach(n => { const s = NICK.get(n) ?? new Set<number>(); s.add(i); NICK.set(n, s) }))

/** [first, last] in lowercase letters, middle names and initials dropped, "Jr"/"III" ignored. */
function firstLast(name: unknown): [string, string] | null {
  const t = String(name ?? '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).map(x => x.replace(/[^a-z]/g, '')).filter(Boolean)
    .filter(x => !['jr', 'sr', 'ii', 'iii', 'iv'].includes(x))
  if (t.length < 2) return null
  return [t[0], t[t.length - 1]]
}
/** Same person written two ways: nickname ("Jim"/"James"), initial ("J"), or a cut-off first name ("Matt"/"Matthew"). */
function sameFirstName(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length === 1 || b.length === 1) return a[0] === b[0]
  if ((a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b))) return true
  const ga = NICK.get(a), gb = NICK.get(b)
  return !!ga && !!gb && Array.from(ga).some(i => gb.has(i))
}

/** No email and no phone: almost always a seeded/imported row rather than a real signup. */
const noContact = (w: Record<string, unknown>) =>
  !String(w.email ?? '').trim() && !normPhone(w.phone)
function slim(w: Record<string, unknown>, users: Set<string>) {
  const email = String(w.email ?? '').trim().toLowerCase()
  return {
    // registered: an app login exists for this email, i.e. the person signed up (or claimed
    // an invite) themselves. Bo's rule: that record is the one to keep.
    registered: !!email && users.has(email),
    id: String(w.id), name: String(w.name ?? ''), email: (w.email as string | null) ?? null,
    phone: (w.phone as string | null) ?? null, defaultRole: String(w.defaultRole ?? 'ref'),
    roles: String(w.roles ?? '[]'), certLevel: String(w.certLevel ?? ''),
    payMethod: String(w.payMethod ?? ''), payHandle: (w.payHandle as string | null) ?? null,
    association: (w.association as string | null) ?? null, createdAt: String(w.createdAt ?? ''),
  }
}

async function resolveOrgId(req: Request, gate: { role: string; orgId: string | null }, fromBody?: unknown): Promise<string> {
  if (gate.role !== 'admin') return gate.orgId ?? ''
  const url = new URL(req.url)
  return String(fromBody ?? url.searchParams.get('viewOrgId') ?? gate.orgId ?? '')
}

// GET /api/workers/duplicates[?viewOrgId=] — likely duplicate Workers in the org's
// pool, paired by same email, same phone, or same normalized name. Pairs the
// organizer marked "not duplicates" (AppSetting workerDupeDismissed:{org}) stay hidden.
export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const orgId = await resolveOrgId(req, gate)

  const client = db()
  const res = orgId
    ? await client.execute({ sql: `SELECT * FROM "Worker" WHERE orgId = ? ORDER BY createdAt ASC`, args: [orgId] })
    : await client.execute(`SELECT * FROM "Worker" ORDER BY createdAt ASC`)
  const workers = res.rows as unknown as Record<string, unknown>[]
  const users = new Set<string>()
  try {
    const u = await client.execute(`SELECT lower(email) AS email FROM "User" WHERE email IS NOT NULL AND email != ''`)
    for (const r of u.rows as Array<Record<string, unknown>>) users.add(String(r.email))
  } catch { /* no login info: no recommendation */ }

  let dismissed: string[] = []
  try {
    const d = await prisma.appSetting.findUnique({ where: { key: `workerDupeDismissed:${orgId || 'all'}` } })
    if (d) dismissed = JSON.parse(d.value)
  } catch { /* none dismissed */ }
  const dismissedSet = new Set(dismissed)

  type Side = ReturnType<typeof slim>
  const pairs: { key: string; reasons: string[]; a: Side; b: Side; keep: 'a' | 'b' | null; strength: number }[] = []
  // 200, not 50: the early import put a lot of people in, and the list is reviewed in one sitting.
  for (let i = 0; i < workers.length && pairs.length < 200; i++) {
    for (let j = i + 1; j < workers.length && pairs.length < 200; j++) {
      const A = workers[i], B = workers[j]
      const reasons: string[] = []
      const emailA = String(A.email ?? '').trim().toLowerCase(), emailB = String(B.email ?? '').trim().toLowerCase()
      if (emailA && emailA === emailB) reasons.push('same email')
      const phoneA = normPhone(A.phone), phoneB = normPhone(B.phone)
      if (phoneA && phoneA === phoneB) reasons.push('same phone')
      const nameA = normName(A.name), nameB = normName(B.name)
      if (nameA.length >= 5 && nameA === nameB) reasons.push('same name')
      else if (nameA.length >= 8 && nameB.length >= 8) {
        // One letter apart is a spelling of the same name far more often than it is two
        // people. Two letters apart is weaker -- siblings on staff can sit that close
        // ("Emma Johnson" / "Ella Johnson") -- so it only counts when one side has no
        // contact details at all, which is the signature of a seeded import.
        const d = editDistance(nameA, nameB, 2)
        if (d === 1) reasons.push('nearly the same name')
        else if (d === 2 && (noContact(A) || noContact(B))) reasons.push('nearly the same name, and one has no contact details')
      }
      if (!reasons.some(r => r.includes('name'))) {
        const fa = firstLast(A.name), fb = firstLast(B.name)
        if (fa && fb && fa[1].length >= 3 && fa[1] === fb[1] && fa[0] !== fb[0] && sameFirstName(fa[0], fb[0])) reasons.push('same last name, first name a nickname or initial')
      }
      if (!reasons.length) continue
      const key = [String(A.id), String(B.id)].sort().join(':')
      if (dismissedSet.has(key)) continue
      const a = slim(A, users), b = slim(B, users)
      // Suggested keeper: the one with an app login. Both or neither: no suggestion.
      const keep: 'a' | 'b' | null = a.registered && !b.registered ? 'a' : b.registered && !a.registered ? 'b' : null
      const strength = (reasons.includes('same email') ? 4 : 0) + (reasons.includes('same phone') ? 3 : 0) + (reasons.includes('same name') ? 2 : 0) + (reasons.length ? 1 : 0)
      pairs.push({ key, reasons, a, b, keep, strength })
    }
  }
  // Surest first: shared email/phone, then same name, then near-spellings and nicknames.
  pairs.sort((x, y) => y.strength - x.strength)
  return NextResponse.json({ pairs })
}

// POST {action:'dismiss', key} — remember a pair as "not duplicates"
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { action?: unknown; key?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const key = String(body.key ?? '')
  if (body.action !== 'dismiss' || !/^[\w-]+:[\w-]+$/.test(key)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const orgId = await resolveOrgId(req, gate, body.viewOrgId)
  const storageKey = `workerDupeDismissed:${orgId || 'all'}`
  let dismissed: string[] = []
  try {
    const d = await prisma.appSetting.findUnique({ where: { key: storageKey } })
    if (d) dismissed = JSON.parse(d.value)
  } catch { /* start fresh */ }
  if (!dismissed.includes(key)) dismissed.push(key)
  const value = JSON.stringify(dismissed.slice(-500))
  await prisma.appSetting.upsert({ where: { key: storageKey }, update: { value }, create: { key: storageKey, value } })
  return NextResponse.json({ ok: true })
}
