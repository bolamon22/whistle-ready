import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID || ''
// The address QuickBooks sends the login back to. It has to match a redirect URI
// registered on the Intuit app exactly. It used NEXTAUTH_URL, which still says
// gameday-staff5.vercel.app, so the login came back to the old domain where nobody
// is signed in (Oct 5 2026). Register https://whistleready.app/api/oauth/quickbooks/callback
// on the app's production keys; QBO_REDIRECT_BASE overrides it if ever needed.
const APP_URL = (process.env.QBO_REDIRECT_BASE || 'https://whistleready.app').replace(/\/+$/, '')
const REDIRECT_URI = `${APP_URL}/api/oauth/quickbooks/callback`
const SCOPE = 'com.intuit.quickbooks.payment com.intuit.quickbooks.accounting openid profile email'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!QBO_CLIENT_ID) return NextResponse.json({ error: 'QBO_CLIENT_ID not configured' }, { status: 503 })

  const state = Buffer.from(JSON.stringify({ userId: (session.user as any).id, ts: Date.now() })).toString('base64')
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?` + new URLSearchParams({
    client_id: QBO_CLIENT_ID,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: REDIRECT_URI,
    state,
  })
  return NextResponse.redirect(authUrl)
}
