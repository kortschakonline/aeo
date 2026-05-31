import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/src/auth/session'
import { getStripe } from '@/src/billing/stripe'
import { getSubscription } from '@/src/db/repo'
import { baseUrl } from '@/src/http/base-url'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'Billing nicht konfiguriert' }, { status: 503 })

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const sub = await getSubscription(session.accountId)
  if (!sub) return NextResponse.json({ error: 'Kein Abo vorhanden' }, { status: 400 })

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${baseUrl(req)}/dashboard`,
    })
    return NextResponse.json({ url: portal.url })
  } catch (e) {
    console.error('Portal fehlgeschlagen:', e)
    return NextResponse.json({ error: 'Portal fehlgeschlagen' }, { status: 502 })
  }
}
