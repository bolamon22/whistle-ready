import { NextRequest, NextResponse } from 'next/server'
import { loadVendorInvoice } from '@/lib/vendorInvoiceStore'
import { buildInvoicePdf, invoiceFileName } from '@/lib/invoicePdf'
import { allowRequest, clientIp, rateLimitedResponse } from '@/lib/rateLimit'

// A VENDOR'S INVOICE AS A PDF (lib/vendorInvoice): the booth fee as approved,
// payments so far, and how to pay by check, Zelle or on the booth page.
//
// Public, like the booth page (/vendor/<token>) and its checkout: the
// unguessable token IS the authorization, and it only ever goes to the address
// on the application. The PDF carries what an accounting office needs (the
// company, its contact's name, the booth, amounts, where to send a check) and
// no email address or phone number of anyone at the vendor.
//
// The office's Email invoice (api/tournaments/[id]/vendor-requests/invoice)
// attaches the same document.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WINDOW = 60_000

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!allowRequest(`vendor-invoice:${clientIp(req)}`, 30, WINDOW)) return rateLimitedResponse(WINDOW)
  try {
    const inv = await loadVendorInvoice(params.token)
    if (!inv) return NextResponse.json({ error: 'There is no invoice for this booth yet' }, { status: 404 })
    const pdf = await buildInvoicePdf(inv.doc)
    const name = invoiceFileName(inv.doc)
    // ?view=1 opens it in the browser (the office's preview); otherwise it downloads.
    const how = req.nextUrl.searchParams.get('view') ? 'inline' : 'attachment'
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${how}; filename="${name.replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    })
  } catch (e) {
    console.error('[vendor invoice] PDF failed:', e)
    return NextResponse.json({ error: 'Could not make the invoice' }, { status: 500 })
  }
}
