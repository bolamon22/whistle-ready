// A REGISTRATION'S INVOICE: the rows behind it, read once.
//
// lib/invoicePdf decides what the invoice says and draws it; this only gathers
// the data, so the pay page, the club portal and the office's "Email invoice"
// all hand out the same document. Server only (database).
import { prisma } from '@/lib/db'
import { orgForTournament, type Org } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { absUrl } from '@/lib/emailLayout'
import { clearingTransfers } from '@/lib/pendingTransfers'
import { ensurePaymentGuard } from '@/lib/paymentGuard'
import { parsePricing, type RegPricing } from '@/lib/regPricing'
import { invoiceDocFor, type InvoiceDoc } from '@/lib/invoicePdf'

export type LoadedInvoice = {
  doc: InvoiceDoc
  reg: { id: string; tournamentId: string; clubName: string; clubContact: string; contactEmail: string }
  tournament: { name: string; startDate: string; endDate: string; logoUrl: string }
  org: Org | null
}

/**
 * The invoice for one registration. `{ mergedInto }` for a registration merged
 * into another one (its links follow the survivor, like the pay page's), null
 * when there is no such registration.
 */
export async function loadInvoice(registrationId: string, now = new Date()): Promise<LoadedInvoice | { mergedInto: string } | null> {
  if (!registrationId) return null
  // The payment table's columns are made on first use; reading payments before
  // they exist fails (same as api/registrations/[id]/pay-info).
  await ensurePaymentGuard()
  const reg = await prisma.teamRegistration.findUnique({
    where: { id: registrationId },
    include: { teams: true, payments: true },
  })
  if (!reg) return null
  if (reg.deletedAt) {
    try {
      const m = await prisma.$queryRawUnsafe<{ mergedIntoId?: string | null }[]>(`SELECT "mergedIntoId" FROM "TeamRegistration" WHERE id = ?`, reg.id)
      const into = String(m?.[0]?.mergedIntoId || '')
      if (into) return { mergedInto: into }
    } catch { /* no merge column yet */ }
    return null
  }

  const t = await prisma.tournament.findUnique({
    where: { id: reg.tournamentId },
    select: { name: true, startDate: true, endDate: true, location: true, logoUrl: true, registrationPricing: true },
  })
  if (!t) return null
  const org = await orgForTournament(reg.tournamentId)

  // Where a check goes. The same three columns the portal reads, and never more:
  // the Organization row also holds the org's own bank account (achRoutingNumber,
  // achAccountNumber), which has no business on a document that gets forwarded.
  let payTo: { zelleHandle: string; checkPayableTo: string; checkAddress: string } | null = null
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT o."zelleHandle", o."checkPayableTo", o."checkAddress"
         FROM "Organization" o JOIN "Tournament" t ON t."orgId" = o.id
        WHERE t.id = ?`, reg.tournamentId)
    const r = rows?.[0]
    if (r) payTo = { zelleHandle: String(r.zelleHandle || ''), checkPayableTo: String(r.checkPayableTo || ''), checkAddress: String(r.checkAddress || '') }
  } catch { /* columns not there yet: the invoice points to the pay page only */ }

  let pricing: RegPricing | null = null
  try { pricing = parsePricing(t.registrationPricing) } catch { /* one total, not itemized */ }
  // Once the registration is in QuickBooks, its invoice carries QuickBooks' number
  // (lib/qboSync), so the PDF, the email and the books all say the same thing.
  let qbo = { number: '', date: '' }
  try {
    const q: { qboDocNumber?: string | null; qboTxnDate?: string | null }[] = await prisma.$queryRawUnsafe(`SELECT "qboDocNumber", "qboTxnDate" FROM "TeamRegistration" WHERE id = ?`, reg.id)
    qbo = { number: String(q?.[0]?.qboDocNumber || ''), date: String(q?.[0]?.qboTxnDate || '') }
  } catch { /* columns not made yet: not in QuickBooks */ }
  const clearing = (await clearingTransfers([reg.id]))[reg.id] || null
  const orgBase = tournamentAbs(org?.slug, '')

  const doc = invoiceDocFor({
    reg: {
      id: reg.id, clubName: reg.clubName, clubContact: reg.clubContact, clubBasedIn: reg.clubBasedIn,
      createdAt: reg.createdAt, invoiceAmount: reg.invoiceAmount, discountAmount: reg.discountAmount, discountNote: reg.discountNote,
    },
    teams: reg.teams.map(x => ({ teamName: x.teamName, division: x.division, waitlisted: x.waitlisted })),
    payments: reg.payments.map(p => ({ amount: p.amount, method: p.method, checkNumber: p.checkNumber, receivedAt: p.receivedAt })),
    tournament: { name: t.name, startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), location: String(t.location || '') },
    pricing,
    org: { ...(org || {}), ...(payTo || {}) },
    clearing: clearing ? { amount: clearing.amount, startedAt: clearing.startedAt } : null,
    payUrl: tournamentAbs(org?.slug, `/pay/${reg.id}`),
    now,
    logo: await logoFor(String(t.logoUrl || ''), orgBase),
    number: qbo.number || null,
    issuedOn: qbo.number ? qbo.date || null : null,
  })

  return {
    doc,
    reg: { id: reg.id, tournamentId: reg.tournamentId, clubName: reg.clubName, clubContact: reg.clubContact, contactEmail: reg.contactEmail },
    tournament: { name: t.name, startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), logoUrl: String(t.logoUrl || '') },
    org,
  }
}

// ── The event's logo, as bytes the PDF can embed ────────────────────────────
// PNG and JPEG only (all the PDF format takes without converting). Anything else,
// or a logo that can't be read in a few seconds, is left off: an invoice without
// a logo beats no invoice.

const MAX_LOGO = 5 * 1024 * 1024

function kindOf(b: Uint8Array): 'png' | 'jpg' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  return null
}

function asBytes(v: unknown): Uint8Array | null {
  if (!v) return null
  if (v instanceof Uint8Array) return v
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  if (Array.isArray(v)) return Uint8Array.from(v as number[])
  if (typeof v === 'string') { try { return new Uint8Array(Buffer.from(v, 'base64')) } catch { return null } }
  const o = v as { type?: string; data?: unknown }
  if (o && o.type === 'Buffer' && Array.isArray(o.data)) return Uint8Array.from(o.data as number[])
  return null
}

async function logoFor(logoUrl: string, orgBase: string): Promise<InvoiceDoc['logo']> {
  const u = logoUrl.trim()
  if (!u) return null
  let bytes: Uint8Array | null = null
  try {
    const data = /^data:[^;,]*;base64,(.*)$/i.exec(u)
    const img = /^\/api\/img\/([A-Za-z0-9-]+)$/.exec(u)
    if (data) bytes = new Uint8Array(Buffer.from(data[1], 'base64'))
    else if (img) {
      // Stored by /api/upload: read the row instead of fetching our own site.
      const rows: { data?: unknown }[] = await prisma.$queryRawUnsafe(`SELECT data FROM "UploadedImage" WHERE id = ?`, img[1])
      bytes = asBytes(rows?.[0]?.data)
    }
    if (!bytes || !kindOf(bytes)) {
      const url = absUrl(orgBase, u)
      if (url) {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' })
        if (res.ok) bytes = new Uint8Array(await res.arrayBuffer())
      }
    }
  } catch { bytes = null }
  if (!bytes || bytes.length > MAX_LOGO) return null
  const kind = kindOf(bytes)
  return kind ? { bytes, kind } : null
}
