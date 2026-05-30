import type { CheckResult, ScanResult, Category, CategoryScore } from '@/src/engine/types'
import { CATEGORY_WEIGHTS } from '@/src/config/weights'

export function scoreScan(url: string, domain: string, checks: CheckResult[]): ScanResult {
  const cats: Category[] = ['technik', 'auffindbarkeit', 'content', 'ki_sichtbarkeit']
  const categories: CategoryScore[] = cats.map(category => {
    const inCat = checks.filter(c => c.category === category)
    const avg = inCat.length ? inCat.reduce((s, c) => s + c.score, 0) / inCat.length : 0
    return { category, score: Math.round(avg * 100) }
  })

  let weightSum = 0, acc = 0
  for (const cs of categories) {
    const w = CATEGORY_WEIGHTS[cs.category]
    if (w <= 0) continue
    weightSum += w
    acc += cs.score * w
  }
  const total = weightSum ? Math.round(acc / weightSum) : 0
  return { url, domain, total, categories, checks }
}
