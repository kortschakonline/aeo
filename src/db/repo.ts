import { db } from '@/src/db/client'
import { scans, leads, accounts, loginTokens, sessions } from '@/src/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { ensureSchema } from '@/src/db/migrate'
import type { ScanResult } from '@/src/engine/types'
import type { AiAnalysis } from '@/src/ai/types'
import type { BrandVisibility } from '@/src/ai/types'

export async function saveScan(r: ScanResult, accountId?: number | null): Promise<number> {
  await ensureSchema()
  const [row] = await db.insert(scans).values({
    url: r.url, domain: r.domain, total: r.total,
    categories: r.categories, checks: r.checks,
    contentExcerpt: r.contentExcerpt ?? '',
    accountId: accountId ?? null,
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

// ---- Accounts & Auth (Stufe 4a) ----

export async function findOrCreateAccount(email: string): Promise<number> {
  await ensureSchema()
  const normalized = email.toLowerCase()
  const [existing] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, normalized))
  if (existing) {
    await db.update(accounts).set({ lastLoginAt: new Date() }).where(eq(accounts.id, existing.id))
    return existing.id
  }
  const [created] = await db.insert(accounts)
    .values({ email: normalized, lastLoginAt: new Date() })
    .returning({ id: accounts.id })
  return created.id
}

export async function createLoginToken(email: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await ensureSchema()
  await db.insert(loginTokens).values({ email: email.toLowerCase(), tokenHash, expiresAt })
}

/** Prüft & verbraucht einen Login-Token atomar. Liefert die E-Mail oder null. */
export async function consumeLoginToken(tokenHash: string): Promise<string | null> {
  await ensureSchema()
  const now = new Date()
  const rows = await db.execute(sql`
    UPDATE login_tokens SET used_at = ${now}
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > ${now}
    RETURNING email
  `)
  const row = (rows as unknown as Array<{ email: string }>)[0]
  return row?.email ?? null
}

/** Ordnet einmalig alle Alt-Scans dieser E-Mail (via leads) dem Account zu. */
export async function backfillScans(accountId: number, email: string): Promise<void> {
  await ensureSchema()
  await db.execute(sql`
    UPDATE scans SET account_id = ${accountId}
    WHERE account_id IS NULL
      AND id IN (SELECT scan_id FROM leads WHERE lower(email) = ${email.toLowerCase()})
  `)
}

export async function getAccountScans(accountId: number) {
  await ensureSchema()
  return db.select().from(scans).where(eq(scans.accountId, accountId)).orderBy(desc(scans.createdAt))
}

/** DSGVO-Löschung: personenbezogene Daten entfernen, Scans anonymisieren. */
export async function deleteAccount(accountId: number, email: string): Promise<void> {
  await ensureSchema()
  const normalized = email.toLowerCase()
  await db.update(scans).set({ accountId: null }).where(eq(scans.accountId, accountId))
  await db.delete(sessions).where(eq(sessions.accountId, accountId))
  await db.execute(sql`DELETE FROM login_tokens WHERE lower(email) = ${normalized}`)
  await db.execute(sql`DELETE FROM leads WHERE lower(email) = ${normalized}`)
  await db.delete(accounts).where(eq(accounts.id, accountId))
}
