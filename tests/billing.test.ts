import { describe, it, expect } from 'vitest'
import { effectivePlan, monitorLimit, monitorsToDeactivate } from '@/src/billing/plans'
import { planForPriceId, priceIdForPlan } from '@/src/billing/config'

describe('effectivePlan', () => {
  it('kein Sub → free', () => {
    expect(effectivePlan(null)).toBe('free')
  })
  it('active → plan', () => {
    expect(effectivePlan({ plan: 'gross', status: 'active' })).toBe('gross')
    expect(effectivePlan({ plan: 'klein', status: 'trialing' })).toBe('klein')
  })
  it('nicht-aktiver Status → free', () => {
    expect(effectivePlan({ plan: 'gross', status: 'canceled' })).toBe('free')
    expect(effectivePlan({ plan: 'gross', status: 'past_due' })).toBe('free')
    expect(effectivePlan({ plan: 'klein', status: 'incomplete' })).toBe('free')
  })
})

describe('monitorLimit', () => {
  it('je Plan', () => {
    expect(monitorLimit('free')).toBe(0)
    expect(monitorLimit('klein')).toBe(1)
    expect(monitorLimit('gross')).toBe(10)
  })
})

describe('monitorsToDeactivate', () => {
  const mk = (id: number, day: number) => ({ id, createdAt: new Date(2026, 0, day) })
  it('behält die ältesten `limit`, gibt Rest-IDs zurück', () => {
    const ms = [mk(1, 1), mk(2, 2), mk(3, 3)]
    expect(monitorsToDeactivate(ms, 1)).toEqual([2, 3])
  })
  it('limit 0 → alle', () => {
    expect(monitorsToDeactivate([mk(1, 1), mk(2, 2)], 0)).toEqual([1, 2])
  })
  it('unter Limit → leer', () => {
    expect(monitorsToDeactivate([mk(1, 1)], 10)).toEqual([])
  })
})

describe('config price mapping', () => {
  const env = { STRIPE_PRICE_KLEIN: 'price_k', STRIPE_PRICE_GROSS: 'price_g' }
  it('planForPriceId', () => {
    expect(planForPriceId('price_k', env)).toBe('klein')
    expect(planForPriceId('price_g', env)).toBe('gross')
    expect(planForPriceId('price_x', env)).toBeNull()
  })
  it('priceIdForPlan', () => {
    expect(priceIdForPlan('klein', env)).toBe('price_k')
    expect(priceIdForPlan('gross', env)).toBe('price_g')
  })
})
