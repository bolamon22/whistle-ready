import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const { regData, tierId, tierName, tierAmount } = body

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } })
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

    const appUrl = process.env.NEXTAUTH_URL || 'https://gameday-staff5.vercel.app'

    // Use raw fetch to Stripe REST API so we can set Stripe-Context for org keys
    const stripeHeaders: Record<string, string> = {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    }
    if (process.env.STRIPE_ACCOUNT_ID) {
      stripeHeaders['Stripe-Context'] = process.env.STRIPE_ACCOUNT_ID
    }

    const formData = new URLSearchParams()
    formData.append('payment_method_types[]', 'card')
    formData.append('mode', 'payment')
    formData.append('line_items[0][price_data][currency]', 'usd')
    formData.append('line_items[0][price_data][product_data][name]', `${tournament.name} — ${tierName}`)
    formData.append('line_items[0][price_data][product_data][description]', `Player registration: ${regData.firstName} ${regData.lastName}`)
    formData.append('line_items[0][price_data][unit_amount]', String(Math.round(tierAmount * 100)))
    formData.append('line_items[0][quantity]', '1')
    formData.append('customer_email', regData.email)
    formData.append('metadata[tournamentId]', params.id)
    formData.append('metadata[playerName]', `${regData.firstName} ${regData.lastName}`)
    formData.append('metadata[tierId]', tierId)
    formData.append('success_url', `${appUrl}/tournaments/${params.id}/individual-register?success=1&session_id={CHECKOUT_SESSION_ID}`)
    formData.append('cancel_url', `${appUrl}/tournaments/${params.id}/individual-register?cancelled=1`)

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: stripeHeaders,
      body: formData.toString(),
    })

    const session = await stripeRes.json()
    if (!stripeRes.ok) {
      throw new Error(session?.error?.message || 'Stripe checkout failed')
    }

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
