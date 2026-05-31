import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '@/src/auth/rateLimit'

describe('createRateLimiter', () => {
  it('erlaubt bis zum Limit und blockt danach', () => {
    const t = 1000
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })

  it('setzt nach Ablauf des Fensters zurück', () => {
    let t = 1000
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => t })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
    t = 2001
    expect(limiter.allow('a')).toBe(true)
  })

  it('trennt Schlüssel', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('b')).toBe(true)
  })
})
