import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    // For Stripe Organization keys (sk_org_live_...) every call needs Stripe-Context: acct_xxx
    const stripeOpts = process.env.STRIPE_ACCOUNT_ID
      ? { headers: { 'Stripe-Context': process.env.STRIPE_ACCOUNT_ID } }
      : {}
    const body = await req.json()
    const { regData, tierId, tierName, tierAmount } = body

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } })
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

    const appUrl = process.env.NEXTAUTH_URL || 'https://gameday-staff5.vercel.app'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${tournament.name} — ${tierName}`,
            description: `Player registration: ${regData.firstName} ${regData.lastName}`,
          },
          unit_amount: Math.round(tierAmount * 100),
        },
        quantity: 1,
      }],
      customer_email: regData.email,
      metadata: {
        tournamentId: params.id,
        playerName: `${regData.firstName} ${regData.lastName}`,
        tierId,
      },
      success_url: `${appUrl}/tournaments/${params.id}/individual-register?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/tournaments/${params.id}/individual-register?cancelled=1`,
    }, stripeOpts)

    // Save registration with pending status
    await prisma.individualRegistration.create({
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
        stripeSessionId: session.id,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Checkout error:', err)
    return NextResponse.json(
      { error: err?.message || 'Checkout failed' },
      { status: 500 }
    )
  }
}
