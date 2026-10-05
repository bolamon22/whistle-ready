// A CLUB'S INVOICE AS A PDF.
//
// Clubs that pay by check need something their accounting office will take:
// a dated invoice with a number, who to pay and where to mail it (Melissa at
// M&D Orlando, Oct 5 2026: "Could you send me an invoice so that I can submit
// to my accounting team so they can issue a check?"). Bo wanted it printable
// from the pay page so it stays self-serve, and emailed by the office as well.
//
// Pure: no database import. lib/invoice reads the rows; this decides what the
// invoice says (invoiceDocFor) and draws it (buildInvoicePdf), so the same
// document comes out of the pay page, the club portal and the office's
// "Email invoice".
//
// Standard Helvetica keeps the file small and needs no font files, but it only
// covers the Windows-1252 characters. Anything else in a club or team name is
// swapped for its plain-letter version (or "?") rather than failing the PDF.
import { PDFDocument, StandardFonts, rgb, PDFString, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import { calcFeeLines, type RegPricing } from '@/lib/regPricing'

export type InvoiceLine = {
  /** "Team registration: M&D Orlando Prep" */
  description: string
  /** The division, shown in its own column. */
  detail: string
  /** null when the invoice is not itemized per team (see InvoiceDoc.itemized). */
  amount: number | null
  /** "Waiting list, not billed" and the like. */
  note?: string
}

export type InvoiceDoc = {
  number: string
  issuedOn: string
  dueText: string
  org: { name: string; address: string; email: string; phone: string; website: string }
  billTo: { name: string; attn: string; place: string }
  event: { name: string; dates: string; location: string; registeredOn: string }
  lines: InvoiceLine[]
  /** False when per-team prices don't add up to the invoice (an amount the office
   *  set by hand, say): the teams are listed and one line carries the total. */
  itemized: boolean
  invoiced: number
  discount: number
  discountNote: string
  payments: { date: string; method: string; amount: number }[]
  clearing: { amount: number; startedOn: string } | null
  balance: number
  payTo: { checkPayableTo: string; checkAddress: string; zelleHandle: string }
  payUrl: string
  memo: string
  logo?: { bytes: Uint8Array; kind: 'png' | 'jpg' } | null
}

const W = 612, H = 792, M = 50
const INK = rgb(0.06, 0.09, 0.16)        // slate-900
const MUTED = rgb(0.39, 0.45, 0.55)      // slate-500
const FAINT = rgb(0.58, 0.64, 0.72)      // slate-400
const RULE = rgb(0.89, 0.91, 0.94)       // slate-200
const SHADE = rgb(0.97, 0.98, 0.99)      // slate-50
const TEAL = rgb(0.05, 0.58, 0.53)       // teal-600
const GREEN = rgb(0.09, 0.5, 0.24)

export const money = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── From a registration to an invoice ────────────────────────────────────────
// What the invoice says is decided here, from plain rows, so it can be tested
// without a database. lib/invoice reads the rows.

export type InvoiceSource = {
  reg: {
    id: string; clubName: string; clubContact?: string | null; clubBasedIn?: string | null
    createdAt: string | Date; invoiceAmount: number; discountAmount?: number | null; discountNote?: string | null
  }
  teams: { teamName: string; division: string; waitlisted?: boolean | null }[]
  payments: { amount: number; method?: string | null; checkNumber?: string | null; receivedAt?: string | null }[]
  tournament: { name: string; startDate?: string | null; endDate?: string | null; location?: string | null }
  /** The event's price list, to itemize per team. null leaves the invoice as one total. */
  pricing: RegPricing | null
  org: {
    name?: string | null; contactEmail?: string | null; contactPhone?: string | null; website?: string | null
    zelleHandle?: string | null; checkPayableTo?: string | null; checkAddress?: string | null
  } | null
  /** A bank transfer still clearing (lib/pendingTransfers). It counts against the balance. */
  clearing: { amount: number; startedAt: string } | null
  payUrl: string
  now?: Date
  logo?: InvoiceDoc['logo']
  /** The invoice's number in QuickBooks, once it has one (lib/qboSync). Without it
   *  the number is made from the org and the registration id. */
  number?: string | null
  /** QuickBooks' invoice date (YYYY-MM-DD), once it has one. Without it, today. */
  issuedOn?: string | null
}

// The office is in Florida. An invoice dated by the server's UTC clock read as
// tomorrow from 8pm on.
const TZ = 'America/New_York'
const round2 = (n: number) => Math.round((n || 0) * 100) / 100
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** YYYY-MM-DD of an instant, on the office's calendar. */
function ymdIn(d: Date, tz = TZ): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** "Oct 24, 2026". A plain YYYY-MM-DD is a calendar day (event days, a check's
 *  received date) and is never shifted; a timestamp is read on the office's calendar. */
export function invoiceDate(v: string | Date | null | undefined): string {
  if (!v) return ''
  const s = v instanceof Date ? ymdIn(v) : /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? String(v).trim() : (() => {
    const d = new Date(String(v)); return isNaN(d.getTime()) ? '' : ymdIn(d)
  })()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : String(v)
}

/** "Oct 24-25, 2026", "Oct 31 - Nov 1, 2026", or one day. */
export function eventDates(start?: string | null, end?: string | null): string {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(start || ''), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(end || '')
  if (!a) return invoiceDate(end || '')
  if (!b || b[0] === a[0]) return invoiceDate(a[0])
  if (a[1] !== b[1]) return `${invoiceDate(a[0])} – ${invoiceDate(b[0])}`
  if (a[2] !== b[2]) return `${MONTHS[+a[2] - 1]} ${+a[3]} – ${MONTHS[+b[2] - 1]} ${+b[3]}, ${a[1]}`
  return `${MONTHS[+a[2] - 1]} ${+a[3]}–${+b[3]}, ${a[1]}`
}

/** (954) 608-5886 from however it was typed; anything that isn't a US number is left alone. */
export function invoicePhone(s?: string | null): string {
  const raw = String(s || '').trim()
  const d = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw
}

/** The org's initials and the end of the registration id: SEG-35TL99. Stable, so
 *  every copy of one club's invoice carries the same number, and a merged
 *  registration's invoice is the survivor's. */
export function invoiceNumber(orgName: string | null | undefined, regId: string): string {
  const initials = String(orgName || '').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'INV'
  return `${initials}-${String(regId || '').slice(-6).toUpperCase()}`
}

/** "Invoice SEG-35TL99 - M&D Orlando.pdf", safe as a file name anywhere. */
export function invoiceFileName(inv: Pick<InvoiceDoc, 'number' | 'billTo'>): string {
  const club = String(inv.billTo.name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 &.,()'-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `Invoice ${inv.number}${club ? ` - ${club}` : ''}.pdf`
}

const METHOD_WORDS: Record<string, string> = {
  check: 'Check', credit_card: 'Card', card: 'Card', ach: 'Bank transfer', zelle: 'Zelle',
  paypal: 'PayPal', venmo: 'Venmo', cash: 'Cash',
}

export function invoiceDocFor(src: InvoiceSource): InvoiceDoc {
  const now = src.now || new Date()
  const { reg, tournament: t } = src
  const orgName = String(src.org?.name || '').trim() || t.name || 'Tournament registration'
  const number = String(src.number || '').trim() || invoiceNumber(src.org?.name || t.name, reg.id)
  const invoiced = round2(Number(reg.invoiceAmount) || 0)
  const discount = round2(Number(reg.discountAmount) || 0)
  const net = round2(invoiced - discount)

  // Per-team prices, worked out the way the invoice was: the price list as of the
  // day they registered (early-bird dates), on the UTC date the server used then.
  // If they don't add up to what is invoiced (the office set an amount by hand,
  // or the price list changed since), the teams are listed and one line carries
  // the total, rather than an itemization that contradicts the bill.
  const regDay = (() => { const d = new Date(reg.createdAt as string); return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10) })()
  const teams = src.teams.map(x => ({ ...x, division: x.division || '', waitlisted: !!x.waitlisted }))
  const priced = src.pricing && teams.length ? calcFeeLines(teams, src.pricing, regDay) : null
  const itemized = !!priced && Math.abs(priced.reduce((s, l) => s + l.amount, 0) - invoiced) < 0.005
  const lines: InvoiceLine[] = teams.map((x, i) => ({
    description: `Team registration: ${x.teamName || `Team ${i + 1}`}`,
    detail: x.division,
    amount: itemized ? round2(priced![i].amount) : null,
    ...(x.waitlisted ? { note: 'Waiting list, not billed' } : {}),
  }))

  const payments = [...src.payments]
    .sort((a, b) => String(a.receivedAt || '').localeCompare(String(b.receivedAt || '')))
    .map(p => {
      const m = String(p.method || '').toLowerCase()
      const word = METHOD_WORDS[m] || (m ? m[0].toUpperCase() + m.slice(1) : 'Payment')
      return {
        date: invoiceDate(p.receivedAt || ''),
        method: m === 'check' && String(p.checkNumber || '').trim() ? `Check #${String(p.checkNumber).trim()}` : word,
        amount: round2(Number(p.amount) || 0),
      }
    })
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  const clearing = src.clearing && src.clearing.amount > 0
    ? { amount: round2(src.clearing.amount), startedOn: invoiceDate(src.clearing.startedAt) }
    : null
  // The same balance the pay page shows (api/registrations/[id]/pay-info).
  const balance = round2(Math.max(0, net - paid - (clearing?.amount || 0)))

  // Payment before the event is what confirms a club's spots, and nothing is
  // collected at the field, so the due date is the first day of the event.
  const start = /^\d{4}-\d{2}-\d{2}/.exec(t.startDate || '')?.[0] || ''
  const dueText = balance <= 0 ? (net > 0 ? 'Paid' : 'No balance due')
    : start && start > ymdIn(now) ? `Before ${invoiceDate(start)}`
    : 'Upon receipt'

  return {
    number,
    issuedOn: invoiceDate(src.issuedOn || now),
    dueText,
    org: {
      name: orgName,
      address: String(src.org?.checkAddress || '').trim(),
      email: String(src.org?.contactEmail || '').trim(),
      phone: invoicePhone(src.org?.contactPhone),
      website: String(src.org?.website || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
    },
    billTo: {
      name: reg.clubName,
      attn: String(reg.clubContact || '').trim(),
      place: String(reg.clubBasedIn || '').trim(),
    },
    event: {
      name: t.name,
      dates: eventDates(t.startDate, t.endDate),
      location: String(t.location || '').trim(),
      registeredOn: invoiceDate(reg.createdAt),
    },
    lines,
    itemized,
    invoiced,
    discount,
    discountNote: String(reg.discountNote || '').trim(),
    payments,
    clearing,
    balance,
    payTo: {
      checkPayableTo: String(src.org?.checkPayableTo || '').trim() || orgName,
      checkAddress: String(src.org?.checkAddress || '').trim(),
      zelleHandle: String(src.org?.zelleHandle || '').trim(),
    },
    payUrl: src.payUrl,
    memo: `${number}, ${reg.clubName}`,
    logo: src.logo || null,
  }
}

// Letters that NFKD can't take apart (a stroke is not an accent), then dashes and
// primes from pasted text.
const SWAPS: Record<string, string> = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', ' ': ' ', '‐': '-', '‑': '-', '−': '-', '′': "'", '″': '"' }

export async function buildInvoicePdf(inv: InvoiceDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Invoice ${inv.number}`)
  doc.setAuthor(inv.org.name)
  doc.setSubject(`${inv.event.name} - ${inv.billTo.name}`)
  doc.setCreator('Whistle Ready')
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ok = new Set(regular.getCharacterSet())
  const clean = (s: unknown): string => {
    let out = ''
    for (const ch of String(s ?? '').replace(/[\r\n\t]+/g, ' ')) {
      const code = ch.codePointAt(0) || 0
      if (ok.has(code)) { out += ch; continue }
      const swap = SWAPS[ch] ?? ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      out += swap && [...swap].every(c => ok.has(c.codePointAt(0) || 0)) ? swap : '?'
    }
    return out.trim()
  }

  let page: PDFPage = doc.addPage([W, H])
  let y = H - M

  const draw = (s: string, x: number, yy: number, o: { font?: PDFFont; size?: number; color?: RGB } = {}) =>
    page.drawText(clean(s), { x, y: yy, font: o.font || regular, size: o.size || 10, color: o.color || INK })
  const width = (s: string, font: PDFFont, size: number) => font.widthOfTextAtSize(clean(s), size)
  const drawRight = (s: string, xRight: number, yy: number, o: { font?: PDFFont; size?: number; color?: RGB } = {}) =>
    draw(s, xRight - width(s, o.font || regular, o.size || 10), yy, o)
  const wrap = (s: string, font: PDFFont, size: number, max: number): string[] => {
    const words = clean(s).split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(next, size) <= max || !cur) cur = next
      else { lines.push(cur); cur = w }
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : ['']
  }
  const link = (x: number, yy: number, w: number, h: number, url: string) => {
    const ctx = doc.context
    const annot = ctx.register(ctx.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x, yy, x + w, yy + h], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }))
    page.node.addAnnot(annot)
  }
  const rule = (yy: number, color = RULE, x1 = M, x2 = W - M) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.75, color })
  // A new page when the next block won't fit above the footer.
  const room = (h: number) => {
    if (y - h >= M + 28) return
    page = doc.addPage([W, H])
    y = H - M
    draw(`Invoice ${inv.number} (continued)`, M, y - 10, { font: bold, size: 10, color: MUTED })
    y -= 30
  }

  // ── Letterhead ───────────────────────────────────────────────────────────
  let logoBottom = y
  if (inv.logo) {
    try {
      const img = inv.logo.kind === 'png' ? await doc.embedPng(inv.logo.bytes) : await doc.embedJpg(inv.logo.bytes)
      const s = Math.min(150 / img.width, 56 / img.height, 1)
      const w = img.width * s, h = img.height * s
      page.drawImage(img, { x: W - M - w, y: y - h, width: w, height: h })
      logoBottom = y - h
    } catch { /* a logo that won't embed is left off, never fails the invoice */ }
  }
  draw(inv.org.name, M, y - 16, { font: bold, size: 17 })
  let ly = y - 32
  for (const line of wrap(inv.org.address, regular, 9.5, 300)) { draw(line, M, ly, { size: 9.5, color: MUTED }); ly -= 12.5 }
  const reach = [inv.org.email, inv.org.phone].filter(Boolean).join('  ·  ')
  if (reach) { draw(reach, M, ly, { size: 9.5, color: MUTED }); ly -= 12.5 }
  if (inv.org.website) { draw(inv.org.website, M, ly, { size: 9.5, color: MUTED }); ly -= 12.5 }
  y = Math.min(ly, logoBottom) - 12
  page.drawRectangle({ x: M, y: y - 2, width: W - 2 * M, height: 2, color: TEAL })
  y -= 34

  // ── Title and the numbers an accounting office files by ──────────────────
  draw('INVOICE', M, y - 4, { font: bold, size: 26, color: TEAL })
  const facts: [string, string][] = [['Invoice #', inv.number], ['Invoice date', inv.issuedOn], [inv.balance > 0 ? 'Payment due' : 'Status', inv.dueText]]
  let fy = y + 12
  for (const [k, v] of facts) {
    drawRight(v, W - M, fy, { font: bold, size: 10 })
    drawRight(k, W - M - Math.max(150, width(v, bold, 10) + 14), fy, { size: 9, color: MUTED })
    fy -= 15
  }
  y = Math.min(y - 20, fy) - 18

  // ── Bill to, and the event ───────────────────────────────────────────────
  const col2 = M + 270
  const eyebrow = (s: string, x: number, yy: number) => draw(s.toUpperCase(), x, yy, { font: bold, size: 8, color: FAINT })
  eyebrow('Bill to', M, y)
  eyebrow('Event', col2, y)
  let by = y - 16, ey = y - 16
  for (const line of wrap(inv.billTo.name, bold, 12, 250)) { draw(line, M, by, { font: bold, size: 12 }); by -= 15 }
  if (inv.billTo.attn) { draw(`Attn: ${inv.billTo.attn}`, M, by, { size: 10, color: MUTED }); by -= 13 }
  if (inv.billTo.place) { draw(inv.billTo.place, M, by, { size: 10, color: MUTED }); by -= 13 }
  for (const line of wrap(inv.event.name, bold, 12, W - M - col2)) { draw(line, col2, ey, { font: bold, size: 12 }); ey -= 15 }
  for (const line of [inv.event.dates, inv.event.location, inv.event.registeredOn ? `Registered ${inv.event.registeredOn}` : ''].filter(Boolean)) {
    draw(line, col2, ey, { size: 10, color: MUTED }); ey -= 13
  }
  y = Math.min(by, ey) - 20

  // ── Line items ───────────────────────────────────────────────────────────
  const xDiv = M + 250, xAmt = W - M - 8
  const head = () => {
    page.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: SHADE })
    draw('DESCRIPTION', M + 8, y - 13.5, { font: bold, size: 8, color: MUTED })
    draw('DIVISION', xDiv, y - 13.5, { font: bold, size: 8, color: MUTED })
    drawRight('AMOUNT', xAmt, y - 13.5, { font: bold, size: 8, color: MUTED })
    y -= 20
  }
  room(60)
  head()
  for (const l of inv.lines) {
    const dLines = wrap(l.description, regular, 10, xDiv - M - 20)
    const vLines = wrap(l.detail, regular, 9.5, xAmt - xDiv - 80)
    const h = Math.max(dLines.length, vLines.length) * 13 + (l.note ? 12 : 0) + 12
    if (y - h < M + 28) { room(h + 40); head() }
    let ry = y - 15
    dLines.forEach((t, i) => draw(t, M + 8, ry - i * 13, { size: 10 }))
    vLines.forEach((t, i) => draw(t, xDiv, ry - i * 13, { size: 9.5, color: MUTED }))
    if (l.amount !== null) drawRight(money(l.amount), xAmt, ry, { size: 10 })
    if (l.note) draw(l.note, M + 8, ry - Math.max(dLines.length, vLines.length) * 13 + 1, { size: 8.5, color: FAINT })
    y -= h
    rule(y)
  }
  if (!inv.itemized) {
    room(30)
    draw(inv.lines.length ? `Team registration fees (${inv.lines.length} team${inv.lines.length === 1 ? '' : 's'})` : 'Tournament registration', M + 8, y - 15, { font: bold, size: 10 })
    drawRight(money(inv.invoiced), xAmt, y - 15, { font: bold, size: 10 })
    y -= 27
    rule(y)
  }
  y -= 14

  // ── Totals ───────────────────────────────────────────────────────────────
  const totals: [string, string, boolean?][] = []
  const net = inv.invoiced - inv.discount
  if (inv.discount > 0) {
    totals.push(['Subtotal', money(inv.invoiced)])
    totals.push([`Discount${inv.discountNote ? ` (${inv.discountNote})` : ''}`, money(-inv.discount)])
  }
  totals.push(['Total', money(net)])
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
  if (paid > 0) totals.push(['Payments received', money(-paid)])
  if (inv.clearing) totals.push([`Bank transfer clearing (sent ${inv.clearing.startedOn})`, money(-inv.clearing.amount)])
  room(totals.length * 16 + 40)
  const xLab = W - M - 260
  for (const [k, v] of totals) {
    const kl = wrap(k, regular, 10, 170)
    kl.forEach((t, i) => draw(t, xLab, y - i * 12, { size: 10, color: MUTED }))
    drawRight(v, xAmt, y, { size: 10 })
    y -= 4 + kl.length * 12
  }
  y -= 4
  rule(y + 2, INK, xLab, W - M)
  y -= 16
  draw('Balance due', xLab, y, { font: bold, size: 12 })
  drawRight(money(inv.balance), xAmt, y, { font: bold, size: 13, color: inv.balance > 0 ? INK : GREEN })
  if (inv.balance <= 0 && net > 0) draw(inv.clearing ? 'PAID - TRANSFER CLEARING' : 'PAID IN FULL', M, y, { font: bold, size: 14, color: GREEN })
  y -= 28

  // ── Payments received ────────────────────────────────────────────────────
  if (inv.payments.length) {
    room(26 + inv.payments.length * 14)
    eyebrow('Payments received', M, y)
    y -= 15
    for (const p of inv.payments) {
      room(14)
      draw(p.date, M, y, { size: 9.5, color: MUTED })
      draw(p.method, M + 110, y, { size: 9.5, color: MUTED })
      drawRight(money(p.amount), M + 340, y, { size: 9.5, color: MUTED })
      y -= 14
    }
    y -= 12
  }

  // ── How to pay ───────────────────────────────────────────────────────────
  if (inv.balance > 0) {
    const ways: { label: string; text: string; url?: string }[] = []
    if (inv.payTo.checkPayableTo || inv.payTo.checkAddress) {
      ways.push({
        label: 'By check',
        text: `Payable to ${inv.payTo.checkPayableTo || inv.org.name}${inv.payTo.checkAddress ? `, mailed to ${inv.payTo.checkAddress}` : ''}. `
          + `Please write "${inv.memo}" on the memo line.`,
      })
    }
    if (inv.payUrl) ways.push({ label: 'Online', text: `Bank transfer (no fee) or card (3% fee): ${inv.payUrl}`, url: inv.payUrl })
    if (inv.payTo.zelleHandle) ways.push({ label: 'Zelle', text: `Send to ${inv.payTo.zelleHandle} with "${inv.billTo.name}" in the memo.` })
    const blocks = ways.map(w => ({ ...w, lines: wrap(w.text, regular, 9.5, W - 2 * M - 100) }))
    const h = 34 + blocks.reduce((s, b) => s + b.lines.length * 12.5 + 7, 0)
    room(h + 10)
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: SHADE, borderColor: RULE, borderWidth: 0.75 })
    draw('How to pay', M + 14, y - 20, { font: bold, size: 11 })
    let py = y - 38
    for (const b of blocks) {
      draw(b.label, M + 14, py, { font: bold, size: 9.5 })
      b.lines.forEach((t, i) => {
        draw(t, M + 86, py - i * 12.5, { size: 9.5, color: b.url && t.includes(b.url.slice(0, 12)) ? TEAL : INK })
      })
      if (b.url) link(M + 86, py - (b.lines.length - 1) * 12.5 - 3, W - 2 * M - 100, b.lines.length * 12.5 + 2, b.url)
      py -= b.lines.length * 12.5 + 7
    }
    y -= h + 22
  }

  // ── Questions ────────────────────────────────────────────────────────────
  const ask = [inv.org.email, inv.org.phone].filter(Boolean).join(' or ')
  const closing = `${ask ? `Questions about this invoice? Contact ${ask}. ` : ''}A W-9 is available on request. Thank you for being part of ${inv.event.name}!`
  const cl = wrap(closing, regular, 9.5, W - 2 * M)
  room(cl.length * 12.5 + 6)
  cl.forEach((t, i) => draw(t, M, y - i * 12.5, { size: 9.5, color: MUTED }))

  // Page footers, now that the page count is known.
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    page = p
    rule(M + 14)
    draw(`${inv.org.name}  ·  Invoice ${inv.number}  ·  ${inv.billTo.name}`, M, M, { size: 8, color: FAINT })
    drawRight(`Page ${i + 1} of ${pages.length}`, W - M, M, { size: 8, color: FAINT })
  })
  return doc.save()
}
