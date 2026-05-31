import { describe, it, expect } from 'vitest'
import { isDue, scoreChange, canEnable } from '@/src/monitoring/logic'

const NOW = new Date('2026-06-01T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

describe('isDue', () => {
  it('noch nie gelaufen → fällig', () => {
    expect(isDue({ active: true, lastRunAt: null }, NOW)).toBe(true)
  })
  it('frisch gelaufen (<7 Tage) → nicht fällig', () => {
    expect(isDue({ active: true, lastRunAt: daysAgo(3) }, NOW)).toBe(false)
  })
  it('überfällig (>7 Tage) → fällig', () => {
    expect(isDue({ active: true, lastRunAt: daysAgo(8) }, NOW)).toBe(true)
  })
  it('inaktiv → nie fällig', () => {
    expect(isDue({ active: false, lastRunAt: null }, NOW)).toBe(false)
  })
})

describe('scoreChange', () => {
  it('Baseline (oldScore null) → keine Änderung', () => {
    expect(scoreChange(null, 80)).toEqual({ changed: false, direction: 'none' })
  })
  it('gleich → keine Änderung', () => {
    expect(scoreChange(80, 80)).toEqual({ changed: false, direction: 'none' })
  })
  it('gestiegen → changed up', () => {
    expect(scoreChange(70, 80)).toEqual({ changed: true, direction: 'up' })
  })
  it('gefallen → changed down', () => {
    expect(scoreChange(80, 70)).toEqual({ changed: true, direction: 'down' })
  })
})

describe('canEnable', () => {
  it('unter Limit → erlaubt', () => {
    expect(canEnable(2, 3, false)).toBe(true)
  })
  it('am Limit & neu → verboten', () => {
    expect(canEnable(3, 3, false)).toBe(false)
  })
  it('am Limit & bereits aktiv → erlaubt (Idempotenz)', () => {
    expect(canEnable(3, 3, true)).toBe(true)
  })
})
