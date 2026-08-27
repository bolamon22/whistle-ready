import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const PROCESSING_FEE_PCT = 0.029
const PROCESSING_FEE_FIXED = 0.30

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return NextResponse.json({ error: 'Stripe publishable key not configured — add STRIPE_PUBLISHABLE_KEY to Vercel env vars' }, { status: 503 })
  }
  if (!(process.env.STRIPE_PUBLISHABLE_KEY || '').startsWith('pk_')) {
    return NextResponse.json({ error: 'STRIPE_PUBLISHABLE_KEY is not a publishable key — it must start with pk_. Copy the "Publishable key" from Stripe → Developers → API keys into Vercel env vars.' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const { regData, tierId, tierName, tierAmount } = body

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } })
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

    const processingFee = Math.round((tierAmount * PROCESSING_FEE_PCT + PROCESSING_FEE_FIXED) * 100) / 100
    const totalCents = Math.round((tierAmount + processingFee) * 100)

    const stripeHeaders: Record<string, string> = {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    }
    if (process.env.STRIPE_ACCOUNT_ID) {
      stripeHeaders['Stripe-Context'] = process.env.STRIPE_ACCOUNT_ID
    }

    const formData = new URLSearchParams()
    formData.append('amount', String(totalCents))
    formData.append('currency', 'usd')
    formData.append('receipt_email', regData.email)
    formData.append('description', `${tournament.name} — ${tierName}`)
    formData.append('metadata[tournamentId]', params.id)
    formData.append('metadata[playerName]', `${regData.firstName} ${regData.lastName}`)
    formData.append('metadata[tierId]', tierId)
    formData.append('metadata[type]', 'individual_registration')

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: stripeHeaders,
      body: formData.toString(),
    })

    const paymentIntent = await stripeRes.json()
    if (!stripeRes.ok) {
      throw new Error(paymentIntent?.error?.message || 'Failed to create PaymentIntent')
    }

    const registration = await prisma.individualRegistration.create({
      data: {
        tournamentId: params.id,
        firstName: regData.firstName,
        lastName: regData.lastName,
        email: regData.email,
        phone: regData.phone || '',
        position: regData.position,
        numberRequest: regData.numberRequest || '',
        jerseySize: regData.jerseySize,
        shortsSize: regData.shortsSize,
        usLacrosseNumber: regData.usLacrosseNumber || '',
        dateOfBirth: regData.dateOfBirth || '',
        guardianName: regData.guardianName || '',
        guardianPhone: regData.guardianPhone || '',
        guardianEmail: regData.guardianEmail || '',
        emergencyContactName: regData.emergencyContactName || '',
        emergencyContactPhone: regData.emergencyContactPhone || '',
        emergencyRelationship: regData.emergencyRelationship || '',
        medicalNotes: regData.medicalNotes || '',
        waiverSigned: Boolean(regData.waiverSigned),
        waiverSignature: regData.waiverSignature || '',
        feeTierId: tierId,
        feeTierName: tierName,
        feeTierAmount: Number(tierAmount),
        paymentStatus: 'pending',
        stripeSessionId: paymentIntent.id,
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      accountId: process.env.STRIPE_ACCOUNT_ID || '',
      registrationId: registration.id,
    })
  } catch (err: any) {
    console.error('Create intent error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to create payment' }, { status: 500 })
  }
}
