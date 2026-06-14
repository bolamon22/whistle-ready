import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encryptConfig } from '@/lib/encrypt'

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID || ''
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET || ''
const APP_URL = process.env.NEXTAUTH_URL || 'https://whistleready.app'
const REDIRECT_URI = `${APP_URL}/api/oauth/quickbooks/callback`

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const realmId = searchParams.get('realmId') // QBO company ID

  if (!code || !state) return NextResponse.redirect(`${APP_URL}/admin/payment-providers?error=qbo_cancelled`)

  let userId = ''
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
    userId = decoded.userId
  } catch {
    return NextResponse.redirect(`${APP_URL}/admin/payment-providers?error=invalid_state`)
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(tokens.error_description || 'Token exchange failed')

    // Get company info
    let companyName = '', email = ''
    try {
      const companyRes = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
        { headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Accept': 'application/json' } }
      )
      const companyData = await companyRes.json()
      companyName = companyData?.CompanyInfo?.CompanyName || ''
      email = companyData?.CompanyInfo?.Email?.Address || ''
    } catch {}

    const config = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiry: String(Date.now() + tokens.expires_in * 1000),
      refreshTokenExpiry: String(Date.now() + tokens.x_refresh_token_expires_in * 1000),
      companyId: realmId || '',
      companyName,
      email,
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await prisma.$executeRawUnsafe(`DELETE FROM OrgPaymentProvider WHERE userId = ? AND provider = 'quickbooks'`, userId)
    await prisma.$executeRawUnsafe(
      `INSERT INTO OrgPaymentProvider (id, userId, provider, enabled, config, mode, createdAt, updatedAt)
       VALUES (?, ?, 'quickbooks', 1, ?, 'live', ?, ?)`,
      id, userId, encryptConfig(config), now, now
    )
    return NextResponse.redirect(`${APP_URL}/admin/payment-providers?success=quickbooks`)
  } catch (err: any) {
    console.error('QBO OAuth error:', err)
    return NextResponse.redirect(`${APP_URL}/admin/payment-providers?error=qbo_failed`)
  }
}
