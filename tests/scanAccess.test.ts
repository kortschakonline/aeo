import { describe, it, expect } from 'vitest'
import { canAccessScan, ANON_SCAN_TTL_MS } from '@/src/auth/scanAccess'

const now = 1_000_000_000_000
const fresh = new Date(now - 60_000) // vor 1 Minute
const old = new Date(now - ANON_SCAN_TTL_MS - 1) // knapp außerhalb des Fensters

describe('canAccessScan', () => {
  it('erlaubt dem Eigentümer Zugriff auf seinen Account-Scan', () => {
    expect(canAccessScan({ accountId: 7, createdAt: old }, { accountId: 7 }, { now })).toBe(true)
  })

  it('verweigert einem fremden Account den Zugriff auf einen Account-Scan', () => {
    expect(canAccessScan({ accountId: 7, createdAt: fresh }, { accountId: 8 }, { now })).toBe(false)
  })

  it('verweigert anonymen Aufrufern den Zugriff auf einen Account-Scan', () => {
    expect(canAccessScan({ accountId: 7, createdAt: fresh }, null, { now })).toBe(false)
  })

  it('erlaubt anonymen Zugriff auf einen frischen anonymen Scan', () => {
    expect(canAccessScan({ accountId: null, createdAt: fresh }, null, { now })).toBe(true)
  })

  it('verweigert anonymen Zugriff auf einen alten anonymen Scan', () => {
    expect(canAccessScan({ accountId: null, createdAt: old }, null, { now })).toBe(false)
  })

  it('erlaubt eingeloggten Nutzern Zugriff auf einen frischen anonymen Scan', () => {
    expect(canAccessScan({ accountId: null, createdAt: fresh }, { accountId: 8 }, { now })).toBe(true)
  })
})
