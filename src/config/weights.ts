import type { Category } from '@/src/engine/types'

// MVP: ki_sichtbarkeit deaktiviert (0). Normalisierung über aktive Kategorien.
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  technik: 35,
  auffindbarkeit: 35,
  content: 30,
  ki_sichtbarkeit: 0,
}
