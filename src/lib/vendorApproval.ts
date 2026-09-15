import { prisma } from '@/lib/db'
import { getSubmissionByPassToken, type FormSubmission } from '@/lib/formSubmissions'
import { orgById, type Org } from '@/lib/org'
import { vendorConfig, type VendorConfig } from '@/lib/vendorForm'

// One loader for the vendor approval page (/vendor/<token>) and its checkout route,
// so the page a vendor reads and the amount Stripe charges can never disagree.
//
// The token is the same unguessable 128-bit key the player pass uses. It IS the
// authorization: there's no vendor login, and the link only ever goes to the address
// on the application.

export type VendorApproval = {
  token: string
  submission: FormSubmission
  orgId: string
  tournamentId: string
  org: Org | null
  tournamentName: string
  cfg: VendorConfig
  /** Dollars owed. Frozen at approval; falls back to the type's current price for
   *  rows approved before amountDue existed. */
  amount: number
  approved: boolean
  declined: boolean
  paid: boolean
}

export async function loadVendorApproval(token: string): Promise<VendorApproval | null> {
  const sub = await getSubmissionByPassToken(token)
  if (!sub || sub.formType !== 'vendor') return null

  const org = await orgById(sub.orgId)
  let tournamentName = String(sub.data?.tournamentName || '')
  if (!tournamentName && sub.tournamentId) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>('SELECT name FROM "Tournament" WHERE id = ?', sub.tournamentId)
      tournamentName = String(rows?.[0]?.name || '')
    } catch { /* the page just omits the event name */ }
  }

  let cfg: VendorConfig
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${sub.orgId}` } })
    cfg = vendorConfig(row ? (JSON.parse(row.value || '{}').vendor) : {})
  } catch { cfg = vendorConfig({}) }

  const frozen = Number(sub.amountDue) || 0
  const fromType = cfg.types.find(t => t.id === String(sub.data?.vendorType || ''))?.price || 0
  const fallback = Number(sub.data?.boothFee) || fromType

  return {
    token,
    submission: sub,
    orgId: sub.orgId,
    tournamentId: sub.tournamentId,
    org,
    tournamentName,
    cfg,
    amount: frozen > 0 ? frozen : fallback,
    approved: sub.status === 'approved',
    declined: sub.status === 'declined',
    paid: sub.paymentStatus === 'paid',
  }
}

/** The instruction blocks that actually have content, in reading order. */
export function filledInstructions(cfg: VendorConfig): { key: string; label: string; body: string }[] {
  const LABELS: [keyof VendorConfig['instructions'], string][] = [
    ['where', 'Where to set up'],
    ['eventTimes', 'Event times'],
    ['loadIn', 'Load-in'],
    ['loadOut', 'Load-out'],
    ['bring', 'What to bring'],
    ['contact', 'Who to contact'],
  ]
  return LABELS
    .map(([k, label]) => ({ key: String(k), label, body: String(cfg.instructions[k] || '').trim() }))
    .filter(x => x.body)
}


export type OrgEvent = { id: string; name: string; dates: string }

const fmtDay = (v: string) => { const [y, m, d] = String(v).split('-').map(Number); const x = new Date(y, (m || 1) - 1, d || 1); return isNaN(x.getTime()) ? null : x }

/** "Oct 24–25, 2026" from the stored YYYY-MM-DD strings. */
export function eventDates(start?: string, end?: string): string {
  const a = fmtDay(String(start || '')), b = fmtDay(String(end || ''))
  if (!a) return ''
  const M = (x: Date) => x.toLocaleDateString('en-US', { month: 'short' })
  if (!b || a.getTime() === b.getTime()) return `${M(a)} ${a.getDate()}, ${a.getFullYear()}`
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${M(a)} ${a.getDate()}\u2013${b.getDate()}, ${a.getFullYear()}`
  return `${M(a)} ${a.getDate()} \u2013 ${M(b)} ${b.getDate()}, ${b.getFullYear()}`
}

/** The org's events a vendor could still apply for, soonest first.
 *
 *  orgId lives on Tournament as a RAW SQL column -- it is not in prisma/schema, so
 *  this has to be a raw query (see src/lib/org.ts for the full story). Never throws:
 *  a failure just means the form offers no cross-promotion. */
export async function upcomingOrgEvents(orgId: string): Promise<OrgEvent[]> {
  if (!orgId) return []
  try {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, startDate, endDate FROM "Tournament"
       WHERE orgId = ? AND (COALESCE(NULLIF(endDate,''), startDate) >= ? OR COALESCE(startDate,'') = '')
       ORDER BY startDate ASC`, orgId, today)
    return (rows || []).map(r => ({ id: String(r.id), name: String(r.name || 'Tournament'), dates: eventDates(r.startDate, r.endDate) }))
  } catch {
    return []
  }
}
