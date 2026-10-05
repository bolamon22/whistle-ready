import { NextResponse } from 'next/server'
import { requireMoney } from '@/lib/apiAuth'
import { signState } from '@/lib/qboState'

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID || ''
// The address QuickBooks sends the login back to. It has to match a redirect URI
// registered on the Intuit app exactly. It used NEXTAUTH_URL, which still says
// gameday-staff5.vercel.app, so the login came back to the old domain where nobody
// is signed in (Oct 5 2026). Register https://whistleready.app/api/oauth/quickbooks/callback
// on the app's production keys; QBO_REDIRECT_BASE overrides it if ever needed.
const APP_URL = (process.env.QBO_REDIRECT_BASE || 'https://whistleready.app').replace(/\/+$/, '')
const REDIRECT_URI = `${APP_URL}/api/oauth/quickbooks/callback`
// Accounting only: the sync writes customers, invoices and payments, which is all
// Whistle Ready does in QuickBooks. It used to ask for QuickBooks Payments too, for
// a Record payment option that charged a club's bank account through QuickBooks;
// that never worked (the app had only development keys) and was removed Oct 5 2026,
// so the production review is for an accounting app, and SEG's books grant no more
// than the sync needs. openid/profile/email were never read either.
const SCOPE = 'com.intuit.quickbooks.accounting'

// Connecting the books is for people who can see money (the QuickBooks panel's
// rule). Signed out, e.g. from QuickBooks' own Connect/Reconnect link: sign in,
// then land on Payment providers, where the Connect button is.
export async function GET() {
  const gate = await requireMoney()
  if (!gate.ok) {
    if (gate.res.status === 401) return NextResponse.redirect(`${APP_URL}/login?callbackUrl=${encodeURIComponent('/admin/payment-providers')}`)
    return gate.res
  }

  if (!QBO_CLIENT_ID) return NextResponse.json({ error: 'QBO_CLIENT_ID not configured' }, { status: 503 })

  const state = signState(gate.userId)
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?` + new URLSearchParams({
    client_id: QBO_CLIENT_ID,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: REDIRECT_URI,
    state,
  })
  return NextResponse.redirect(authUrl)
}
