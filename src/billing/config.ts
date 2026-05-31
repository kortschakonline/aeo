import type { Plan } from '@/src/billing/plans'

type PriceEnv = { STRIPE_PRICE_KLEIN?: string; STRIPE_PRICE_GROSS?: string }

export function planForPriceId(priceId: string, env: PriceEnv = process.env as PriceEnv): Plan | null {
  if (priceId && priceId === env.STRIPE_PRICE_KLEIN) return 'klein'
  if (priceId && priceId === env.STRIPE_PRICE_GROSS) return 'gross'
  return null
}

export function priceIdForPlan(plan: 'klein' | 'gross', env: PriceEnv = process.env as PriceEnv): string | undefined {
  return plan === 'klein' ? env.STRIPE_PRICE_KLEIN : env.STRIPE_PRICE_GROSS
}
