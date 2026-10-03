import { stripeHeaders, isAch } from './stripeReconcile'

// BANK TRANSFERS STILL CLEARING.
//
// An ACH payment takes a few business days to settle. Stripe calls it
// "processing" the whole time, and the app only writes a payment row once it
// succeeds (the webhook, or the reconcile sweep). So between a club clicking
// Pay and the money landing, the registration read as unpaid everywhere: the
// staff card showed the full balance, the club's own portal still offered
// "Pay $2,500", and a payment reminder could have gone out asking for money
// already on its way. Calusa Lacrosse Club, Oct 2 2026: $2,500 sent by bank
// transfer through the pay page, and nothing on their account. Bo, Oct 3:
// "mark it paid but not funded".
//
// Read live from Stripe, never stored. Stripe is the only thing that knows
// whether a transfer is still clearing, failed, or landed, so a copy kept here
// would just be one more thing to go stale. When it succeeds the webhook records
// it and it drops off this list; if the bank rejects it, it drops off too and
// the balance is owed again. Never throws: Stripe being down reads as "nothing
// clearing", which is exactly what every page showed before this existed.

export type Clearing = {
  /** Dollars on their way, the base amount (ACH carries no fee). */
  amount: number
  /** When the earliest of them was started, ISO. */
  startedAt: string
  count: number
}

// ACH settles in about four business days. Three weeks covers a slow one with
// room to spare without paging through months of card payments.
const WINDOW_DAYS = 21

/** Team-registration ACH payments Stripe has accepted but not settled, per
 *  registration id. Pass ids to keep only those registrations. */
export async function clearingTransfers(registrationIds?: string[]): Promise<Record<string, Clearing>> {
  const out: Record<string, Clearing> = {}
  const headers = stripeHeaders()
  if (!headers) return out
  const want = registrationIds ? new Set(registrationIds.filter(Boolean)) : null
  if (want && !want.size) return out
  const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400
  try {
    let startingAfter = ''
    for (let page = 0; page < 5; page++) {
      const url = new URL('https://api.stripe.com/v1/payment_intents')
      url.searchParams.set('limit', '100')
      url.searchParams.set('created[gte]', String(since))
      if (startingAfter) url.searchParams.set('starting_after', startingAfter)
      // no-store: a cached answer would keep showing a transfer that already landed.
      const res = await fetch(url.toString(), { headers, cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) break
      const data: any[] = Array.isArray(body.data) ? body.data : []
      for (const pi of data) {
        if (pi?.status !== 'processing' || !isAch(pi)) continue
        const md = pi.metadata || {}
        if (md.type !== 'team_registration') continue
        const regId = String(md.registrationId || '')
        if (!regId || (want && !want.has(regId))) continue
        const charged = (pi.amount ?? 0) / 100
        const base = parseFloat(md.baseAmount || '')
        const amount = base > 0 && base <= charged ? base : charged
        const startedAt = new Date((pi.created || 0) * 1000).toISOString()
        const cur = out[regId]
        out[regId] = cur
          ? { amount: Math.round((cur.amount + amount) * 100) / 100, startedAt: cur.startedAt < startedAt ? cur.startedAt : startedAt, count: cur.count + 1 }
          : { amount: Math.round(amount * 100) / 100, startedAt, count: 1 }
      }
      if (!body.has_more || !data.length) break
      startingAfter = data[data.length - 1].id
    }
  } catch { /* Stripe unreachable: show nothing clearing */ }
  return out
}
