import { db } from '@/src/db/client'
import { scans, leads } from '@/src/db/schema'
import { eq } from 'drizzle-orm'
import type { ScanResult } from '@/src/engine/types'

export async function saveScan(r: ScanResult): Promise<number> {
  const [row] = await db.insert(scans).values({
    url: r.url, domain: r.domain, total: r.total,
    categories: r.categories, checks: r.checks,
  }).returning({ id: scans.id })
  return row.id
}

export async function getScan(id: number) {
  const [row] = await db.select().from(scans).where(eq(scans.id, id))
  return row ?? null
}

export async function saveLead(scanId: number, email: string): Promise<number> {
  const [row] = await db.insert(leads).values({ scanId, email }).returning({ id: leads.id })
  return row.id
}
