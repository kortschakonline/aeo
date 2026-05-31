import { describe, it, expect } from 'vitest'
import {
  generateToken, hashToken, isExpired, loginTokenExpiry, sessionExpiry,
} from '@/src/auth/tokens'

describe('tokens', () => {
  it('hashToken ist deterministisch und liefert 64 Hex-Zeichen', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })

  it('generateToken liefert Token + passenden Hash, Tokens sind eindeutig', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a.tokenHash).toBe(hashToken(a.token))
    expect(a.token).not.toBe(b.token)
    expect(a.token.length).toBeGreaterThan(20)
  })

  it('loginTokenExpiry liegt 15 Minuten in der Zukunft', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(loginTokenExpiry(now).getTime()).toBe(now.getTime() + 15 * 60 * 1000)
  })

  it('sessionExpiry liegt 30 Tage in der Zukunft', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(sessionExpiry(now).getTime()).toBe(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  })

  it('isExpired vergleicht korrekt', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(isExpired(new Date('2025-12-31T23:59:59Z'), now)).toBe(true)
    expect(isExpired(new Date('2026-01-01T00:00:01Z'), now)).toBe(false)
  })
})
