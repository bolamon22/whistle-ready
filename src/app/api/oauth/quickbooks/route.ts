import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID || ''
const APP_URL = process.env.NEXTAUTH_URL || 'https://whistleready.app'
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
