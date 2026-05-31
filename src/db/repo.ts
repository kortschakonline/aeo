import { db } from '@/src/db/client'
import { scans, leads, accounts, loginTokens, sessions, monitors, subscriptions } from '@/src/db/schema'
import { eq, and, desc, sql, inArray, isNull, gt } from 'drizzle-orm'
import { ensureSchema } from '@/src/db/migrate'
import { resolvePlan, type Plan } from '@/src/billing/plans'
import { isCompEmail } from '@/src/billing/access'
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
  // Atomar über den Query-Builder (db.execute(sql``) serialisiert Date-Parameter
  // mit postgres-js NICHT korrekt → ERR_INVALID_ARG_TYPE). Bleibt single-statement.
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(loginTokens.tokenHash, tokenHash),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date()),
      ),
    )
    .returning({ email: loginTokens.email })
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
  await db.delete(monitors).where(eq(monitors.accountId, accountId))
  await db.execute(sql`DELETE FROM login_tokens WHERE lower(email) = ${normalized}`)
  await db.execute(sql`DELETE FROM leads WHERE lower(email) = ${normalized}`)
  await db.delete(subscriptions).where(eq(subscriptions.accountId, accountId))
  await db.delete(accounts).where(eq(accounts.id, accountId))
}

// ---- Monitoring (Stufe 4b) ----

export async function getMonitorsForAccount(accountId: number) {
  await ensureSchema()
  return db.select().from(monitors).where(eq(monitors.accountId, accountId))
}

export async function upsertMonitor(
  accountId: number,
  domain: string,
  url: string,
  active: boolean,
): Promise<void> {
  await ensureSchema()
  await db
    .insert(monitors)
    .values({ accountId, domain, url, active })
    .onConflictDoUpdate({
      target: [monitors.accountId, monitors.domain],
      set: { active, url },
    })
}

export async function latestScanUrlForDomain(accountId: number, domain: string): Promise<string | null> {
  await ensureSchema()
  const [row] = await db
    .select({ url: scans.url })
    .from(scans)
    .where(and(eq(scans.accountId, accountId), eq(scans.domain, domain)))
    .orderBy(desc(scans.createdAt))
    .limit(1)
  return row?.url ?? null
}

/** Alle aktiven Monitore mit Account-E-Mail (Join), älteste/nie-gelaufene zuerst. */
export async function getActiveMonitorsWithEmail() {
  await ensureSchema()
  return db
    .select({
      id: monitors.id,
      accountId: monitors.accountId,
      domain: monitors.domain,
      url: monitors.url,
      lastRunAt: monitors.lastRunAt,
      lastScore: monitors.lastScore,
      email: accounts.email,
    })
    .from(monitors)
    .innerJoin(accounts, eq(monitors.accountId, accounts.id))
    .where(eq(monitors.active, true))
    .orderBy(sql`${monitors.lastRunAt} ASC NULLS FIRST`)
}

export async function recordMonitorRun(monitorId: number, score: number): Promise<void> {
  await ensureSchema()
  await db.update(monitors).set({ lastRunAt: new Date(), lastScore: score }).where(eq(monitors.id, monitorId))
}

// ---- Billing (Stufe 4c) ----

export async function getSubscription(accountId: number) {
  await ensureSchema()
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId))
  return row ?? null
}

export async function getSubscriptionByCustomerId(stripeCustomerId: string) {
  await ensureSchema()
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
  return row ?? null
}

export async function upsertSubscription(
  accountId: number,
  data: {
    stripeCustomerId: string
    stripeSubscriptionId: string | null
    plan: string
    status: string
    currentPeriodEnd: Date | null
  },
): Promise<void> {
  await ensureSchema()
  await db
    .insert(subscriptions)
    .values({ accountId, ...data })
    .onConflictDoUpdate({
      target: subscriptions.accountId,
      set: {
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        plan: data.plan,
        status: data.status,
        currentPeriodEnd: data.currentPeriodEnd,
        updatedAt: new Date(),
      },
    })
}

export async function getAccountPlan(accountId: number): Promise<Plan> {
  await ensureSchema()
  const [acc] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, accountId))
  const sub = await getSubscription(accountId)
  const subInput = sub ? { plan: sub.plan as Plan, status: sub.status } : null
  return resolvePlan(subInput, acc ? isCompEmail(acc.email) : false)
}

export async function deactivateMonitors(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  await ensureSchema()
  await db.update(monitors).set({ active: false }).where(inArray(monitors.id, ids))
}

// ---- Admin (Stufe 4f) ----

export async function getAdminStats() {
  await ensureSchema()
  const rows = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM scans)::int AS total_scans,
      (SELECT count(*) FROM scans WHERE created_at >= current_date)::int AS scans_today,
      (SELECT coalesce(round(avg(total)), 0) FROM scans)::int AS avg_score,
      (SELECT count(*) FROM leads)::int AS total_leads,
      (SELECT count(*) FROM subscriptions WHERE status IN ('active','trialing'))::int AS active_subs
  `)) as unknown as Array<{
    total_scans: number; scans_today: number; avg_score: number; total_leads: number; active_subs: number
  }>
  const r = rows[0]
  return {
    totalScans: Number(r?.total_scans ?? 0),
    scansToday: Number(r?.scans_today ?? 0),
    avgScore: Number(r?.avg_score ?? 0),
    totalLeads: Number(r?.total_leads ?? 0),
    activeSubs: Number(r?.active_subs ?? 0),
  }
}

export async function getRecentScansWithLead(limit = 100) {
  await ensureSchema()
  return db
    .select({
      id: scans.id,
      domain: scans.domain,
      total: scans.total,
      createdAt: scans.createdAt,
      leadEmail: sql<string | null>`(SELECT email FROM leads WHERE leads.scan_id = ${scans.id} ORDER BY id LIMIT 1)`,
    })
    .from(scans)
    .orderBy(desc(scans.createdAt))
    .limit(limit)
}

export async function getRecentLeads(limit = 100) {
  await ensureSchema()
  return db
    .select({ email: leads.email, domain: scans.domain, createdAt: leads.createdAt })
    .from(leads)
    .innerJoin(scans, eq(leads.scanId, scans.id))
    .orderBy(desc(leads.createdAt))
    .limit(limit)
}

export async function getAccountsOverview() {
  await ensureSchema()
  return db
    .select({
      id: accounts.id,
      email: accounts.email,
      createdAt: accounts.createdAt,
      plan: subscriptions.plan,
      status: subscriptions.status,
      monitorCount: sql<number>`(SELECT count(*) FROM monitors WHERE monitors.account_id = ${accounts.id} AND monitors.active = true)::int`,
    })
    .from(accounts)
    .leftJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
    .orderBy(desc(accounts.createdAt))
}
