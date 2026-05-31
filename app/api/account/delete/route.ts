import { NextResponse } from 'next/server'
import { getSession, destroySession } from '@/src/auth/session'
import { deleteAccount, getSubscription } from '@/src/db/repo'
import { getStripe } from '@/src/billing/stripe'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const stripe = getStripe()
  if (stripe) {
    try {
      const sub = await getSubscription(session.accountId)
      if (sub?.stripeSubscriptionId) await stripe.subscriptions.cancel(sub.stripeSubscriptionId)
    } catch (e) {
      console.error('Stripe-Kündigung bei Account-Löschung fehlgeschlagen:', e)
    }
  }

  await deleteAccount(session.accountId, session.email)
  await destroySession()
  return NextResponse.json({ ok: true })
}
