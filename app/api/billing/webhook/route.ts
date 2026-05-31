import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/src/billing/stripe'
import { planForPriceId } from '@/src/billing/config'
import { effectivePlan, monitorLimit, monitorsToDeactivate, type Plan } from '@/src/billing/plans'
import {
  getSubscriptionByCustomerId,
  upsertSubscription,
  getMonitorsForAccount,
  deactivateMonitors,
} from '@/src/db/repo'

export const runtime = 'nodejs'

function periodEnd(sub: Stripe.Subscription): Date | null {
  const cpe = (sub as unknown as { current_period_end?: number }).current_period_end
  return cpe ? new Date(cpe * 1000) : null
}

function planFromSubscription(sub: Stripe.Subscription): Plan | null {
  const priceId = sub.items.data[0]?.price?.id
  return priceId ? planForPriceId(priceId) : null
}

async function enforceLimit(accountId: number, plan: Plan, status: string): Promise<void> {
  const eff = effectivePlan({ plan, status })
  const limit = monitorLimit(eff)
  const list = await getMonitorsForAccount(accountId)
  const active = list.filter((m) => m.active)
  await deactivateMonitors(monitorsToDeactivate(active, limit))
}

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) return NextResponse.json({ error: 'Billing nicht konfiguriert' }, { status: 503 })

  const raw = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (e) {
    console.error('Webhook-Signatur ungültig:', e)
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const cs = event.data.object as Stripe.Checkout.Session
      const accountId = Number(cs.client_reference_id)
      const subId = typeof cs.subscription === 'string' ? cs.subscription : cs.subscription?.id
      const customerId = typeof cs.customer === 'string' ? cs.customer : cs.customer?.id
      if (accountId && subId && customerId) {
        const sub = await stripe.subscriptions.retrieve(subId)
        const plan = planFromSubscription(sub)
        if (plan) {
          await upsertSubscription(accountId, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: sub.id,
            plan,
            status: sub.status,
            currentPeriodEnd: periodEnd(sub),
          })
        }
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const row = await getSubscriptionByCustomerId(customerId)
      if (row) {
        const plan = (planFromSubscription(sub) ?? (row.plan as Plan))
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status
        await upsertSubscription(row.accountId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          plan,
          status,
          currentPeriodEnd: periodEnd(sub),
        })
        await enforceLimit(row.accountId, plan, status)
      }
    }
  } catch (e) {
    console.error('Webhook-Verarbeitung fehlgeschlagen:', e)
    return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
