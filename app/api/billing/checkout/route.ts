import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/src/auth/session'
import { getStripe } from '@/src/billing/stripe'
import { priceIdForPlan } from '@/src/billing/config'
import { getSubscription, upsertSubscription } from '@/src/db/repo'
import { baseUrl } from '@/src/http/base-url'

export const runtime = 'nodejs'

const Body = z.object({ plan: z.enum(['klein', 'gross']) })

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'Billing nicht konfiguriert' }, { status: 503 })

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültiger Plan' }, { status: 400 })
  const { plan } = parsed.data

  const price = priceIdForPlan(plan)
  if (!price) return NextResponse.json({ error: 'Preis nicht konfiguriert' }, { status: 503 })

  try {
    const existing = await getSubscription(session.accountId)
    let customerId: string
    if (existing) {
      // Customer-ID ist bereits persistiert; Plan/Status NICHT anfassen
      // (sonst würde ein Tier-Wechsel vor der Zahlung freischalten — Webhook ist die Wahrheit).
      customerId = existing.stripeCustomerId
    } else {
      customerId = (await stripe.customers.create({ email: session.email })).id
      // Neue Zeile sofort persistieren (schließt Webhook-Reihenfolge-Lücke); 'incomplete' gewährt nichts.
      await upsertSubscription(session.accountId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: null,
        plan,
        status: 'incomplete',
        currentPeriodEnd: null,
      })
    }

    const base = baseUrl(req)
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer: customerId,
      client_reference_id: String(session.accountId),
      success_url: `${base}/dashboard?upgraded=1`,
      cancel_url: `${base}/pricing`,
    })
    return NextResponse.json({ url: checkout.url })
  } catch (e) {
    console.error('Checkout fehlgeschlagen:', e)
    return NextResponse.json({ error: 'Checkout fehlgeschlagen' }, { status: 502 })
  }
}
