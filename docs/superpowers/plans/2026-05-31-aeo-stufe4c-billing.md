# AEO-Tool Stufe 4c — Abo/Billing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bezahlbare Abo-Tiers (Gratis 0 / Klein €19·1 Domain / Groß €49·10 Domains) via Stripe Checkout + Customer Portal + Webhooks, mit Plan-Gating der Monitoring-Domain-Limits.

**Architecture:** Neue Tabelle `subscriptions` (eine je Account). Stripe Checkout/Portal sind gehostet; ein signatur-verifizierter Webhook ist die Wahrheit für den Plan-Status. Reine Plan-Logik (`effectivePlan`/`monitorLimit`/`monitorsToDeactivate`) ist unit-getestet; das Gating greift an genau zwei Stellen (Monitor-Toggle + Webhook-Downgrade), der Wochenlauf bleibt unverändert.

**Tech Stack:** Next.js 16 (Route Handler, `req.text()` für rohen Webhook-Body), Drizzle ORM + postgres-js, Zod, `stripe` (neu), Vitest.

**Konventionen (verifiziert):**
- Route Handler: `import { NextRequest, NextResponse } from 'next/server'`, `export const runtime = 'nodejs'`. `getSession()` aus `@/src/auth/session` → `{accountId, email}|null`.
- Webhook braucht den **rohen** Body: `await req.text()` (NICHT `req.json()`), dann `stripe.webhooks.constructEvent(raw, sig, secret)`.
- Vitest `node`-Env **ohne DB/Netz** → nur reine Logik unit-getestet; Stripe/DB/Route-Glue via `npx tsc --noEmit` + `npm run build` + Stripe-CLI/manuell.
- `ensureSchema()` erzeugt Tabellen idempotent. Fail-closed: fehlende Secrets → 503 (wie 4b).
- Stripe-SDK: `current_period_end` ist Unix-Sekunden → `new Date(sec * 1000)`.

---

## File Structure

**Neu:**
- `src/billing/plans.ts` — `Plan`, `PLAN_LIMITS`, `effectivePlan`, `monitorLimit`, `monitorsToDeactivate` (rein). **Getestet.**
- `src/billing/config.ts` — `planForPriceId`, `priceIdForPlan` (env-abhängig). **Getestet.**
- `src/billing/stripe.ts` — `getStripe()` (guarded client).
- `src/http/base-url.ts` — `baseUrl(req)` (geteilt von Billing-Routen).
- `tests/billing.test.ts` — Unit-Tests.
- `app/api/billing/checkout/route.ts`, `app/api/billing/portal/route.ts`, `app/api/billing/webhook/route.ts`.
- `app/pricing/page.tsx`, `components/UpgradeButton.tsx`, `components/ManageBillingButton.tsx`.

**Geändert:**
- `src/db/schema.ts` (+`subscriptions`), `src/db/migrate.ts` (+`subscriptions`), `src/db/repo.ts` (+Subscription-Funktionen; `deleteAccount` löscht Sub-Zeile).
- `app/api/monitoring/toggle/route.ts` (Plan-Limit statt `MAX_MONITORS`).
- `app/api/account/delete/route.ts` (Stripe-Abo kündigen vor Löschung).
- `app/dashboard/page.tsx` (Plan-Badge + Buttons), `components/AccountMenu.tsx` (Upgrade/Verwalten), `components/MonitorToggle.tsx` (409-Text), `components/SiteHeader.tsx` (Preise-Link), `app/datenschutz/page.tsx` (Stripe).
- `docker-compose.yml` (+`STRIPE_*`), `package.json` (+`stripe`).

---

## Task 1: Dependency, Schema & Migration

**Files:** `package.json` (via npm), `src/db/schema.ts`, `src/db/migrate.ts`

- [ ] **Step 1: Stripe-Dependency installieren**

Run: `npm install stripe`
Expected: `stripe` erscheint in `package.json` dependencies; `package-lock.json` aktualisiert.

- [ ] **Step 2: Drizzle-Tabelle ergänzen**

In `src/db/schema.ts` am Ende anfügen (Imports `pgTable, serial, text, integer, timestamp` sind vorhanden):
```ts
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').references(() => accounts.id).notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').notNull(),
  status: text('status').notNull(),
  currentPeriodEnd: timestamp('current_period_end'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

- [ ] **Step 3: `ensureSchema()` erweitern**

In `src/db/migrate.ts`, nach dem `monitors`-Block (letzte `CREATE INDEX … monitors_active_last_run_idx …`), vor Block-Ende anfügen:
```ts
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id serial PRIMARY KEY,
          account_id integer NOT NULL REFERENCES accounts(id),
          stripe_customer_id text NOT NULL,
          stripe_subscription_id text,
          plan text NOT NULL,
          status text NOT NULL,
          current_period_end timestamp,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_account_idx ON subscriptions (account_id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions (stripe_customer_id)`)
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/db/schema.ts src/db/migrate.ts
git commit -m "feat(billing): stripe-Dependency + subscriptions-Tabelle (Schema + Migration)"
```

---

## Task 2: Plan-Logik & Price-Config — TDD

**Files:** Create `src/billing/plans.ts`, `src/billing/config.ts`; Test `tests/billing.test.ts`

- [ ] **Step 1: Failing test schreiben**

`tests/billing.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { effectivePlan, monitorLimit, monitorsToDeactivate } from '@/src/billing/plans'
import { planForPriceId, priceIdForPlan } from '@/src/billing/config'

describe('effectivePlan', () => {
  it('kein Sub → free', () => {
    expect(effectivePlan(null)).toBe('free')
  })
  it('active → plan', () => {
    expect(effectivePlan({ plan: 'gross', status: 'active' })).toBe('gross')
    expect(effectivePlan({ plan: 'klein', status: 'trialing' })).toBe('klein')
  })
  it('nicht-aktiver Status → free', () => {
    expect(effectivePlan({ plan: 'gross', status: 'canceled' })).toBe('free')
    expect(effectivePlan({ plan: 'gross', status: 'past_due' })).toBe('free')
    expect(effectivePlan({ plan: 'klein', status: 'incomplete' })).toBe('free')
  })
})

describe('monitorLimit', () => {
  it('je Plan', () => {
    expect(monitorLimit('free')).toBe(0)
    expect(monitorLimit('klein')).toBe(1)
    expect(monitorLimit('gross')).toBe(10)
  })
})

describe('monitorsToDeactivate', () => {
  const mk = (id: number, day: number) => ({ id, createdAt: new Date(2026, 0, day) })
  it('behält die ältesten `limit`, gibt Rest-IDs zurück', () => {
    const ms = [mk(1, 1), mk(2, 2), mk(3, 3)]
    expect(monitorsToDeactivate(ms, 1)).toEqual([2, 3])
  })
  it('limit 0 → alle', () => {
    expect(monitorsToDeactivate([mk(1, 1), mk(2, 2)], 0)).toEqual([1, 2])
  })
  it('unter Limit → leer', () => {
    expect(monitorsToDeactivate([mk(1, 1)], 10)).toEqual([])
  })
})

describe('config price mapping', () => {
  const env = { STRIPE_PRICE_KLEIN: 'price_k', STRIPE_PRICE_GROSS: 'price_g' }
  it('planForPriceId', () => {
    expect(planForPriceId('price_k', env)).toBe('klein')
    expect(planForPriceId('price_g', env)).toBe('gross')
    expect(planForPriceId('price_x', env)).toBeNull()
  })
  it('priceIdForPlan', () => {
    expect(priceIdForPlan('klein', env)).toBe('price_k')
    expect(priceIdForPlan('gross', env)).toBe('price_g')
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run tests/billing.test.ts`
Expected: FAIL (Module fehlen).

- [ ] **Step 3: `src/billing/plans.ts`**

```ts
export type Plan = 'free' | 'klein' | 'gross'

export const PLAN_LIMITS: Record<Plan, { monitors: number; autoBrand: boolean; export: boolean }> = {
  free: { monitors: 0, autoBrand: false, export: false },
  klein: { monitors: 1, autoBrand: false, export: false },
  gross: { monitors: 10, autoBrand: true, export: true },
}

const ACTIVE_STATUSES = ['active', 'trialing']

export function effectivePlan(sub: { plan: Plan; status: string } | null): Plan {
  if (!sub) return 'free'
  return ACTIVE_STATUSES.includes(sub.status) ? sub.plan : 'free'
}

export function monitorLimit(plan: Plan): number {
  return PLAN_LIMITS[plan].monitors
}

export function monitorsToDeactivate(
  monitors: { id: number; createdAt: Date }[],
  limit: number,
): number[] {
  const sorted = [...monitors].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  return sorted.slice(limit).map((m) => m.id)
}
```

- [ ] **Step 4: `src/billing/config.ts`**

```ts
import type { Plan } from '@/src/billing/plans'

type PriceEnv = { STRIPE_PRICE_KLEIN?: string; STRIPE_PRICE_GROSS?: string }

export function planForPriceId(priceId: string, env: PriceEnv = process.env): Plan | null {
  if (priceId && priceId === env.STRIPE_PRICE_KLEIN) return 'klein'
  if (priceId && priceId === env.STRIPE_PRICE_GROSS) return 'gross'
  return null
}

export function priceIdForPlan(plan: 'klein' | 'gross', env: PriceEnv = process.env): string | undefined {
  return plan === 'klein' ? env.STRIPE_PRICE_KLEIN : env.STRIPE_PRICE_GROSS
}
```

- [ ] **Step 5: Run, verify PASS**

Run: `npx vitest run tests/billing.test.ts`
Expected: PASS (alle Tests grün).

- [ ] **Step 6: Commit**

```bash
git add src/billing/plans.ts src/billing/config.ts tests/billing.test.ts
git commit -m "feat(billing): Plan-Logik + Price-Mapping (TDD)"
```

---

## Task 3: Stripe-Client, Base-URL-Helper & Repo-Funktionen

**Files:** Create `src/billing/stripe.ts`, `src/http/base-url.ts`; Modify `src/db/repo.ts`

- [ ] **Step 1: Stripe-Client**

`src/billing/stripe.ts`:
```ts
import Stripe from 'stripe'

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  return key ? new Stripe(key) : null
}
```

- [ ] **Step 2: Base-URL-Helper**

`src/http/base-url.ts`:
```ts
import type { NextRequest } from 'next/server'

export function baseUrl(req: NextRequest): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'aeo.kortschak.online'
  return `${proto}://${host}`
}
```

- [ ] **Step 3: Repo-Imports erweitern**

In `src/db/repo.ts` oben drei Import-Zeilen anpassen/ergänzen:
- Schema-Import um `subscriptions` erweitern:
```ts
import { scans, leads, accounts, loginTokens, sessions, monitors, subscriptions } from '@/src/db/schema'
```
- drizzle-Operatoren um `inArray` erweitern:
```ts
import { eq, and, desc, sql, inArray } from 'drizzle-orm'
```
- neue Zeile für die Plan-Logik (zu den übrigen `@/src/...`-Imports oben):
```ts
import { effectivePlan, type Plan } from '@/src/billing/plans'
```

- [ ] **Step 4: Subscription-Funktionen anfügen**

Am Ende von `src/db/repo.ts` (KEINE Imports hier mitten in der Datei — die stehen oben aus Step 3):
```ts
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
  const sub = await getSubscription(accountId)
  return effectivePlan(sub ? { plan: sub.plan as Plan, status: sub.status } : null)
}

export async function deactivateMonitors(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  await ensureSchema()
  await db.update(monitors).set({ active: false }).where(inArray(monitors.id, ids))
}
```
> Die `import type { Plan }` / `import { effectivePlan }`-Zeilen hier mitten in der Datei sind zulässig (ES-Module-Imports werden gehoistet), aber sauberer ist es, sie zu den übrigen Imports oben in `src/db/repo.ts` zu verschieben. Tu das: oben `import { effectivePlan, type Plan } from '@/src/billing/plans'` ergänzen und die Inline-Import-Zeilen hier weglassen.

- [ ] **Step 5: `deleteAccount` erweitern**

In `src/db/repo.ts` die bestehende `deleteAccount`-Funktion: vor `await db.delete(accounts)…` einfügen:
```ts
  await db.delete(subscriptions).where(eq(subscriptions.accountId, accountId))
```
(Das Stripe-Abo selbst wird in der Route gekündigt — siehe Task 7.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (keine ungenutzten Imports; `inArray`, `subscriptions`, `effectivePlan`, `Plan` werden genutzt).

- [ ] **Step 7: Commit**

```bash
git add src/billing/stripe.ts src/http/base-url.ts src/db/repo.ts
git commit -m "feat(billing): Stripe-Client, Base-URL-Helper, Subscription-Repo-Funktionen"
```

---

## Task 4: Checkout-Route

**Files:** Create `app/api/billing/checkout/route.ts`

- [ ] **Step 1: Implementierung**

`app/api/billing/checkout/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/src/auth/session'
import { getStripe } from '@/src/billing/stripe'
import { priceIdForPlan } from '@/src/billing/config'
import { getSubscription, upsertSubscription } from '@/src/db/repo'
import { baseUrl } from '@/src/http/base-url'

export const runtime = 'nodejs'

const Body = z.object({ plan: z.enum(['klein', 'gross']) })

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'Billing nicht konfiguriert' }, { status: 503 })

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültiger Plan' }, { status: 400 })
  const { plan } = parsed.data

  const price = priceIdForPlan(plan)
  if (!price) return NextResponse.json({ error: 'Preis nicht konfiguriert' }, { status: 503 })

  try {
    const existing = await getSubscription(session.accountId)
    const customerId =
      existing?.stripeCustomerId ?? (await stripe.customers.create({ email: session.email })).id

    // Zeile sofort persistieren (schließt Webhook-Reihenfolge-Lücke).
    await upsertSubscription(session.accountId, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: existing?.stripeSubscriptionId ?? null,
      plan,
      status: existing?.status ?? 'incomplete',
      currentPeriodEnd: existing?.currentPeriodEnd ?? null,
    })

    const base = baseUrl(req)
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer: customerId,
      client_reference_id: String(session.accountId),
      success_url: `${base}/dashboard?upgraded=1`,
      cancel_url: `${base}/pricing`,
    })
    return NextResponse.json({ url: checkout.url })
  } catch (e) {
    console.error('Checkout fehlgeschlagen:', e)
    return NextResponse.json({ error: 'Checkout fehlgeschlagen' }, { status: 502 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/checkout/route.ts
git commit -m "feat(billing): POST /api/billing/checkout (Stripe Checkout Session)"
```

---

## Task 5: Portal-Route

**Files:** Create `app/api/billing/portal/route.ts`

- [ ] **Step 1: Implementierung**

`app/api/billing/portal/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/src/auth/session'
import { getStripe } from '@/src/billing/stripe'
import { getSubscription } from '@/src/db/repo'
import { baseUrl } from '@/src/http/base-url'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'Billing nicht konfiguriert' }, { status: 503 })

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const sub = await getSubscription(session.accountId)
  if (!sub) return NextResponse.json({ error: 'Kein Abo vorhanden' }, { status: 400 })

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${baseUrl(req)}/dashboard`,
    })
    return NextResponse.json({ url: portal.url })
  } catch (e) {
    console.error('Portal fehlgeschlagen:', e)
    return NextResponse.json({ error: 'Portal fehlgeschlagen' }, { status: 502 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/portal/route.ts
git commit -m "feat(billing): POST /api/billing/portal (Stripe Customer Portal)"
```

---

## Task 6: Webhook-Route

**Files:** Create `app/api/billing/webhook/route.ts`

- [ ] **Step 1: Implementierung**

`app/api/billing/webhook/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/src/billing/stripe'
import { planForPriceId } from '@/src/billing/config'
import { effectivePlan, monitorLimit, monitorsToDeactivate, type Plan } from '@/src/billing/plans'
import {
  getSubscriptionByCustomerId,
  upsertSubscription,
  getMonitorsForAccount,
  deactivateMonitors,
} from '@/src/db/repo'

export const runtime = 'nodejs'

function periodEnd(sub: Stripe.Subscription): Date | null {
  return sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
}

function planFromSubscription(sub: Stripe.Subscription): Plan | null {
  const priceId = sub.items.data[0]?.price?.id
  return priceId ? planForPriceId(priceId) : null
}

/** Nach Status-Änderung überzählige Monitore abschalten. */
async function enforceLimit(accountId: number, plan: Plan, status: string): Promise<void> {
  const eff = effectivePlan({ plan, status })
  const limit = monitorLimit(eff)
  const list = await getMonitorsForAccount(accountId)
  const active = list.filter((m) => m.active)
  await deactivateMonitors(monitorsToDeactivate(active, limit))
}

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) return NextResponse.json({ error: 'Billing nicht konfiguriert' }, { status: 503 })

  const raw = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (e) {
    console.error('Webhook-Signatur ungültig:', e)
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const cs = event.data.object as Stripe.Checkout.Session
      const accountId = Number(cs.client_reference_id)
      const subId = typeof cs.subscription === 'string' ? cs.subscription : cs.subscription?.id
      const customerId = typeof cs.customer === 'string' ? cs.customer : cs.customer?.id
      if (accountId && subId && customerId) {
        const sub = await stripe.subscriptions.retrieve(subId)
        const plan = planFromSubscription(sub)
        if (plan) {
          await upsertSubscription(accountId, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: sub.id,
            plan,
            status: sub.status,
            currentPeriodEnd: periodEnd(sub),
          })
        }
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const row = await getSubscriptionByCustomerId(customerId)
      if (row) {
        const plan = (planFromSubscription(sub) ?? (row.plan as Plan)) as Plan
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status
        await upsertSubscription(row.accountId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          plan,
          status,
          currentPeriodEnd: periodEnd(sub),
        })
        await enforceLimit(row.accountId, plan, status)
      }
    }
  } catch (e) {
    console.error('Webhook-Verarbeitung fehlgeschlagen:', e)
    // 200 zurückgeben wäre falsch bei echtem Fehler — 500 lässt Stripe erneut zustellen.
    return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
```

> **Hinweis Stripe-Typen:** Falls `npx tsc` `current_period_end` auf `Stripe.Subscription` nicht kennt (SDK-Version), die Property defensiv lesen: `const cpe = (sub as unknown as { current_period_end?: number }).current_period_end`. Erst prüfen, dann ggf. so anpassen.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler. (Bei Stripe-Typproblemen den obigen Hinweis anwenden.)

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/webhook/route.ts
git commit -m "feat(billing): POST /api/billing/webhook (Plan-Sync + Limit-Durchsetzung)"
```

---

## Task 7: Gating im Toggle & Stripe-Kündigung bei Account-Löschung

**Files:** `app/api/monitoring/toggle/route.ts`, `app/api/account/delete/route.ts`

- [ ] **Step 1: Toggle auf Plan-Limit umstellen**

`app/api/monitoring/toggle/route.ts`: den Import `import { MAX_MONITORS } from '@/src/monitoring/constants'` entfernen, `getAccountPlan` + `monitorLimit` importieren, und den Limit-Block ersetzen. Neue Datei:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/src/auth/session'
import { getMonitorsForAccount, latestScanUrlForDomain, upsertMonitor, getAccountPlan } from '@/src/db/repo'
import { canEnable } from '@/src/monitoring/logic'
import { monitorLimit } from '@/src/billing/plans'

export const runtime = 'nodejs'

const Body = z.object({ domain: z.string().min(1), active: z.boolean() })

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const { domain, active } = parsed.data

  const list = await getMonitorsForAccount(session.accountId)
  const existing = list.find((m) => m.domain === domain)

  if (active) {
    const limit = monitorLimit(await getAccountPlan(session.accountId))
    const alreadyActive = !!existing?.active
    const activeCount = list.filter((m) => m.active).length
    if (!canEnable(activeCount, limit, alreadyActive)) {
      return NextResponse.json({ error: 'Abo erforderlich', upgrade: true }, { status: 409 })
    }
  }

  const url = existing?.url ?? (await latestScanUrlForDomain(session.accountId, domain))
  if (!url) return NextResponse.json({ error: 'Keine Scan-URL für diese Domain' }, { status: 400 })

  await upsertMonitor(session.accountId, domain, url, active)
  return NextResponse.json({ ok: true, active })
}
```

- [ ] **Step 2: `MAX_MONITORS` aufräumen**

Prüfen, ob `MAX_MONITORS` noch irgendwo referenziert wird:
Run: `grep -rn "MAX_MONITORS" src app tests`
Expected: keine Treffer mehr (nur evtl. die Definition). Wenn nur noch die Definition in `src/monitoring/constants.ts` übrig ist, diese Zeile entfernen (Datei behält `MONITOR_INTERVAL_DAYS`, `MONITOR_RUN_CAP`).

- [ ] **Step 3: Account-Löschung kündigt Stripe-Abo**

`app/api/account/delete/route.ts` lesen. Es ruft aktuell `getSession()` und `deleteAccount(accountId, email)`. VOR `deleteAccount` das Stripe-Abo kündigen (best effort, darf die Löschung nicht blockieren). Neue Datei:
```ts
import { NextResponse } from 'next/server'
import { getSession, destroySession } from '@/src/auth/session'
import { deleteAccount, getSubscription } from '@/src/db/repo'
import { getStripe } from '@/src/billing/stripe'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const stripe = getStripe()
  if (stripe) {
    try {
      const sub = await getSubscription(session.accountId)
      if (sub?.stripeSubscriptionId) await stripe.subscriptions.cancel(sub.stripeSubscriptionId)
    } catch (e) {
      console.error('Stripe-Kündigung bei Account-Löschung fehlgeschlagen:', e)
    }
  }

  await deleteAccount(session.accountId, session.email)
  await destroySession()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Typecheck & Tests**

Run: `npx tsc --noEmit`
Expected: keine Fehler.
Run: `npm test`
Expected: alle grün (Monitoring-Tests nutzen `canEnable` weiterhin; keine Bezugnahme auf entferntes `MAX_MONITORS`).

- [ ] **Step 5: Commit**

```bash
git add app/api/monitoring/toggle/route.ts app/api/account/delete/route.ts src/monitoring/constants.ts
git commit -m "feat(billing): Monitor-Gating per Plan; Stripe-Abo bei Account-Löschung kündigen"
```

---

## Task 8: Pricing-Seite & Buttons

**Files:** Create `components/UpgradeButton.tsx`, `components/ManageBillingButton.tsx`, `app/pricing/page.tsx`; Modify `components/SiteHeader.tsx`

- [ ] **Step 1: `UpgradeButton` (Client)**

`components/UpgradeButton.tsx`:
```tsx
"use client";

import { useState } from "react";

export default function UpgradeButton({
  plan,
  label,
  className,
}: {
  plan: "klein" | "gross";
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function upgrade() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button onClick={upgrade} disabled={busy} className={className}>
      {busy ? "Weiterleiten…" : label}
    </button>
  );
}
```

- [ ] **Step 2: `ManageBillingButton` (Client)**

`components/ManageBillingButton.tsx`:
```tsx
"use client";

import { useState } from "react";

export default function ManageBillingButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function manage() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button onClick={manage} disabled={busy} className={className}>
      {busy ? "Weiterleiten…" : "Abo verwalten"}
    </button>
  );
}
```

- [ ] **Step 3: Pricing-Seite**

`app/pricing/page.tsx` (Server Component; liest Session, um eingeloggt-Zustand zu kennen):
```tsx
import Link from "next/link";
import { getSession } from "@/src/auth/session";
import UpgradeButton from "@/components/UpgradeButton";

export const runtime = "nodejs";

const TIERS = [
  {
    name: "Gratis",
    price: "€0",
    plan: null as null | "klein" | "gross",
    features: ["Anonymer Schnupper-Scan", "Konto + Scan-Verlauf", "Kein Monitoring"],
  },
  {
    name: "Klein",
    price: "€19",
    plan: "klein" as const,
    features: ["1 überwachte Domain", "Wöchentliches Monitoring", "E-Mail bei Score-Änderung"],
  },
  {
    name: "Groß",
    price: "€49",
    plan: "gross" as const,
    features: ["Bis zu 10 Domains", "Wöchentliches Monitoring", "Auto-Brand-Visibility", "PDF-Export"],
  },
];

export default async function PricingPage() {
  const session = await getSession();
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Preise</p>
        <h1 className="mt-2 font-serif text-3xl font-medium text-ink">Wähle deinen Plan</h1>
        <p className="mt-2 text-sm text-muted">Monatlich kündbar. Preise inkl. USt.</p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {TIERS.map((t) => (
          <section key={t.name} className="flex flex-col rounded-xl border border-line bg-surface p-6">
            <h2 className="font-serif text-xl font-medium text-ink">{t.name}</h2>
            <p className="mt-1 font-mono text-2xl text-ink">
              {t.price}
              <span className="text-sm text-faint"> / Monat</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-muted">
              {t.features.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            <div className="mt-6">
              {t.plan === null ? (
                <Link
                  href={session ? "/dashboard" : "/login"}
                  className="block rounded-lg border border-line px-6 py-3 text-center text-sm font-semibold text-ink hover:border-brand"
                >
                  {session ? "Zum Dashboard" : "Kostenlos starten"}
                </Link>
              ) : session ? (
                <UpgradeButton
                  plan={t.plan}
                  label={`${t.name} wählen`}
                  className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-brand-alt disabled:opacity-60"
                />
              ) : (
                <Link
                  href="/login"
                  className="block rounded-lg bg-brand px-6 py-3 text-center text-sm font-semibold text-ink hover:bg-brand-alt"
                >
                  Anmelden & wählen
                </Link>
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: „Preise"-Link im Header**

In `components/SiteHeader.tsx` im rechten `<div className="flex items-center gap-6">`, VOR dem bestehenden Dashboard/Anmelden-Link, einfügen:
```tsx
          <Link
            href="/pricing"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
          >
            Preise
          </Link>
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: erfolgreich; `/pricing` gelistet.

- [ ] **Step 6: Commit**

```bash
git add components/UpgradeButton.tsx components/ManageBillingButton.tsx app/pricing/ components/SiteHeader.tsx
git commit -m "feat(billing): Pricing-Seite, Upgrade-/Verwalten-Buttons, Header-Preise-Link"
```

---

## Task 9: Dashboard — Plan-Badge, Account-Menü, Toggle-Text

**Files:** `app/dashboard/page.tsx`, `components/AccountMenu.tsx`, `components/MonitorToggle.tsx`

- [ ] **Step 1: AccountMenu um Plan + Buttons erweitern**

`components/AccountMenu.tsx` ersetzen:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ManageBillingButton from "@/components/ManageBillingButton";

export default function AccountMenu({
  email,
  plan,
  hasSubscription,
}: {
  email: string;
  plan: "free" | "klein" | "gross";
  hasSubscription: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function deleteAccount() {
    if (!confirm("Account und alle persönlichen Daten endgültig löschen? Deine Scan-Daten werden anonymisiert.")) return;
    setBusy(true);
    await fetch("/api/account/delete", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const planLabel = plan === "free" ? "Gratis" : plan === "klein" ? "Klein" : "Groß";

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs">
      <span className="font-mono text-faint">{email}</span>
      <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-brand">
        {planLabel}
      </span>
      {hasSubscription ? (
        <ManageBillingButton className="text-muted hover:text-ink disabled:opacity-60" />
      ) : (
        <Link href="/pricing" className="text-muted hover:text-ink">
          Upgraden
        </Link>
      )}
      <button onClick={logout} disabled={busy} className="text-muted hover:text-ink disabled:opacity-60">
        Abmelden
      </button>
      <button onClick={deleteAccount} disabled={busy} className="text-muted hover:text-brand disabled:opacity-60">
        Account löschen
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Dashboard lädt Plan & Sub**

In `app/dashboard/page.tsx`:
(a) Imports ergänzen:
```tsx
import { getAccountScans, getMonitorsForAccount, getAccountPlan, getSubscription } from "@/src/db/repo";
```
(b) Nach `const monitorByDomain = …` einfügen:
```tsx
  const plan = await getAccountPlan(session.accountId);
  const hasSubscription = (await getSubscription(session.accountId)) !== null;
```
(c) Den `<AccountMenu email={session.email} />`-Aufruf ersetzen durch:
```tsx
        <AccountMenu email={session.email} plan={plan} hasSubscription={hasSubscription} />
```

- [ ] **Step 3: MonitorToggle 409-Text mit Upgrade-Link**

In `components/MonitorToggle.tsx` den 409-Zweig anpassen. Aktuell:
```tsx
      if (res.status === 409) {
        const d = await res.json();
        setMsg(d.error ?? "Limit erreicht");
        return;
      }
```
Da der Toggle-Endpoint bei Limit jetzt `{ error: 'Abo erforderlich', upgrade: true }` liefert, soll der Hinweis auf `/pricing` verlinken. Ändere die `msg`-Anzeige so, dass bei `upgrade` ein Link gerendert wird. Ersetze den `{msg && …}`-Block am Ende durch:
```tsx
      {msg &&
        (msg === "Abo erforderlich" ? (
          <a href="/pricing" className="font-mono text-[10px] text-brand underline">
            Abo erforderlich – upgraden
          </a>
        ) : (
          <span className="font-mono text-[10px] text-brand">{msg}</span>
        ))}
```
(Den `setMsg(d.error ?? "Limit erreicht")` zu `setMsg(d.error ?? "Abo erforderlich")` belassen/anpassen, sodass der Text exakt `"Abo erforderlich"` ist, damit der Link-Zweig greift.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: erfolgreich; `/dashboard` gelistet.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx components/AccountMenu.tsx components/MonitorToggle.tsx
git commit -m "feat(billing): Dashboard-Plan-Badge, Upgrade/Verwalten, Toggle-Upgrade-Hinweis"
```

---

## Task 10: Datenschutz & Compose-Env

**Files:** `app/datenschutz/page.tsx`, `docker-compose.yml`

- [ ] **Step 1: Datenschutz-Abschnitt**

`app/datenschutz/page.tsx` lesen und im selben Stil (lokale `H2` + `<p className="mt-2">`) einen Abschnitt ergänzen (z. B. nach „Monitoring"):

Heading: „Zahlungsabwicklung"
Body: Für kostenpflichtige Abos nutzen wir den Zahlungsdienstleister Stripe (Stripe Payments Europe, Ltd.). Bei einem Abschluss werden die für die Zahlung nötigen Daten (u. a. E-Mail-Adresse, Zahlungs- und Rechnungsdaten) an Stripe übermittelt und dort verarbeitet; Stripe ist insoweit eigenständig bzw. als Auftragsverarbeiter tätig. Kartendaten werden ausschließlich von Stripe verarbeitet, nicht von uns gespeichert. Dein Abo kannst du jederzeit über das Kundenportal verwalten und kündigen.

- [ ] **Step 2: Compose-Env ergänzen**

In `docker-compose.yml` in der `app`-`environment`-Liste (nach `- MONITORING_SECRET=${MONITORING_SECRET}`) hinzufügen:
```yaml
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - STRIPE_PRICE_KLEIN=${STRIPE_PRICE_KLEIN}
      - STRIPE_PRICE_GROSS=${STRIPE_PRICE_GROSS}
```

- [ ] **Step 3: Build & Sanity**

Run: `npm run build`
Expected: erfolgreich.
Run: `node -e "require('fs').readFileSync('docker-compose.yml','utf8').includes('STRIPE_WEBHOOK_SECRET')&&console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add app/datenschutz/page.tsx docker-compose.yml
git commit -m "feat(billing): Datenschutz-Abschnitt Stripe + STRIPE_*-Envs in Compose"
```

---

## Task 11: Gesamt-Verifikation & Deploy-Hinweise

**Files:** keine (nur Prüfungen)

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: alle grün (inkl. `tests/billing.test.ts`).

- [ ] **Step 2: Lint der neuen/geänderten Dateien**

Run: `npx eslint src/billing src/http tests/billing.test.ts app/api/billing app/pricing components/UpgradeButton.tsx components/ManageBillingButton.tsx components/AccountMenu.tsx components/MonitorToggle.tsx app/dashboard/page.tsx app/api/monitoring/toggle/route.ts app/api/account/delete/route.ts src/db/repo.ts`
Expected: keine Fehler.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: erfolgreich; Routen `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/webhook`, `/pricing` gelistet.

- [ ] **Step 4: Lokaler Stripe-Smoke (optional, mit Stripe-Test-Keys + lokaler DB)**

1. Env setzen (Test-Keys, Test-Price-IDs, Webhook-Secret aus `stripe listen`), `npm run dev`.
2. `stripe listen --forward-to localhost:3000/api/billing/webhook` in einem Terminal.
3. Eingeloggt auf `/pricing` „Klein wählen" → Stripe-Test-Checkout (Karte 4242…) → Rückkehr `/dashboard?upgraded=1`.
4. Webhook `checkout.session.completed` → `subscriptions`-Zeile status `active`, plan `klein`. Toggle: 1 Domain aktivierbar, 2. → 409.
5. Über „Abo verwalten" kündigen → Webhook `customer.subscription.deleted` → Plan free, Monitore deaktiviert.

- [ ] **Step 5: Deploy**

1. Stripe-Dashboard: Produkte „AEO Klein"/„AEO Groß" + monatliche Preise €19/€49 anlegen → Price-IDs. Webhook-Endpoint `https://aeo.kortschak.online/api/billing/webhook` (Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted) → Webhook-Secret.
2. Vier `STRIPE_*`-Envs in der VPS-Projekt-Env setzen.
3. Push nach `master` → Actions baut Image → `VPS_updateProjectV1(virtualMachineId=1478430, projectName="aeo")`.
4. `ensureSchema()` legt `subscriptions` beim ersten Zugriff an. Live mit Test- oder Live-Keys end-to-end prüfen.

---

## Self-Review-Notiz (Plan ↔ Spec)

- **subscriptions-Tabelle** → T1. **Plan-Logik + Price-Config (TDD)** → T2. **Stripe-Client/Base-URL/Repo (inkl. deleteAccount-Sub-Delete)** → T3. **Checkout (inkl. Sofort-Upsert gegen Webhook-Reihenfolge)** → T4. **Portal** → T5. **Webhook (Sync + Downgrade-Enforcement)** → T6. **Toggle-Gating per Plan + Stripe-Kündigung bei Account-Löschung + MAX_MONITORS-Aufräumen** → T7. **Pricing-Seite + Buttons + Header** → T8. **Dashboard-Badge/Menü/Toggle-Text** → T9. **Datenschutz + Compose-Env** → T10. **Verifikation/Deploy** → T11.
- **Gating nur an zwei Stellen** (Toggle, Webhook); Run-Endpoint unverändert — wie spezifiziert.
- **Nur reine Logik unit-getestet** (T2); Stripe/DB/Route via Build + Stripe-CLI.
- **Fail-closed** (503) in allen Billing-Routen bei fehlendem Key/Secret.
