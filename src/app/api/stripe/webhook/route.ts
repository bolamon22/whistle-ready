import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { notifyPaymentReceived } from '@/lib/paymentNotify'

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null

    // --- Individual player registration ---
    if (session.metadata?.tournamentId) {
      try {
        await prisma.individualRegistration.updateMany({
          where: { stripeSessionId: session.id },
          data: {
            paymentStatus: 'paid',
            ...(paymentIntent ? { stripePaymentIntent: paymentIntent } : {}),
          },
        })
        console.log(`Individual registration paid: session ${session.id}`)
      } catch (e) {
        console.error('Failed to update individual registration:', e)
      }
    }

    // --- Team registration ---
    if (session.metadata?.registrationId) {
      try {
        const reg = await prisma.teamRegistration.findUnique({
          where: { id: session.metadata.registrationId },
        })
        if (reg) {
          const amount = (session.amount_total ?? 0) / 100
          await prisma.registrationPayment.create({
            data: {
              registrationId: reg.id,
              amount,
              method: 'credit_card',
              checkNumber: '',
              receivedAt: new Date().toISOString().split('T')[0],
              notes: `Stripe${paymentIntent ? ` · ${paymentIntent}` : ''} · session ${session.id}`,
            },
          })
          console.log(`Team registration payment recorded: ${reg.id}, $${amount}`)
          await notifyPaymentReceived({ registrationId: reg.id, amount, method: 'credit_card', via: 'Stripe webhook' })
        }
      } catch (e) {
        console.error('Failed to create team payment record:', e)
      }
    }
  }

  // --- Team registration paid via PaymentIntent (card or ACH) ---
  // ACH settles days after the customer authorizes, so this webhook is what
  // records those payments. Idempotent with the stripeConfirm PATCH path
  // (both skip when a payment already references this intent id).
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const registrationId = pi.metadata?.registrationId
    if (pi.metadata?.type === 'team_registration' && registrationId) {
      try {
        const existing = await prisma.registrationPayment.findFirst({
          where: { registrationId, notes: { contains: pi.id } },
        })
        if (!existing) {
          const charged = (pi.amount_received ?? pi.amount ?? 0) / 100
          const base = parseFloat(pi.metadata?.baseAmount || '')
          const amount = base > 0 && base <= charged ? base : charged
          // Exact single-type match: our ACH intents carry ONLY us_bank_account.
          // Card intents may LIST us_bank_account among the account defaults, so
          // includes() would mislabel card payments as ACH (bug found Aug 27).
          const isAch = (pi.payment_method_types || []).join(',') === 'us_bank_account'
          await prisma.registrationPayment.create({
            data: {
              registrationId,
              amount,
              method: isAch ? 'ach' : 'credit_card',
              checkNumber: '',
              receivedAt: new Date().toISOString().split('T')[0],
              notes: `Stripe · ${pi.id}${amount < charged ? ` · incl. $${(charged - amount).toFixed(2)} card fee (charged $${charged.toFixed(2)})` : ''} · via webhook`,
            },
          })
          console.log(`Team registration payment recorded via webhook: ${registrationId}, $${amount}`)
          await notifyPaymentReceived({ registrationId, amount, method: isAch ? 'ach' : 'credit_card', charged, via: 'Stripe webhook' })
        }
      } catch (e) {
        console.error('Failed to record webhook payment:', e)
      }
    }
  }

  return NextResponse.json({ received: true })
}
