import { describe, it, expect } from 'vitest'
import { isAdminEmail, isCompEmail } from '@/src/billing/access'
import { resolvePlan } from '@/src/billing/plans'

const env = { ADMIN_EMAILS: 'boss@kortschak.online', COMP_EMAILS: 'kollege@kortschak.online, zwei@x.at' }

describe('isAdminEmail', () => {
  it('Treffer case-insensitive + getrimmt', () => {
    expect(isAdminEmail('boss@kortschak.online', env)).toBe(true)
    expect(isAdminEmail('BOSS@kortschak.online', env)).toBe(true)
  })
  it('kein Treffer / leere Env', () => {
    expect(isAdminEmail('x@y.at', env)).toBe(false)
    expect(isAdminEmail('x@y.at', {})).toBe(false)
  })
})

describe('isCompEmail', () => {
  it('Treffer in COMP', () => {
    expect(isCompEmail('kollege@kortschak.online', env)).toBe(true)
    expect(isCompEmail('zwei@x.at', env)).toBe(true)
  })
  it('Admin ist automatisch Comp', () => {
    expect(isCompEmail('boss@kortschak.online', env)).toBe(true)
  })
  it('sonst false', () => {
    expect(isCompEmail('fremd@y.at', env)).toBe(false)
  })
})

describe('resolvePlan', () => {
  it('isComp → gross (auch ohne/abgelaufenes Abo)', () => {
    expect(resolvePlan(null, true)).toBe('gross')
    expect(resolvePlan({ plan: 'klein', status: 'canceled' }, true)).toBe('gross')
  })
  it('nicht comp → effectivePlan', () => {
    expect(resolvePlan({ plan: 'klein', status: 'active' }, false)).toBe('klein')
    expect(resolvePlan(null, false)).toBe('free')
    expect(resolvePlan({ plan: 'gross', status: 'canceled' }, false)).toBe('free')
  })
})
