import { describe, it, expect } from 'vitest'
import { scoreScan } from '@/src/engine/scoring'
import type { CheckResult, Category } from '@/src/engine/types'

const mk = (category: Category, score: number, key: string): CheckResult =>
  ({ key, category, score, label: key, detail: '' })

describe('scoreScan', () => {
  it('alle Checks perfekt → total 100', () => {
    const checks = [mk('technik',1,'a'), mk('auffindbarkeit',1,'b'), mk('content',1,'c')]
    const r = scoreScan('https://x.com/', 'x.com', checks)
    expect(r.total).toBe(100)
  })
  it('deaktivierte Kategorie zählt nicht', () => {
    const checks = [mk('technik',1,'a'), mk('auffindbarkeit',1,'b'), mk('content',1,'c'), mk('ki_sichtbarkeit',0,'d')]
    const r = scoreScan('https://x.com/', 'x.com', checks)
    expect(r.total).toBe(100) // ki_sichtbarkeit (Gewicht 0) ignoriert
  })
  it('Kategorie-Score ist Mittelwert der Checks × 100', () => {
    const checks = [mk('technik',0.5,'a'), mk('technik',1,'b'), mk('auffindbarkeit',1,'c'), mk('content',1,'d')]
    const r = scoreScan('https://x.com/', 'x.com', checks)
    const technik = r.categories.find(c => c.category === 'technik')!
    expect(technik.score).toBe(75)
  })
})
