import { db } from '@/src/db/client'
import { scans, leads } from '@/src/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/src/db/migrate'
import type { ScanResult } from '@/src/engine/types'
import type { AiAnalysis } from '@/src/ai/types'
import type { BrandVisibility } from '@/src/ai/types'

export async function saveScan(r: ScanResult): Promise<number> {
  await ensureSchema()
  const [row] = await db.insert(scans).values({
    url: r.url, domain: r.domain, total: r.total,
    categories: r.categories, checks: r.checks,
    contentExcerpt: r.contentExcerpt ?? '',
  }).returning({ id: scans.id })
  return row.id
}

export async function getScan(id: number) {
  await ensureSchema()
  const [row] = await db.select().from(scans).where(eq(scans.id, id))
  return row ?? null
}

export async function saveLead(scanId: number, email: string): Promise<number> {
  await ensureSchema()
  const [row] = await db.insert(leads).values({ scanId, email }).returning({ id: leads.id })
  return row.id
}

export async function saveAiAnalysis(scanId: number, analysis: AiAnalysis): Promise<void> {
  await ensureSchema()
  await db.update(scans).set({ aiAnalysis: analysis }).where(eq(scans.id, scanId))
}

export async function saveBrandVisibility(scanId: number, data: BrandVisibility): Promise<void> {
  await ensureSchema()
  await db.update(scans).set({ brandVisibility: data }).where(eq(scans.id, scanId))
}
